export interface WaterFeatureCaseSnapshot {
  readonly caseId: string;
  readonly preset: string;
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly finite: boolean;
  readonly runtimeError: string;
  readonly signal: number;
}

/** Minimal A/B surface shared by public Feature cases, never by developer diagnostics. */
export interface WaterFeatureCaseApi {
  readonly caseId: string;
  readonly preset: string;
  readonly ready: boolean;
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void | Promise<void>;
  reset(): void | Promise<void>;
  snapshot(): Readonly<WaterFeatureCaseSnapshot>;
}

declare global {
  interface Window {
    waterPcgFeature?: WaterFeatureCaseApi;
  }
}

export function createFeatureSnapshot(
  api: Pick<WaterFeatureCaseApi, "caseId" | "preset" | "ready" | "enabled">,
  runtimeError: string,
  finite: boolean,
  signal: number
): Readonly<WaterFeatureCaseSnapshot> {
  return Object.freeze({
    caseId: api.caseId,
    preset: api.preset,
    ready: api.ready,
    enabled: api.enabled,
    finite,
    runtimeError,
    signal: Number.isFinite(signal) ? signal : 0
  });
}
