import { IMeshColliderShape } from "@galacean/engine-design";
import { ignoreClone } from "../../clone/CloneManager";
import { Engine } from "../../Engine";
import { Mesh } from "../../graphic/Mesh";
import { ModelMesh } from "../../mesh/ModelMesh";
import { ColliderShape } from "./ColliderShape";

/**
 * Physical collider shape for mesh.
 * @remarks
 * - Triangle mesh (isConvex=false) only works with StaticCollider
 * - Convex mesh (isConvex=true) works with both StaticCollider and DynamicCollider
 */
export class MeshColliderShape extends ColliderShape {
  private _isConvex: boolean = false;
  private _vertices: Float32Array = null;
  private _indices: Uint16Array | Uint32Array = null;
  private _doubleSided: boolean = false;
  private _tightBounds: boolean = true;

  /**
   * Whether to use convex mesh mode.
   * @remarks
   * - Convex mesh: Works with DynamicCollider, PhysX auto-computes convex hull
   * - Triangle mesh: Only works with StaticCollider, requires indices
   */
  get isConvex(): boolean {
    return this._isConvex;
  }

  set isConvex(value: boolean) {
    if (this._isConvex !== value) {
      this._isConvex = value;
      if (this._vertices && this._nativeShape) {
        this._updateNativeMesh();
      }
    }
  }

  /**
   * Whether the triangle mesh should be double-sided for collision detection.
   * @remarks Only applies to triangle mesh (non-convex).
   */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(value: boolean) {
    if (this._doubleSided !== value) {
      this._doubleSided = value;
      (<IMeshColliderShape>this._nativeShape)?.setDoubleSided(value);
    }
  }

  /**
   * Whether to use tight bounds for convex mesh.
   * @remarks Only applies to convex mesh.
   */
  get tightBounds(): boolean {
    return this._tightBounds;
  }

  set tightBounds(value: boolean) {
    if (this._tightBounds !== value) {
      this._tightBounds = value;
      (<IMeshColliderShape>this._nativeShape)?.setTightBounds(value);
    }
  }

  /**
   * Create a MeshColliderShape.
   * @param isConvex - Whether to use convex mesh mode (default: false)
   */
  constructor(isConvex: boolean = false) {
    super();
    this._isConvex = isConvex;
    // Native shape is created lazily when mesh data is set
    this._nativeShape = null;
  }

  /**
   * Set mesh data directly from arrays.
   * @param vertices - Vertex positions as Float32Array (x, y, z per vertex)
   * @param indices - Triangle indices (required for triangle mesh, optional for convex)
   */
  setMeshData(vertices: Float32Array, indices?: Uint16Array | Uint32Array): void {
    this._vertices = vertices;
    this._indices = indices || null;
    this._updateNativeMesh();
  }

  /**
   * Set mesh data from a Mesh object.
   * @param mesh - The mesh to extract vertex and index data from
   * @remarks The mesh must have accessible data (not released after upload)
   */
  setMesh(mesh: Mesh): void {
    if (mesh instanceof ModelMesh) {
      this._extractMeshData(mesh);
      this._updateNativeMesh();
    } else {
      console.warn("MeshColliderShape: Only ModelMesh is supported");
    }
  }

  protected override _syncNative(): void {
    if (this._nativeShape) {
      super._syncNative();
    }
  }

  /**
   * @internal
   */
  override _destroy() {
    if (this._nativeShape) {
      this._nativeShape.destroy();
      this._nativeShape = null;
    }
    delete Engine._physicalObjectsMap[this._id];
    this._vertices = null;
    this._indices = null;
  }

  private _extractMeshData(mesh: ModelMesh): void {
    // Get positions from mesh
    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.warn("MeshColliderShape: Mesh has no position data or data is not accessible");
      return;
    }

    // Convert Vector3[] to Float32Array
    const vertexCount = positions.length;
    this._vertices = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const pos = positions[i];
      this._vertices[i * 3] = pos.x;
      this._vertices[i * 3 + 1] = pos.y;
      this._vertices[i * 3 + 2] = pos.z;
    }

    // Get indices for triangle mesh
    if (!this._isConvex) {
      const indices = mesh.getIndices();
      if (indices) {
        // Convert Uint8Array to Uint16Array if needed
        if (indices instanceof Uint8Array) {
          this._indices = new Uint16Array(indices);
        } else {
          this._indices = indices as Uint16Array | Uint32Array;
        }
      } else {
        console.warn("MeshColliderShape: Triangle mesh requires indices");
      }
    }
  }

  @ignoreClone
  private _updateNativeMesh(): void {
    if (!this._vertices || this._vertices.length === 0) {
      return;
    }

    const vertexCount = this._vertices.length / 3;

    // Validate triangle mesh has indices
    if (!this._isConvex && !this._indices) {
      console.warn("MeshColliderShape: Triangle mesh requires indices, skipping update");
      return;
    }

    if (this._nativeShape) {
      // Update existing shape
      (<IMeshColliderShape>this._nativeShape).setMeshData(this._vertices, vertexCount, this._indices, this._isConvex);
    } else {
      // Create new shape
      this._nativeShape = Engine._nativePhysics.createMeshColliderShape(
        this._id,
        this._vertices,
        vertexCount,
        this._indices,
        this._isConvex,
        this._material._nativeMaterial
      );
      Engine._physicalObjectsMap[this._id] = this;
    }
  }
}
