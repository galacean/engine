import type { MeshRenderer, Vector3 } from "@galacean/engine";

/** A draw producer supplies geometry/coverage and, for packed draws, its instance correspondence. */
export interface RuntimePickBatch {
  readonly renderer: MeshRenderer;
  readonly count: number;
  readonly resolve: (instanceIndex: number, position?: Readonly<Vector3>) => string | undefined;
  readonly needsPosition?: boolean;
  readonly instanced?: boolean;
  readonly prepare?: () => void;
  readonly restore?: () => void;
}
export type RuntimePickVisitor = (batch: RuntimePickBatch) => void;
export type RuntimePickSource = (visitor: RuntimePickVisitor) => void;
