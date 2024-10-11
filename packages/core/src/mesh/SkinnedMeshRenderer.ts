import { BoundingBox, Matrix, Vector2 } from "@galacean/engine-math";
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

    this._onSkinUpdated = this._onSkinUpdated.bind(this);
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

  protected override _updateLocalBounds(localBounds: BoundingBox): void {
    if (this._dirtyUpdateFlag & RendererUpdateFlags.LocalBounds) {
      const skin = this._skin;
      const rootBone = skin?.rootBone;
      if (rootBone) {
        const meshBounds = this._mesh.bounds;
        const { bones, inverseBindMatrices } = skin;
        const rootBoneIndex = bones.indexOf(rootBone);
        if (rootBoneIndex !== -1) {
          BoundingBox.transform(meshBounds, inverseBindMatrices[rootBoneIndex], localBounds);
        } else {
          // Root bone is not in joints list, we can only compute approximate inverse bind matrix
          // Average all root bone's children inverse bind matrix
          const approximateBindMatrix = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
          let subRootBoneCount = this._computeApproximateBindMatrix(
            bones,
            inverseBindMatrices,
            rootBone,
            approximateBindMatrix
          );

          if (subRootBoneCount !== 0) {
            Matrix.multiplyScalar(approximateBindMatrix, 1.0 / subRootBoneCount, approximateBindMatrix);
            BoundingBox.transform(meshBounds, approximateBindMatrix, localBounds);
          } else {
            localBounds.copyFrom(meshBounds);
          }
        }
      } else {
        super._updateLocalBounds(localBounds);
      }
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.LocalBounds;
    }
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
        const skin = this._skin;
        if (skin?.rootBone && skin.bones.indexOf(skin.rootBone) !== -1) {
          this._dirtyUpdateFlag |= RendererUpdateFlags.AllBounds;
        }
        break;
      case SkinUpdateFlag.RootBoneChanged:
        this._setTransform((<Entity>value).transform);
        this._dirtyUpdateFlag |= RendererUpdateFlags.AllBounds;
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

  private _computeApproximateBindMatrix(
    jointEntities: ReadonlyArray<Entity>,
    inverseBindMatrices: Matrix[],
    rootEntity: Entity,
    approximateBindMatrix: Matrix
  ): number {
    let subRootBoneCount = 0;
    const children = rootEntity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      const rootChild = children[i];
      const index = jointEntities.indexOf(rootChild);
      if (index !== -1) {
        Matrix.add(approximateBindMatrix, inverseBindMatrices[index], approximateBindMatrix);
        subRootBoneCount++;
      } else {
        subRootBoneCount += this._computeApproximateBindMatrix(
          jointEntities,
          inverseBindMatrices,
          rootChild,
          approximateBindMatrix
        );
      }
    }

    return subRootBoneCount;
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
