import { MeshColliderShapeCookingFlag, Vector3 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape, ShapeFlag } from "./PhysXColliderShape";

/**
 * Mesh collider shape in PhysX.
 */
export class PhysXMeshColliderShape extends PhysXColliderShape implements IMeshColliderShape {
  /** @internal eTIGHT_BOUNDS = 1 (1<<0) */
  private static _tightBoundsFlag = 1;

  private _pxMesh: any = null;
  private _isConvex: boolean;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial,
    cookingFlags: number
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;

    if (!this._createMesh(positions, indices, cookingFlags)) {
      return;
    }

    const { _physX: physX, _pxPhysics: physics } = physXPhysics;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;
    const shapeFlags = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;
    const meshFlag = isConvex ? PhysXMeshColliderShape._tightBoundsFlag : 0;
    const createShapeFn = isConvex ? physX.createConvexMeshShape : physX.createTriMeshShape;

    this._pxShape = createShapeFn(
      this._pxMesh, scaleX, scaleY, scaleZ, meshFlag, shapeFlags, material._pxMaterial, physics
    );

    this._id = uniqueID;
    this._pxMaterial = material._pxMaterial;
    this._pxShape.setUUID(uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IMeshColliderShape.setMeshData }
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    cookingFlags: number
  ): void {
    const oldMesh = this._pxMesh;
    const oldGeometry = this._pxGeometry;

    this._pxMesh = null;
    this._pxGeometry = null;
    this._isConvex = isConvex;

    if (!this._createMesh(positions, indices, cookingFlags)) {
      this._pxMesh = oldMesh;
      this._pxGeometry = oldGeometry;
      return;
    }

    this._pxShape.setGeometry(this._pxGeometry);

    if (oldMesh) {
      oldMesh.release();
    }
    if (oldGeometry) {
      oldGeometry.delete();
    }
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._updateGeometry();
  }

  /**
   * {@inheritDoc IColliderShape.destroy }
   */
  override destroy(): void {
    this._pxMesh?.release();
    super.destroy();
  }

  private _createMesh(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: number
  ): boolean {
    const { _physX: physX, _pxPhysics: physics, _pxCooking: cooking, _pxCookingParams: cookingParams } =
      this._physXPhysics;

    // Apply per-shape cooking flags
    let preprocessFlags = 0;
    if (cookingFlags & MeshColliderShapeCookingFlag.VertexWelding) {
      preprocessFlags |= 1; // eWELD_VERTICES
    }
    if (!(cookingFlags & MeshColliderShapeCookingFlag.Cleaning)) {
      preprocessFlags |= 2; // eDISABLE_CLEAN_MESH
    }
    physX.setCookingMeshPreprocessParams(cookingParams, preprocessFlags);
    cooking.setParams(cookingParams);

    const verticesPtr = this._allocatePositions(positions);

    if (this._isConvex) {
      this._pxMesh = cooking.createConvexMesh(verticesPtr, positions.length, physics);
      physX._free(verticesPtr);

      if (!this._pxMesh) {
        this._logConvexCookingError(physX);
        return false;
      }
    } else {
      if (!indices) {
        physX._free(verticesPtr);
        console.error("PhysXMeshColliderShape: Triangle mesh requires indices.");
        return false;
      }

      const isU32 = indices instanceof Uint32Array;
      const indicesPtr = this._allocateIndices(indices, isU32);
      this._pxMesh = cooking.createTriMesh(verticesPtr, positions.length, indicesPtr, indices.length / 3, !isU32, physics);
      physX._free(verticesPtr);
      physX._free(indicesPtr);

      if (!this._pxMesh) {
        this._logTriMeshCookingError(physX);
        return false;
      }
    }

    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;
    const meshFlag = this._isConvex ? PhysXMeshColliderShape._tightBoundsFlag : 0;
    this._pxGeometry = this._isConvex
      ? physX.createConvexMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, meshFlag)
      : physX.createTriMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, meshFlag);

    return true;
  }

  private _logConvexCookingError(physX: any): void {
    switch (physX.getLastConvexCookingResult()) {
      case 1: // eZERO_AREA_TEST_FAILED
        console.error(
          "PhysXMeshColliderShape: Failed to create convex mesh. Could not find 4 vertices that do not form a zero-area triangle."
        );
        break;
      case 2: // ePOLYGONS_LIMIT_REACHED
        console.error(
          "PhysXMeshColliderShape: Failed to create convex mesh within the maximum polygons limit (256). Consider simplifying the mesh."
        );
        break;
      default: // eFAILURE
        console.error("PhysXMeshColliderShape: Failed to create convex mesh. The input geometry may be invalid.");
        break;
    }
  }

  private _logTriMeshCookingError(physX: any): void {
    switch (physX.getLastTriMeshCookingResult()) {
      case 1: // eLARGE_TRIANGLE
        console.error(
          "PhysXMeshColliderShape: Failed to create triangle mesh. One of the triangles is too large. Consider tessellating large triangles."
        );
        break;
      default: // eFAILURE
        console.error("PhysXMeshColliderShape: Failed to create triangle mesh. The input geometry may be invalid.");
        break;
    }
  }

  private _allocatePositions(positions: Vector3[]): number {
    const physX = this._physXPhysics._physX;
    const length = positions.length;
    const ptr = physX._malloc(length * 3 * 4);
    const view = new Float32Array(physX.HEAPF32.buffer, ptr, length * 3);
    for (let i = 0, offset = 0; i < length; i++, offset += 3) {
      positions[i].copyToArray(view, offset);
    }
    return ptr;
  }

  private _allocateIndices(indices: Uint8Array | Uint16Array | Uint32Array, isU32: boolean): number {
    const physX = this._physXPhysics._physX;
    // Uint8Array and Uint16Array both write as Uint16 (PhysX minimum index size)
    const TypedArrayCtor = isU32 ? Uint32Array : Uint16Array;
    const heap = isU32 ? physX.HEAPU32 : physX.HEAPU16;
    const ptr = physX._malloc(indices.length * TypedArrayCtor.BYTES_PER_ELEMENT);
    new TypedArrayCtor(heap.buffer, ptr, indices.length).set(indices);
    return ptr;
  }

  private _updateGeometry(): void {
    const physX = this._physXPhysics._physX;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;
    const meshFlag = this._isConvex ? PhysXMeshColliderShape._tightBoundsFlag : 0;

    const newGeometry = this._isConvex
      ? physX.createConvexMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, meshFlag)
      : physX.createTriMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, meshFlag);

    this._pxGeometry.delete();
    this._pxGeometry = newGeometry;
    this._pxShape.setGeometry(this._pxGeometry);
  }

}
