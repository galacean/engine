import { MeshColliderShapeCookingFlag, Vector3 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape, ShapeFlag } from "./PhysXColliderShape";

/** ConvexMesh flag: eTIGHT_BOUNDS = 1 (1<<0) */
const TIGHT_BOUNDS_FLAG = 1;

/**
 * Mesh collider shape in PhysX.
 */
export class PhysXMeshColliderShape extends PhysXColliderShape implements IMeshColliderShape {
  private _pxMesh: any = null;
  private _isConvex: boolean;
  private _vertices: Float32Array | null;
  private _vertexCount: number;
  private _indices: Uint16Array | Uint32Array | null;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial,
    cookingFlags: number
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;
    this._vertices = vertices;
    this._vertexCount = vertexCount;
    this._indices = indices;

    this._createMeshAndShape(material, uniqueID, cookingFlags);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IMeshColliderShape.setMeshData }
   */
  setMeshData(
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean,
    cookingFlags: number
  ): void {
    // Save old resources
    const oldMesh = this._pxMesh;
    const oldGeometry = this._pxGeometry;

    // Update data and create new mesh
    this._pxMesh = null;
    this._pxGeometry = null;
    this._isConvex = isConvex;
    this._vertices = vertices;
    this._vertexCount = vertexCount;
    this._indices = indices;

    if (!this._createMesh(cookingFlags)) {
      // Restore old resources on failure
      this._pxMesh = oldMesh;
      this._pxGeometry = oldGeometry;
      return;
    }

    this._pxShape.setGeometry(this._pxGeometry);

    // Release old resources only after successful creation
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
    this._releaseMesh();
    super.destroy();
  }

  private _createMeshAndShape(material: PhysXPhysicsMaterial, uniqueID: number, cookingFlags: number): void {
    if (!this._createMesh(cookingFlags)) {
      return;
    }

    const { _physX: physX, _pxPhysics: physics } = this._physXPhysics;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;
    const shapeFlags = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

    // Create shape with material
    if (this._isConvex) {
      this._pxShape = physX.createConvexMeshShape(
        this._pxMesh,
        scaleX,
        scaleY,
        scaleZ,
        TIGHT_BOUNDS_FLAG,
        shapeFlags,
        material._pxMaterial,
        physics
      );
    } else {
      this._pxShape = physX.createTriMeshShape(
        this._pxMesh,
        scaleX,
        scaleY,
        scaleZ,
        0,
        shapeFlags,
        material._pxMaterial,
        physics
      );
    }

    this._id = uniqueID;
    this._pxMaterial = material._pxMaterial;
    this._pxShape.setUUID(uniqueID);
  }

  private _createMesh(cookingFlags: number): boolean {
    const { _physX: physX, _pxPhysics: physics, _pxCooking: cooking, _pxCookingParams: cookingParams } =
      this._physXPhysics;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;

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

    const verticesPtr = this._allocateVertices();

    if (this._isConvex) {
      this._pxMesh = cooking.createConvexMesh(verticesPtr, this._vertexCount, physics);
      physX._free(verticesPtr);
      this._vertices = null;
      this._indices = null;

      if (!this._pxMesh) {
        this._logConvexCookingError(physX);
        return false;
      }

      this._pxGeometry = physX.createConvexMeshGeometry(
        this._pxMesh,
        scaleX,
        scaleY,
        scaleZ,
        TIGHT_BOUNDS_FLAG
      );
    } else {
      if (!this._indices) {
        physX._free(verticesPtr);
        this._vertices = null;
        console.error("PhysXMeshColliderShape: Triangle mesh requires indices.");
        return false;
      }

      const { ptr: indicesPtr, isU16, triangleCount } = this._allocateIndices();
      this._pxMesh = cooking.createTriMesh(verticesPtr, this._vertexCount, indicesPtr, triangleCount, isU16, physics);
      physX._free(verticesPtr);
      physX._free(indicesPtr);
      this._vertices = null;
      this._indices = null;

      if (!this._pxMesh) {
        this._logTriMeshCookingError(physX);
        return false;
      }

      this._pxGeometry = physX.createTriMeshGeometry(
        this._pxMesh,
        scaleX,
        scaleY,
        scaleZ,
        0
      );
    }

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

  private _allocateVertices(): number {
    const physX = this._physXPhysics._physX;
    const ptr = physX._malloc(this._vertexCount * 3 * 4);
    const view = new Float32Array(physX.HEAPF32.buffer, ptr, this._vertexCount * 3);
    view.set(this._vertices);
    return ptr;
  }

  private _allocateIndices(): { ptr: number; isU16: boolean; triangleCount: number } {
    const physX = this._physXPhysics._physX;
    const indices = this._indices!;
    const isU16 = indices instanceof Uint16Array;
    const triangleCount = indices.length / 3;
    const bytesPerIndex = isU16 ? 2 : 4;
    const ptr = physX._malloc(indices.length * bytesPerIndex);

    if (isU16) {
      new Uint16Array(physX.HEAPU16.buffer, ptr, indices.length).set(indices);
    } else {
      new Uint32Array(physX.HEAPU32.buffer, ptr, indices.length).set(indices as Uint32Array);
    }

    return { ptr, isU16, triangleCount };
  }

  private _updateGeometry(): void {
    const physX = this._physXPhysics._physX;
    const { x: scaleX, y: scaleY, z: scaleZ } = this._worldScale;

    const newGeometry = this._isConvex
      ? physX.createConvexMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, TIGHT_BOUNDS_FLAG)
      : physX.createTriMeshGeometry(this._pxMesh, scaleX, scaleY, scaleZ, 0);

    this._pxGeometry.delete();
    this._pxGeometry = newGeometry;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  private _releaseMesh(): void {
    if (this._pxMesh) {
      this._pxMesh.release();
      this._pxMesh = null;
    }
    if (this._pxGeometry) {
      this._pxGeometry.delete();
      this._pxGeometry = null;
    }
  }
}
