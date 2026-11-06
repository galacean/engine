/** Minimal realtime IBL state needed to capture and test one startup revision barrier. */
export interface TerrainIBLRevisionBarrierSnapshot {
  readonly activeRevision: number | null;
  readonly pendingRevision: number | null;
  readonly publishedRevision: number;
}

/** Captures the newest IBL revision already requested when a startup barrier begins. */
export function captureTerrainIBLRevisionBarrier(snapshot: TerrainIBLRevisionBarrierSnapshot): number {
  return Math.max(snapshot.activeRevision ?? 0, snapshot.pendingRevision ?? 0, snapshot.publishedRevision);
}

/** Tests whether the captured startup revision or a newer coalesced revision has been published. */
export function hasPublishedTerrainIBLRevision(
  snapshot: TerrainIBLRevisionBarrierSnapshot,
  barrierRevision: number
): boolean {
  return snapshot.publishedRevision >= barrierRevision;
}
