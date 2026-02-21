import { IMeshColliderShape } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { ModelMesh } from "../../mesh/ModelMesh";
import { Vector3 } from "@galacean/engine-math";
import { DynamicCollider } from "../DynamicCollider";
import { MeshColliderShapeCookingFlag } from "../enums/MeshColliderShapeCookingFlag";
import { ColliderShape } from "./ColliderShape";

/**
 * Collider shape based on mesh geometry, supporting both convex hull and triangle mesh modes.
 */
export class MeshColliderShape extends ColliderShape {
  private _mesh: ModelMesh = null;
  private _isConvex = false;
  private _positions: Vector3[] = null;
  private _indices: Uint8Array | Uint16Array | Uint32Array | null = null;
  private _cookingFlags = MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding;

  /**
   * Cooking flags for this mesh collider shape.
   */
  get cookingFlags(): MeshColliderShapeCookingFlag {
    return this._cookingFlags;
  }

  set cookingFlags(value: MeshColliderShapeCookingFlag) {
    if (this._cookingFlags !== value) {
      this._cookingFlags = value;
      if (this._mesh) {
        this._updateNativeMesh();
      }
    }
  }

  /**
   * Whether to use convex mesh mode.
   * @remarks
   * - When true, generates a convex hull from the mesh vertices. Works with all collider types.
   * - When false, uses the original triangle mesh. Only works with StaticCollider or kinematic DynamicCollider, and the mesh must have indices.
   */
  get isConvex(): boolean {
    return this._isConvex;
  }

  set isConvex(value: boolean) {
    if (this._isConvex !== value) {
      this._isConvex = value;
      const mesh = this._mesh;
      if (mesh) {
        if (this._extractMeshData(mesh)) {
          this._updateNativeMesh();
        }
      }
    }
  }

  /**
   * The mesh used for collision detection.
   * @remarks The mesh must have accessible data (not released after upload).
   */
  get mesh(): ModelMesh {
    return this._mesh;
  }

  set mesh(value: ModelMesh) {
    if (this._mesh !== value) {
      this._mesh = value;
      if (this._extractMeshData(value)) {
        this._updateNativeMesh();
      }
    }
  }

  /**
   * {@inheritDoc ColliderShape.getClosestPoint}
   */
  override getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    if (!this._nativeShape) {
      console.warn("MeshColliderShape: Cannot get closest point. Ensure mesh has been set with valid data.");
      return -1;
    }
    return super.getClosestPoint(point, outClosestPoint);
  }

  /**
   * @internal
   */
  override _destroy() {
    super._destroy();
    this._mesh = null;
    this._positions = null;
    this._indices = null;
  }

  private _extractMeshData(mesh: ModelMesh): boolean {
    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.warn("MeshColliderShape: Mesh has no position data");
      return false;
    }

    this._positions = positions;
    this._indices = null;

    if (!this._isConvex) {
      const indices = mesh.getIndices();
      if (!indices) {
        console.warn("MeshColliderShape: Triangle mesh requires indices");
        return false;
      }
      this._indices = indices;
    }

    return true;
  }

  private _updateNativeMesh(): void {
    // Non-convex MeshColliderShape is only supported on StaticCollider or kinematic DynamicCollider
    if (!this._isConvex && this._collider instanceof DynamicCollider && !this._collider.isKinematic) {
      console.error("MeshColliderShape: Non-convex mesh is not supported on non-kinematic DynamicCollider.");
      return;
    }

    if (this._nativeShape) {
      (<IMeshColliderShape>this._nativeShape).setMeshData(
        this._positions,
        this._indices,
        this._isConvex,
        this._cookingFlags
      );
    } else {
      const nativeShape = Engine._nativePhysics.createMeshColliderShape(
        this._id,
        this._positions,
        this._indices,
        this._isConvex,
        this._material._nativeMaterial,
        this._cookingFlags
      );

      if (!nativeShape) {
        return;
      }

      this._nativeShape = nativeShape;

      // Sync base class properties (position, rotation, contactOffset, isTrigger, material)
      super._syncNative();

      // If already attached to a collider, add the newly created native shape to it
      if (this._collider) {
        nativeShape.setWorldScale(this._collider.entity.transform.lossyWorldScale);
        this._collider._nativeCollider.addShape(nativeShape);
      }
    }
  }
}
