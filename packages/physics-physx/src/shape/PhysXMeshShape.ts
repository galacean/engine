import { Vector3 } from "@galacean/engine";
import { IMeshShape, IPhysicsMeshSource, MeshColliderCookingFlag } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Mesh shape in PhysX.
 */
export class PhysXMeshShape extends PhysXShape implements IMeshShape {
  private static readonly _tightBoundsFlag = 1; // eTIGHT_BOUNDS = 1 (1<<0)

  private _cookedMesh: CookedMesh;
  private readonly _isConvex: boolean;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial,
    cookingFlags: MeshColliderCookingFlag,
    scale: Vector3,
    source: IPhysicsMeshSource
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;

    const cookedMesh = this._acquireCookedMesh(source, positions, indices, cookingFlags);
    if (!cookedMesh) {
      return;
    }

    this._cookedMesh = cookedMesh;
    this._pxGeometry = this._createGeometry(cookedMesh.pxMesh, scale);
    this._initialize(material, uniqueID);
  }

  /**
   * {@inheritDoc IMeshShape.setMeshData }
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: MeshColliderCookingFlag,
    scale: Vector3,
    source: IPhysicsMeshSource
  ): boolean {
    const cookedMesh = this._acquireCookedMesh(source, positions, indices, cookingFlags);
    if (!cookedMesh) {
      return false;
    }

    this._updateGeometry(cookedMesh.pxMesh, scale);
    this._releaseCookedMesh(this._cookedMesh);
    this._cookedMesh = cookedMesh;
    return true;
  }

  /**
   * {@inheritDoc IMeshShape.setScale }
   */
  setScale(scale: Vector3): void {
    this._updateGeometry(this._cookedMesh.pxMesh, scale);
  }

  /**
   * {@inheritDoc IPhysicsShape.destroy }
   */
  override destroy(): void {
    super.destroy();
    this._releaseCookedMesh(this._cookedMesh);
  }

  private _acquireCookedMesh(
    source: IPhysicsMeshSource,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: MeshColliderCookingFlag
  ): CookedMesh | null {
    const isConvex = this._isConvex;
    let variant = 0;
    if (isConvex) {
      variant = 3; // Convex uses the fourth slot after the triangle preprocessing variants.
    } else if (!(cookingFlags & MeshColliderCookingFlag.Cleaning)) {
      variant = 2; // eDISABLE_CLEAN_MESH also disables welding.
    } else if (cookingFlags & MeshColliderCookingFlag.VertexWelding) {
      variant = 1; // eWELD_VERTICES
    }
    const key = source._getGeometryVersion(!isConvex) * 4 + variant;
    const cache = this._physXPhysics._meshCookCache;
    let variants = cache.get(source);
    const existing = variants?.get(key);
    if (existing) {
      existing.users++;
      return existing;
    }

    const pxMesh = this._cookMesh(positions, indices, variant);
    if (!pxMesh) return null;

    if (!variants) cache.set(source, (variants = new Map()));
    const cookedMesh = { source, key, pxMesh, users: 1 };
    variants.set(key, cookedMesh);
    return cookedMesh;
  }

  private _releaseCookedMesh(cookedMesh: CookedMesh): void {
    if (--cookedMesh.users === 0) {
      const { source, key, pxMesh } = cookedMesh;
      const cache = this._physXPhysics._meshCookCache;
      const variants = cache.get(source)!;
      variants.delete(key);
      if (variants.size === 0) cache.delete(source);
      // Keep the creator's native reference until the last shape is done. PhysX drops
      // the old geometry's reference before acquiring the new one in setGeometry.
      pxMesh.release();
    }
  }

  private _cookMesh(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    variant: number
  ): any | null {
    const {
      _physX: physX,
      _pxPhysics: physics,
      _pxCooking: cooking,
      _pxCookingParams: cookingParams
    } = this._physXPhysics;

    const verticesPtr = this._allocatePositions(positions);
    if (!verticesPtr) return null;
    let indicesPtr = 0;
    let pxMesh: any = null;

    if (this._isConvex) {
      pxMesh = cooking.createConvexMesh(verticesPtr, positions.length, physics);
      !pxMesh && this._logConvexCookingError(physX);
    } else {
      const isU32 = indices instanceof Uint32Array;
      indicesPtr = this._allocateIndices(indices!, isU32);
      if (indicesPtr) {
        physX.setCookingMeshPreprocessParams(cookingParams, variant);
        cooking.setParams(cookingParams);
        pxMesh = cooking.createTriMesh(verticesPtr, positions.length, indicesPtr, indices!.length / 3, !isU32, physics);
        !pxMesh && this._logTriMeshCookingError(physX);
      }
    }

    physX._free(verticesPtr);
    indicesPtr && physX._free(indicesPtr);

    return pxMesh;
  }

  private _logConvexCookingError(physX: any): void {
    switch (physX.getLastConvexCookingResult()) {
      case 1: // eZERO_AREA_TEST_FAILED
        console.error(
          "PhysXMeshShape: Failed to create convex mesh. Could not find 4 vertices that do not form a zero-area triangle."
        );
        break;
      case 2: // ePOLYGONS_LIMIT_REACHED
        console.error(
          "PhysXMeshShape: Failed to create convex mesh within the maximum polygons limit (256). Consider simplifying the mesh."
        );
        break;
      default: // eFAILURE
        console.error("PhysXMeshShape: Failed to create convex mesh. The input geometry may be invalid.");
        break;
    }
  }

  private _logTriMeshCookingError(physX: any): void {
    switch (physX.getLastTriMeshCookingResult()) {
      case 1: // eLARGE_TRIANGLE
        console.error(
          "PhysXMeshShape: Failed to create triangle mesh. One of the triangles is too large. Consider tessellating large triangles."
        );
        break;
      default: // eFAILURE
        console.error("PhysXMeshShape: Failed to create triangle mesh. The input geometry may be invalid.");
        break;
    }
  }

  private _allocatePositions(positions: readonly Vector3[]): number {
    const physX = this._physXPhysics._physX;
    const length = positions.length;
    const ptr = physX._malloc(length * 3 * 4);
    if (!ptr) {
      console.error("PhysXMeshShape: could not allocate vertex data.");
      return 0;
    }
    const view = new Float32Array(physX.HEAPF32.buffer, ptr, length * 3);
    let i = 0;
    for (let offset = 0; i < length; i++, offset += 3) {
      const point = positions[i];
      if (!point) break;
      const x = Math.fround(point.x);
      const y = Math.fround(point.y);
      const z = Math.fround(point.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break;
      view[offset] = x;
      view[offset + 1] = y;
      view[offset + 2] = z;
    }
    if (i === length) return ptr;
    physX._free(ptr);
    console.error("PhysXMeshShape: vertex positions must be finite in Float32.");
    return 0;
  }

  private _allocateIndices(indices: Uint8Array | Uint16Array | Uint32Array, isU32: boolean): number {
    const physX = this._physXPhysics._physX;
    // PhysX accepts 16- or 32-bit indices, so widen 8-bit input to 16 bits.
    const TypedArrayCtor = isU32 ? Uint32Array : Uint16Array;
    const ptr = physX._malloc(indices.length * TypedArrayCtor.BYTES_PER_ELEMENT);
    if (!ptr) {
      console.error("PhysXMeshShape: could not allocate index data.");
      return 0;
    }
    const heap = isU32 ? physX.HEAPU32 : physX.HEAPU16;
    new TypedArrayCtor(heap.buffer, ptr, indices.length).set(indices);
    return ptr;
  }

  private _createGeometry(pxMesh: any, scale: Vector3): any {
    const physX = this._physXPhysics._physX;
    const { x: scaleX, y: scaleY, z: scaleZ } = scale;
    const meshFlag = this._isConvex ? PhysXMeshShape._tightBoundsFlag : 0;

    return this._isConvex
      ? physX.createConvexMeshGeometry(pxMesh, scaleX, scaleY, scaleZ, meshFlag)
      : physX.createTriMeshGeometry(pxMesh, scaleX, scaleY, scaleZ, meshFlag);
  }

  private _updateGeometry(pxMesh: any, scale: Vector3): void {
    const newGeometry = this._createGeometry(pxMesh, scale);
    this._pxShape.setGeometry(newGeometry);
    this._pxGeometry.delete();
    this._pxGeometry = newGeometry;
  }
}

/** @internal Shared cooks per source and input revision. */
export type PhysXMeshCookCache = WeakMap<object, Map<number, CookedMesh>>;

interface CookedMesh {
  readonly source: object;
  readonly key: number;
  readonly pxMesh: { release(): void };
  users: number;
}
