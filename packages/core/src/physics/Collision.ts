import { Vector3 } from "@galacean/engine-math";
import { ColliderShape } from "./shape";
import { ICollision } from "@galacean/engine-design";

/**
 * Describes a contact point where the collision occurs.
 */
export class ContactPoint {
  /** The position of the contact point between the shapes, in world space. */
  readonly position = new Vector3();
  /** The normal of the contacting surfaces at the contact point. The normal direction points from the second shape to the first shape. */
  readonly normal = new Vector3();
  /** The impulse applied at the contact point, in world space. Divide by the simulation time step to get a force value. */
  readonly impulse = new Vector3();
  /** The separation of the shapes at the contact point.  A negative separation denotes a penetration. */
  separation: number;
}

/**
 * Collision information between two shapes when they collide.
 */
export class Collision {
  /** @internal */
  _nativeCollision: ICollision;

  /** The target shape be collided. */
  shape: ColliderShape;

  /**
   * Count of contact points.
   */
  get contactCount(): number {
    return this._nativeCollision.contactCount;
  }

  /**
   * Get contact points.
   * @param outContacts - The result of contact points
   * @returns The result of contact points
   */
  getContacts(outContacts: ContactPoint[]): ContactPoint[] {
    const { shape0Id, shape1Id } = this._nativeCollision;
    outContacts.length = 0;
    const nativeContactPoints = this._nativeCollision.getContacts();
    for (let i = 0, n = nativeContactPoints.size(); i < n; i++) {
      const nativeContractPoint = nativeContactPoints.get(i);
      const { position, normal, impulse, separation } = nativeContractPoint;
      let factor = 1;
      if (shape0Id > shape1Id) {
        factor = -1;
      }

      const contact = (outContacts[i] ||= new ContactPoint());
      contact.position.set(position.x, position.y, position.z);
      contact.normal.set(normal.x, normal.y, normal.z).scale(factor);
      contact.impulse.set(impulse.x, impulse.y, impulse.z).scale(factor);
      contact.separation = separation;
    }
    return outContacts;
  }
}
