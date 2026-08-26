#!/usr/bin/env node
/**
 * Gate de `npm audit` para CI.
 * Falha em qualquer high/critical — sem allowlist.
 */
import { execSync } from "node:child_process";

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
const blocking = [];

for (const [name, entry] of Object.entries(vulns)) {
  if (entry.severity === "high" || entry.severity === "critical") {
    blocking.push({ name, severity: entry.severity });
  }
}

if (blocking.length === 0) {
  console.log("npm audit: OK (sem high/critical)");
  process.exit(0);
}

console.error("npm audit: vulnerabilidades high/critical bloqueantes:\n");
for (const b of blocking) {
  console.error(`- ${b.severity}: ${b.name}`);
}
console.error("\nRode `npm audit --omit=dev` localmente para detalhes.");
process.exit(1);
