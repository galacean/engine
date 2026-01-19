import { Vector3 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape, ShapeFlag } from "./PhysXColliderShape";

/**
 * Mesh collider shape in PhysX.
 */
// Flags:
// - TriangleMesh: eDOUBLE_SIDED = 2 (1<<1)
// - ConvexMesh: eTIGHT_BOUNDS = 1 (1<<0)
const DOUBLE_SIDED_FLAG = 2;
const TIGHT_BOUNDS_FLAG = 1;

export class PhysXMeshColliderShape extends PhysXColliderShape implements IMeshColliderShape {
  private _pxMesh: any = null;
  private _isConvex: boolean;
  private _doubleSided: boolean = false;
  private _tightBounds: boolean = true;
  private _vertices: Float32Array;
  private _vertexCount: number;
  private _indices: Uint16Array | Uint32Array | null;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial
  ) {
    super(physXPhysics);
    this._isConvex = isConvex;
    this._vertices = vertices;
    this._vertexCount = vertexCount;
    this._indices = indices;

    this._createMeshAndShape(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IMeshColliderShape.setMeshData }
   */
  setMeshData(
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean
  ): void {
    // Release old mesh
    this._releaseMesh();

    this._isConvex = isConvex;
    this._vertices = vertices;
    this._vertexCount = vertexCount;
    this._indices = indices;

    // Recreate geometry and update shape
    this._createMeshGeometry();
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * {@inheritDoc IMeshColliderShape.setDoubleSided }
   */
  setDoubleSided(value: boolean): void {
    this._doubleSided = value;
    if (!this._isConvex && this._pxMesh) {
      this._updateMeshScale();
    }
  }

  /**
   * {@inheritDoc IMeshColliderShape.setTightBounds }
   */
  setTightBounds(value: boolean): void {
    this._tightBounds = value;
    if (this._isConvex && this._pxMesh) {
      this._updateMeshScale();
    }
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._updateMeshScale();
  }

  /**
   * {@inheritDoc IColliderShape.destroy }
   */
  override destroy(): void {
    this._releaseMesh();
    super.destroy();
  }

  private _createMeshAndShape(material: PhysXPhysicsMaterial, uniqueID: number): void {
    const physX = this._physXPhysics._physX;
    const physics = this._physXPhysics._pxPhysics;
    const cooking = this._physXPhysics._pxCooking;

    // Allocate memory for vertices
    const verticesPtr = physX._malloc(this._vertexCount * 3 * 4);
    const verticesView = new Float32Array(physX.HEAPF32.buffer, verticesPtr, this._vertexCount * 3);
    verticesView.set(this._vertices);

    const shapeFlags = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

    if (this._isConvex) {
      // Create convex mesh
      this._pxMesh = cooking.createConvexMesh(verticesPtr, this._vertexCount, physics);

      // Use helper to create shape directly
      this._pxShape = physX.createConvexMeshShape(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._tightBounds ? TIGHT_BOUNDS_FLAG : 0,
        shapeFlags,
        material._pxMaterial,
        physics
      );

      // Also create geometry for later use (setGeometry)
      this._pxGeometry = physX.createConvexMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._tightBounds ? TIGHT_BOUNDS_FLAG : 0
      );
    } else {
      // Create triangle mesh
      if (!this._indices) {
        physX._free(verticesPtr);
        throw new Error("Triangle mesh requires indices");
      }

      const isU16 = this._indices instanceof Uint16Array;
      const triangleCount = this._indices.length / 3;

      // Allocate memory for indices
      const bytesPerIndex = isU16 ? 2 : 4;
      const indicesPtr = physX._malloc(this._indices.length * bytesPerIndex);

      if (isU16) {
        const indicesView = new Uint16Array(physX.HEAPU16.buffer, indicesPtr, this._indices.length);
        indicesView.set(this._indices);
      } else {
        const indicesView = new Uint32Array(physX.HEAPU32.buffer, indicesPtr, this._indices.length);
        indicesView.set(this._indices as Uint32Array);
      }

      this._pxMesh = cooking.createTriMesh(verticesPtr, this._vertexCount, indicesPtr, triangleCount, isU16, physics);

      // Use helper to create shape directly
      this._pxShape = physX.createTriMeshShape(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._doubleSided ? DOUBLE_SIDED_FLAG : 0,
        shapeFlags,
        material._pxMaterial,
        physics
      );

      // Also create geometry for later use (setGeometry)
      this._pxGeometry = physX.createTriMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._doubleSided ? DOUBLE_SIDED_FLAG : 0
      );

      physX._free(indicesPtr);
    }

    physX._free(verticesPtr);

    // Set up shape
    this._id = uniqueID;
    this._pxMaterial = material._pxMaterial;
    this._pxShape.setUUID(uniqueID);
  }

  private _createMeshGeometry(): void {
    const physX = this._physXPhysics._physX;
    const physics = this._physXPhysics._pxPhysics;
    const cooking = this._physXPhysics._pxCooking;

    // Allocate memory for vertices
    const verticesPtr = physX._malloc(this._vertexCount * 3 * 4);
    const verticesView = new Float32Array(physX.HEAPF32.buffer, verticesPtr, this._vertexCount * 3);
    verticesView.set(this._vertices);

    if (this._isConvex) {
      this._pxMesh = cooking.createConvexMesh(verticesPtr, this._vertexCount, physics);
      this._pxGeometry = physX.createConvexMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._tightBounds ? TIGHT_BOUNDS_FLAG : 0
      );
    } else {
      if (!this._indices) {
        physX._free(verticesPtr);
        throw new Error("Triangle mesh requires indices");
      }

      const isU16 = this._indices instanceof Uint16Array;
      const triangleCount = this._indices.length / 3;
      const bytesPerIndex = isU16 ? 2 : 4;
      const indicesPtr = physX._malloc(this._indices.length * bytesPerIndex);

      if (isU16) {
        const indicesView = new Uint16Array(physX.HEAPU16.buffer, indicesPtr, this._indices.length);
        indicesView.set(this._indices);
      } else {
        const indicesView = new Uint32Array(physX.HEAPU32.buffer, indicesPtr, this._indices.length);
        indicesView.set(this._indices as Uint32Array);
      }

      this._pxMesh = cooking.createTriMesh(verticesPtr, this._vertexCount, indicesPtr, triangleCount, isU16, physics);
      this._pxGeometry = physX.createTriMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._doubleSided ? DOUBLE_SIDED_FLAG : 0
      );

      physX._free(indicesPtr);
    }

    physX._free(verticesPtr);
  }

  private _updateMeshScale(): void {
    const physX = this._physXPhysics._physX;

    // Create new geometry with updated scale
    if (this._isConvex) {
      const newGeometry = physX.createConvexMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._tightBounds ? TIGHT_BOUNDS_FLAG : 0
      );
      this._pxGeometry.delete();
      this._pxGeometry = newGeometry;
    } else {
      const newGeometry = physX.createTriMeshGeometry(
        this._pxMesh,
        this._worldScale.x,
        this._worldScale.y,
        this._worldScale.z,
        this._doubleSided ? DOUBLE_SIDED_FLAG : 0
      );
      this._pxGeometry.delete();
      this._pxGeometry = newGeometry;
    }

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
