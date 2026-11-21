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

  /** The Collider on the other side of this contact pair. */
  collider: Collider;
  /** The receiving Collider. Contact normals and impulses are oriented from {@link collider} toward this Collider. */
  selfCollider: Collider;

  /** The number of contact points in this callback. */
  get contactCount(): number {
    return this._nativeCollision.contactCount;
  }

  /**
   * Copies contact points into the supplied array.
   * @param outContacts - Output array. Existing contact objects are reused, and the array grows as needed.
   * @returns The number of entries written. Entries beyond this count are left unchanged.
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
