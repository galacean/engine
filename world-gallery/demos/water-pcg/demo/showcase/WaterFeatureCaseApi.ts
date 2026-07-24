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

export interface WaterFeatureCaseControllerOptions {
  readonly caseId: string;
  readonly preset: string;
  readonly getReady: () => boolean;
  readonly getRuntimeError: () => string;
  readonly setEnabled: (enabled: boolean) => void;
  readonly reset: () => void;
  readonly getSignal: () => number;
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

/**
 * Creates one focused A/B surface around one capability-specific controller.
 *
 * The callbacks deliberately do not expose a shared master switch: each caller
 * must bind setEnabled/reset/getSignal to the subsystem proven by that case.
 */
export function createWaterFeatureCaseApi(
  options: Readonly<WaterFeatureCaseControllerOptions>
): WaterFeatureCaseApi {
  let enabled = true;
  const api: WaterFeatureCaseApi = {
    caseId: options.caseId,
    preset: options.preset,
    get ready() {
      return options.getReady();
    },
    get enabled() {
      return enabled;
    },
    setEnabled(nextEnabled: boolean): void {
      options.setEnabled(nextEnabled);
      enabled = nextEnabled;
    },
    reset(): void {
      options.reset();
      enabled = true;
    },
    snapshot(): Readonly<WaterFeatureCaseSnapshot> {
      const signal = enabled ? options.getSignal() : 0;
      return createFeatureSnapshot(
        api,
        options.getRuntimeError(),
        Number.isFinite(signal),
        signal
      );
    }
  };
  return api;
}
