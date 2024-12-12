/**
 * Interface of collision.
 */
export interface ICollision {
  /** The unique id of the first collider. */
  shape0Id: number;
  /** The unique id of the second collider. */
  shape1Id: number;
  /** Count of contact points. */
  contactCount: number;
  /** Get contact points. */
  getContacts(): PhysXVectorPxContactPairPoint;
}

interface PhysXVectorPxContactPairPoint {
  size(): number;
  get(index: number): IContractPoint;
}

interface IContractPoint {
  position: {
    x: number;
    y: number;
    z: number;
  };
  normal: {
    x: number;
    y: number;
    z: number;
  };
  impulse: {
    x: number;
    y: number;
    z: number;
  };
  separation: number;
}
