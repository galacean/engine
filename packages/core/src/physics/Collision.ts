import { ContactPoint } from "./ContactPoint";
import { ColliderShape } from "./shape";
import { ICollision } from "@galacean/engine-design";

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
   * @returns The actual count of contact points
   * @remarks To optimize performance, the engine does not modify the length of the array you pass.
   * You need to obtain the actual number of contact points from the function's return value.
   */
  getContacts(outContacts: ContactPoint[]): number {
    const { shape0Id, shape1Id } = this._nativeCollision;
    const factor = shape0Id < shape1Id ? 1 : -1;

    const nativeContactPoints = this._nativeCollision.getContacts();
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
