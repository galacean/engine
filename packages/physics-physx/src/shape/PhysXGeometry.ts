import { Quaternion, Vector3 } from "@galacean/engine";

/**
 * Base class for PhysX geometry types.
 */
export class PhysXGeometry {
  protected _physX: any;
  protected _geometry: any;

  constructor(physX: any) {
    this._physX = physX;
  }

  /**
   * Get the underlying PhysX geometry object.
   */
  getGeometry(): any {
    return this._geometry;
  }

  /**
   * Calculate the distance from a point to this geometry.
   * @param pose - The transform of the geometry
   * @param point - The point to calculate distance from
   * @returns Object containing distance and closest point
   */
  pointDistance(
    pose: { translation: Vector3; rotation: Quaternion },
    point: Vector3
  ): { distance: number; closestPoint: Vector3 } {
    return this._geometry.pointDistance(pose, point);
  }

  release(): void {
    this._geometry.delete();
  }
}
