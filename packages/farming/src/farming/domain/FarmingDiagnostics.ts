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
  readonly phase: "candidate" | "published";
  readonly planningRevision: number;
  readonly publicationRevision: number;
  readonly placement: FarmingDiagnosticCheck;
  readonly access: FarmingDiagnosticCheck;
  readonly runtime: FarmingDiagnosticCheck;
  readonly presentation: FarmingDiagnosticCheck;
}
export interface FarmingDiagnosticReport {
  readonly farms: readonly FarmingFarmDiagnostics[];
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
      farms: Object.freeze([...this.records.values()].filter((r) => !farmId || r.farmId === farmId))
    });
  }

  clear(): void {
    this.records.clear();
  }
}
