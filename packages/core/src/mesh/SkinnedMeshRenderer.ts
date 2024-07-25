import { BoundingBox, Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RendererUpdateFlags } from "../Renderer";
import { Logger } from "../base/Logger";
import { deepClone, ignoreClone } from "../clone/CloneManager";
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
  private static _jointCountProperty = ShaderProperty.getByName("renderer_JointCount");
  private static _jointSamplerProperty = ShaderProperty.getByName("renderer_JointSampler");
  private static _jointMatrixProperty = ShaderProperty.getByName("renderer_JointMatrix");

  /** @internal */
  @ignoreClone
  _condensedBlendShapeWeights: Float32Array;

  @deepClone
  private _localBounds: BoundingBox = new BoundingBox();

  @ignoreClone
  private _jointDataCreateCache: Vector2 = new Vector2(-1, -1);
  @ignoreClone
  private _blendShapeWeights: Float32Array;
  @ignoreClone
  private _maxVertexUniformVectors: number;

  @ignoreClone
  private _jointTexture: Texture2D;

  @deepClone
  private _skin: Skin;

  /**
   * Skin of the SkinnedMeshRenderer.
   */
  get skin(): Skin {
    return this._skin;
  }

  set skin(value: Skin) {
    const lastSkin = this._skin;
    if (lastSkin !== value) {
      this._applySkin(lastSkin, value);
      this._skin = value;
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
   * Local bounds.
   */
  get localBounds(): BoundingBox {
    return this._localBounds;
  }

  set localBounds(value: BoundingBox) {
    if (this._localBounds !== value) {
      this._localBounds.copyFrom(value);
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

    const localBounds = this._localBounds;
    // @ts-ignore
    localBounds.min._onValueChanged = this._onLocalBoundsChanged;
    // @ts-ignore
    localBounds.max._onValueChanged = this._onLocalBoundsChanged;
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    const worldMatrix = this._transform.worldMatrix;
    if (onlyMVP) {
      this._updateProjectionRelatedShaderData(context, worldMatrix, batched);
    } else {
      this._updateWorldViewRelatedShaderData(context, worldMatrix, batched);
    }
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    super._onDestroy();
    this._jointDataCreateCache = null;
    this._skin = null;
    this._blendShapeWeights = null;
    this._localBounds = null;
    this._jointTexture?.destroy();
    this._jointTexture = null;
  }

  /**
   * @internal
   */
  override _cloneTo(target: SkinnedMeshRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);

    if (this.skin) {
      target._applySkin(null, target.skin);
    }

    this._blendShapeWeights && (target._blendShapeWeights = this._blendShapeWeights.slice());
  }

  protected override _update(context: RenderContext): void {
    const { skin } = this;
    if (skin?.bones.length > 0) {
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
        // @TODO: different shader type should use different count, not always 44
        const remainUniformJointCount = Math.ceil((this._maxVertexUniformVectors - (44 + bsUniformOccupiesCount)) / 4);

        if (boneCount > remainUniformJointCount) {
          const engine = this.engine;
          if (engine._hardwareRenderer.canIUseMoreJoints) {
            if (boneCountChange) {
              this._jointTexture?.destroy();
              this._jointTexture = new Texture2D(engine, 4, boneCount, TextureFormat.R32G32B32A32, false);
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

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    const rootBone = this.skin?.rootBone;
    if (rootBone) {
      BoundingBox.transform(this._localBounds, this._transform.worldMatrix, worldBounds);
    } else {
      super._updateBounds(worldBounds);
    }
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

  @ignoreClone
  private _onLocalBoundsChanged(): void {
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  @ignoreClone
  private _onSkinUpdated(type: SkinUpdateFlag, value: Object): void {
    switch (type) {
      case SkinUpdateFlag.BoneCountChanged:
        const shaderData = this.shaderData;
        if (<number>value > 0) {
          shaderData.enableMacro("RENDERER_HAS_SKIN");
          shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, <number>value);
        } else {
          shaderData.disableMacro("RENDERER_HAS_SKIN");
        }
        break;
      case SkinUpdateFlag.RootBoneChanged:
        this._attachTransform((value as Entity).transform);
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        break;
    }
  }

  private _applySkin(lastSkin: Skin, value: Skin): void {
    const lastSkinBoneCount = lastSkin?.bones?.length ?? 0;
    const lastRootBone = lastSkin?.rootBone ?? this.entity;
    lastSkin?._updatedManager.removeListener(this._onSkinUpdated);

    const skinBoneCount = value?.bones?.length ?? 0;
    const rootBone = value?.rootBone ?? this.entity;
    value?._updatedManager.addListener(this._onSkinUpdated);

    if (lastSkinBoneCount !== skinBoneCount) {
      this._onSkinUpdated(SkinUpdateFlag.BoneCountChanged, skinBoneCount);
    }
    if (lastRootBone !== rootBone) {
      this._onSkinUpdated(SkinUpdateFlag.RootBoneChanged, rootBone);
    }
  }

  /**
   * @deprecated use {@link SkinnedMeshRenderer.skin.rootBone} instead.
   */
  get rootBone(): Entity {
    return this.skin.rootBone;
  }

  set rootBone(value: Entity) {
    this.skin.rootBone = value;
  }

  /**
   * @deprecated use {@link SkinnedMeshRenderer.skin.bones} instead.
   */
  get bones(): Readonly<Entity[]> {
    return this.skin.bones;
  }

  set bones(value: Readonly<Entity[]>) {
    this.skin.bones = value;
  }
}
