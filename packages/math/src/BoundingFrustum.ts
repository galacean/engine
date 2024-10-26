import { BoundingBox } from "./BoundingBox";
import { BoundingSphere } from "./BoundingSphere";
import { CollisionUtil } from "./CollisionUtil";
import { ContainmentType } from "./enums/ContainmentType";
import { FrustumFace } from "./enums/FrustumFace";
import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Matrix } from "./Matrix";
import { Plane } from "./Plane";

/**
 * A bounding frustum.
 */
export class BoundingFrustum implements IClone<BoundingFrustum>, ICopy<BoundingFrustum, BoundingFrustum> {
  /** The near plane of this frustum. */
  public near: Plane;
  /** The far plane of this frustum. */
  public far: Plane;
  /** The left plane of this frustum. */
  public left: Plane;
  /** The right plane of this frustum. */
  public right: Plane;
  /** The bottom plane of this frustum. */
  public bottom: Plane;
  /** The top plane of this frustum. */
  public top: Plane;

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
   * Get the plane by the given frustum face.
   * @param face - The frustum face
   * @returns The plane get
   */
  getPlane(face: FrustumFace): Plane {
    switch (face) {
      case FrustumFace.Near:
        return this.near;
      case FrustumFace.Far:
        return this.far;
      case FrustumFace.Left:
        return this.left;
      case FrustumFace.Right:
        return this.right;
      case FrustumFace.Bottom:
        return this.bottom;
      case FrustumFace.Top:
        return this.top;
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
    nearNormal.set(m14 + m13, m24 + m23, m34 + m33);
    this.near.distance = m44 + m43;
    this.near.normalize();

    // far
    const farNormal = this.far.normal;
    farNormal.set(m14 - m13, m24 - m23, m34 - m33);
    this.far.distance = m44 - m43;

    this.far.normalize();

    // left
    const leftNormal = this.left.normal;
    leftNormal.set(m14 + m11, m24 + m21, m34 + m31);
    this.left.distance = m44 + m41;
    this.left.normalize();

    // right
    const rightNormal = this.right.normal;
    rightNormal.set(m14 - m11, m24 - m21, m34 - m31);
    this.right.distance = m44 - m41;
    this.right.normalize();

    // bottom
    const bottomNormal = this.bottom.normal;
    bottomNormal.set(m14 + m12, m24 + m22, m34 + m32);
    this.bottom.distance = m44 + m42;
    this.bottom.normalize();

    // top
    const topNormal = this.top.normal;
    topNormal.set(m14 - m12, m24 - m22, m34 - m32);
    this.top.distance = m44 - m42;
    this.top.normalize();
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

  /**
   * Creates a clone of this frustum.
   * @returns A clone of this frustum
   */
  clone(): BoundingFrustum {
    const out = new BoundingFrustum();
    out.copyFrom(this);
    return out;
  }

  /**
   * Copy this frustum from the specified frustum.
   * @param source - The specified frustum
   * @returns This frustum
   */
  copyFrom(source: BoundingFrustum): BoundingFrustum {
    this.near.copyFrom(source.near);
    this.far.copyFrom(source.far);
    this.left.copyFrom(source.left);
    this.right.copyFrom(source.right);
    this.bottom.copyFrom(source.bottom);
    this.top.copyFrom(source.top);
    return this;
  }
}
