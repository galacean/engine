import type { MeshRenderer, Vector3 } from "@galacean/engine";
import type { RuntimePickBatch } from "./runtime-pick-source";
export interface SeedWorldPickBatch extends RuntimePickBatch {
  /** Ground cover remains photographable but must not hide the ground a farming tool operates on. Default true. */
  readonly interactionOccluder?: boolean;
  /** Immutable authoring identity for position-dependent packed draws. */
  readonly snapshotResolver?: () => { byteLength: number; resolve(position: Readonly<Vector3>): string | undefined };
  readonly snapshotKey?: object;
}
/** Persistent descriptor owned by a draw producer; refresh fields after packing. */
export class SeedWorldArrayPickBatch implements SeedWorldPickBatch {
  interactionOccluder = true;
  count = 0;
  start = 0;
  instanced = false;
  id?: string;
  ids?: readonly (string | undefined)[];
  constructor(readonly renderer: MeshRenderer) {}
  resolve(index: number): string | undefined {
    return this.id ?? this.ids?.[this.start + index];
  }
}
export type SeedWorldPickVisitor = (batch: SeedWorldPickBatch) => void;
export type SeedWorldPickSource = (visitor: SeedWorldPickVisitor) => void;
