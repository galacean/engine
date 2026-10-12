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
  /**
   * Release the native vector.
   * @internal
   * @remarks Backends that hand out an Embind-owned vector must implement this;
   * the JS GC cannot reclaim wasm heap memory. Backends returning plain JS
   * objects implement it as a no-op.
   */
  delete(): void;
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
  /**
   * Release this native contact point copy.
   * @internal
   * @remarks Embind `get(index)` returns an owned copy allocated on the wasm
   * heap; it must be released explicitly. No-op for plain JS implementations.
   */
  delete(): void;
}
