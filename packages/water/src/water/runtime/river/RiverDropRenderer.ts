import { RIVER_DEFAULT_DROP_LOOK } from "../../authoring/river/FarmlandsDropLook";
import type { Engine, Entity } from "@galacean/engine-core";
import type { RiverDrop } from "../../authoring/river/RiverDrop";
import type { RiverDropLook } from "../../authoring/river/RiverDropLook";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import { RiverDropPresentation } from "./RiverDropPresentation";

/** One batched curtain mesh plus the Look's existing native particle emitters. */
export class RiverDropRenderer {
  private readonly presentation: RiverDropPresentation;
  constructor(
    engine: Engine,
    parent: Entity,
    drops: readonly RiverDrop[],
    look: Readonly<RiverDropLook> | undefined,
    leases: readonly WaterRuntimeResourceLease[] = [],
    timeOverride?: number
  ) {
    this.presentation = new RiverDropPresentation(
      engine,
      parent,
      drops,
      look ?? RIVER_DEFAULT_DROP_LOOK,
      leases,
      timeOverride
    );
  }
  get triangleCount(): number {
    return this.presentation.triangleCount;
  }
  get drawCount(): number {
    return this.presentation.drawCount;
  }
  setLook(look: Readonly<RiverDropLook> | undefined): void {
    this.presentation.setLook(look ?? RIVER_DEFAULT_DROP_LOOK);
  }
  setSurfacePriority(priority: number): void {
    this.presentation.setSurfacePriority(priority);
  }
  destroy(): void {
    this.presentation.destroy();
  }
}
