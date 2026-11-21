import { Vector3, Vector4 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { HavokPhysics } from "../HavokPhysics";
import { HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HP_ShapeId, ZERO_HANDLE } from "../HavokTypes";
import { HavokColliderShape } from "./HavokColliderShape";

const MIN_SCALE = Math.fround(1e-6);

interface PreparedMeshData {
  vertices: Float32Array;
  indices: Int32Array | null;
}

/**
 * Mesh collider shape (convex hull or triangle mesh) for Havok.
 * Note: Shapes start at unit scale and receive world scale via setWorldScale().
 * World scale is baked into vertices so container child scale stays [1,1,1] and Havok query colId
 * always resolves directly to the leaf shape handle.
 */
export class HavokMeshColliderShape extends HavokColliderShape implements IMeshColliderShape {
  private readonly _isConvex: boolean;
  private _rawVertices: Float32Array | null = null;
  private _validIndices: Int32Array | null = null;

  constructor(
    havokPhysics: HavokPhysics,
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: HavokPhysicsMaterial
  ) {
    super(havokPhysics, uniqueID, material);
    this._isConvex = isConvex;

    const prepared = this._prepareMeshData(positions, indices);
    if (!prepared) {
      return;
    }
    const hkShape = this._createHKShape(prepared.vertices, prepared.indices);
    if (!hkShape) {
      return;
    }
    this._rawVertices = prepared.vertices;
    this._validIndices = prepared.indices;
    this._initShape(hkShape);
  }

  setMeshData(positions: Vector3[], indices: Uint8Array | Uint16Array | Uint32Array | null): boolean {
    const prepared = this._prepareMeshData(positions, indices);
    if (!prepared) {
      return false;
    }
    const hkShape = this._createHKShape(prepared.vertices, prepared.indices);
    if (!hkShape) {
      return false;
    }
    this._rawVertices = prepared.vertices;
    this._validIndices = prepared.indices;
    this._replaceHKShape(hkShape);
    return true;
  }

  protected override _onScaleChanged(): void {
    if (!this._rawVertices) return;
    const hkShape = this._createHKShape(this._rawVertices, this._validIndices);
    if (hkShape) {
      this._replaceHKShape(hkShape);
    }
  }

  override pointDistance(point: Vector3): Vector4 {
    const out = HavokColliderShape._tempVector4;
    if (!this._hkShape || !this._isConvex) {
      out.set(point.x, point.y, point.z, -1);
      return out;
    }

    const worldPos = HavokColliderShape._tempWorldPos;
    const worldRot = HavokColliderShape._tempWorldRot;
    this._getWorldPose(worldPos, worldRot);

    if (!this._havokPhysics._querySingleShapePointDistance(this._hkShape, worldPos, worldRot, point, out)) {
      out.set(point.x, point.y, point.z, 0);
    }
    return out;
  }

  override destroy(): void {
    this._rawVertices = null;
    this._validIndices = null;
    super.destroy();
  }

  private _prepareMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null
  ): PreparedMeshData | null {
    const numVerts = positions.length;
    if (numVerts === 0) {
      this._logCookingError("The input geometry has no vertices.");
      return null;
    }

    const vertices = new Float32Array(numVerts * 3);
    for (let i = 0, o = 0; i < numVerts; i++, o += 3) {
      const p = positions[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        this._logCookingError("The input geometry contains non-finite vertex coordinates.");
        return null;
      }
      vertices[o] = p.x;
      vertices[o + 1] = p.y;
      vertices[o + 2] = p.z;
    }

    if (this._isConvex) {
      if (numVerts < 4 || !this._hasNonZeroVolume(vertices)) {
        this._logCookingError("Could not find 4 vertices that do not form a zero-area triangle.");
        return null;
      }
      return { vertices, indices: null };
    }

    if (!indices || indices.length < 3 || indices.length % 3 !== 0) {
      this._logCookingError("The input geometry may be invalid.");
      return null;
    }

    const rawTriCount = indices.length / 3;
    const validBuf = new Int32Array(indices.length);
    let validCount = 0;
    for (let t = 0; t < rawTriCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];
      if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts) {
        this._logCookingError("Triangle index out of vertex bounds.");
        return null;
      }
      if (i0 === i1 || i1 === i2 || i2 === i0) {
        continue;
      }
      const o0 = i0 * 3;
      const o1 = i1 * 3;
      const o2 = i2 * 3;
      const abx = vertices[o1] - vertices[o0];
      const aby = vertices[o1 + 1] - vertices[o0 + 1];
      const abz = vertices[o1 + 2] - vertices[o0 + 2];
      const acx = vertices[o2] - vertices[o0];
      const acy = vertices[o2 + 1] - vertices[o0 + 1];
      const acz = vertices[o2 + 2] - vertices[o0 + 2];
      const abSq = abx * abx + aby * aby + abz * abz;
      const acSq = acx * acx + acy * acy + acz * acz;
      const refSq = abSq * acSq;
      if (refSq <= 0) {
        continue;
      }
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      if (cx * cx + cy * cy + cz * cz > refSq * 1e-12) {
        validBuf[validCount++] = i0;
        validBuf[validCount++] = i1;
        validBuf[validCount++] = i2;
      }
    }

    if (validCount === 0) {
      this._logCookingError("The input geometry may be invalid.");
      return null;
    }

    return {
      vertices,
      indices: validCount === validBuf.length ? validBuf : validBuf.slice(0, validCount)
    };
  }

  private _createHKShape(vertices: Float32Array, indices: Int32Array | null): HP_ShapeId | null {
    const hk = this._havokPhysics._hk;
    const numVerts = vertices.length / 3;
    const sx = Math.fround(Math.max(this._worldScale.x, MIN_SCALE));
    const sy = Math.fround(Math.max(this._worldScale.y, MIN_SCALE));
    const sz = Math.fround(Math.max(this._worldScale.z, MIN_SCALE));
    if (!(Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz))) {
      return null;
    }

    let vertsPtr = 0;
    let trisPtr = 0;
    try {
      vertsPtr = hk._malloc(vertices.length * 4);
      if (vertsPtr === 0) {
        this._logCookingError("Failed to allocate WASM vertex buffer.");
        return null;
      }
      const vertOffset = vertsPtr >>> 2;
      const heapF32 = hk.HEAPF32;
      if (sx === 1 && sy === 1 && sz === 1) {
        heapF32.set(vertices, vertOffset);
      } else {
        for (let o = 0, len = vertices.length; o < len; o += 3) {
          heapF32[vertOffset + o] = vertices[o] * sx;
          heapF32[vertOffset + o + 1] = vertices[o + 1] * sy;
          heapF32[vertOffset + o + 2] = vertices[o + 2] * sz;
        }
      }

      let res: { value: number };
      let shapeId: HP_ShapeId;
      if (this._isConvex) {
        [res, shapeId] = hk.HP_Shape_CreateConvexHull(vertsPtr, numVerts);
      } else {
        const idx = indices!;
        trisPtr = hk._malloc(idx.length * 4);
        if (trisPtr === 0) {
          this._logCookingError("Failed to allocate WASM index buffer.");
          return null;
        }
        hk.HEAP32.set(idx, trisPtr >>> 2);
        [res, shapeId] = hk.HP_Shape_CreateMesh(vertsPtr, numVerts, trisPtr, idx.length / 3);
      }

      if (res.value !== hk.Result.RESULT_OK.value || shapeId[0] === ZERO_HANDLE[0]) {
        this._logCookingError("The input geometry may be invalid.");
        return null;
      }
      return shapeId;
    } finally {
      if (trisPtr !== 0) {
        hk._free(trisPtr);
      }
      if (vertsPtr !== 0) {
        hk._free(vertsPtr);
      }
    }
  }

  private _logCookingError(reason: string): void {
    const kind = this._isConvex ? "convex" : "triangle";
    console.error(`HavokMeshColliderShape: Failed to create ${kind} mesh. ${reason}`);
  }

  private _hasNonZeroVolume(vertices: Float32Array): boolean {
    const len = vertices.length;
    const p0x = vertices[0];
    const p0y = vertices[1];
    const p0z = vertices[2];

    // Pass 1: farthest point p1 from p0
    let maxDistSq = 0;
    let e1x = 0,
      e1y = 0,
      e1z = 0;
    for (let o = 3; o < len; o += 3) {
      const dx = vertices[o] - p0x;
      const dy = vertices[o + 1] - p0y;
      const dz = vertices[o + 2] - p0z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        e1x = dx;
        e1y = dy;
        e1z = dz;
      }
    }
    if (maxDistSq <= 1e-12) {
      return false;
    }

    // Pass 2: point p2 maximizing triangle area with (p0, p1)
    let maxCrossSq = 0;
    let nx = 0,
      ny = 0,
      nz = 0;
    for (let o = 3; o < len; o += 3) {
      const dx = vertices[o] - p0x;
      const dy = vertices[o + 1] - p0y;
      const dz = vertices[o + 2] - p0z;
      const cx = e1y * dz - e1z * dy;
      const cy = e1z * dx - e1x * dz;
      const cz = e1x * dy - e1y * dx;
      const cSq = cx * cx + cy * cy + cz * cz;
      if (cSq > maxCrossSq) {
        maxCrossSq = cSq;
        nx = cx;
        ny = cy;
        nz = cz;
      }
    }
    if (maxCrossSq <= 1e-12 * maxDistSq * maxDistSq) {
      return false;
    }

    // Pass 3: point p3 maximizing height off the (p0, p1, p2) plane
    const invNorm = 1 / Math.sqrt(maxCrossSq);
    nx *= invNorm;
    ny *= invNorm;
    nz *= invNorm;
    const minHeight = 1e-6 * Math.sqrt(maxDistSq);
    for (let o = 3; o < len; o += 3) {
      const height = Math.abs((vertices[o] - p0x) * nx + (vertices[o + 1] - p0y) * ny + (vertices[o + 2] - p0z) * nz);
      if (height > minHeight) {
        return true;
      }
    }
    return false;
  }
}
