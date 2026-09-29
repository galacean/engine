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
   * @returns Whether the replacement succeeded
   * @remarks On failure, returns false and leaves the previous shape and its event state unchanged.
   */
  replaceShape(previousShape: IColliderShape, newShape: IColliderShape): boolean;
}
