import { MeshColliderCookingFlag, Vector3 } from "@galacean/engine";
import { IMeshShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Mesh shape in PhysX.
 */
export class PhysXMeshShape extends PhysXShape implements IMeshShape {
  private static readonly _tightBoundsFlag = 1; // eTIGHT_BOUNDS = 1 (1<<0)

  private _pxMesh: any = null;
  private readonly _isConvex: boolean;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial,
    cookingFlags: number,
    scale: Vector3
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;

    const pxMesh = this._cookMesh(positions, indices, cookingFlags);
    if (!pxMesh) {
      return;
    }

    const pxGeometry = this._createGeometry(pxMesh, scale);
    const pxShape = this._createShape(pxGeometry, material);

    this._id = uniqueID;
    this._pxMesh = pxMesh;
    this._pxGeometry = pxGeometry;
    this._pxShape = pxShape;
    this._pxShape.setUUID(uniqueID);
  }

  /**
   * {@inheritDoc IMeshShape.setMeshData }
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: number,
    scale: Vector3
  ): boolean {
    const pxMesh = this._cookMesh(positions, indices, cookingFlags);
    if (!pxMesh) {
      return false;
    }

    this._updateGeometry(pxMesh, scale);
    this._pxMesh.release();
    this._pxMesh = pxMesh;
    return true;
  }

  /**
   * {@inheritDoc IMeshShape.setScale }
   */
  setScale(scale: Vector3): void {
    this._updateGeometry(this._pxMesh, scale);
  }

  /**
   * {@inheritDoc IPhysicsShape.destroy }
   */
  override destroy(): void {
    this._pxMesh.release();
    super.destroy();
  }

  private _cookMesh(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: number
  ): any | null {
    const {
      _physX: physX,
      _pxPhysics: physics,
      _pxCooking: cooking,
      _pxCookingParams: cookingParams
    } = this._physXPhysics;

    // The cooking instance is shared, so set its preprocessing flags for each cook.
    let preprocessFlags = 0;
    if (cookingFlags & MeshColliderCookingFlag.VertexWelding) {
      preprocessFlags |= 1; // eWELD_VERTICES
    }
    if (!(cookingFlags & MeshColliderCookingFlag.Cleaning)) {
      preprocessFlags |= 2; // eDISABLE_CLEAN_MESH
    }
    physX.setCookingMeshPreprocessParams(cookingParams, preprocessFlags);
    cooking.setParams(cookingParams);

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

  private _allocatePositions(positions: Vector3[]): number {
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
