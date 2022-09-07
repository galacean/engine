import { Matrix } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
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
  /** Whether to use joint texture. Automatically used when the device can't support the maximum number of bones. */
  private _useJointTexture: boolean = false;
  private _skin: Skin;
  private _blendShapeCountChangeFlag: BoolUpdateFlag = new BoolUpdateFlag();

  /** @internal */
  @ignoreClone
  _blendShapeWeights: Float32Array = new Float32Array(0);

  /** @internal */
  @ignoreClone
  _condensedBlendShapeWeights: Float32Array;

  /**
   * The weights of the BlendShapes.
   * @remarks Array index is BlendShape index.
   */
  get blendShapeWeights(): Float32Array {
    if (this._blendShapeCountChangeFlag.flag) {
      this._resetBlendShapeWeights(<ModelMesh>this._mesh);
      this._blendShapeCountChangeFlag.flag = false;
    }

    return this._blendShapeWeights;
  }

  set blendShapeWeights(value: Float32Array) {
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

    const shaderData = this.shaderData;
    if (!this._useJointTexture && this.matrixPalette) {
      shaderData.setFloatArray(SkinnedMeshRenderer._jointMatrixProperty, this.matrixPalette);
    }

    const mesh = <ModelMesh>this.mesh;
    mesh._blendShapeManager._updateShaderData(shaderData, this);
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
    const maxJoints = Math.floor((maxAttribUniformVec4 - 30) / 4);
    const shaderData = this.shaderData;
    const jointCount = jointNodes.length;

    if (jointCount) {
      shaderData.enableMacro("O3_HAS_SKIN");
      shaderData.setInt(SkinnedMeshRenderer._jointCountProperty, jointCount);
      if (jointCount > maxJoints) {
        if (rhi.canIUseMoreJoints) {
          this._useJointTexture = true;
        } else {
          Logger.error(
            `component's joints count(${jointCount}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${maxAttribUniformVec4}, and don't support jointTexture in this device. suggest joint count less than ${maxJoints}.`,
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

  private findByNodeName(entity: Entity, nodeName: string) {
    if (!entity) return null;

    const n = entity.findByName(nodeName);

    if (n) return n;

    return this.findByNodeName(entity.parent, nodeName);
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
          mat.copyFrom(ibms[i]);
        }
        Matrix.multiply(worldToLocal, mat, mat);
        matrixPalette.set(mat.elements, i * 16);
      }
      if (this._useJointTexture) {
        this.createJointTexture();
      }
    }
  }

  /**
   * Generate joint texture.
   * Format: (4 * RGBA) * jointCont
   */
  createJointTexture(): void {
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

  /**
   * @override
   * @internal
   */
  _setMesh(mesh: ModelMesh): void {
    const lastMesh = this._mesh;
    super._setMesh(mesh);

    if (lastMesh) {
      this._blendShapeCountChangeFlag.clearFromManagers();
    }
    if (mesh) {
      mesh._blendShapeManager._blendShapeCountChangeManager.addFlag(this._blendShapeCountChangeFlag);
    }
    this._resetBlendShapeWeights(mesh);
  }

  /**
   * @internal
   */
  _cloneTo(target: SkinnedMeshRenderer): void {
    super._cloneTo(target);
    target.blendShapeWeights = this._blendShapeWeights.slice();
  }

  private _resetBlendShapeWeights(mesh: ModelMesh): void {
    const blendShapeCount = mesh ? mesh.blendShapeCount : 0;
    if (this._blendShapeWeights && this._blendShapeWeights.length !== blendShapeCount) {
      this._blendShapeWeights = new Float32Array(blendShapeCount);
    } else {
      this._blendShapeWeights.fill(0);
    }
  }
}
