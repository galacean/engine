import { MeshColliderShapeCookingFlag, Vector3 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape, ShapeFlag } from "./PhysXColliderShape";

/**
 * Mesh collider shape in PhysX.
 */
export class PhysXMeshColliderShape extends PhysXColliderShape implements IMeshColliderShape {
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
    worldScale: Vector3
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;
    this._worldScale.set(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));

    const pxMesh = this._cookMesh(positions, indices, cookingFlags);
    if (!pxMesh) {
      return;
    }

    const { _physX: physX, _pxPhysics: physics } = physXPhysics;
    const pxGeometry = this._createGeometry(pxMesh);
    const shapeFlags = new physX.PxShapeFlags(ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE);
    const pxMaterial = material._pxMaterial;
    const pxShape = physics.createShape(pxGeometry, pxMaterial, true, shapeFlags);
    shapeFlags.delete();

    if (!pxShape) {
      pxGeometry.delete();
      pxMesh.release();
      return;
    }

    this._id = uniqueID;
    this._pxMaterial = pxMaterial;
    this._pxMesh = pxMesh;
    this._pxGeometry = pxGeometry;
    this._pxShape = pxShape;
    this._pxShape.setUUID(uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IMeshColliderShape.setMeshData }
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: number
  ): boolean {
    const pxMesh = this._cookMesh(positions, indices, cookingFlags);
    if (!pxMesh) {
      return false;
    }

    this._updateGeometry(pxMesh);
    this._pxMesh.release();
    this._pxMesh = pxMesh;
    return true;
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._updateGeometry(this._pxMesh);
  }

  /**
   * {@inheritDoc IColliderShape.destroy }
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
    let pxMesh: any;

    if (this._isConvex) {
      pxMesh = cooking.createConvexMesh(verticesPtr, positions.length, physics);
      physX._free(verticesPtr);

      if (!pxMesh) {
        this._logConvexCookingError(physX);
        return null;
      }
    } else {
      const isU32 = indices instanceof Uint32Array;
      const indicesPtr = this._allocateIndices(indices, isU32);
      pxMesh = cooking.createTriMesh(verticesPtr, positions.length, indicesPtr, indices.length / 3, !isU32, physics);
      physX._free(verticesPtr);
      physX._free(indicesPtr);

      if (!pxMesh) {
        this._logTriMeshCookingError(physX);
        return null;
      }
    }

    return pxMesh;
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
    const ptr = physX._malloc(indices.length * TypedArrayCtor.BYTES_PER_ELEMENT);
    const heap = isU32 ? physX.HEAPU32 : physX.HEAPU16;
    new TypedArrayCtor(heap.buffer, ptr, indices.length).set(indices);
    return ptr;
  }

  private _createGeometry(pxMesh: any): any {
    const physX = this._physXPhysics._physX;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;
    const meshFlag = this._isConvex ? PhysXMeshColliderShape._tightBoundsFlag : 0;

    return this._isConvex
      ? physX.createConvexMeshGeometry(pxMesh, scaleX, scaleY, scaleZ, meshFlag)
      : physX.createTriMeshGeometry(pxMesh, scaleX, scaleY, scaleZ, meshFlag);
  }

  private _updateGeometry(pxMesh: any): void {
    const newGeometry = this._createGeometry(pxMesh);
    this._pxShape.setGeometry(newGeometry);
    this._pxGeometry.delete();
    this._pxGeometry = newGeometry;
  }
}
