import { IMeshColliderShape } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { ModelMesh } from "../../mesh/ModelMesh";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneManager";
import { DynamicCollider } from "../DynamicCollider";
import { MeshColliderShapeCookingFlag } from "../enums/MeshColliderShapeCookingFlag";
import { ColliderShape } from "./ColliderShape";

/**
 * Collider shape based on mesh geometry, supporting both convex hull and triangle mesh modes.
 */
export class MeshColliderShape extends ColliderShape {
  @ignoreClone
  private _mesh: ModelMesh = null;
  private _isConvex = false;
  @ignoreClone
  private _positions: Vector3[] = null;
  @ignoreClone
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
      if (this._nativeShape) {
        this._updateNativeShapeData();
      } else if (this._mesh && this._extractMeshData(this._mesh)) {
        this._createNativeShape();
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
        // PxShape.setGeometry requires matching geometry type, so recreate when isConvex changes
        this._destroyNativeShape();
        if (this._extractMeshData(mesh)) {
          this._createNativeShape();
        } else {
          this._clearMeshData();
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
      this._mesh?._addReferCount(-1);
      value?._addReferCount(1);
      this._mesh = value;
      if (value && this._extractMeshData(value)) {
        if (this._nativeShape) {
          this._updateNativeShapeData();
        } else {
          this._createNativeShape();
        }
      } else {
        this._destroyNativeShape();
        this._clearMeshData();
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
  override _cloneTo(target: MeshColliderShape): void {
    target.mesh = this._mesh;
    super._cloneTo(target);
  }

  /**
   * @internal
   */
  override _destroy() {
    super._destroy();
    if (this._mesh) {
      this._mesh._addReferCount(-1);
      this._mesh = null;
    }
    this._clearMeshData();
  }

  private _clearMeshData(): void {
    this._positions = null;
    this._indices = null;
  }

  private _destroyNativeShape(): void {
    if (this._nativeShape) {
      this._collider?._setNativeShapeAttached(this, false);
      this._nativeShape.destroy();
      this._nativeShape = null;
    }
  }

  private _extractMeshData(mesh: ModelMesh): boolean {
    if (!mesh.accessible) {
      console.warn("MeshColliderShape: Mesh data is not accessible. Set 'keepMeshData' before uploading.");
      return false;
    }

    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.warn("MeshColliderShape: Mesh has no position data.");
      return false;
    }

    this._positions = positions;
    this._indices = null;

    if (!this._isConvex) {
      const indices = mesh.getIndices();
      if (!indices) {
        console.warn("MeshColliderShape: Non-convex mesh requires indices.");
        return false;
      }
      this._indices = indices;
    }

    return true;
  }

  private _updateNativeShapeData(): void {
    const succeeded = (<IMeshColliderShape>this._nativeShape).setMeshData(
      this._positions,
      this._indices,
      this._isConvex,
      this._cookingFlags
    );
    this._collider?._setNativeShapeAttached(this, succeeded);
  }

  private _createNativeShape(): void {
    // Non-convex MeshColliderShape is only supported on StaticCollider or kinematic DynamicCollider
    if (!this._isConvex && this._collider instanceof DynamicCollider && !this._collider.isKinematic) {
      console.error("MeshColliderShape: Non-convex mesh is not supported on non-kinematic DynamicCollider.");
      return;
    }

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

    this._collider?._setNativeShapeAttached(this, true);
  }
}
