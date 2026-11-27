import { Matrix, Quaternion, Vector3, type Vector3Like } from "@galacean/engine-math";
import type { Entity } from "../Entity";
import type { Layer } from "../Layer";

/**
 * @internal
 */
export class PhysicsUtils {
  private static readonly _columns = [new Vector3(), new Vector3(), new Vector3()];
  private static readonly _cofactors = [new Vector3(), new Vector3(), new Vector3()];
  private static readonly _localCofactors = new Float64Array(12);
  private static readonly _trsMatrix = new Matrix();
  private static readonly _frameRotation = new Quaternion();

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
    const scale = PhysicsUtils._getDiagonalScale(entity);
    if (scale) {
      Vector3.multiply(local, scale, out);
      return;
    }
    const transform = entity.transform;
    Vector3.transformNormal(local, transform.worldMatrix, out);
    const rotation = PhysicsUtils._frameRotation;
    Quaternion.normalize(transform.worldRotationQuaternion, rotation);
    rotation.conjugate();
    Vector3.transformByQuat(out, rotation, out);
  }

  /** Recover the shortest local offset whose reachable world position is closest to the actor offset. */
  static unscaleFromActorFrame(entity: Entity, offset: Vector3, out: Vector3): void {
    if (offset.x === 0 && offset.y === 0 && offset.z === 0) {
      out.set(0, 0, 0);
      return;
    }
    const scale = PhysicsUtils._getDiagonalScale(entity);
    if (scale) {
      out.set(scale.x ? offset.x / scale.x : 0, scale.y ? offset.y / scale.y : 0, scale.z ? offset.z / scale.z : 0);
      return;
    }
    const transform = entity.transform;
    Quaternion.normalize(transform.worldRotationQuaternion, PhysicsUtils._frameRotation);
    Vector3.transformByQuat(offset, PhysicsUtils._frameRotation, out);
    const columns = PhysicsUtils._columns;
    const cofactors = PhysicsUtils._cofactors;
    const det = PhysicsUtils._readAnchorFrame(entity);
    const a = columns[0],
      b = columns[1],
      c = columns[2];
    const bc = cofactors[0],
      ca = cofactors[1],
      ab = cofactors[2];
    if (det !== 0) {
      out.set(Vector3.dot(out, bc) / det, Vector3.dot(out, ca) / det, Vector3.dot(out, ab) / det);
      return;
    }
    const squaredArea = bc.lengthSquared() + ca.lengthSquared() + ab.lengthSquared();
    if (squaredArea > 0) {
      // For a plane, combine all column pairs to obtain the shortest local anchor for the projected world point.
      Vector3.cross(out, a, a);
      Vector3.cross(out, b, b);
      Vector3.cross(out, c, c);
      out.set(
        (Vector3.dot(b, ab) - Vector3.dot(c, ca)) / squaredArea,
        (Vector3.dot(c, bc) - Vector3.dot(a, ab)) / squaredArea,
        (Vector3.dot(a, ca) - Vector3.dot(b, bc)) / squaredArea
      );
    } else {
      // On a line the pseudoinverse is the transpose divided by the sum of squared column lengths.
      const squaredLength = a.lengthSquared() + b.lengthSquared() + c.lengthSquared();
      const weight = squaredLength > 0 ? 1 / squaredLength : 0;
      out.set(Vector3.dot(a, out) * weight, Vector3.dot(b, out) * weight, Vector3.dot(c, out) * weight);
    }
  }

  /** Return the bit index (0-31) of a single collision layer, throwing if multiple or no bits are set. */
  static getLayerIndex(layer: Layer): number {
    const index = 31 - Math.clz32(layer);
    if ((1 << index) >>> 0 !== layer) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }
    return index;
  }

  private static _getDiagonalScale(entity: Entity): Vector3 | null {
    const transform = entity.transform;
    // Consume WorldScale so a subsequent edit can notify the joint again.
    const scale = transform.lossyWorldScale;
    if (PhysicsUtils._matchesTRS(transform.worldMatrix, scale, transform.worldRotationQuaternion)) return scale;
    const parent = entity.parent;
    if (!parent || !parent.transform._getWorldUniformScaling()) return null;

    // Products of ordinary rotations can round a near-zero coefficient differently from their quaternion product.
    // Uniform ancestors still cancel in actor space if each local matrix actually represents its declared TRS.
    for (let node: Entity | null = entity; node; node = node.parent) {
      const local = node.transform;
      if (!PhysicsUtils._matchesTRS(local.localMatrix, local.scale, local.rotationQuaternion)) return null;
    }
    return scale;
  }

  private static _matchesTRS(matrix: Matrix, scale: Vector3, rotation: Quaternion): boolean {
    const trs = PhysicsUtils._trsMatrix;
    Matrix.affineTransformation(scale, rotation, Vector3._zero, trs);
    const expected = trs.elements,
      actual = matrix.elements;
    // Compare each coefficient at Float32 precision. A genuinely small axis must retain its own scale.
    for (let col = 0; col < 12; col += 4) {
      for (let row = 0; row < 3; row++) {
        const a = expected[col + row],
          b = actual[col + row];
        if (a !== b && Math.abs(a - b) > 4 * 2 ** -23 * Math.max(Math.abs(a), Math.abs(b))) return false;
      }
    }
    return true;
  }

  private static _readAnchorFrame(entity: Entity): number {
    const columns = PhysicsUtils._columns;
    const cofactors = PhysicsUtils._cofactors;
    let node: Entity | null = entity;
    while (node && node.transform.localMatrix.determinant() !== 0) node = node.parent;
    const world = entity.transform.worldMatrix.elements;
    if (!node) {
      for (let i = 0; i < 3; i++) columns[i].copyFromArray(world, i * 4);
      for (let i = 0; i < 3; i++) Vector3.cross(columns[(i + 1) % 3], columns[(i + 2) % 3], cofactors[i]);
      return Vector3.dot(columns[0], cofactors[0]);
    }

    // A collapsed layer has already lost a dimension. A rounded world matrix can falsely regain it.
    // Propagate directions and oriented areas separately: cof(A B) = cof(A) cof(B), even for singular A or B.
    for (let i = 0; i < 3; i++) {
      columns[i].set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
      cofactors[i].copyFrom(columns[i]);
    }
    const firstCollapsed = node;
    const localCofactors = PhysicsUtils._localCofactors;
    for (; node; node = node.parent) {
      const matrix = node.transform.localMatrix;
      const e = matrix.elements;
      const projectedAgain = node !== firstCollapsed && matrix.determinant() === 0;
      for (let i = 0; i < 3; i++) {
        const j = ((i + 1) % 3) * 4,
          k = ((i + 2) % 3) * 4;
        localCofactors[4 * i] = e[j + 1] * e[k + 2] - e[j + 2] * e[k + 1];
        localCofactors[4 * i + 1] = e[j + 2] * e[k] - e[j] * e[k + 2];
        localCofactors[4 * i + 2] = e[j] * e[k + 1] - e[j + 1] * e[k];
      }
      PhysicsUtils._transformBasis(columns, e, projectedAgain);
      PhysicsUtils._transformBasis(cofactors, localCofactors, projectedAgain);
    }
    // Use the same Float32 world columns as the forward map, restricted to the surviving plane or line.
    let axis = PhysicsUtils._longest(cofactors);
    const plane = axis.lengthSquared() > 0;
    if (!plane) axis = PhysicsUtils._longest(columns);
    const length = axis.length();
    if (length > 0) {
      const x = axis.x / length,
        y = axis.y / length,
        z = axis.z / length;
      for (let i = 0; i < 3; i++) {
        const v = columns[i].copyFromArray(world, i * 4);
        const dot = v.x * x + v.y * y + v.z * z;
        if (plane) v.set(v.x - dot * x, v.y - dot * y, v.z - dot * z);
        else v.set(dot * x, dot * y, dot * z);
      }
      if (plane) {
        for (let i = 0; i < 3; i++) Vector3.cross(columns[(i + 1) % 3], columns[(i + 2) % 3], cofactors[i]);
      }
    }
    return 0;
  }

  private static _longest(basis: Vector3[]): Vector3 {
    let longest = basis[0];
    for (let i = 1; i < 3; i++) if (basis[i].lengthSquared() > longest.lengthSquared()) longest = basis[i];
    return longest;
  }

  private static _transformBasis(basis: Vector3[], e: Float32Array | Float64Array, projectedAgain: boolean): void {
    // Successive projections can annihilate a direction or an entire plane. Discard only roundoff at that step.
    let roundoff = 0;
    if (projectedAgain) {
      for (let i = 0; i < 12; i += 4) roundoff += e[i] * e[i] + e[i + 1] * e[i + 1] + e[i + 2] * e[i + 2];
      roundoff *= (8 * Number.EPSILON) ** 2;
    }
    for (let i = 0; i < 3; i++) {
      const v = basis[i];
      const { x, y, z } = v;
      const tolerance = roundoff * v.lengthSquared();
      v.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
      if (projectedAgain && v.lengthSquared() <= tolerance) v.set(0, 0, 0);
    }
  }

  private static _componentDiffersF32(a: number, b: number): boolean {
    return a !== b && Math.fround(a) !== Math.fround(b);
  }
}
