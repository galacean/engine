import { Quaternion, Vector3, type Vector3Like } from "@galacean/engine-math";
import type { Entity } from "../Entity";
import type { Layer } from "../Layer";

/**
 * @internal
 */
export class PhysicsUtils {
  /** Compare positions submitted directly as native Float32 vectors. */
  static differsF32(a: Vector3, b: Vector3): boolean {
    return (
      PhysicsUtils._componentDiffersF32(a.x, b.x) ||
      PhysicsUtils._componentDiffersF32(a.y, b.y) ||
      PhysicsUtils._componentDiffersF32(a.z, b.z)
    );
  }

  /** Compare orientations after the same normalization and Float32 conversion as the native pose. */
  static rotationDiffersF32(a: Quaternion, b: Quaternion): boolean {
    if (a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w) return false;
    const scaleA = 1 / a.length();
    const scaleB = (Quaternion.dot(a, b) < 0 ? -1 : 1) / b.length();
    return (
      PhysicsUtils._componentDiffersF32(a.x * scaleA, b.x * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.y * scaleA, b.y * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.z * scaleA, b.z * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.w * scaleA, b.w * scaleB)
    );
  }

  /** Whether the value is a positive, normal, finite Float32 extent safe for native physics geometry. */
  static isValidPositiveFloat32(value: number): boolean {
    const f = Math.fround(value);
    return f >= 1.17549435e-38 && Number.isFinite(f);
  }

  /** Validate that a scalar parameter is finite and clamp negative values to 0. */
  static clampNonNegative(value: number, property: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${property} must be finite.`);
    }
    return Math.max(0, value);
  }

  /** Validate the whole input before replacing a unit direction snapshot. */
  static normalizeDirection(current: Vector3, value: Readonly<Vector3Like>, property: string): Vector3 {
    let { x, y, z } = value;
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length)) {
      throw new Error(`${property} must be finite.`);
    }
    if (length === 0) return current;

    x /= length;
    y /= length;
    z /= length;
    return x === current.x && y === current.y && z === current.z ? current : Object.freeze(new Vector3(x, y, z));
  }

  /** Scale a local offset into the Entity's rotation-aligned actor frame. */
  static scaleToActorFrame(entity: Entity, local: Vector3, out: Vector3): void {
    const transform = entity.transform;
    const parent = entity.parent;
    if (parent && !parent.transform._getWorldUniformScaling()) {
      // The native actor applies world rotation, while inherited non-uniform scale can mix local axes.
      const e = transform._getScaleMatrix().elements;
      const { x, y, z } = local;
      out.set(e[0] * x + e[3] * y + e[6] * z, e[1] * x + e[4] * y + e[7] * z, e[2] * x + e[5] * y + e[8] * z);
      return;
    }
    Vector3.multiply(local, transform.lossyWorldScale, out);
  }

  /** Unscale an offset from the Entity's rotation-aligned actor frame back into local space. */
  static unscaleFromActorFrame(entity: Entity, offset: Vector3, out: Vector3): void {
    const transform = entity.transform;
    const parent = entity.parent;
    if (!parent || parent.transform._getWorldUniformScaling()) {
      const scale = transform.lossyWorldScale;
      const x = offset.x / scale.x;
      const y = offset.y / scale.y;
      const z = offset.z / scale.z;
      out.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
      return;
    }

    const e = transform._getScaleMatrix().elements;
    const m00 = e[0],
      m10 = e[1],
      m20 = e[2];
    const m01 = e[3],
      m11 = e[4],
      m21 = e[5];
    const m02 = e[6],
      m12 = e[7],
      m22 = e[8];
    const bx = offset.x,
      by = offset.y,
      bz = offset.z;

    const c00 = m11 * m22 - m21 * m12;
    const c01 = m21 * m02 - m01 * m22;
    const c02 = m01 * m12 - m11 * m02;
    const det = m00 * c00 + m10 * c01 + m20 * c02;

    const g00 = m00 * m00 + m10 * m10 + m20 * m20;
    const g11 = m01 * m01 + m11 * m11 + m21 * m21;
    const g22 = m02 * m02 + m12 * m12 + m22 * m22;
    const volBound = Math.sqrt(g00) * Math.sqrt(g11) * Math.sqrt(g22);
    if (volBound > 0 && Math.abs(det) > volBound * 1e-6) {
      const invDet = 1 / det;
      const x = (c00 * bx + c01 * by + c02 * bz) * invDet;
      const y = ((m20 * m12 - m10 * m22) * bx + (m00 * m22 - m20 * m02) * by + (m10 * m02 - m00 * m12) * bz) * invDet;
      const z = ((m10 * m21 - m20 * m11) * bx + (m20 * m01 - m00 * m21) * by + (m00 * m11 - m10 * m01) * bz) * invDet;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out.set(x, y, z);
        return;
      }
    }

    // Singular scale matrix: project onto the best-conditioned non-degenerate column subspace.
    const g01 = m00 * m01 + m10 * m11 + m20 * m21;
    const g02 = m00 * m02 + m10 * m12 + m20 * m22;
    const g12 = m01 * m02 + m11 * m12 + m21 * m22;
    const r0 = m00 * bx + m10 * by + m20 * bz;
    const r1 = m01 * bx + m11 * by + m21 * bz;
    const r2 = m02 * bx + m12 * by + m22 * bz;

    const d01 = g00 * g11 - g01 * g01;
    const d02 = g00 * g22 - g02 * g02;
    const d12 = g11 * g22 - g12 * g12;
    const s01 = g00 > 0 && g11 > 0 ? d01 / (g00 * g11) : 0;
    const s02 = g00 > 0 && g22 > 0 ? d02 / (g00 * g22) : 0;
    const s12 = g11 > 0 && g22 > 0 ? d12 / (g11 * g22) : 0;
    if (Math.max(s01, s02, s12) > 1e-12) {
      let x = 0;
      let y = 0;
      let z = 0;
      if (s01 >= s02 && s01 >= s12) {
        x = (g11 * r0 - g01 * r1) / d01;
        y = (g00 * r1 - g01 * r0) / d01;
      } else if (s02 >= s12) {
        x = (g22 * r0 - g02 * r2) / d02;
        z = (g00 * r2 - g02 * r0) / d02;
      } else {
        y = (g22 * r1 - g12 * r2) / d12;
        z = (g11 * r2 - g12 * r1) / d12;
      }
      out.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
      return;
    }

    const maxG = Math.max(g00, g11, g22);
    if (maxG > 0) {
      if (g00 >= g11 && g00 >= g22) {
        const x = r0 / g00;
        out.set(Number.isFinite(x) ? x : 0, 0, 0);
      } else if (g11 >= g22) {
        const y = r1 / g11;
        out.set(0, Number.isFinite(y) ? y : 0, 0);
      } else {
        const z = r2 / g22;
        out.set(0, 0, Number.isFinite(z) ? z : 0);
      }
      return;
    }
    out.set(0, 0, 0);
  }

  /** Return the bit index (0-31) of a single collision layer, throwing if multiple or no bits are set. */
  static getLayerIndex(layer: Layer): number {
    const index = 31 - Math.clz32(layer);
    if (index < 0 || (1 << index) >>> 0 !== layer) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }
    return index;
  }

  private static _componentDiffersF32(a: number, b: number): boolean {
    return a !== b && Math.fround(a) !== Math.fround(b);
  }
}
