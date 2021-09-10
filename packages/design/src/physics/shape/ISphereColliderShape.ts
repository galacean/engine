import { IColliderShape } from "./IColliderShape";

/**Interface of PhysXPhysics Shape for Sphere */
export interface ISphereColliderShape extends IColliderShape {
  /** radius of sphere shape */
  setRadius(radius: number): void;
}
