import { IMeshColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { assignmentClone } from "../../clone/CloneDecorators";
import { ModelMesh } from "../../mesh/ModelMesh";
import { DynamicCollider } from "../DynamicCollider";
import { MeshColliderShapeCookingFlag } from "../enums/MeshColliderShapeCookingFlag";
import { RigidCollider } from "../RigidCollider";
import { ColliderShape } from "./ColliderShape";

type MeshData = {
  positions: Vector3[];
  indices: Uint8Array | Uint16Array | Uint32Array | null;
};

/**
 * Collider shape based on mesh geometry, supporting both convex hull and triangle mesh modes.
 */
export class MeshColliderShape extends ColliderShape {
  private static readonly _unitScale = new Vector3(1, 1, 1);

  @assignmentClone
  private _mesh: ModelMesh = null;
  private _isConvex = false;
  @assignmentClone
  private _meshData: MeshData | null = null;
  private _cookingFlags = MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding;

  /** @internal */
  declare _collider: RigidCollider;

  /**
   * Cooking flags for this mesh collider shape.
   */
  get cookingFlags(): MeshColliderShapeCookingFlag {
    return this._cookingFlags;
  }

  set cookingFlags(value: MeshColliderShapeCookingFlag) {
    if (this._cookingFlags !== value) {
      if (!this._mesh) {
        this._cookingFlags = value;
        return;
      }

      const { positions, indices } = this._meshData;
      const nativeShape = this._createNativeShape(positions, indices, this._isConvex, value);
      if (!nativeShape) return;

      this._replaceNativeShape(nativeShape);
      this._cookingFlags = value;
    }
  }

  /**
   * Whether to use convex mesh mode.
   * @remarks
   * - When true, generates a convex hull from the mesh vertices. Works with StaticCollider or DynamicCollider.
   * - When false, uses the original triangle mesh. Only works with StaticCollider or kinematic DynamicCollider, and the mesh must have indices.
   */
  get isConvex(): boolean {
    return this._isConvex;
  }

  set isConvex(value: boolean) {
    if (this._isConvex !== value) {
      const mesh = this._mesh;
      if (!mesh) {
        this._isConvex = value;
        return;
      }

      let meshData = this._meshData;
      if (!value && !meshData.indices) {
        meshData = this._getMeshData(mesh, false);
        if (!meshData) return;
      }

      const nativeShape = this._createNativeShape(meshData.positions, meshData.indices, value, this._cookingFlags);
      if (!nativeShape) return;

      this._replaceNativeShape(nativeShape);
      this._isConvex = value;
      this._meshData = meshData;
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
      if (value) {
        const meshData = this._getMeshData(value, this._isConvex);
        if (!meshData) return;

        const nativeShape = this._createNativeShape(
          meshData.positions,
          meshData.indices,
          this._isConvex,
          this._cookingFlags
        );
        if (!nativeShape) return;

        this._replaceNativeShape(nativeShape);
        this._meshData = meshData;
      } else {
        this._replaceNativeShape(null);
        this._meshData = null;
      }

      this._mesh?._addReferCount(-1);
      value?._addReferCount(1);
      this._mesh = value;
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
    this._meshData = null;
  }

  private _getMeshData(mesh: ModelMesh, isConvex: boolean): MeshData | null {
    if (!mesh.accessible) {
      console.warn("MeshColliderShape: Mesh data is not accessible. Set 'keepMeshData' before uploading.");
      return null;
    }

    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.warn("MeshColliderShape: Mesh has no position data.");
      return null;
    }

    let indices: Uint8Array | Uint16Array | Uint32Array | null = null;
    if (!isConvex) {
      indices = mesh.getIndices();
      if (!indices) {
        console.warn("MeshColliderShape: Non-convex mesh requires indices.");
        return null;
      }
    }

    return { positions, indices };
  }

  private _createNativeShape(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    cookingFlags: MeshColliderShapeCookingFlag
  ): IMeshColliderShape | null {
    // Non-convex MeshColliderShape is only supported on StaticCollider or kinematic DynamicCollider
    if (!isConvex && this._collider instanceof DynamicCollider && !this._collider.isKinematic) {
      console.error("MeshColliderShape: Non-convex mesh is not supported on non-kinematic DynamicCollider.");
      return null;
    }

    const nativeShape = Engine._nativePhysics.createMeshColliderShape(
      this._id,
      positions,
      indices,
      isConvex,
      this._material._nativeMaterial,
      cookingFlags,
      this._collider?.entity.transform.lossyWorldScale ?? MeshColliderShape._unitScale
    );

    if (nativeShape) this._syncNativeShape(nativeShape);
    return nativeShape;
  }

  private _replaceNativeShape(nativeShape: IMeshColliderShape | null): void {
    if (this._collider) {
      this._collider._replaceNativeShape(this, nativeShape);
    } else {
      this._nativeShape?.destroy();
      this._nativeShape = nativeShape;
    }
  }

  /**
   * @inheritdoc
   */
  override _onClone(target: MeshColliderShape): void {
    super._onClone(target);
    const mesh = target._mesh;
    if (mesh) {
      const meshData = target._meshData;
      const nativeShape =
        meshData &&
        target._createNativeShape(meshData.positions, meshData.indices, target._isConvex, target._cookingFlags);
      if (!nativeShape) {
        target._mesh = null;
        target._nativeShape = null;
        target._meshData = null;
        return;
      }
      target._nativeShape = nativeShape;
      mesh._addReferCount(1);
    }
  }
}
