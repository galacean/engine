import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../../../Entity";

/**
 * @internal
 */
export interface IHitResult {
  entity: Entity;
  distance: number;
  point: Vector3;
  normal: Vector3;
}
