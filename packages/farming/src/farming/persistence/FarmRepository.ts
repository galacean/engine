import type { FarmSnapshot } from "../domain/index";
import type { WaterLayoutChange } from "../domain/fields/SoilWaterField";

export interface FarmRepositoryTransaction<T> {
  readonly snapshot: FarmSnapshot;
  readonly value: T;
  /** Automatic checkpoints can retain clock-only progress in memory. Explicit checkpoints persist it. */
  readonly clockOnly?: "volatile" | "persist";
  /** Set false for initialization, autonomous clock/weather ticks, or ground re-sync that are not user edits. */
  readonly userEdit?: boolean;
}

export interface FarmSnapshotReplacement {
  current(): FarmSnapshot | null;
  validate(snapshot: FarmSnapshot): FarmSnapshot;
  refreshLayout(
    snapshot: FarmSnapshot,
    layout: WaterLayoutChange,
    options: {
      previous: FarmSnapshot;
      rebaseTime: boolean;
      mergeSettlement?: (settled: FarmSnapshot) => FarmSnapshot;
    }
  ): FarmSnapshot;
  committed(snapshot: FarmSnapshot, rebaseTime: boolean): void;
}

/** Only a validated owner replacement has a replacement revision. */
export type FarmRepositoryListener = (external?: boolean, replacementRevision?: number) => void;

export interface FarmRepository {
  /** Local ticks wait while a project replacement is using the live settlement. */
  readonly replacementPending?: boolean;
  read(farmId: string): Promise<FarmSnapshot | undefined>;
  transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal
  ): Promise<T>;
  subscribe(farmId: string, listener: FarmRepositoryListener, replacement?: FarmSnapshotReplacement): () => void;
  dispose(): void;
}
