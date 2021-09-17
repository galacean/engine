import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physical shape for capsule
 */
export interface ICapsuleColliderShape extends IColliderShape {
  /** radius of capsule */
  setRadius(radius: number): void;

  /** height of capsule */
  setHeight(height: number): void;

  /** direction of capsule */
  setDirection(dir: number): void;
}
