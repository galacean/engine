import type { Entity } from "@galacean/engine";
import type { PreparedTerrainUpdate } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { PublishedPlanningSeedScene } from "./PlanningSeedScenePublication";

type Solids = PublishedPlanningSeedScene["solids"];
/** Transfer prepared geometry only at the same boundary as its terrain and navigation. */
export function preparePlanningSurfaceSolidsSwap(previous: Solids, next: Solids, stage: Entity): PreparedTerrainUpdate {
  const parent = previous.root.parent!;
  let state: "prepared" | "committed" | "finished" = "prepared";
  let oldActive = previous.root.isActive;
  const rollback = () => {
    if (state !== "committed") return;
    next.root.parent = stage;
    next.rollbackCommit();
    previous.root.isActive = oldActive;
    state = "prepared";
  };
  return {
    commit: () => {
      if (state !== "prepared" || previous.root.destroyed || next.root.destroyed)
        throw Error("Stale solid replacement");
      oldActive = previous.root.isActive;
      state = "committed";
      try {
        next.commit();
        next.root.parent = parent;
        previous.root.isActive = false;
      } catch (error) {
        rollback();
        throw error;
      }
    },
    rollback,
    finalize: () => {
      if (state !== "committed") throw Error("Solid replacement not committed");
      next.finalizeCommit();
      state = "finished";
      try {
        previous.dispose();
      } finally {
        stage.destroy();
      }
    },
    discard: () => {
      if (state === "finished") return;
      rollback();
      state = "finished";
      next.rollbackCommit();
      try {
        next.dispose();
      } finally {
        stage.destroy();
      }
    }
  };
}
