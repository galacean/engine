/** System-owned usage knowledge. Field types, units and limits stay in the component schema. */
export interface PlanningSystemDeclaration {
  readonly id: string;
  readonly title: string;
  /** Existing progressive-knowledge document to which this system contributes. */
  readonly skill: string;
  readonly components: readonly {
    readonly type: string;
    readonly domain: "architecture" | "lighting" | "grading" | "vegetation" | "composition";
    readonly knowledge: readonly string[];
    /** Resolve only requested values inherited from a source asset, without authoring defaults or writes. */
    readonly readInherited?: (
      current: Readonly<Record<string, unknown>>,
      fields: readonly string[],
      signal: AbortSignal
    ) => Promise<{ values: Record<string, unknown>; source: Record<string, unknown> } | undefined>;
    /** Check whether an intent edit reaches an enabled consumer, after same-batch values merge.
     * This does not prohibit storing parameters while their renderer is disabled. */
    readonly validateExecution?: (
      patch: Readonly<Record<string, unknown>>,
      effective: Readonly<Record<string, unknown>>
    ) => string | undefined;
  }[];
}

/** A declaration projected onto the capabilities actually available to this caller. */
export interface PlanningSystemKnowledge {
  readonly id: string;
  readonly title: string;
  readonly skill: string;
  readonly components: readonly string[];
  readonly domains: Readonly<Record<string, PlanningSystemDeclaration["components"][number]["domain"]>>;
  readonly knowledge: readonly string[];
}
