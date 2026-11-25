import { IMeshShape, IPhysicsShape, MeshColliderCookingFlag } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { ModelMesh } from "../mesh/ModelMesh";
import { Collider } from "./Collider";
import type { PhysicsScene } from "./PhysicsScene";

/**
 * A collider based on a triangle mesh or a convex hull.
 * @remarks Simulation and queries exclude a triangle mesh used as a trigger or owned by a non-kinematic
 * {@link Rigidbody}. The mesh is validated and cooked during physics synchronization.
 */
export class MeshCollider extends Collider {
  private static _isValidScale(scale: Vector3): boolean {
    const minScale = Math.fround(1e-6);
    const maxScale = 1e6;
    const x = Math.fround(scale.x);
    const y = Math.fround(scale.y);
    const z = Math.fround(scale.z);
    return x >= minScale && y >= minScale && z >= minScale && x <= maxScale && y <= maxScale && z <= maxScale;
  }

  @ignoreClone
  private _mesh: ModelMesh | null = null;
  private _convex = false;
  private _cookingFlags = MeshColliderCookingFlag.Cleaning | MeshColliderCookingFlag.VertexWelding;

  @ignoreClone
  private _nativeMesh: ModelMesh | null;
  @ignoreClone
  private _nativeConvex = false;
  @ignoreClone
  private _nativeCookingFlags: MeshColliderCookingFlag;
  @ignoreClone
  private _nativeTrigger: boolean;
  @ignoreClone
  private _rejection = MeshSyncRejection.None;

  /**
   * The mesh used for collision detection, or null to remove the shape.
   * @remarks Keep the mesh data accessible when uploading it. Both modes need positions, and triangle meshes also
   * need indices. Simulation and queries exclude a mesh if cooking fails.
   * After editing a mesh with its data setters, clear and reassign it to refresh an existing collider.
   */
  get mesh(): ModelMesh | null {
    return this._mesh;
  }

  set mesh(value: ModelMesh | null) {
    if (this._mesh !== value || this._rejection === MeshSyncRejection.CookFailed) {
      this._setMesh(value);
      if (!value || !this._registeredScene) {
        this._nativeMesh = null;
        !this._registeredScene && this._destroyNative();
      }
      this._rejection = MeshSyncRejection.None;
      this._markDirty();
    }
  }

  /**
   * Whether to use a convex hull generated from the mesh vertices.
   * @defaultValue false
   */
  get convex(): boolean {
    return this._convex;
  }

  set convex(value: boolean) {
    if (this._convex !== value) {
      this._convex = value;
      this._rejection = MeshSyncRejection.None;
      this._markDirty();
    }
  }

  /**
   * Cooking flags for the mesh.
   * @defaultValue `MeshColliderCookingFlag.Cleaning | MeshColliderCookingFlag.VertexWelding`
   */
  get cookingFlags(): MeshColliderCookingFlag {
    return this._cookingFlags;
  }

  set cookingFlags(value: MeshColliderCookingFlag) {
    if (this._cookingFlags !== value) {
      this._cookingFlags = value;
      this._rejection = MeshSyncRejection.None;
      this._markDirty();
    }
  }

  /**
   * Finds the closest point in a convex hull.
   * @param point - Point to measure from in world space.
   * @param outClosestPoint - Receives the closest point in world space. Left unchanged if the query fails.
   * @returns Distance in world units, 0 for a point inside or on the hull, or -1 if the hull is unavailable.
   */
  override getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    if (this._mesh && !this._convex) {
      console.error("MeshCollider: getClosestPoint is only supported when convex is true.");
      return -1;
    }
    return super.getClosestPoint(point, outClosestPoint);
  }

  /**
   * @internal
   * @inheritDoc
   */
  override _getVolumeDistance(point: Vector3, outClosestPoint?: Vector3): number {
    if (!this._convex) {
      return -1;
    }
    return super._getVolumeDistance(point, outClosestPoint);
  }

  /**
   * @internal
   */
  override _nativeSupportsDynamicBody(): boolean {
    return this._nativeConvex;
  }

  /**
   * @internal
   * @inheritDoc
   */
  override _onClone(target: MeshCollider): void {
    super._onClone(target);
    // _mesh is @ignoreClone: assign it through the setter so the clone retains its own reference.
    target.mesh = this._mesh;
  }

  /**
   * @internal
   */
  override _detach(physicsScene?: PhysicsScene): void {
    super._detach(physicsScene);
    // A Rigidbody can detach the shape while mesh edits are still queued for the next sync.
    if (this._native && this._dirtyIndex === -1 && (!this._mesh || this._nativeMesh !== this._mesh)) {
      this._nativeMesh = null;
      this._destroyNative();
    }
  }

  protected override _supportsDynamicBody(): boolean {
    return this._convex || !this._mesh;
  }

  protected override _setIsTrigger(value: boolean): void {
    if (this._isTrigger !== value) {
      this._isTrigger = value;
      if (this._native && this._convex && this._nativeConvex) {
        this._native.setIsTrigger(value);
        this._nativeTrigger = value;
        this._attachedBody?._markMassDirty();
      } else {
        this._markDirty();
      }
    }
  }

  protected override _syncNativeShape(scale: Vector3): IPhysicsShape | null {
    const mesh = this._mesh;
    if (!mesh) return null;

    const scaleChanged = this._scaleChanged(scale);
    if (scaleChanged && !MeshCollider._isValidScale(scale)) {
      return null;
    }
    if (!this._convex && this._isTrigger) {
      if (this._rejection !== MeshSyncRejection.TriggerOnNonConvex) {
        this._rejection = MeshSyncRejection.TriggerOnNonConvex;
        console.error("MeshCollider: isTrigger is only supported when convex is true.");
      }
      return null;
    }
    if (this._rejection === MeshSyncRejection.TriggerOnNonConvex) {
      this._rejection = MeshSyncRejection.None;
    }

    if (this._rejection === MeshSyncRejection.CookFailed) {
      return null;
    }

    const previous = <IMeshShape | null>this._native;
    const needsCook =
      !previous ||
      this._nativeMesh !== mesh ||
      this._nativeConvex !== this._convex ||
      this._nativeCookingFlags !== this._cookingFlags;
    let shape: IMeshShape;
    if (needsCook) {
      const updated = this._cook(previous, mesh, scale);
      if (!updated) {
        this._rejection = MeshSyncRejection.CookFailed;
        this._nativeMesh = null;
        return null;
      }
      if (updated !== previous) {
        this._nativeTrigger = this._isTrigger;
      }
      shape = updated;
      this._nativeMesh = mesh;
      this._nativeConvex = this._convex;
      this._nativeCookingFlags = this._cookingFlags;
    } else {
      shape = previous;
      scaleChanged && shape.setScale(scale);
    }
    const geometryChanged = needsCook || scaleChanged;
    geometryChanged && this._nativeScale.copyFrom(scale);

    const triggerChanged = this._nativeTrigger !== this._isTrigger;
    if (triggerChanged) {
      shape.setIsTrigger(this._isTrigger);
      this._nativeTrigger = this._isTrigger;
    }
    (geometryChanged || triggerChanged) && this._attachedBody?._markMassDirty();

    return shape;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._setMesh(null);
    this._nativeMesh = null;
  }

  private _cook(shape: IMeshShape | null, mesh: ModelMesh, scale: Vector3): IMeshShape | null {
    const convex = this._convex;
    if (!mesh.accessible) {
      console.warn(
        "MeshCollider: mesh data is not accessible. Use mesh.uploadData(false) or enable keepMeshData at creation."
      );
      return null;
    }
    let positions: Vector3[] | null;
    let indices: Uint8Array | Uint16Array | Uint32Array | null;
    try {
      positions = mesh.getPositions();
      indices = convex ? null : mesh.getIndices();
    } catch (error) {
      console.error(`MeshCollider: mesh data is not readable (${error}).`);
      return null;
    }
    if (!positions || positions.length === 0) {
      console.warn("MeshCollider: mesh has no position data.");
      return null;
    }
    if (!convex && !indices) {
      console.warn("MeshCollider: a non-convex mesh requires indices.");
      return null;
    }
    const flags = this._cookingFlags;
    if (shape && this._nativeConvex === convex) {
      return shape.setMeshData(positions, indices, flags, scale, mesh) ? shape : null;
    }
    const replacement = Engine._nativePhysics.createMeshShape(
      this._id,
      positions,
      indices,
      convex,
      this._getNativeMaterial(),
      flags,
      scale,
      mesh
    );
    if (!replacement) return null;
    return this._initializeNativeShape(replacement);
  }

  private _setMesh(value: ModelMesh | null): void {
    if (this._mesh !== value) {
      this._mesh && this._addResourceReferCount(this._mesh, -1);
      value && this._addResourceReferCount(value, 1);
      this._mesh = value;
    }
  }
}

const enum MeshSyncRejection {
  None = 0,
  TriggerOnNonConvex = 1,
  CookFailed = 2
}
