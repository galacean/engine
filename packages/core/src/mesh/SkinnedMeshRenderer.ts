import { BoundingBox, Matrix, Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { RendererUpdateFlags } from "../Renderer";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneDecorators";
import { Mesh, MeshModifyFlags } from "../graphic/Mesh";
import { ShaderProperty } from "../shader";
import { Texture2D } from "../texture/Texture2D";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { MeshRenderer } from "./MeshRenderer";
import { ModelMesh } from "./ModelMesh";
import { Skin, SkinUpdateFlag } from "./Skin";

/**
 * SkinnedMeshRenderer.
 */
export class SkinnedMeshRenderer extends MeshRenderer {
  // @TODO: different shader type should use different count, not always 48
  /** @internal */
  static _baseVertexUniformVectorCount = 48;

  private static _jointCountProperty = ShaderProperty.getByName("renderer_JointCount");
  private static _jointSamplerProperty = ShaderProperty.getByName("renderer_JointSampler");
  private static _jointMatrixProperty = ShaderProperty.getByName("renderer_JointMatrix");
  private static _tempMatrix = new Matrix();

  /** @internal */
  @ignoreClone
  _condensedBlendShapeWeights: Float32Array;

  private _localBounds: BoundingBox = new BoundingBox();
  private _rootBoneBindInverseMatrix: Matrix | null = null;
  @ignoreClone
  private _hasCustomLocalBounds: boolean = false;
  @ignoreClone
  private _isUpdatingAutoLocalBounds: boolean = false;

  @ignoreClone
  private _jointDataCreateCache: Vector2 = new Vector2(-1, -1);
  private _blendShapeWeights: Float32Array;
  @ignoreClone
  private _maxVertexUniformVectors: number;

  @ignoreClone
  private _jointTexture: Texture2D;

  private _skin: Skin | null;

  /**
   * Skin of the SkinnedMeshRenderer.
   */
  get skin(): Skin | null {
    return this._skin;
  }

  set skin(value: Skin | null) {
    const lastSkin = this._skin;
    if (lastSkin !== value) {
      this._skin = value;
      this._applySkin(lastSkin, value, true);
    }
  }

  /**
   * The weights of the BlendShapes.
   * @remarks Array index is BlendShape index.
   */
  get blendShapeWeights(): Float32Array {
    this._checkBlendShapeWeightLength();
    return this._blendShapeWeights;
  }

  set blendShapeWeights(value: Float32Array) {
    this._checkBlendShapeWeightLength();
    const blendShapeWeights = this._blendShapeWeights;
    if (value.length <= blendShapeWeights.length) {
      blendShapeWeights.set(value);
    } else {
      for (let i = 0, n = blendShapeWeights.length; i < n; i++) {
        blendShapeWeights[i] = value[i];
      }
    }
  }

  /**
   * Local bounds in `skin.rootBone` (or entity) space.
   *
   * @remarks
   * By default, derived automatically from `mesh` and `skin`.
   * Assigning a box or mutating `min`/`max` switches to custom bounds;
   * assigning `null` or `undefined` restores automatic calculation.
   */
  get localBounds(): BoundingBox {
    if (!this._hasCustomLocalBounds && this._dirtyUpdateFlag & SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds) {
      this._calculateDefaultLocalBounds();
    }
    return this._localBounds;
  }

  set localBounds(value: BoundingBox | null | undefined) {
    if (value == null) {
      if (this._hasCustomLocalBounds) {
        this._hasCustomLocalBounds = false;
        this._markAutoLocalBoundsDirty();
      }
      return;
    }

    this._hasCustomLocalBounds = true;
    this._dirtyUpdateFlag &= ~SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;
    if (this._localBounds !== value) {
      this._localBounds.copyFrom(value);
    } else {
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._skin = null;

    const rhi = this.entity.engine._hardwareRenderer;
    let maxVertexUniformVectors = rhi.renderStates.getParameter(rhi.gl.MAX_VERTEX_UNIFORM_VECTORS);

    // Limit size to 256 to avoid some problem:
    // For renderer is "Apple GPU", when uniform is large than 256 the skeleton matrix array access in shader very slow in Safari or WKWebview. This may be a apple bug, Chrome and Firefox is OK!
    // For renderer is "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3011 vs_5_0 ps_5_0, D3011)", compile shader si very slow because of max uniform is 4096.
    maxVertexUniformVectors = Math.min(maxVertexUniformVectors, rhi._options._maxAllowSkinUniformVectorCount);

    this._maxVertexUniformVectors = maxVertexUniformVectors;

    this._onLocalBoundsChanged = this._onLocalBoundsChanged.bind(this);
    this._onSkinUpdated = this._onSkinUpdated.bind(this);
    this._dirtyUpdateFlag |= SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;

    const localBounds = this._localBounds;
    // @ts-ignore
    localBounds.min._onValueChanged = this._onLocalBoundsChanged;
    // @ts-ignore
    localBounds.max._onValueChanged = this._onLocalBoundsChanged;
  }

  /**
   * @internal
   */
  override _canBatch(_preElement: RenderElement, _curElement: RenderElement): boolean {
    return false;
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    this._skin?._updatedManager.removeListener(this._onSkinUpdated);
    super._onDestroy();
    this._jointDataCreateCache = null!;
    this._skin = null;
    this._blendShapeWeights = null!;
    this._localBounds = null!;
    this._rootBoneBindInverseMatrix = null;
    this._jointTexture?.destroy();
    this._jointTexture = null!;
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onClone(target: SkinnedMeshRenderer): void {
    super._onClone(target);
    if (this._jointTexture) {
      target.shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, null);
    }
    target._hasCustomLocalBounds = this._hasCustomLocalBounds;
    if (this._skin) {
      // Preserve cloned bind-pose rootBone inverse matrix instead of re-sampling a potentially moved bone pose.
      target._applySkin(null, target._skin, false);
    }
    if (this._hasCustomLocalBounds) {
      target._dirtyUpdateFlag &= ~SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;
      target._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    } else {
      target._markAutoLocalBoundsDirty();
    }
  }

  protected override _update(context: RenderContext): void {
    const { skin } = this;
    if (skin && skin.bones.length > 0) {
      skin._updateSkinMatrices(this);
    }

    const shaderData = this.shaderData;
    const mesh = <ModelMesh>this.mesh;

    const blendShapeManager = mesh._blendShapeManager;
    blendShapeManager._updateShaderData(shaderData, this);

    const bones = skin?.bones;
    if (bones) {
      const bsUniformOccupiesCount = blendShapeManager._uniformOccupiesCount;
      const boneCount = bones.length;
      const boneDataCreateCache = this._jointDataCreateCache;
      const boneCountChange = boneCount !== boneDataCreateCache.x;

      if (boneCountChange || bsUniformOccupiesCount !== boneDataCreateCache.y) {
        // directly use max joint count to avoid shader recompile
        const remainUniformJointCount = Math.ceil(
          (this._maxVertexUniformVectors -
            (SkinnedMeshRenderer._baseVertexUniformVectorCount + bsUniformOccupiesCount)) /
            4
        );

        if (boneCount > remainUniformJointCount) {
          const engine = this.engine;
          if (engine._hardwareRenderer.canIUseMoreJoints) {
            if (boneCountChange) {
              this._jointTexture?.destroy();
              this._jointTexture = new Texture2D(engine, 4, boneCount, TextureFormat.R32G32B32A32, false, false);
              this._jointTexture.filterMode = TextureFilterMode.Point;
              this._jointTexture.isGCIgnored = true;
            }
            shaderData.disableMacro("RENDERER_JOINTS_NUM");
            shaderData.enableMacro("RENDERER_USE_JOINT_TEXTURE");
            shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, this._jointTexture);
          } else {
            Logger.error(
              `component's joints count(${boneCount}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${this._maxVertexUniformVectors}, and don't support jointTexture in this device. suggest joint count less than ${remainUniformJointCount}.`,
              this
            );
          }
        } else {
          this._jointTexture?.destroy();
          shaderData.disableMacro("RENDERER_USE_JOINT_TEXTURE");
          shaderData.enableMacro("RENDERER_JOINTS_NUM", remainUniformJointCount.toString());
          shaderData.setFloatArray(SkinnedMeshRenderer._jointMatrixProperty, skin._skinMatrices);
        }
        boneDataCreateCache.set(boneCount, bsUniformOccupiesCount);
      }

      if (this._jointTexture) {
        this._jointTexture.setPixelBuffer(skin._skinMatrices);
      }
    }

    super._update(context);
  }

  protected override _setMesh(mesh: Mesh): void {
    super._setMesh(mesh);
    this._markAutoLocalBoundsDirty();
  }

  @ignoreClone
  protected override _onMeshChanged(type: MeshModifyFlags): void {
    super._onMeshChanged(type);
    if (type & MeshModifyFlags.Bounds) {
      this._markAutoLocalBoundsDirty();
    }
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this.localBounds, this._transformEntity!.transform.worldMatrix, worldBounds);
  }

  private _checkBlendShapeWeightLength(): void {
    const mesh = <ModelMesh>this._mesh;
    const newBlendShapeCount = mesh ? mesh.blendShapeCount : 0;
    const lastBlendShapeWeights = this._blendShapeWeights;
    if (lastBlendShapeWeights) {
      const lastBlendShapeWeightsCount = lastBlendShapeWeights.length;
      if (lastBlendShapeWeightsCount !== newBlendShapeCount) {
        const newBlendShapeWeights = new Float32Array(newBlendShapeCount);
        if (newBlendShapeCount > lastBlendShapeWeightsCount) {
          newBlendShapeWeights.set(lastBlendShapeWeights);
        } else {
          for (let i = 0; i < newBlendShapeCount; i++) {
            newBlendShapeWeights[i] = lastBlendShapeWeights[i];
          }
        }
        this._blendShapeWeights = newBlendShapeWeights;
      }
    } else {
      this._blendShapeWeights = new Float32Array(newBlendShapeCount);
    }
  }

  private _markAutoLocalBoundsDirty(): void {
    this._dirtyUpdateFlag |= SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;
    if (!this._hasCustomLocalBounds) {
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  private _updateRootBoneBindInverseMatrix(recapture: boolean): void {
    const skin = this._skin;
    const rootBone = skin?.rootBone;
    if (rootBone && skin.bones.indexOf(rootBone) === -1) {
      if (recapture || !this._rootBoneBindInverseMatrix) {
        // rootBone can sit outside skin.bones with no inverseBindMatrices entry; snapshot bind pose before animation.
        const matrix = (this._rootBoneBindInverseMatrix ||= new Matrix());
        if (Matrix.invert(rootBone.transform.worldMatrix, matrix) === null) {
          matrix.identity();
        }
      }
    } else {
      this._rootBoneBindInverseMatrix = null;
    }
  }

  private _calculateDefaultLocalBounds(): void {
    const localBounds = this._localBounds;
    const mesh = this._mesh;
    const skin = this._skin;
    const rootBone = skin?.rootBone;

    this._isUpdatingAutoLocalBounds = true;
    try {
      if (!mesh) {
        localBounds.min.set(0, 0, 0);
        localBounds.max.set(0, 0, 0);
      } else if (!rootBone) {
        localBounds.copyFrom(mesh.bounds);
      } else {
        const rootBoneIndex = skin.bones.indexOf(rootBone);
        let bindInverseMatrix =
          rootBoneIndex !== -1 ? skin.inverseBindMatrices[rootBoneIndex] : this._rootBoneBindInverseMatrix;
        if (!bindInverseMatrix) {
          bindInverseMatrix =
            rootBoneIndex !== -1 ? SkinnedMeshRenderer._tempMatrix : (this._rootBoneBindInverseMatrix = new Matrix());
          if (Matrix.invert(rootBone.transform.worldMatrix, bindInverseMatrix) === null) {
            bindInverseMatrix.identity();
          }
        }
        BoundingBox.transform(mesh.bounds, bindInverseMatrix, localBounds);
      }
    } finally {
      this._isUpdatingAutoLocalBounds = false;
    }

    this._dirtyUpdateFlag &= ~SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;
  }

  @ignoreClone
  private _onLocalBoundsChanged(): void {
    if (!this._isUpdatingAutoLocalBounds) {
      this._hasCustomLocalBounds = true;
      this._dirtyUpdateFlag &= ~SkinnedMeshRendererUpdateFlags.AutomaticLocalBounds;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  @ignoreClone
  private _onSkinUpdated(type: SkinUpdateFlag, value: number | Entity): void {
    switch (type) {
      case SkinUpdateFlag.BoneCountChanged:
        this._updateSkinBoneCount(<number>value);
        break;
      case SkinUpdateFlag.RootBoneChanged:
        this._setTransformEntity(<Entity>value ?? this.entity);
        this._updateRootBoneBindInverseMatrix(true);
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        this._markAutoLocalBoundsDirty();
        break;
      case SkinUpdateFlag.BonesChanged:
        this._updateRootBoneBindInverseMatrix(false);
        this._markAutoLocalBoundsDirty();
        break;
      case SkinUpdateFlag.InverseBindMatricesChanged:
        this._markAutoLocalBoundsDirty();
        break;
    }
  }

  private _updateSkinBoneCount(boneCount: number): void {
    const shaderData = this.shaderData;
    if (boneCount > 0) {
      shaderData.enableMacro("RENDERER_HAS_SKIN");
      shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, boneCount);
    } else {
      shaderData.disableMacro("RENDERER_HAS_SKIN");
    }
  }

  private _applySkin(lastSkin: Skin | null, value: Skin | null, captureBindMatrix: boolean): void {
    const lastSkinBoneCount = lastSkin?.bones?.length ?? 0;
    const lastRootBone = lastSkin?.rootBone ?? this.entity;
    lastSkin?._updatedManager.removeListener(this._onSkinUpdated);

    const skinBoneCount = value?.bones?.length ?? 0;
    const rootBone = value?.rootBone ?? this.entity;
    value?._updatedManager.addListener(this._onSkinUpdated);

    if (lastSkinBoneCount !== skinBoneCount) {
      this._updateSkinBoneCount(skinBoneCount);
    }
    if (lastRootBone !== rootBone) {
      this._setTransformEntity(rootBone);
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
    if (captureBindMatrix) {
      this._updateRootBoneBindInverseMatrix(true);
    }
    this._markAutoLocalBoundsDirty();
  }

  /**
   * @deprecated use {@link SkinnedMeshRenderer.skin.rootBone} instead.
   */
  get rootBone(): Entity {
    return this.skin!.rootBone;
  }

  set rootBone(value: Entity) {
    this.skin!.rootBone = value;
  }

  /**
   * @deprecated use {@link SkinnedMeshRenderer.skin.bones} instead.
   */
  get bones(): Readonly<Entity[]> {
    return this.skin!.bones;
  }

  set bones(value: Readonly<Entity[]>) {
    this.skin!.bones = value;
  }
}

/**
 * @remarks Extends `MeshRendererUpdateFlags`.
 */
enum SkinnedMeshRendererUpdateFlags {
  /** Automatic localBounds. */
  AutomaticLocalBounds = 0x4
}
