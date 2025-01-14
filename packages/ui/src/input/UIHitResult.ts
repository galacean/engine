import { Entity, Vector3 } from "@galacean/engine";
import { UIRenderer } from "../component/UIRenderer";

/**
 * @internal
 */
export class UIHitResult {
  entity: Entity = null;
  distance: number = 0;
  point: Vector3 = new Vector3();
  normal: Vector3 = new Vector3();
  component: UIRenderer = null;
}
