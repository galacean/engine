import { Entity, Vector3 } from "oasis-engine";
import { Rigidbody } from "./Rigidbody";
import { Collider } from "./Collider";

//articulationBody, barycentricCoordinate, lightmapCoord, textureCoord, textureCoord2, triangleIndex
export class RaycastHit {
  /** The Collider that was hit. */
  entity: Entity;
  /** The impact point in world space where the ray hit the collider. */
  point: Vector3;
  /** The normal of the surface the ray hit. */
  normal: Vector3;
  /** The distance from the ray's origin to the impact point. */
  distance: number;

  /** The Rigidbody of the collider that was hit. If the collider is not attached to a rigidbody then it is null. */
  rigidbody: Rigidbody | undefined;
  collider: Collider | undefined;
  /** The Transform of the rigidbody or collider that was hit. */
  transform: Vector3;
}
