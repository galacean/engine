import { IPhysicsShape } from "./IPhysicsShape";

/**
 * Infinite plane shape passing through the local origin with a +Y normal.
 * @remarks Backends whose native plane uses a different local normal (such as PhysX +X) must apply the axis offset
 * internally when setting the local pose.
 */
export interface IPlaneShape extends IPhysicsShape {}
