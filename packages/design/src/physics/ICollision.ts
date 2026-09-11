/**
 * Interface of collision.
 */
export interface ICollision {
  /** The unique ID of the first shape in the contact pair. */
  shape0Id: number;
  /** The unique ID of the second shape in the contact pair. */
  shape1Id: number;
  /** Count of contact points. */
  contactCount: number;
  /**
   * Get contact points.
   * @remarks Contact normals and impulses must point from the second shape in the pair to the first.
   */
  getContacts(): VectorContactPairPoint;
}

interface VectorContactPairPoint {
  size(): number;
  get(index: number): IContactPoint;
}

interface IContactPoint {
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
