import { BoundingBox, Matrix, Vector2 } from "@galacean/engine-math";
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
  private _hasInitSkin: boolean = false;
  @ignoreClone
  private _jointDataCreateCache: Vector2 = new Vector2(-1, -1);
  private _skin: Skin;
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
  private _jointEntities: Entity[];

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
   * Skin Object.
   */
  get skin(): Skin {
    return this._skin;
  }

  set skin(value: Skin) {
    if (this._skin !== value) {
      this._skin = value;
      this._hasInitSkin = false;
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
    this._skin.skeleton = value.name;
    this._hasInitSkin = false;
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
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
    if (!this._hasInitSkin) {
      this._initSkin();
      this._hasInitSkin = true;
    }
    const skin = this._skin;
    if (skin) {
      const ibms = skin.inverseBindMatrices;
      const worldToLocal = this._rootBone.getInvModelMatrix();
      const { _jointEntities: joints, _jointMatrices: jointMatrices } = this;

      for (let i = joints.length - 1; i >= 0; i--) {
        const joint = joints[i];
        const offset = i * 16;
        if (joint) {
          Utils._floatMatrixMultiply(joint.transform.worldMatrix, ibms[i].elements, 0, jointMatrices, offset);
        } else {
          jointMatrices.set(ibms[i].elements, offset);
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

    const skin = this._skin;
    if (skin) {
      const bsUniformOccupiesCount = blendShapeManager._uniformOccupiesCount;
      const jointCount = skin.joints.length;
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
    if (this._jointEntities) {
      this._jointEntities.length = 0;
      this._jointEntities = null;
    }
  }

  /**
   * @internal
   */
  override _cloneTo(target: SkinnedMeshRenderer): void {
    super._cloneTo(target);
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

  private _initSkin(): void {
    const rhi = this.entity.engine._hardwareRenderer;
    if (!rhi) return;

    const { _skin: skin, shaderData } = this;
    if (!skin) {
      shaderData.disableMacro("RENDERER_HAS_SKIN");
      return;
    }

    const joints = skin.joints;
    const jointCount = joints.length;
    const jointEntities = new Array<Entity>(jointCount);
    for (let i = jointCount - 1; i >= 0; i--) {
      jointEntities[i] = this._findByEntityName(this.entity, joints[i]);
    }
    this._jointEntities = jointEntities;
    this._jointMatrices = new Float32Array(jointCount * 16);

    const lastRootBone = this._rootBone;
    const rootBone = this._findByEntityName(this.entity, skin.skeleton);

    lastRootBone && lastRootBone.transform._updateFlagManager.removeListener(this._onTransformChanged);
    rootBone.transform._updateFlagManager.addListener(this._onTransformChanged);

    const rootIndex = joints.indexOf(skin.skeleton);
    if (rootIndex !== -1) {
      BoundingBox.transform(this._mesh.bounds, skin.inverseBindMatrices[rootIndex], this._localBounds);
    } else {
      // Root bone is not in joints list, we can only compute approximate inverse bind matrix
      // Average all root bone's children inverse bind matrix
      const approximateBindMatrix = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let subRootBoneCount = this._computeApproximateBindMatrix(
        jointEntities,
        skin.inverseBindMatrices,
        rootBone,
        approximateBindMatrix
      );

      if (subRootBoneCount !== 0) {
        Matrix.multiplyScalar(approximateBindMatrix, 1.0 / subRootBoneCount, approximateBindMatrix);
        BoundingBox.transform(this._mesh.bounds, approximateBindMatrix, this._localBounds);
      } else {
        this._localBounds.copyFrom(this._mesh.bounds);
      }
    }

    this._rootBone = rootBone;
    if (jointCount) {
      shaderData.enableMacro("RENDERER_HAS_SKIN");
      shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, jointCount);
    } else {
      shaderData.disableMacro("RENDERER_HAS_SKIN");
    }
  }

  private _computeApproximateBindMatrix(
    jointEntities: Entity[],
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

  private _findByEntityName(rootEntity: Entity, name: string): Entity {
    if (!rootEntity) {
      return null;
    }

    const result = rootEntity.findByName(name);
    if (result) {
      return result;
    }

    return this._findByEntityName(rootEntity.parent, name);
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
}
