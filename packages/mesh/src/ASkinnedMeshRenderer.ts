import { mat4 } from "@alipay/o3-math";
import { AMeshRenderer } from "./AMeshRenderer";
import { Node } from "@alipay/o3-core";
import { Mesh } from "./Mesh";
import { Skin } from "./Skin";
import { Texture2D } from "@alipay/o3-material";

/**
 * 负责渲染一个 Skinned Mesh 的组件
 * @extends AMeshRenderer
 */
export class ASkinnedMeshRenderer extends AMeshRenderer {
  public matrixPalette: Float32Array;
  public jointNodes: Node[];
  public jointTexture: Texture2D;

  private _mat: Float32Array;
  private _weights: number[];
  private weightsIndices: number[] = [];
  private _skin: Skin;
  /** 当超过设备最大骨骼数时，自动使用骨骼纹理技术，该技术能提高骨骼上限，但是性能会下降 */
  private _useJointTexture: boolean = false;

  /**
   * constructor
   * @param node
   * @param props
   */
  constructor(node: Node, props: { mesh?: Mesh; skin?: Skin; weights?: number[]; rootNodes?: Node[] } = {}) {
    super(node, props);
    this._mat = mat4.create() as Float32Array;
    this._weights = null;
    this._skin = null;

    this.skin = props.skin;
    this.setWeights(props.mesh?.weights);
  }

  /**
   * set morph target weights
   * @param {Number|Vec} weights 权重参数
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

    // 冒泡排序，对 weights 进行大小排序，weightsIndices 根据 weights 顺序而调换顺序
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
   * 当前绑定的 Skin 对象
   */
  get skin() {
    return this._skin;
  }

  /**
   * 绑定 Skin 对象
   */
  set skin(skin) {
    this._skin = skin;
    this._started = false; // force onStart callback
  }

  get weights() {
    return this._weights;
  }

  /**
   * callback, create interal objects, bind bones
   * @private
   */
  onStart() {
    if (this._skin) {
      const skin = this._skin;
      //-- init

      const joints = skin.joints;
      const jointNodes = [];
      for (let i = joints.length - 1; i >= 0; i--) {
        jointNodes[i] = this.findByNodeName(this.node, joints[i]);
      } // end of for
      this.matrixPalette = new Float32Array(jointNodes.length * 16);
      this.jointNodes = jointNodes;

      /** 是否使用骨骼纹理 */
      const rhi = this.scene.activeCameras[0].renderHardware;
      const maxAttribUniformVec4 = rhi.renderStates.getParameter(rhi.gl.MAX_VERTEX_UNIFORM_VECTORS);
      const maxJoints = Math.floor((maxAttribUniformVec4 - 16) / 4);

      if (joints.length > maxJoints && rhi.canIUseMoreJoints) {
        this._useJointTexture = true;
      }
    }
  }

  private findByNodeName(node: Node, nodeName: string) {
    if (!node) return null;

    const n = node.findChildByName(nodeName);

    if (n) return n;

    return this.findByNodeName(node.parentNode, nodeName);
  }

  /**
   * 在SceneGraph的树形结构中中向上查找
   * @param {SceneNode} node
   * @param {string} nodeName
   * @private
   */
  _findParent(node: Node, nodeName: string) {
    if (node) {
      const parent = node.parentNode;
      if (!parent) return null;
      if (parent.name === nodeName) return parent;

      const brother = parent.findChildByName(nodeName);
      if (brother) return brother;

      return this._findParent(parent, nodeName);
    }
    return null;
  }

  /**
   * update matrix palette
   * @param {Number} deltaTime
   * @private
   */
  onUpdate(deltaTime: number) {
    if (this._skin) {
      const joints = this.jointNodes;
      const ibms = this._skin.inverseBindMatrices;
      const matrixPalette = this.matrixPalette;
      const worldToLocal = this.node.getInvModelMatrix();

      const mat = this._mat;
      for (let i = joints.length - 1; i >= 0; i--) {
        mat4.identity(mat);
        if (joints[i]) {
          mat4.multiply(mat, joints[i].getModelMatrix(), ibms[i]);
        } else {
          mat4.copy(mat, ibms[i]);
        }
        mat4.multiply(mat, worldToLocal, mat);
        matrixPalette.set(mat, i * 16);
      } // end of for
      if (this._useJointTexture) {
        this.createJointTexture();
      }
    }
  }

  /**
   * 生成骨骼纹理，将 matrixPalette 存储到 u_jointSampler 中
   * 格式：(4 * RGBA) * jointCont
   * */
  createJointTexture() {
    if (!this.jointTexture) {
      this.jointTexture = new Texture2D("joint_texture", this.matrixPalette, {
        isRaw: true,
        isFloat: true,
        width: 4,
        height: this.jointNodes.length
      });
      return;
    }
    this.jointTexture.image = this.matrixPalette;
  }
}
