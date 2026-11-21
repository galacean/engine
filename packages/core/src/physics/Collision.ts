import { ContactPoint } from "./ContactPoint";
import { Collider } from "./Collider";
import { ICollision } from "@galacean/engine-design";

/**
 * Contact data reported to a script during a collision callback.
 * @remarks The physics scene reuses this object. Read it during the callback and copy any values needed afterward.
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
   * Write contact points to the supplied array.
   * @param outContacts - The array to fill, reusing its existing contact points
   * @returns The number of entries written
   * @remarks The array grows as needed. Entries beyond the returned count are left unchanged.
   */
  getContacts(outContacts: ContactPoint[]): number {
    const nativeCollision = this._nativeCollision;
    const factor = this.selfCollider._id === nativeCollision.shape0Id ? 1 : -1;
    const nativeContactPoints = nativeCollision.getContacts();
    const length = nativeContactPoints.size();
    for (let i = 0; i < length; i++) {
      const nativeContactPoint = nativeContactPoints.get(i);

      const contact = (outContacts[i] ||= new ContactPoint());
      contact.position.copyFrom(nativeContactPoint.position);
      contact.normal.copyFrom(nativeContactPoint.normal).scale(factor);
      contact.impulse.copyFrom(nativeContactPoint.impulse).scale(factor);
      contact.separation = nativeContactPoint.separation;
    }
    return length;
  }
}
