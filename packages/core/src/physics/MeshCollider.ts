import { IMeshColliderShape } from "@galacean/engine-design";
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
 * @remarks A triangle mesh (`convex = false`) can only be static or belong to a kinematic {@link Rigidbody}.
 */
export class MeshCollider extends Collider {
  /** @internal */
  static _deserializePropOrder(props: Record<string, unknown>): readonly string[] {
    return props.isTrigger === false ? ["isTrigger", "convex", "cookingFlags"] : ["convex", "cookingFlags"];
  }

  /** @internal */
  static _getDeserializePhase(props: Record<string, unknown>): number {
    if (props.convex === false) return 1;
    if (props.convex === true) return -1;
    if (props.isTrigger === false) return -1;
    if (props.isTrigger === true) return 1;
    return 0;
  }

  @ignoreClone
  private _mesh: ModelMesh | null = null;
  private _convex = false;
  private _cookingFlags = MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding;

  /**
   * The mesh used for collision detection.
   * @remarks The mesh must keep its data accessible (not released after upload). A non-convex collider also needs
   * indices. Invalid meshes are rejected and the previous mesh is kept.
   */
  get mesh(): ModelMesh | null {
    return this._mesh;
  }

  set mesh(value: ModelMesh | null) {
    if (this._mesh !== value) {
      if (value) {
        const meshData = MeshCollider._getMeshData(value, this._convex);
        if (!meshData || !this._rebuildNative(meshData, this._convex, this._cookingFlags)) {
          return;
        }
      } else {
        this._replaceNativeShape(null);
      }
      this._setMesh(value);
    }
  }

  /**
   * Whether to use a convex hull generated from the mesh vertices.
   * @defaultValue false
   * @remarks Setting false is rejected while the Collider is a trigger or belongs to a non-kinematic Rigidbody.
   */
  get convex(): boolean {
    return this._convex;
  }

  set convex(value: boolean) {
    if (this._convex !== value) {
      if (!value) {
        if (this.isTrigger) {
          console.error("MeshCollider: cannot set convex to false while isTrigger is true.");
          return;
        }
        const body = this.attachedRigidbody;
        if (body && !body.isKinematic) {
          console.error("MeshCollider: cannot set convex to false while it belongs to a non-kinematic Rigidbody.");
          return;
        }
      }
      const mesh = this._mesh;
      if (mesh) {
        const meshData = MeshCollider._getMeshData(mesh, value);
        if (!meshData || !this._rebuildNative(meshData, value, this._cookingFlags, true)) {
          return;
        }
      }
      this._convex = value;
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
    if (this._cookingFlags !== value) {
      const mesh = this._mesh;
      if (mesh) {
        const meshData = MeshCollider._getMeshData(mesh, this._convex);
        if (!meshData || !this._rebuildNative(meshData, this._convex, value)) {
          return;
        }
      }
      this._cookingFlags = value;
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
    return this._convex;
  }

  protected override _hasValidGeometry(scale: Vector3): boolean {
    const minScale = 1e-6;
    const x = Math.fround(scale.x);
    const y = Math.fround(scale.y);
    const z = Math.fround(scale.z);
    return (
      x >= minScale && y >= minScale && z >= minScale && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    );
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onClone(target: MeshCollider): void {
    super._onClone(target);
    // convex and cookingFlags are already copied, so the setter cooks the same shape
    target.mesh = this._mesh;
  }

  protected override _setIsTrigger(value: boolean): void {
    if (value && !this._convex) {
      console.error("MeshCollider: isTrigger is only supported when convex is true.");
      return;
    }
    super._setIsTrigger(value);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._setMesh(null);
  }

  /**
   * Cook new mesh data into the native shape, keeping the previous shape on failure. Cooking in the setters is what
   * validates the mesh, so it also runs before the Collider enters a scene.
   * @param replace - Whether the geometry kind changes, which needs a new native shape
   */
  private _rebuildNative(
    meshData: MeshData,
    convex: boolean,
    cookingFlags: MeshColliderShapeCookingFlag,
    replace = false
  ): boolean {
    const shape = <IMeshColliderShape>this._native;
    if (shape && !replace) {
      if (!shape.setMeshData(meshData.positions, convex ? null : meshData.indices, cookingFlags)) {
        return false;
      }
      this._onGeometryChanged();
      return true;
    }
    const newShape = this._cook(meshData, convex, cookingFlags);
    return !!newShape && this._replaceNativeShape(newShape);
  }

  private _cook(
    { positions, indices }: MeshData,
    convex: boolean,
    cookingFlags: MeshColliderShapeCookingFlag
  ): IMeshColliderShape | null {
    const shape = Engine._nativePhysics.createMeshColliderShape(
      this._id,
      positions,
      convex ? null : indices,
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
    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.warn("MeshCollider: mesh has no position data.");
      return null;
    }
    const indices = mesh.getIndices();
    if (!convex && !indices) {
      console.warn("MeshCollider: a non-convex mesh requires indices.");
      return null;
    }
    return { positions, indices };
  }
}
