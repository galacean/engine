import { Vector3 } from "@galacean/engine-math";
import { ColliderShape } from "./shape";
import { ICollision } from "@galacean/engine-design";

/**
 * Describes a contact point where the collision occurs.
 */
export interface ContractPoint {
  /** The position of the contact point between the shapes, in world space. */
  position: Vector3;
  /** The normal of the contacting surfaces at the contact point. The normal direction points from the second shape to the first shape. */
  normal: Vector3;
  /** The impulse applied at the contact point, in world space. Divide by the simulation time step to get a force value. */
  impulse: Vector3;
  /** The separation of the shapes at the contact point.  A negative separation denotes a penetration. */
  separation: number;
}

export class Collision {
  /** @internal */
  _nativeCollision: ICollision;

  /** The shape be collided. */
  shape: ColliderShape;

  /**
   * Get count of contact points.
   */
  get contactCount(): number {
    return this._nativeCollision.contactCount;
  }

  /**
   * Get contact points.
   * @param contacts - The result of contact points
   * @returns The result of contact points
   */
  getContacts(contacts: ContractPoint[]): ContractPoint[] {
    const nativeContractPoints = this._nativeCollision.getContacts();
    for (let i = 0, n = nativeContractPoints.size(); i < n; i++) {
      const nativeContractPoint = nativeContractPoints.get(i);
      const { position, normal, impulse, separation } = nativeContractPoint;
      const contact: ContractPoint = {
        position: new Vector3(position.x, position.y, position.z),
        normal: new Vector3(normal.x, normal.y, normal.z),
        impulse: new Vector3(impulse.x, impulse.y, impulse.z),
        separation: separation
      };
      contacts.push(contact);
    }
    return contacts;
  }
}
