import type { FarmSnapshot } from "../domain/index";

export interface FarmRepositoryTransaction<T> {
  readonly snapshot: FarmSnapshot;
  readonly value: T;
}

export interface FarmRepository {
  read(farmId: string): Promise<FarmSnapshot | undefined>;
  transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal
  ): Promise<T>;
  subscribe(farmId: string, listener: () => void): () => void;
  dispose(): void;
}
