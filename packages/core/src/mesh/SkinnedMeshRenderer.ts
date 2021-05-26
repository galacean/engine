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
   * Skin Object.
   */
  get skin() {
    return this._skin;
  }

  set skin(skin) {
    this._skin = skin;
  }

  _initJoints() {
    if (!this._skin) return;
    const skin = this._skin;

    const joints = skin.joints;
    this.matrixPalette = new Float32Array(joints.length * 16);
    this.jointNodes = joints;

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
      this.shaderData.enableMacro("O3_USE_JOINT_TEXTURE");
      this.shaderData.setTexture(SkinnedMeshRenderer._jointSamplerProperty, this.jointTexture);
    }
    this.jointTexture.setPixelBuffer(this.matrixPalette);
  }
}
