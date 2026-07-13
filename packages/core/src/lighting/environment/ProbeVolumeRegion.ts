import { Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { deepClone } from "../../clone/CloneManager";

/**
 * Defines the placement and local dimensions of a probe volume bake.
 * @remarks Move, rotate, or scale the owning entity before baking. Lighting must be re-baked after changing the region.
 */
export class ProbeVolumeRegion extends Component {
  /** Unscaled dimensions of the region in its entity's local space. */
  @deepClone
  readonly size = new Vector3(10, 10, 10);

  /** Target spacing of the smallest brick before the region is fitted to its exact size. */
  minBrickSize = 1;
}
