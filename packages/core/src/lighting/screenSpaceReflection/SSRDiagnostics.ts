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
