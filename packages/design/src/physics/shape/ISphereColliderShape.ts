import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physical shape for Sphere
 */
export interface ISphereColliderShape extends IColliderShape {
  /** radius of sphere shape */
  setRadius(radius: number): void;
}
