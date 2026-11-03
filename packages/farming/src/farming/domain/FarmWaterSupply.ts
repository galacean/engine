import type { PlotState } from "./FarmState";

/** Host-owned, ephemeral geometry facts. Never serialized with FarmSnapshot. */
export interface FarmNearWaterEntry {
  readonly plotId: string;
  readonly groundId: string;
  readonly cellX: number;
  readonly cellZ: number;
  readonly sourceHash: string | null;
  readonly compiledHash: string | null;
  readonly shoreDistanceM: number | null;
  readonly heightDifferenceM: number | null;
  readonly coefficient: number;
  readonly groundRevision: number;
  readonly layoutRevision: number;
}

export interface FarmWaterSupplyDiagnostics {
  readonly refreshing: boolean;
  readonly requestedGroundRevision: number | null;
  readonly requestedLayoutRevision: number;
  readonly completedGroundRevision: number | null;
  readonly completedLayoutRevision: number | null;
  readonly plotCount: number;
  readonly candidateCount: number;
  readonly totalSampleCalls: number;
  readonly taskSampleCalls: number;
  readonly completedTasks: number;
  readonly discardedTasks: number;
  readonly sliceCount: number;
  readonly lastSliceCalls: number;
  readonly maximumSliceCalls: number;
  readonly lastSliceMs: number;
  readonly maximumSliceMs: number;
  readonly overBudgetSlices: number;
  readonly overBudgetCalls: number;
  readonly maximumCallMs: number;
}

export interface FarmWaterSupplyInput {
  readonly farmId: string;
  readonly maximumPerMinute: number;
  readonly equilibriumMoistureUnits: number;
  readonly plots: ReadonlyMap<string, FarmNearWaterEntry>;
  readonly diagnostics: FarmWaterSupplyDiagnostics;
}

export interface FarmNearWaterView {
  readonly sourceHash: string | null;
  readonly compiledHash: string | null;
  readonly shoreDistanceM: number | null;
  readonly heightDifferenceM: number | null;
  readonly coefficient: number;
  /** null until this plot has a complete cached result. */
  readonly groundRevision: number | null;
  readonly layoutRevision: number | null;
  readonly refreshing: boolean;
  readonly requestedGroundRevision: number | null;
  readonly requestedLayoutRevision: number;
}

export function nearWaterEntry(
  input: FarmWaterSupplyInput | undefined,
  plot: PlotState
): FarmNearWaterEntry | undefined {
  const entry = input?.plots.get(plot.plotId);
  return entry?.groundId === plot.groundId && entry.cellX === plot.cellX && entry.cellZ === plot.cellZ
    ? entry
    : undefined;
}

/** Current potential supply, in moisture percentage points per simulation minute. */
export function nearWaterPerMinute(
  moistureUnits: number,
  minimumMoistureUnits: number,
  input: FarmWaterSupplyInput | undefined,
  entry: FarmNearWaterEntry | undefined
): number {
  if (!input || !entry || entry.coefficient <= 0) return 0;
  const range = input.equilibriumMoistureUnits - minimumMoistureUnits;
  if (range <= 0) return 0;
  return (
    input.maximumPerMinute *
    entry.coefficient *
    Math.max(0, Math.min(1, (input.equilibriumMoistureUnits - moistureUnits) / range))
  );
}

export function nearWaterView(input: FarmWaterSupplyInput | undefined, plot: PlotState): FarmNearWaterView | null {
  if (!input) return null;
  const entry = nearWaterEntry(input, plot);
  return Object.freeze({
    sourceHash: entry?.sourceHash ?? null,
    compiledHash: entry?.compiledHash ?? null,
    shoreDistanceM: entry?.shoreDistanceM ?? null,
    heightDifferenceM: entry?.heightDifferenceM ?? null,
    coefficient: entry?.coefficient ?? 0,
    groundRevision: entry?.groundRevision ?? null,
    layoutRevision: entry?.layoutRevision ?? null,
    refreshing: input.diagnostics.refreshing,
    requestedGroundRevision: input.diagnostics.requestedGroundRevision,
    requestedLayoutRevision: input.diagnostics.requestedLayoutRevision
  });
}
