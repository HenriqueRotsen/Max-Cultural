#!/usr/bin/env node
/**
 * Gate de `npm audit` para CI.
 * Falha em high/critical, exceto advisories allowlisted sem patch utilizável:
 * - xlsx (SheetJS community no npm sem fix)
 * - deepmerge-ts (Prisma pinou 7.1.5; override 8 quebra a cadeia)
 */
import { execSync } from "node:child_process";

const ALLOWED_ADVISORY_PACKAGES = new Set(["xlsx", "deepmerge-ts"]);

let report;
try {
  const raw = execSync("npm audit --omit=dev --json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
  report = JSON.parse(raw);
} catch (err) {
  const stdout = err.stdout?.toString?.() || "";
  try {
    report = JSON.parse(stdout);
  } catch {
    console.error(stdout || err.message);
    process.exit(1);
  }
}

const vulns = report.vulnerabilities || {};

/** Resolve nomes de pacotes que realmente têm advisory nesta cadeia. */
function rootAdvisoryPackages(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const entry = vulns[name];
  if (!entry) return new Set();

  const roots = new Set();
  for (const via of entry.via || []) {
    if (typeof via === "string") {
      for (const r of rootAdvisoryPackages(via, seen)) roots.add(r);
      continue;
    }
    if (via?.name) roots.add(via.name);
  }
  if (roots.size === 0 && (entry.severity === "high" || entry.severity === "critical")) {
    roots.add(name);
  }
  return roots;
}

const blocking = [];
const ignored = [];

for (const [name, entry] of Object.entries(vulns)) {
  if (entry.severity !== "high" && entry.severity !== "critical") continue;
  const roots = [...rootAdvisoryPackages(name)];
  const allAllowed =
    roots.length > 0 && roots.every((r) => ALLOWED_ADVISORY_PACKAGES.has(r));
  if (allAllowed) {
    ignored.push(`${name} ← ${roots.join(",")}`);
    continue;
  }
  blocking.push({ name, severity: entry.severity, roots });
}

if (blocking.length === 0) {
  if (ignored.length) {
    console.log("npm audit: OK");
    console.log("Ignorados (sem patch utilizável):");
    for (const line of ignored) console.log(`  - ${line}`);
  } else {
    console.log("npm audit: OK (sem high/critical)");
  }
  process.exit(0);
}

console.error("npm audit: vulnerabilidades high/critical bloqueantes:\n");
for (const b of blocking) {
  console.error(`- ${b.severity}: ${b.name} (roots: ${b.roots.join(", ")})`);
}
console.error("\nRode `npm audit --omit=dev` localmente para detalhes.");
process.exit(1);
