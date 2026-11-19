import { IPlaneColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HKVector3, IDENTITY_QUAT } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

// Havok WASM has no native infinite half-space plane shape.
// Approximate with a large slab whose top face lies at local y = 0 (outward normal +Y).
const PLANE_EXTENT_XZ = 10000;
const PLANE_THICKNESS = 100;
const PLANE_CENTER: HKVector3 = [0, -PLANE_THICKNESS * 0.5, 0];
const PLANE_EXTENTS: HKVector3 = [PLANE_EXTENT_XZ, PLANE_THICKNESS, PLANE_EXTENT_XZ];

/**
 * Plane collider shape approximation for Havok.
 */
export class HavokPlaneColliderShape extends HavokColliderShape implements IPlaneColliderShape {
  constructor(havokPhysics: HavokPhysics, uniqueID: number, material: HavokPhysicsMaterial) {
    super(havokPhysics, uniqueID, material);
    const shape = havokPhysics._hk.HP_Shape_CreateBox(PLANE_CENTER, IDENTITY_QUAT, PLANE_EXTENTS)[1];
    this._initShape(shape);
  }
}
