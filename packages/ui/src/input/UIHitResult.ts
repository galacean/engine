import { Entity } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { UIRenderer } from "../component/UIRenderer";

/**
 * @internal
 */
export class UIHitResult {
  entity: Entity | null = null;
  distance: number = 0;
  point: Vector3 = new Vector3();
  normal: Vector3 = new Vector3();
  component: UIRenderer | null = null;
}
