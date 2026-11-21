import { IColliderShape, IMeshColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { ModelMesh } from "../mesh/ModelMesh";
import { Collider } from "./Collider";
import { MeshColliderShapeCookingFlag } from "./enums/MeshColliderShapeCookingFlag";

type MeshData = {
  positions: Vector3[];
  indices: Uint8Array | Uint16Array | Uint32Array | null;
};

/**
 * A collider based on mesh geometry, either as a convex hull or as the original triangle mesh.
 * @remarks A triangle mesh (`convex = false`) can only be static or belong to a kinematic {@link Rigidbody}, and
 * cannot be a trigger. Validation and native mesh cooking run when the Collider synchronizes with the physics scene.
 */
export class MeshCollider extends Collider {
  @ignoreClone
  private _mesh: ModelMesh | null = null;
  private _convex = false;
  private _cookingFlags = MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding;

  @ignoreClone
  private _nativeMesh: ModelMesh | null = null;
  @ignoreClone
  private _nativeConvex = false;
  @ignoreClone
  private _nativeCookingFlags: MeshColliderShapeCookingFlag =
    MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding;
  @ignoreClone
  private _nativeTrigger = false;
  @ignoreClone
  private _cookFailed = false;
  @ignoreClone
  private _triggerRejected = false;

  /**
   * The mesh used for collision detection.
   * @remarks The mesh must keep its data accessible (`keepMeshData` before upload). A non-convex collider also needs
   * indices. Invalid meshes are excluded from simulation and queries until replaced with a valid mesh.
   */
  get mesh(): ModelMesh | null {
    return this._mesh;
  }

  set mesh(value: ModelMesh | null) {
    if (this._mesh !== value || this._cookFailed) {
      this._setMesh(value);
      if (!value) {
        this._nativeMesh = null;
      }
      this._cookFailed = false;
      this._markDirty();
    }
  }

  /**
   * Whether to use a convex hull generated from the mesh vertices.
   * @defaultValue false
   * @remarks A non-convex mesh cannot be a trigger or belong to a non-kinematic {@link Rigidbody}; invalid
   * combinations are excluded from simulation and queries until resolved.
   */
  get convex(): boolean {
    return this._convex;
  }

  set convex(value: boolean) {
    if (this._convex !== value || this._cookFailed) {
      this._convex = value;
      this._cookFailed = false;
      this._markDirty();
    }
  }

  /**
   * Cooking flags for the mesh.
   * @defaultValue `MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding`
   */
  get cookingFlags(): MeshColliderShapeCookingFlag {
    return this._cookingFlags;
  }

  set cookingFlags(value: MeshColliderShapeCookingFlag) {
    if (this._cookingFlags !== value || this._cookFailed) {
      this._cookingFlags = value;
      this._cookFailed = false;
      this._markDirty();
    }
  }

  /**
   * Get the distance and the closest point on the Collider from a point.
   * @remarks Only supported when {@link convex} is true.
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
   */
  override _getVolumeDistance(point: Vector3, outClosestPoint: Vector3): number {
    if (!this._convex) {
      return -1;
    }
    return super._getVolumeDistance(point, outClosestPoint);
  }

  /**
   * @internal
   */
  override _supportsDynamicBody(): boolean {
    return this._convex || !this._mesh;
  }

  /**
   * @internal
   */
  override _nativeSupportsDynamicBody(): boolean {
    return !this._native || this._nativeConvex;
  }

  protected override _hasValidGeometry(scale: Vector3): boolean {
    const minScale = Math.fround(1e-6);
    const maxScale = 1e6;
    const x = Math.fround(scale.x);
    const y = Math.fround(scale.y);
    const z = Math.fround(scale.z);
    return x >= minScale && y >= minScale && z >= minScale && x <= maxScale && y <= maxScale && z <= maxScale;
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onClone(target: MeshCollider): void {
    super._onClone(target);
    // _mesh is @ignoreClone: assign it through the setter so the clone retains its own reference.
    target.mesh = this._mesh;
  }

  protected override _setIsTrigger(value: boolean): void {
    if (this._isTrigger !== value) {
      this._isTrigger = value;
      if (this._native && this._convex && this._nativeConvex) {
        (<IColliderShape>this._native).setIsTrigger(value);
        this._nativeTrigger = value;
        this._attachedBody?._markMassDirty();
      } else {
        this._markDirty();
      }
    }
  }

  protected override _syncNativeShape(scale: Vector3): IColliderShape | null {
    const mesh = this._mesh;
    if (!mesh) {
      this._triggerRejected = false;
      if (this._native) {
        this._replaceNativeShape(null);
      }
      return null;
    }

    if (!this._convex && this._isTrigger) {
      if (!this._triggerRejected) {
        this._triggerRejected = true;
        console.error("MeshCollider: isTrigger is only supported when convex is true.");
      }
      return null;
    }
    this._triggerRejected = false;

    let shape = <IMeshColliderShape | null>this._native;
    if (this._cookFailed) {
      return null;
    }

    if (
      !shape ||
      this._nativeMesh !== mesh ||
      this._nativeConvex !== this._convex ||
      this._nativeCookingFlags !== this._cookingFlags
    ) {
      const meshData = MeshCollider._getMeshData(mesh, this._convex);
      if (!meshData) {
        this._cookFailed = true;
        if (shape) {
          this._replaceNativeShape(null);
          this._nativeMesh = null;
        }
        return null;
      }

      if (shape && this._nativeConvex === this._convex) {
        this._syncNativeScale(shape, scale);
        if (!shape.setMeshData(meshData.positions, meshData.indices, this._cookingFlags)) {
          this._cookFailed = true;
          this._replaceNativeShape(null);
          this._nativeMesh = null;
          return null;
        }
        this._nativeMesh = mesh;
        this._nativeCookingFlags = this._cookingFlags;
        this._onGeometryChanged();
      } else {
        const newShape = this._cook(meshData, this._convex, this._cookingFlags);
        if (!newShape || !this._replaceNativeShape(newShape)) {
          this._cookFailed = true;
          if (shape) {
            this._replaceNativeShape(null);
            this._nativeMesh = null;
          }
          return null;
        }
        this._nativeMesh = mesh;
        this._nativeConvex = this._convex;
        this._nativeCookingFlags = this._cookingFlags;
        this._nativeTrigger = this._isTrigger;
        shape = newShape;
      }
    }

    if (this._nativeConvex && this._nativeTrigger !== this._isTrigger) {
      shape.setIsTrigger(this._isTrigger);
      this._nativeTrigger = this._isTrigger;
      this._attachedBody?._markMassDirty();
    }

    return shape;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._setMesh(null);
    this._nativeMesh = null;
  }

  private _cook(
    { positions, indices }: MeshData,
    convex: boolean,
    cookingFlags: MeshColliderShapeCookingFlag
  ): IMeshColliderShape | null {
    const shape = Engine._nativePhysics.createMeshColliderShape(
      this._id,
      positions,
      indices,
      convex,
      this._getNativeMaterial(),
      cookingFlags
    );
    shape && this._initializeNativeShape(shape);
    return shape;
  }

  private _setMesh(value: ModelMesh | null): void {
    if (this._mesh !== value) {
      this._mesh && this._addResourceReferCount(this._mesh, -1);
      value && this._addResourceReferCount(value, 1);
      this._mesh = value;
    }
  }

  private static _getMeshData(mesh: ModelMesh, convex: boolean): MeshData | null {
    if (!mesh.accessible) {
      console.warn("MeshCollider: mesh data is not accessible. Set 'keepMeshData' before uploading.");
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
    return { positions, indices };
  }
}
