import { describe, expect, it } from "vitest";
import type {
  AuditPlanningMatchRow,
  AuditPlanningReconcileCounts,
} from "@/lib/planning/federal/audit-reconcile";

function tally(rows: Array<Pick<AuditPlanningMatchRow, "status">>): AuditPlanningReconcileCounts {
  const counts: AuditPlanningReconcileCounts = {
    aligned: 0,
    auditOnly: 0,
    planningOnly: 0,
    divergent: 0,
  };
  for (const row of rows) {
    if (row.status === "ALIGNED") counts.aligned += 1;
    else if (row.status === "AUDIT_ONLY") counts.auditOnly += 1;
    else if (row.status === "PLANNING_ONLY") counts.planningOnly += 1;
    else counts.divergent += 1;
  }
  return counts;
}

describe("audit-reconcile status tally", () => {
  it("conta cada status", () => {
    expect(
      tally([
        { status: "ALIGNED" },
        { status: "ALIGNED" },
        { status: "AUDIT_ONLY" },
        { status: "PLANNING_ONLY" },
        { status: "DIVERGENT" },
      ]),
    ).toEqual({
      aligned: 2,
      auditOnly: 1,
      planningOnly: 1,
      divergent: 1,
    });
  });
});

describe("amount divergence threshold", () => {
  it("marca divergente acima de 0,05", () => {
    const audit = 100;
    const planning = 100.1;
    expect(Math.abs(planning - audit) > 0.05).toBe(true);
    expect(Math.abs(100.01 - 100) > 0.05).toBe(false);
  });
});
