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
   *
   * @remarks To optimize performance, the engine does not modify the length of the array you pass.
   * You need to obtain the actual number of contact points from the function's return value.
   */
  getContacts(outContacts: ContactPoint[]): number {
    const nativeCollision = this._nativeCollision;
    const smallerShapeId = Math.min(nativeCollision.shape0Id, nativeCollision.shape1Id);
    const factor = this.shape.id === smallerShapeId ? 1 : -1;
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
