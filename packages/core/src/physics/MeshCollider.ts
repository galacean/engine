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
  private static readonly _unitScale = new Vector3(1, 1, 1);

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
   * @remarks Setting false is rejected while the Collider belongs to a non-kinematic Rigidbody.
   */
  get convex(): boolean {
    return this._convex;
  }

  set convex(value: boolean) {
    if (this._convex !== value) {
      if (!value) {
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
   * {@inheritDoc Collider.getClosestPoint}
   */
  override getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    if (!this._mesh) {
      console.warn("MeshCollider: cannot get the closest point without a valid mesh.");
      return -1;
    }
    return super.getClosestPoint(point, outClosestPoint);
  }

  /**
   * @internal
   */
  override _supportsDynamicBody(): boolean {
    return this._convex;
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onClone(target: MeshCollider): void {
    super._onClone(target);
    target._setMesh(this._mesh);
  }

  protected override _createNative(): IMeshColliderShape | null {
    const mesh = this._mesh;
    const meshData = mesh && MeshCollider._getMeshData(mesh, this._convex);
    return meshData ? this._cook(meshData, this._convex, this._cookingFlags) : null;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._setMesh(null);
  }

  /**
   * Apply new mesh data to the native shape, keeping the previous shape on failure.
   * @param replace - Whether the geometry kind changes, which needs a new native shape
   */
  private _rebuildNative(
    meshData: MeshData,
    convex: boolean,
    cookingFlags: MeshColliderShapeCookingFlag,
    replace = false
  ): boolean {
    const shape = <IMeshColliderShape>this._native;
    if (!shape) {
      // The shape is cooked from the current fields on the first scene sync
      return true;
    }
    if (!replace) {
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
      cookingFlags,
      MeshCollider._unitScale
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
