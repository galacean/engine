import {
  TerrainLodGroupRuntime,
  createTerrainLodRendererSetScratch
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import type { MasonryLod } from "./MasonryLodPolicy";

// The same per-instance state machine as procedural trees. Selection and readiness
// are building-specific; transition/reversal/hidden-time semantics have one owner.
const definition = new TerrainLodGroupRuntime(
  {
    fadeMode: "CrossFade",
    animateCrossFading: true,
    localReferencePoint: [0, 0, 0],
    size: 1,
    lods: [2.5, 1.5, 0].map((screenRelativeTransitionHeight) => ({ screenRelativeTransitionHeight }))
  },
  0.5
);
export class MasonryLodTransition {
  private readonly instance = definition.createInstance();
  private readonly scratch = createTerrainLodRendererSetScratch();
  target: MasonryLod = 2;
  private pending: MasonryLod = 2;
  private pendingSince = 0;
  private animating = false;
  private readonly observation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 1 };
  constructor() {
    this.instance.snap(this.observation);
  }
  update(time: number, requested: MasonryLod, ready: boolean, visible: boolean) {
    // Unavailable detail must never start a fade toward an absent representation.
    const next = ready ? requested : 2;
    if (next !== this.pending) {
      this.pending = next;
      this.pendingSince = time;
    }
    if (!ready || next < this.target || time - this.pendingSince >= 0.6) this.target = next;
    this.observation.timeSeconds = time;
    this.observation.screenRelativeHeight = 3 - this.target;
    const states = this.instance.updateInto(
      visible ? this.observation : { timeSeconds: time, visible: false },
      this.scratch
    );
    this.animating = states.length > 1;
    return states;
  }
  /** A stationary camera must still finish a delayed downgrade and its fade. */
  get nextUpdateTime(): number {
    if (this.animating) return -Infinity;
    return this.pending !== this.target ? this.pendingSince + 0.6 : Infinity;
  }
  /** Re-admit a hidden resident at its current allocation, with no stale outgoing LOD. */
  snap(time: number, lod: MasonryLod) {
    this.animating = false;
    this.target = this.pending = lod;
    this.pendingSince = time;
    this.observation.timeSeconds = time;
    this.observation.screenRelativeHeight = 3 - lod;
    return this.instance.snap(this.observation);
  }
  reset(time: number) {
    this.snap(time, 2);
  }
}
