import { ContactPoint } from "./ContactPoint";
import { Collider } from "./Collider";
import { ICollision } from "@galacean/engine-design";

/**
 * Collision information passed to the scripts on one of the two colliding Colliders' Entity.
 */
export class Collision {
  /** @internal */
  _nativeCollision: ICollision;

  /** The other Collider in the collision. */
  collider: Collider;
  /** The Collider that receives this collision; contact normals and impulses point from the other Collider to it. */
  selfCollider: Collider;

  /**
   * Count of contact points.
   */
  get contactCount(): number {
    return this._nativeCollision.contactCount;
  }

  /**
   * Get contact points.
   * @param outContacts - The result of contact points
   * @returns The actual count of contact points
   *
   * @remarks To optimize performance, the engine does not modify the length of the array you pass.
   * You need to obtain the actual number of contact points from the function's return value.
   */
  getContacts(outContacts: ContactPoint[]): number {
    const nativeCollision = this._nativeCollision;
    const factor = this.selfCollider._id === nativeCollision.shape0Id ? 1 : -1;
    const nativeContactPoints = nativeCollision.getContacts();
    const length = nativeContactPoints.size();
    for (let i = 0; i < length; i++) {
      const nativeContractPoint = nativeContactPoints.get(i);

      const contact = (outContacts[i] ||= new ContactPoint());
      contact.position.copyFrom(nativeContractPoint.position);
      contact.normal.copyFrom(nativeContractPoint.normal).scale(factor);
      contact.impulse.copyFrom(nativeContractPoint.impulse).scale(factor);
      contact.separation = nativeContractPoint.separation;
    }
    return length;
  }
}
