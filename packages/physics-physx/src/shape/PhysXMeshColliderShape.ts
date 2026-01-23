import { Vector3 } from "@galacean/engine";
import { IMeshColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape, ShapeFlag } from "./PhysXColliderShape";

/** TriangleMesh flag: eDOUBLE_SIDED = 2 (1<<1) */
const DOUBLE_SIDED_FLAG = 2;
/** ConvexMesh flag: eTIGHT_BOUNDS = 1 (1<<0) */
const TIGHT_BOUNDS_FLAG = 1;

/**
 * Mesh collider shape in PhysX.
 */
export class PhysXMeshColliderShape extends PhysXColliderShape implements IMeshColliderShape {
  private _pxMesh: any = null;
  private _isConvex: boolean;
  private _doubleSided: boolean = false;
  private _tightBounds: boolean = true;
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
    // Save old resources
    const oldMesh = this._pxMesh;
    const oldGeometry = this._pxGeometry;

    // Update data and create new mesh (may throw on failure)
    this._pxMesh = null;
    this._pxGeometry = null;
    this._isConvex = isConvex;
    this._vertices = vertices;
    this._vertexCount = vertexCount;
    this._indices = indices;

    this._createMesh();
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
   * {@inheritDoc IMeshColliderShape.setDoubleSided }
   */
  setDoubleSided(value: boolean): void {
    this._doubleSided = value;
    if (!this._isConvex && this._pxMesh) {
      this._updateGeometry();
    }
  }

  /**
   * {@inheritDoc IMeshColliderShape.setTightBounds }
   */
  setTightBounds(value: boolean): void {
    this._tightBounds = value;
    if (this._isConvex && this._pxMesh) {
      this._updateGeometry();
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

  private _createMeshAndShape(material: PhysXPhysicsMaterial, uniqueID: number): void {
    const physX = this._physXPhysics._physX;
    const physics = this._physXPhysics._pxPhysics;
    const shapeFlags = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

    this._createMesh();

    // Create shape with material
    if (this._isConvex) {
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
    } else {
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
    }

    this._id = uniqueID;
    this._pxMaterial = material._pxMaterial;
    this._pxShape.setUUID(uniqueID);
  }

  private _createMesh(): void {
    const physX = this._physXPhysics._physX;
    const physics = this._physXPhysics._pxPhysics;
    const cooking = this._physXPhysics._pxCooking;

    const verticesPtr = this._allocateVertices();
    let indicesPtr = 0;

    try {
      if (this._isConvex) {
        this._pxMesh = cooking.createConvexMesh(verticesPtr, this._vertexCount, physics);
        if (!this._pxMesh) {
          throw new Error("Failed to create convex mesh. Check if vertex count <= 255 and geometry is valid.");
        }
        this._pxGeometry = physX.createConvexMeshGeometry(
          this._pxMesh,
          this._worldScale.x,
          this._worldScale.y,
          this._worldScale.z,
          this._tightBounds ? TIGHT_BOUNDS_FLAG : 0
        );
      } else {
        if (!this._indices) {
          throw new Error("Triangle mesh requires indices");
        }

        const { ptr, isU16, triangleCount } = this._allocateIndices();
        indicesPtr = ptr;
        this._pxMesh = cooking.createTriMesh(verticesPtr, this._vertexCount, indicesPtr, triangleCount, isU16, physics);
        if (!this._pxMesh) {
          throw new Error("Failed to create triangle mesh. Check if geometry is valid.");
        }
        this._pxGeometry = physX.createTriMeshGeometry(
          this._pxMesh,
          this._worldScale.x,
          this._worldScale.y,
          this._worldScale.z,
          this._doubleSided ? DOUBLE_SIDED_FLAG : 0
        );
      }
    } finally {
      physX._free(verticesPtr);
      if (indicesPtr) {
        physX._free(indicesPtr);
      }
      // Release JS memory after copying to WASM
      this._vertices = null;
      this._indices = null;
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

    const newGeometry = this._isConvex
      ? physX.createConvexMeshGeometry(
          this._pxMesh,
          this._worldScale.x,
          this._worldScale.y,
          this._worldScale.z,
          this._tightBounds ? TIGHT_BOUNDS_FLAG : 0
        )
      : physX.createTriMeshGeometry(
          this._pxMesh,
          this._worldScale.x,
          this._worldScale.y,
          this._worldScale.z,
          this._doubleSided ? DOUBLE_SIDED_FLAG : 0
        );

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
