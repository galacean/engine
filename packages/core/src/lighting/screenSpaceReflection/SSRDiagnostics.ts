/**
 * Runtime lifecycle state of the per-camera SSR state machine.
 */
export enum SSRRuntimeState {
  Disabled = "disabled",
  Skipped = "skipped",
  WarmupColor = "warmup-color",
  FirstTrace = "first-trace",
  ActiveSteady = "active-steady",
  ContextLost = "context-lost"
}

/**
 * Read-only per-camera diagnostics snapshot for SSR validation and telemetry.
 */
export interface SSRDiagnostics {
  readonly active: boolean;
  readonly state: SSRRuntimeState;
  readonly traceWidth: number;
  readonly traceHeight: number;
  readonly estimatedBytes: number;
  readonly unsupportedReason: string | null;
  readonly opaqueReceiverCount: number;
  readonly transparentReceiverCount: number;
  readonly useHardwareStencil: boolean;
  readonly usesPackedDepthRG8: boolean;
  readonly usesPackedNormalOct8: boolean;
  readonly useLinearTrace: boolean;
}

/**
 * Shared read-only diagnostics snapshot for cameras without an active SSR pass.
 * @internal
 */
export const DISABLED_SSR_DIAGNOSTICS: Readonly<SSRDiagnostics> = Object.freeze({
  active: false,
  state: SSRRuntimeState.Disabled,
  traceWidth: 0,
  traceHeight: 0,
  estimatedBytes: 0,
  unsupportedReason: null,
  opaqueReceiverCount: 0,
  transparentReceiverCount: 0,
  useHardwareStencil: true,
  usesPackedDepthRG8: false,
  usesPackedNormalOct8: false,
  useLinearTrace: false
});
