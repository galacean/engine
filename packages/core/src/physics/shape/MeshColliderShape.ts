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
  private _isShapeAttached = false;
  /**
   * `true` if PhysX cooking returned null after valid mesh data was extracted.
   * Unsupported collider/mesh combinations are terminal and must not enter retry.
   */
  private _pendingNativeShapeCreation = false;

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
          this._pendingNativeShapeCreation = false;
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
      if (value) {
        if (this._extractMeshData(value)) {
          if (this._nativeShape) {
            this._updateNativeShapeData();
          } else {
            this._createNativeShape();
          }
        } else {
          // Mesh data extraction cannot recover without assigning a new mesh.
          this._destroyNativeShape();
          this._clearMeshData();
          this._pendingNativeShapeCreation = false;
        }
      } else {
        this._destroyNativeShape();
        this._clearMeshData();
        this._pendingNativeShapeCreation = false;
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
      if (this._isShapeAttached) {
        this._detachFromCollider();
      }
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
    if (
      (<IMeshColliderShape>this._nativeShape).setMeshData(
        this._positions,
        this._indices,
        this._isConvex,
        this._cookingFlags
      )
    ) {
      // Re-add to collider if previously removed due to cooking failure
      if (this._collider && !this._isShapeAttached) {
        this._attachToCollider();
      }
    }
  }

  private _detachFromCollider(): void {
    this._collider._nativeCollider.removeShape(this._nativeShape);
    this._isShapeAttached = false;
  }

  private _attachToCollider(): void {
    this._collider._nativeCollider.addShape(this._nativeShape);
    this._isShapeAttached = true;
  }

  private _createNativeShape(): void {
    // Non-convex MeshColliderShape is only supported on StaticCollider or kinematic DynamicCollider
    if (!this._isConvex && this._collider instanceof DynamicCollider && !this._collider.isKinematic) {
      this._pendingNativeShapeCreation = false;
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
      // Cook failed — `_onPhysicsUpdate` will retry next frame
      this._pendingNativeShapeCreation = true;
      return;
    }

    this._nativeShape = nativeShape;
    this._pendingNativeShapeCreation = false;

    // Sync base class properties (position, rotation, contactOffset, isTrigger, material)
    super._syncNative();

    // If already attached to a collider, add the newly created native shape to it
    if (this._collider) {
      nativeShape.setWorldScale(this._collider.entity.transform.lossyWorldScale);
      this._attachToCollider();
    }
  }

  /**
   * @internal
   * Retry hook: keep attempting `_createNativeShape` until it succeeds.
   *
   * Triggered every physics update tick by `Collider._onUpdate`. Handles the case
   * where `_cookMesh` fails on first attempt due to PhysX cooking pipeline timing
   * (the mesh data was extracted successfully at `set mesh` time, but the native
   * cook call returned null). No-op once a valid native shape exists.
   *
   * We DO NOT re-call `_extractMeshData` here — once `set mesh` finished, either:
   *   - extraction succeeded → `_positions` is populated and we reuse it
   *   - extraction failed → `_clearMeshData` cleared `_positions`, and `mesh.accessible`
   *     won't recover (GPU upload is one-way), so re-extracting would fail again
   */
  override _onPhysicsUpdate(): void {
    if (!this._pendingNativeShapeCreation || !this._mesh || !this._positions) return;
    this._createNativeShape();
  }

  /**
   * @internal
   * After CloneManager deep-copies `_positions` / `_indices` / `_mesh` and remaps `_collider`,
   * the cloned shape still has no native PhysX shape because `_nativeShape` is `@ignoreClone`.
   * Cook a fresh native shape now using the already-cloned vertex/index buffers; on transient
   * cook failure `_createNativeShape` sets `_pendingNativeShapeCreation = true` and
   * `_onPhysicsUpdate` will retry next tick.
   */
  override _cloneTo(target: MeshColliderShape): void {
    super._cloneTo(target);
    if (target._positions) {
      target._createNativeShape();
    }
  }
}
