import type { FarmingAgronomyReport } from "./FarmingAgronomy";
import { freezePlantContent } from "../procedural/core/immutable";

export type FarmingDiagnosticState = "pending" | "ready" | "blocked" | "failed";
export type FarmingDiagnosticDimension = "placement" | "access" | "runtime" | "presentation";
export interface FarmingDiagnosticIssue {
  readonly code: string;
  readonly message: string;
  readonly source: "planner" | "farming" | "host";
  readonly target: string;
  readonly expected?: number | string | boolean;
  readonly actual?: number | string | boolean;
  readonly suggestion?: string;
}
export interface FarmingDiagnosticCheck {
  readonly state: FarmingDiagnosticState;
  readonly issues: readonly FarmingDiagnosticIssue[];
  /** Read-only source references, interpreted by the supplying host rather than agricultural simulation. */
  readonly evidence?: readonly FarmingDiagnosticEvidence[];
}
export interface FarmingDiagnosticEvidence {
  readonly code: string;
  readonly source: "planner" | "farming" | "host";
  readonly target: string;
  readonly relatedIds: readonly string[];
}
/** Host supplies spatial/access evidence; Farming never infers the host's road topology. */
export interface FarmingFarmDiagnostics {
  readonly farmId: string;
  /** Independent lanes: candidate describes a plan attempt; published describes the active publication. Compare revisions within each lane. Candidate pending does not override published ready. */
  readonly phase: "candidate" | "published";
  readonly planningRevision: number;
  readonly publicationRevision: number;
  readonly placement: FarmingDiagnosticCheck;
  readonly access: FarmingDiagnosticCheck;
  readonly runtime: FarmingDiagnosticCheck;
  /** Visual resources/representation readiness, NOT capabilities.interactionHostBound. */
  readonly presentation: FarmingDiagnosticCheck;
}
export const FARMING_DIAGNOSTIC_COVERAGE = Object.freeze({
  kind: "publication-readiness" as const,
  checked: ["placement", "access", "runtime", "presentation"] as const
});
export interface FarmingDiagnosticReport {
  /** Current agricultural evidence, independent of publication readiness. Unavailable is not healthy. */
  readonly agronomy: readonly FarmingAgronomyReport[];
  /** Scope of current: publication readiness only. Agricultural evidence is reported separately in agronomy. */
  readonly coverage: typeof FARMING_DIAGNOSTIC_COVERAGE;
  /** Current published health per farm. Candidate checks are not current failures. null = no published evidence. */
  readonly current: readonly {
    farmId: string;
    phase: "published" | "unpublished";
    ready: boolean | null;
    states: Partial<Record<FarmingDiagnosticDimension, FarmingDiagnosticState>>;
    issueCount: number;
    issues: readonly FarmingDiagnosticIssue[];
    actionRequired: boolean | null;
  }[];
  readonly scope: { readonly kind: "system" | "farm"; readonly farmId: string | null };
  /** Each entry identifies its phase and revisions. Inspect published for the current farm; retain candidate evidence separately. */
  readonly farms: readonly FarmingFarmDiagnostics[];
}

export function summarizeFarmingDiagnostics(
  records: readonly FarmingFarmDiagnostics[]
): FarmingDiagnosticReport["current"] {
  return [...new Set(records.map((r) => r.farmId))].map((farmId) => {
    const published = records.find((r) => r.farmId === farmId && r.phase === "published");
    const dimensions = ["placement", "access", "runtime", "presentation"] as const;
    return {
      farmId,
      phase: published ? ("published" as const) : ("unpublished" as const),
      ready: published ? dimensions.every((d) => published[d].state === "ready") : null,
      states: published ? Object.fromEntries(dimensions.map((d) => [d, published[d].state])) : {},
      issues: published ? dimensions.flatMap((d) => published[d].issues) : [],
      actionRequired: published
        ? dimensions.some((d) => ["blocked", "failed"].includes(published[d].state) || published[d].issues.length > 0)
        : null,
      issueCount: published ? dimensions.reduce((n, d) => n + published[d].issues.length, 0) : 0
    };
  });
}

/** Scene-local evidence, including planned farms that have no runtime area. Not gameplay persistence. */
export class FarmingDiagnostics {
  private readonly records = new Map<string, FarmingFarmDiagnostics>();

  publish(record: FarmingFarmDiagnostics): boolean {
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(record.farmId)) throw new Error("Invalid diagnostic farm ID");
    for (const revision of [record.planningRevision, record.publicationRevision])
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid diagnostic revision");
    if (!["candidate", "published"].includes(record.phase)) throw new Error("Invalid diagnostic phase");
    const key = `${record.phase}/${record.farmId}`;
    const previous = this.records.get(key);
    // Publication order is authoritative; candidate author revisions have their own lane.
    const order = (r: FarmingFarmDiagnostics) =>
      record.phase === "candidate"
        ? [r.planningRevision, r.publicationRevision]
        : [r.publicationRevision, r.planningRevision];
    const [major, minor] = order(record);
    if (previous) {
      const [previousMajor, previousMinor] = order(previous);
      if (major < previousMajor || (major === previousMajor && minor < previousMinor)) return false;
    }
    for (const dimension of ["placement", "access", "runtime", "presentation"] as const) {
      const check = record[dimension];
      if (!["pending", "ready", "blocked", "failed"].includes(check.state) || !Array.isArray(check.issues))
        throw new Error("Invalid farming diagnostic check");
      for (const issue of check.issues)
        if (!issue.code || !issue.message || !issue.target || !["planner", "farming", "host"].includes(issue.source))
          throw new Error("Invalid farming diagnostic issue");
      if (check.evidence !== undefined) {
        if (!Array.isArray(check.evidence)) throw new Error("Invalid farming diagnostic evidence");
        for (const evidence of check.evidence)
          if (
            !evidence.code ||
            !evidence.target ||
            !["planner", "farming", "host"].includes(evidence.source) ||
            !Array.isArray(evidence.relatedIds) ||
            evidence.relatedIds.some((id: unknown) => typeof id !== "string" || !id)
          )
            throw new Error("Invalid farming diagnostic evidence");
      }
    }
    this.records.set(key, freezePlantContent(structuredClone(record)));
    return true;
  }

  get(farmId?: string): FarmingDiagnosticReport {
    return Object.freeze({
      agronomy: [
        ...new Set([...this.records.values()].filter((r) => !farmId || r.farmId === farmId).map((r) => r.farmId))
      ].map((farmId) => ({
        farmId,
        status: "unavailable" as const,
        reason: "No live agricultural observation supplied"
      })),
      coverage: FARMING_DIAGNOSTIC_COVERAGE,
      current: summarizeFarmingDiagnostics([...this.records.values()].filter((r) => !farmId || r.farmId === farmId)),
      scope: Object.freeze({ kind: farmId ? ("farm" as const) : ("system" as const), farmId: farmId ?? null }),
      farms: Object.freeze([...this.records.values()].filter((r) => !farmId || r.farmId === farmId))
    });
  }

  clear(): void {
    this.records.clear();
  }
}
