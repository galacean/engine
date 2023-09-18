import { BoundingBox, Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RendererUpdateFlags } from "../Renderer";
import { Utils } from "../Utils";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneManager";
import { ShaderProperty } from "../shader";
import { Texture2D } from "../texture/Texture2D";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { MeshRenderer } from "./MeshRenderer";
import { ModelMesh } from "./ModelMesh";
import { Skin } from "./Skin";

/**
 * SkinnedMeshRenderer.
 */
export class SkinnedMeshRenderer extends MeshRenderer {
  private static _jointCountProperty = ShaderProperty.getByName("renderer_JointCount");
  private static _jointSamplerProperty = ShaderProperty.getByName("renderer_JointSampler");
  private static _jointMatrixProperty = ShaderProperty.getByName("renderer_JointMatrix");

  @ignoreClone
  private _jointDataCreateCache: Vector2 = new Vector2(-1, -1);
  @ignoreClone
  private _blendShapeWeights: Float32Array;
  @ignoreClone
  private _maxVertexUniformVectors: number;
  @ignoreClone
  private _rootBone: Entity;
  @ignoreClone
  private _localBounds: BoundingBox = new BoundingBox();
  @ignoreClone
  private _jointMatrices: Float32Array;
  @ignoreClone
  private _jointTexture: Texture2D;
  @ignoreClone
  private _bones: ReadonlyArray<Entity>;

  /** @internal */
  @ignoreClone
  _condensedBlendShapeWeights: Float32Array;

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
   * Root bone.
   */
  get rootBone(): Entity {
    return this._rootBone;
  }

  set rootBone(value: Entity) {
    if (this._rootBone !== value) {
      this._rootBone?.transform._updateFlagManager.removeListener(this._onTransformChanged);
      value.transform._updateFlagManager.addListener(this._onTransformChanged);
      this._rootBone = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Bones of the SkinnedMeshRenderer.
   */
  get bones(): ReadonlyArray<Entity> {
    return this._bones;
  }

  set bones(value: ReadonlyArray<Entity>) {
    if (this._bones !== value) {
      const lastBoneCount = this._bones?.length ?? 0;
      const boneCount = value?.length ?? 0;
      if (lastBoneCount !== boneCount) {
        const shaderData = this.shaderData;
        if (boneCount > 0) {
          this._jointMatrices = new Float32Array(boneCount * 16);
          shaderData.enableMacro("RENDERER_HAS_SKIN");
          shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, boneCount);
        } else {
          this._jointMatrices = null;
          shaderData.disableMacro("RENDERER_HAS_SKIN");
        }
      }
      this._bones = value;
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

    const localBounds = this._localBounds;
    // @ts-ignore
    localBounds.min._onValueChanged = this._onLocalBoundsChanged;
    // @ts-ignore
    localBounds.max._onValueChanged = this._onLocalBoundsChanged;
  }

  /**
   * @internal
   */
  override update(): void {
    const { _skin: skin, _bones: bones } = this;
    if (skin && bones) {
      // @todo: can optimize when share skin
      const jointMatrices = this._jointMatrices;
      const bindMatrices = skin.inverseBindMatrices;
      const worldToLocal = (this._rootBone ?? this.entity).getInvModelMatrix();
      for (let i = bones.length - 1; i >= 0; i--) {
        const bone = bones[i];
        const offset = i * 16;
        if (bone) {
          Utils._floatMatrixMultiply(bone.transform.worldMatrix, bindMatrices[i].elements, 0, jointMatrices, offset);
        } else {
          jointMatrices.set(bindMatrices[i].elements, offset);
        }
        Utils._floatMatrixMultiply(worldToLocal, jointMatrices, offset, jointMatrices, offset);
      }
    }
  }

  /**
   * @internal
   */
  protected override _updateShaderData(context: RenderContext): void {
    const entity = this.entity;
    const worldMatrix = this._rootBone ? this._rootBone.transform.worldMatrix : entity.transform.worldMatrix;
    this._updateTransformShaderData(context, worldMatrix);

    const shaderData = this.shaderData;

    const mesh = <ModelMesh>this.mesh;
    const blendShapeManager = mesh._blendShapeManager;
    blendShapeManager._updateShaderData(shaderData, this);

    const bones = this._bones;
    if (bones) {
      const bsUniformOccupiesCount = blendShapeManager._uniformOccupiesCount;
      const jointCount = bones.length;
      const jointDataCreateCache = this._jointDataCreateCache;
      const jointCountChange = jointCount !== jointDataCreateCache.x;

      if (jointCountChange || bsUniformOccupiesCount !== jointDataCreateCache.y) {
        // directly use max joint count to avoid shader recompile
        // @TODO: different shader type should use different count, not always 44
        const remainUniformJointCount = Math.ceil((this._maxVertexUniformVectors - (44 + bsUniformOccupiesCount)) / 4);

        if (jointCount > remainUniformJointCount) {
          const engine = this.engine;
          if (engine._hardwareRenderer.canIUseMoreJoints) {
            if (jointCountChange) {
              this._jointTexture?.destroy();
              this._jointTexture = new Texture2D(engine, 4, jointCount, TextureFormat.R32G32B32A32, false);
              this._jointTexture.filterMode = TextureFilterMode.Point;
              this._jointTexture.isGCIgnored = true;
            }
            shaderData.disableMacro("RENDERER_JOINTS_NUM");
            shaderData.enableMacro("RENDERER_USE_JOINT_TEXTURE");
            shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, this._jointTexture);
          } else {
            Logger.error(
              `component's joints count(${jointCount}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${this._maxVertexUniformVectors}, and don't support jointTexture in this device. suggest joint count less than ${remainUniformJointCount}.`,
              this
            );
          }
        } else {
          this._jointTexture?.destroy();
          shaderData.disableMacro("RENDERER_USE_JOINT_TEXTURE");
          shaderData.enableMacro("RENDERER_JOINTS_NUM", remainUniformJointCount.toString());
          shaderData.setFloatArray(SkinnedMeshRenderer._jointMatrixProperty, this._jointMatrices);
        }
        jointDataCreateCache.set(jointCount, bsUniformOccupiesCount);
      }

      if (this._jointTexture) {
        this._jointTexture.setPixelBuffer(this._jointMatrices);
      }
    }

    const layer = entity.layer;
    this._rendererLayer.set(layer & 65535, (layer >>> 16) & 65535, 0, 0);
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    super._onDestroy();
    this._rootBone?.transform._updateFlagManager.removeListener(this._onTransformChanged);
    this._rootBone = null;
    this._jointDataCreateCache = null;
    this._skin = null;
    this._blendShapeWeights = null;
    this._localBounds = null;
    this._jointMatrices = null;
    this._jointTexture?.destroy();
    this._jointTexture = null;
    this._bones = null;
  }

  /**
   * @internal
   */
  override _cloneTo(target: SkinnedMeshRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    const paths = new Array<number>();

    // Clone rootBone
    if (this.rootBone) {
      const success = this._getEntityHierarchyPath(srcRoot, this.rootBone, paths);
      target.rootBone = success ? this._getEntityByHierarchyPath(targetRoot, paths) : this.rootBone;
    }

    // Clone bones
    const bones = this._bones;
    if (bones) {
      const boneCount = bones.length;
      const destBones = new Array<Entity>(boneCount);
      for (let i = 0; i < boneCount; i++) {
        const bone = bones[i];
        const success = this._getEntityHierarchyPath(srcRoot, bone, paths);
        destBones[i] = success ? this._getEntityByHierarchyPath(targetRoot, paths) : bone;
      }
      target.bones = destBones;
    }

    this._blendShapeWeights && (target._blendShapeWeights = this._blendShapeWeights.slice());
  }

  /**
   * @internal
   */
  protected override _registerEntityTransformListener(): void {
    // Cancel register listener to entity transform.
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    if (this._rootBone) {
      const localBounds = this._localBounds;
      const worldMatrix = this._rootBone.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
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

  private _getEntityHierarchyPath(rootEntity: Entity, searchEntity: Entity, inversePath: number[]): boolean {
    inversePath.length = 0;
    while (searchEntity !== rootEntity) {
      const parent = searchEntity.parent;
      if (!parent) {
        return false;
      }
      inversePath.push(searchEntity.siblingIndex);
      searchEntity = parent;
    }
    return true;
  }

  /**
   * @internal
   */
  private _getEntityByHierarchyPath(rootEntity: Entity, inversePath: number[]): Entity {
    let entity = rootEntity;
    for (let i = inversePath.length - 1; i >= 0; i--) {
      entity = entity.children[inversePath[i]];
    }
    return entity;
  }

  private _skin: Skin;

  /**
   * @deprecated
   * Skin Object.
   *
   * If you want get `skeleton`, use {@link SkinnedMeshRenderer.rootBone} instead.
   * If you want get `bones`, use {@link SkinnedMeshRenderer.bones} instead.
   * `inverseBindMatrices` will migrate to mesh in the future.
   *
   * @remarks `rootBone` and `bones` will not update when `skin` changed.
   */
  get skin(): Skin {
    return this._skin;
  }

  set skin(value: Skin) {
    this._skin = value;
  }
}
