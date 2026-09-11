import { ICollider } from "./ICollider";
import { IColliderShape } from "./shape";

/**
 * Interface of a rigid collider.
 */
export interface IRigidCollider extends ICollider {
  /**
   * Atomically replace an attached shape with the same logical identity.
   * @param previousShape - The currently attached shape
   * @param newShape - The replacement shape
   * @remarks If attachment fails, the previous shape and its event state remain unchanged.
   */
  replaceShape(previousShape: IColliderShape, newShape: IColliderShape): void;
}
