import type { RiverDiagnostic } from "../shared/diagnostics";

export enum RiverCompileWorkerMessageKind {
  Compile = "compile",
  Success = "success",
  Failure = "failure"
}

export interface RiverCompileWorkerRequest {
  readonly kind: RiverCompileWorkerMessageKind.Compile;
  readonly requestId: number;
  readonly source: unknown;
}

export interface RiverCompileWorkerSuccess {
  readonly kind: RiverCompileWorkerMessageKind.Success;
  readonly requestId: number;
  readonly resourceBytes: ArrayBuffer;
}

export interface RiverCompileWorkerFailure {
  readonly kind: RiverCompileWorkerMessageKind.Failure;
  readonly requestId: number;
  readonly diagnostics: readonly RiverDiagnostic[];
}

export type RiverCompileWorkerResponse = RiverCompileWorkerSuccess | RiverCompileWorkerFailure;
