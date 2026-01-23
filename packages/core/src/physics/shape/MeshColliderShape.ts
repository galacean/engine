import { IMeshColliderShape } from "@galacean/engine-design";
import { ignoreClone } from "../../clone/CloneManager";
import { Engine } from "../../Engine";
import { Mesh } from "../../graphic/Mesh";
import { VertexAttribute } from "../../mesh/enums/VertexAttribute";
import { ModelMesh } from "../../mesh/ModelMesh";
import { ColliderShape } from "./ColliderShape";

/**
 * Physical collider shape for mesh.
 * @remarks
 * - Triangle mesh (isConvex=false) works with StaticCollider or kinematic DynamicCollider
 * - Convex mesh (isConvex=true) works with both StaticCollider and DynamicCollider
 * @see https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/Geometry.html#triangle-meshes
 */
export class MeshColliderShape extends ColliderShape {
  private _isConvex: boolean = false;
  private _vertices: Float32Array = null;
  private _indices: Uint16Array | Uint32Array = null;
  private _doubleSided: boolean = false;
  private _tightBounds: boolean = true;
  private _indicesU16Cache: Uint16Array = null;

  /**
   * Whether to use convex mesh mode.
   * @remarks
   * - Convex mesh: Works with all collider types, PhysX auto-computes convex hull
   * - Triangle mesh: Works with StaticCollider or kinematic DynamicCollider, requires indices
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
      if (this._extractMeshData(mesh)) {
        this._updateNativeMesh();
      }
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
    this._indicesU16Cache = null;
  }

  private _extractMeshData(mesh: ModelMesh): boolean {
    // @ts-ignore: Access internal property for performance optimization
    const primitive = mesh._primitive;
    const vertexElement = primitive._vertexElementMap?.[VertexAttribute.Position];

    if (!vertexElement) {
      console.warn("MeshColliderShape: Mesh has no position attribute");
      return false;
    }

    const bufferBinding = primitive.vertexBufferBindings[vertexElement.bindingIndex];
    const buffer = bufferBinding?.buffer;

    if (!buffer) {
      console.warn("MeshColliderShape: Position buffer not found");
      return false;
    }

    if (!buffer.readable) {
      console.warn("MeshColliderShape: Buffer is not readable");
      return false;
    }

    const vertexCount = mesh.vertexCount;
    const byteOffset = vertexElement.offset;
    const byteStride = bufferBinding.stride;
    const bufferData = buffer.data;

    // Reuse or create Float32Array
    if (!this._vertices || this._vertices.length !== vertexCount * 3) {
      this._vertices = new Float32Array(vertexCount * 3);
    }

    // Create Float32Array view to read source data
    const sourceData = new Float32Array(bufferData.buffer, bufferData.byteOffset, bufferData.byteLength / 4);

    // Choose optimal copy method based on stride
    if (byteStride === 12 && byteOffset === 0) {
      // Tightly packed: direct copy
      this._vertices.set(sourceData.subarray(0, vertexCount * 3));
    } else {
      // Interleaved: copy per vertex with optimized indexing
      const floatStride = byteStride / 4;
      const floatOffset = byteOffset / 4;
      const vertices = this._vertices;
      for (let i = 0, srcIdx = floatOffset, dstIdx = 0; i < vertexCount; i++, srcIdx += floatStride, dstIdx += 3) {
        vertices[dstIdx] = sourceData[srcIdx];
        vertices[dstIdx + 1] = sourceData[srcIdx + 1];
        vertices[dstIdx + 2] = sourceData[srcIdx + 2];
      }
    }

    // Extract indices for triangle mesh
    if (!this._isConvex) {
      const indices = mesh.getIndices();
      if (indices) {
        if (indices instanceof Uint8Array) {
          const len = indices.length;
          if (!this._indicesU16Cache || this._indicesU16Cache.length < len) {
            this._indicesU16Cache = new Uint16Array(len);
          }
          this._indicesU16Cache.set(indices);
          // Use subarray to ensure correct length (cache may be larger than needed)
          this._indices = this._indicesU16Cache.subarray(0, len);
        } else {
          this._indices = indices as Uint16Array | Uint32Array;
        }
      } else {
        console.warn("MeshColliderShape: Triangle mesh requires indices");
      }
    }

    return true;
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

      // Sync doubleSided and tightBounds to newly created native shape
      (<IMeshColliderShape>this._nativeShape).setDoubleSided(this._doubleSided);
      (<IMeshColliderShape>this._nativeShape).setTightBounds(this._tightBounds);
    }
  }
}
