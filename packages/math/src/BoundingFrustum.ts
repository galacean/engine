import { IClone } from "./IClone";
import { BoundingBox } from "./BoundingBox";
import { BoundingSphere } from "./BoundingSphere";
import { CollisionUtil } from "./CollisionUtil";
import { ContainmentType } from "./enums/ContainmentType";
import { Matrix } from "./Matrix";
import { Plane } from "./Plane";

/**
 * A bounding frustum.
 */
export class BoundingFrustum implements IClone {
  /** The near plane of this frustum. */
  public near: Plane;
  /** The far plane of this frustum. */
  public far: Plane;
  /** The left plane of this frustum. */
  public left: Plane;
  /** The right plane of this frustum. */
  public right: Plane;
  /** The top plane of this frustum. */
  public top: Plane;
  /** The bottom plane of this frustum. */
  public bottom: Plane;

  /**
   * Constructor of BoundingFrustum.
   * @param matrix - The view-projection matrix
   */
  constructor(matrix: Matrix = null) {
    this.near = new Plane();
    this.far = new Plane();
    this.left = new Plane();
    this.right = new Plane();
    this.top = new Plane();
    this.bottom = new Plane();

    matrix && this.calculateFromMatrix(matrix);
  }

  /**
   * Creates a clone of this frustum.
   * @returns A clone of this frustum
   */
  clone(): BoundingFrustum {
    const bf = new BoundingFrustum();
    this.cloneTo(bf);
    return bf;
  }

  /**
   * Clones this frustum to the specified frustum.
   * @param out - The specified frustum
   * @returns The specified frustum
   */
  cloneTo(out: BoundingFrustum): BoundingFrustum {
    this.near.cloneTo(out.near);
    this.far.cloneTo(out.far);
    this.left.cloneTo(out.left);
    this.right.cloneTo(out.right);
    this.top.cloneTo(out.top);
    this.bottom.cloneTo(out.bottom);
    return out;
  }

  /**
   * Get the plane by the given index.
   * 0: near
   * 1: far
   * 2: left
   * 3: right
   * 4: top
   * 5: bottom
   * @param index - The index
   * @returns The plane get
   */
  getPlane(index: number): Plane {
    switch (index) {
      case 0:
        return this.near;
      case 1:
        return this.far;
      case 2:
        return this.left;
      case 3:
        return this.right;
      case 4:
        return this.top;
      case 5:
        return this.bottom;
      default:
        return null;
    }
  }

  /**
   * Update all planes from the given matrix.
   * @param matrix - The given view-projection matrix
   */
  public calculateFromMatrix(matrix: Matrix): void {
    const me = matrix.elements;
    const m11 = me[0];
    const m12 = me[1];
    const m13 = me[2];
    const m14 = me[3];
    const m21 = me[4];
    const m22 = me[5];
    const m23 = me[6];
    const m24 = me[7];
    const m31 = me[8];
    const m32 = me[9];
    const m33 = me[10];
    const m34 = me[11];
    const m41 = me[12];
    const m42 = me[13];
    const m43 = me[14];
    const m44 = me[15];

    // near
    const nearNormal = this.near.normal;
    nearNormal.x = -m14 - m13;
    nearNormal.y = -m24 - m23;
    nearNormal.z = -m34 - m33;
    this.near.distance = -m44 - m43;
    this.near.normalize();

    // far
    const farNormal = this.far.normal;
    farNormal.x = m13 - m14;
    farNormal.y = m23 - m24;
    farNormal.z = m33 - m34;
    this.far.distance = m43 - m44;

    this.far.normalize();

    // left
    const leftNormal = this.left.normal;
    leftNormal.x = -m14 - m11;
    leftNormal.y = -m24 - m21;
    leftNormal.z = -m34 - m31;
    this.left.distance = -m44 - m41;
    this.left.normalize();

    // right
    const rightNormal = this.right.normal;
    rightNormal.x = m11 - m14;
    rightNormal.y = m21 - m24;
    rightNormal.z = m31 - m34;
    this.right.distance = m41 - m44;
    this.right.normalize();

    // top
    const topNormal = this.top.normal;
    topNormal.x = m12 - m14;
    topNormal.y = m22 - m24;
    topNormal.z = m32 - m34;
    this.top.distance = m42 - m44;
    this.top.normalize();

    // bottom
    const bottomNormal = this.bottom.normal;
    bottomNormal.x = -m14 - m12;
    bottomNormal.y = -m24 - m22;
    bottomNormal.z = -m34 - m32;
    this.bottom.distance = -m44 - m42;
    this.bottom.normalize();
  }

  /**
   * Get whether or not a specified bounding box intersects with this frustum (Contains or Intersects).
   * @param box - The box for testing
   * @returns True if bounding box intersects with this frustum, false otherwise
   */
  public intersectsBox(box: BoundingBox): boolean {
    return CollisionUtil.intersectsFrustumAndBox(this, box);
  }

  /**
   * Get whether or not a specified bounding sphere intersects with this frustum (Contains or Intersects).
   * @param sphere - The sphere for testing
   * @returns True if bounding sphere intersects with this frustum, false otherwise
   */
  public intersectsSphere(sphere: BoundingSphere): boolean {
    return CollisionUtil.frustumContainsSphere(this, sphere) !== ContainmentType.Disjoint;
  }
}
