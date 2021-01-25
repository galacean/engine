import { Matrix } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { ignoreClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Shader } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { Texture2D } from "../texture/Texture2D";
import { MeshRenderer } from "./MeshRenderer";
import { Skin } from "./Skin";

/**
 * SkinnedMeshRenderer
 */
export class SkinnedMeshRenderer extends MeshRenderer {
  private static _jointCountProperty: ShaderProperty = Shader.getPropertyByName("u_jointCount");
  private static _jointSamplerProperty: ShaderProperty = Shader.getPropertyByName("u_jointSampler");
  private static _jointMatrixProperty: ShaderProperty = Shader.getPropertyByName("u_jointMatrix");

  private static _maxJoints: number = 0;

  @ignoreClone
  public matrixPalette: Float32Array;
  @ignoreClone
  public jointNodes: Entity[];
  @ignoreClone
  public jointTexture: Texture2D;

  @ignoreClone
  private _hasInitJoints: boolean = false;
  @ignoreClone
  private _mat: Matrix;
  @ignoreClone
  private _weights: number[];
  @ignoreClone
  private weightsIndices: number[] = [];
  @ignoreClone
  /** Whether to use joint texture. Automatically used when the device can't support the maxium number of bones. */
  private _useJointTexture: boolean = false;

  private _skin: Skin;

  /**
   * Constructor of SkinnedMeshRenderer
   * @param entity - Entity
   */
  constructor(entity: Entity) {
    super(entity);
    this._mat = new Matrix();
    this._weights = null;
    this._skin = null;
  }

  /**
   * @internal
   */
  _updateShaderData(context: RenderContext) {
    super._updateShaderData(context);

    if (!this._useJointTexture && this.matrixPalette) {
      this.shaderData.setFloatArray(SkinnedMeshRenderer._jointMatrixProperty, this.matrixPalette);
    }
  }

  /**
   * Set morph target weights
   * @param weights - Weights
   */
  setWeights(weights: number[]) {
    this._weights = weights;
    if (!weights) {
      return;
    }
    const len = weights.length;
    for (let i = 0; i < len; i++) {
      this.weightsIndices[i] = i;
    }

    const weightsIndices = this.weightsIndices;

    for (let i = 0; i < len - 1; i++) {
      for (let j = i + 1; j < len; j++) {
        if (weights[j] > weights[i]) {
          let t = weights[i];
          weights[i] = weights[j];
          weights[j] = t;
          t = weightsIndices[i];
          weightsIndices[i] = weightsIndices[j];
          weightsIndices[j] = t;
        }
      }
    }
    this.mesh.updatePrimitiveWeightsIndices(weightsIndices);
  }

  /**
   * Skin Object.
   */
  get skin() {
    return this._skin;
  }

  set skin(skin) {
    this._skin = skin;
  }

  get weights() {
    return this._weights;
  }

  _initJoints() {
    if (!this._skin) return;
    const skin = this._skin;

    const joints = skin.joints;
    const jointNodes = [];
    for (let i = joints.length - 1; i >= 0; i--) {
      jointNodes[i] = this.findByNodeName(this.entity, joints[i]);
    } // end of for
    this.matrixPalette = new Float32Array(jointNodes.length * 16);
    this.jointNodes = jointNodes;

    /** Whether to use a skeleton texture */
    const rhi = this.entity.engine._hardwareRenderer;
    if (!rhi) return;
    const maxAttribUniformVec4 = rhi.renderStates.getParameter(rhi.gl.MAX_VERTEX_UNIFORM_VECTORS);
    const maxJoints = Math.floor((maxAttribUniformVec4 - 20) / 4);
    const shaderData = this.shaderData;
    const jointCount = this.jointNodes?.length;
    if (jointCount) {
      shaderData.enableMacro("O3_HAS_SKIN");
      shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, jointCount);
      if (joints.length > maxJoints) {
        if (rhi.canIUseMoreJoints) {
          this._useJointTexture = true;
          shaderData.enableMacro("O3_USE_JOINT_TEXTURE");
          shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, this.jointTexture);
        } else {
          Logger.error(
            `component's joints count(${joints}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${maxAttribUniformVec4}, and don't support jointTexture in this device. suggest joint count less than ${maxJoints}.`,
            this
          );
        }
      } else {
        const maxJoints = Math.max(SkinnedMeshRenderer._maxJoints, joints.length);
        SkinnedMeshRenderer._maxJoints = maxJoints;
        shaderData.disableMacro("O3_USE_JOINT_TEXTURE");
        shaderData.enableMacro("O3_JOINTS_NUM", maxJoints.toString());
      }
    } else {
      shaderData.disableMacro("O3_HAS_SKIN");
    }
  }

  private findByNodeName(entity: Entity, nodeName: string) {
    if (!entity) return null;

    const n = entity.findByName(nodeName);

    if (n) return n;

    return this.findByNodeName(entity.parent, nodeName);
  }

  private _findParent(entity: Entity, nodeName: string) {
    if (entity) {
      const parent = entity.parent;
      if (!parent) return null;
      if (parent.name === nodeName) return parent;

      const brother = parent.findByName(nodeName);
      if (brother) return brother;

      return this._findParent(parent, nodeName);
    }
    return null;
  }

  /**
   * @internal
   */
  update() {
    if (!this._hasInitJoints) {
      this._initJoints();
      this._hasInitJoints = true;
    }
    if (this._skin) {
      const joints = this.jointNodes;
      const ibms = this._skin.inverseBindMatrices;
      const matrixPalette = this.matrixPalette;
      const worldToLocal = this.entity.getInvModelMatrix();

      const mat = this._mat;
      for (let i = joints.length - 1; i >= 0; i--) {
        mat.identity();
        if (joints[i]) {
          Matrix.multiply(joints[i].transform.worldMatrix, ibms[i], mat);
        } else {
          ibms[i].cloneTo(mat);
        }
        Matrix.multiply(worldToLocal, mat, mat);
        matrixPalette.set(mat.elements, i * 16);
      } // end of for
      if (this._useJointTexture) {
        this.createJointTexture();
      }
    }
  }

  /**
   * Generate joint texture.
   * Format: (4 * RGBA) * jointCont
   */
  createJointTexture() {
    if (!this.jointTexture) {
      const engine = this.engine;
      const rhi = engine._hardwareRenderer;
      if (!rhi) return;
      this.jointTexture = new Texture2D(engine, 4, this.jointNodes.length, TextureFormat.R32G32B32A32, false);
      this.jointTexture.filterMode = TextureFilterMode.Point;
    }
    this.jointTexture.setPixelBuffer(this.matrixPalette);
  }
}
