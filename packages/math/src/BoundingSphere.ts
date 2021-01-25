import { IClone } from "@oasis-engine/design";
import { BoundingBox } from "./BoundingBox";
import { Vector3 } from "./Vector3";

/**
 * A bounding sphere.
 * */
export class BoundingSphere implements IClone {
  private static _tempVec30: Vector3 = new Vector3();

  /**
   * Calculate a bounding sphere that fully contains the given points.
   * @param points - The given points
   * @param out - The calculated bounding sphere
   */
  static fromPoints(points: Vector3[], out: BoundingSphere): void {
    if (!points || points.length === 0) {
      throw new Error("points must be array and length must > 0");
    }

    const len = points.length;
    const center = BoundingSphere._tempVec30;
    center.x = center.y = center.z = 0;

    // Calculate the center of the sphere.
    for (let i = 0; i < len; ++i) {
      Vector3.add(points[i], center, center);
    }

    // The center of the sphere.
    Vector3.scale(center, 1 / len, out.center);

    // Calculate the radius of the sphere.
    let radius = 0.0;
    for (let i = 0; i < len; ++i) {
      const distance = Vector3.distanceSquared(center, points[i]);
      distance > radius && (radius = distance);
    }
    // The radius of the sphere.
    out.radius = Math.sqrt(radius);
  }

  /**
   * Calculate a bounding sphere from a given box.
   * @param box - The given box
   * @param out - The calculated bounding sphere
   */
  static fromBox(box: BoundingBox, out: BoundingSphere): void {
    const { center } = out;
    const { min, max } = box;

    center.x = (min.x + max.x) * 0.5;
    center.y = (min.y + max.y) * 0.5;
    center.z = (min.z + max.z) * 0.5;
    out.radius = Vector3.distance(center, max);
  }

  /** The center point of the sphere. */
  public readonly center: Vector3 = new Vector3();
  /** The radius of the sphere. */
  public radius: number = 0;

  /**
   * Constructor of BoundingSphere.
   * @param center - The center point of the sphere
   * @param radius - The radius of the sphere
   */
  constructor(center: Vector3 = null, radius: number = 0) {
    center && center.cloneTo(this.center);
    this.radius = radius;
  }

  /**
   * Creates a clone of this sphere.
   * @returns A clone of this sphere
   */
  clone(): BoundingSphere {
    return new BoundingSphere(this.center, this.radius);
  }

  /**
   * Clones this sphere to the specified sphere.
   * @param out - The specified sphere
   * @returns The specified sphere
   */
  cloneTo(out: BoundingSphere): BoundingSphere {
    this.center.cloneTo(out.center);
    out.radius = this.radius;
    return out;
  }
}
