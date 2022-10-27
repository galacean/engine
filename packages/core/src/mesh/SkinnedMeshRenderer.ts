import { BoundingBox, Matrix } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Shader } from "../shader";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { Texture2D } from "../texture/Texture2D";
import { MeshRenderer } from "./MeshRenderer";
import { ModelMesh } from "./ModelMesh";
import { Skin } from "./Skin";

/**
 * SkinnedMeshRenderer.
 */
export class SkinnedMeshRenderer extends MeshRenderer {
  private static _jointCountProperty = Shader.getPropertyByName("u_jointCount");
  private static _jointSamplerProperty = Shader.getPropertyByName("u_jointSampler");
  private static _jointMatrixProperty = Shader.getPropertyByName("u_jointMatrix");

  private static _maxJoints: number = 0;

  @ignoreClone
  private _hasInitJoints: boolean = false;
  @ignoreClone
  private _mat: Matrix;
  @ignoreClone
  /** Whether to use joint texture. Automatically used when the device can't support the maximum number of bones. */
  private _useJointTexture: boolean = false;
  private _skin: Skin;
  @ignoreClone
  private _blendShapeWeights: Float32Array;
  @ignoreClone
  private _maxVertexUniformVectors: number;
  @ignoreClone
  private _rootBone: Entity;
  @ignoreClone
  private _rootBoneIndex: number;
  @ignoreClone
  private _localBounds: BoundingBox = new BoundingBox();
  @ignoreClone
  private _matrixPalette: Float32Array;
  @ignoreClone
  private _jointTexture: Texture2D;
  @ignoreClone
  private _jointNodes: Entity[];

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
      this._hasInitJoints = false;
    }
  }

  /**
   *  Local bounds.
   */
  get localBounds(): BoundingBox {
    return this._localBounds;
  }

  set localBounds(value: BoundingBox) {
    this._localBounds = value;
  }

  /**
   *  Root bone.
   */
  get rootBone(): Entity {
    return this._rootBone;
  }

  set rootBone(value: Entity) {
    this._rootBone = value;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._mat = new Matrix();
    this._skin = null;

    const rhi = this.entity.engine._hardwareRenderer;
    let maxVertexUniformVectors = rhi.renderStates.getParameter(rhi.gl.MAX_VERTEX_UNIFORM_VECTORS);
    if (rhi.renderer === "Apple GPU") {
      // When uniform is large than 256, the skeleton matrix array access in shader very slow in Safari or WKWebview.
      // This may be a apple bug, Chrome and Firefox is OK!
      maxVertexUniformVectors = Math.min(maxVertexUniformVectors, 256);
    }
    this._maxVertexUniformVectors = maxVertexUniformVectors;
  }

  /**
   * @internal
   */
  update(): void {
    if (!this._hasInitJoints) {
      this._initJoints();
      this._hasInitJoints = true;
    }
    if (this._skin) {
      const joints = this._jointNodes;
      const ibms = this._skin.inverseBindMatrices;
      const matrixPalette = this._matrixPalette;
      const worldToLocal = this._rootBone.getInvModelMatrix();

      const mat = this._mat;
      for (let i = joints.length - 1; i >= 0; i--) {
        mat.identity();
        const Joint = joints[i];
        if (Joint) {
          Matrix.multiply(Joint.transform.worldMatrix, ibms[i], mat);
        } else {
          mat.copyFrom(ibms[i]);
        }
        Matrix.multiply(worldToLocal, mat, mat);
        matrixPalette.set(mat.elements, i * 16);
      }
      if (this._useJointTexture) {
        this._createJointTexture();
      }
    }
  }

  /**
   * @override
   * @internal
   */
  _onAwake(): void {}

  /**
   * @internal
   */
  _updateShaderData(context: RenderContext): void {
    const worldMatrix = this._rootBone.transform.worldMatrix;
    this._updateTransformShaderData(context, worldMatrix);

    const shaderData = this.shaderData;
    if (!this._useJointTexture && this._matrixPalette) {
      shaderData.setFloatArray(SkinnedMeshRenderer._jointMatrixProperty, this._matrixPalette);
    }

    const mesh = <ModelMesh>this.mesh;
    mesh._blendShapeManager._updateShaderData(shaderData, this);
  }

  /**
   * @internal
   */
  _cloneTo(target: SkinnedMeshRenderer): void {
    super._cloneTo(target);
    this._blendShapeWeights && (target._blendShapeWeights = this._blendShapeWeights.slice());
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const mesh = this._mesh;
    if (mesh && this._rootBone) {
      // const localBounds = mesh.bounds;
      const localBounds = this._localBounds;
      const worldMatrix = this._rootBone.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
    } else {
      worldBounds.min.set(0, 0, 0);
      worldBounds.max.set(0, 0, 0);
    }
  }

  private _createJointTexture(): void {
    if (!this._jointTexture) {
      const engine = this.engine;
      const rhi = engine._hardwareRenderer;
      if (!rhi) return;
      this._jointTexture = new Texture2D(engine, 4, this._jointNodes.length, TextureFormat.R32G32B32A32, false);
      this._jointTexture.filterMode = TextureFilterMode.Point;
      this.shaderData.enableMacro("O3_USE_JOINT_TEXTURE");
      this.shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, this._jointTexture);
    }
    this._jointTexture.setPixelBuffer(this._matrixPalette);
  }

  private _initJoints(): void {
    const rhi = this.entity.engine._hardwareRenderer;
    if (!rhi) return;

    const { _skin: skin, shaderData } = this;
    if (!skin) {
      shaderData.disableMacro("O3_HAS_SKIN");
      return;
    }

    const joints = skin.joints;
    const jointCount = joints.length;
    const jointNodes = new Array<Entity>(jointCount);
    for (let i = jointCount - 1; i >= 0; i--) {
      jointNodes[i] = this._findByEntityName(this.entity, joints[i]);
    }
    this._jointNodes = jointNodes;
    this._matrixPalette = new Float32Array(jointNodes.length * 16);

    this._rootBone = this._findByEntityName(this.entity, skin.skeleton);
    this._rootBoneIndex = joints.indexOf(skin.skeleton);

    this._boundsTransformFlag && this._boundsTransformFlag.destroy();
    this._boundsTransformFlag = this._rootBone.transform.registerWorldChangeFlag();

    BoundingBox.transform(this._mesh.bounds, skin.inverseBindMatrices[this._rootBoneIndex], this._localBounds);

    const maxJoints = Math.floor((this._maxVertexUniformVectors - 30) / 4);

    if (jointCount) {
      shaderData.enableMacro("O3_HAS_SKIN");
      shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, jointCount);
      if (jointCount > maxJoints) {
        if (rhi.canIUseMoreJoints) {
          this._useJointTexture = true;
        } else {
          Logger.error(
            `component's joints count(${jointCount}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${this._maxVertexUniformVectors}, and don't support jointTexture in this device. suggest joint count less than ${maxJoints}.`,
            this
          );
        }
      } else {
        const maxJoints = Math.max(SkinnedMeshRenderer._maxJoints, jointCount);
        SkinnedMeshRenderer._maxJoints = maxJoints;
        shaderData.disableMacro("O3_USE_JOINT_TEXTURE");
        shaderData.enableMacro("O3_JOINTS_NUM", maxJoints.toString());
      }
    } else {
      shaderData.disableMacro("O3_HAS_SKIN");
    }
  }

  private _findByEntityName(rootEnitity: Entity, name: string): Entity {
    if (!rootEnitity) {
      return null;
    }

    const result = rootEnitity.findByName(name);
    if (result) {
      return result;
    }

    return this._findByEntityName(rootEnitity.parent, name);
  }

  private _checkBlendShapeWeightLength(): void {
    const mesh = <ModelMesh>this._mesh;
    const newBlendShapeCount = mesh ? mesh.blendShapeCount : 0;
    const lastBlendShapeWeights = this._blendShapeWeights;
    if (lastBlendShapeWeights) {
      if (lastBlendShapeWeights.length !== newBlendShapeCount) {
        const newBlendShapeWeights = new Float32Array(newBlendShapeCount);
        if (newBlendShapeCount > lastBlendShapeWeights.length) {
          newBlendShapeWeights.set(lastBlendShapeWeights);
        } else {
          for (let i = 0, n = lastBlendShapeWeights.length; i < n; i++) {
            lastBlendShapeWeights[i] = newBlendShapeWeights[i];
          }
        }
        this._blendShapeWeights = newBlendShapeWeights;
      }
    } else {
      this._blendShapeWeights = new Float32Array(newBlendShapeCount);
    }
  }
}
