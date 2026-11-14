export interface FarmingAgronomyEvidence {
  readonly revision: number;
  readonly simulatedTimeMs: number;
  readonly checked: readonly ["plot-ground", "crop-health", "crop-growth", "soil-values", "inventory-quantities"];
  readonly unchecked: readonly ["visual-appearance", "future-simulation"];
  /** No issues means only the current checked conditions; empty plots and empty storage are not faults. */
  readonly assessment: "no-issues-found" | "attention-needed";
  readonly plotCount: number;
  readonly cropCount: number;
  readonly emptyPlotCount: number;
  readonly matureCropCount: number;
  readonly soilMoisture: {
    readonly unit: "volumetric-percentage-points";
    readonly minimum: number | null;
    readonly maximum: number | null;
  };
  readonly storedQuantity: number;
  readonly pendingHarvestQuantity: number;
  readonly findingCount: number;
  /** At most 32 current findings. Use plot queries for details; count covers every plot. */
  readonly findings: readonly {
    readonly plotId: string;
    readonly kind: "ground-unavailable" | "crop-health" | "crop-growth-paused";
    readonly reason: string;
  }[];
}
export type FarmingAgronomyReport =
  | { readonly farmId: string; readonly status: "observed"; readonly evidence: FarmingAgronomyEvidence }
  | { readonly farmId: string; readonly status: "unavailable"; readonly reason: string };
