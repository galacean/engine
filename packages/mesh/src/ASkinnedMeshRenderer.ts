import { mat4 } from "@alipay/o3-math";
import { AMeshRenderer } from "./AMeshRenderer";
import { Node } from "@alipay/o3-core";
import { Mesh } from "./Mesh";
import { mat4Type } from "@alipay/o3-core/types/type";
import { Skin } from "./Skin";

/**
 * 负责渲染一个 Skinned Mesh 的组件
 * @extends AMeshRenderer
 */
export class ASkinnedMeshRenderer extends AMeshRenderer {
  private _mat: Float32Array;
  private _weights: number[];
  private _skin: Skin;
  public started: boolean;
  public matrixPalette: Float32Array;
  public jointNodes: Node[];

  /**
   * constructor
   * @param node
   * @param props
   */
  constructor(node: Node, props: { mesh?: Mesh; skin?: Skin; weights?: number[] } = {}) {
    super(node, props);

    this._mat = mat4.create() as Float32Array;
    this._weights = null;
    this._skin = null;

    this.skin = props.skin;
    this.setWeights(props.weights);
  }

  /**
   * set morph target weights
   * @param {Number|Vec} weights 权重参数
   */
  setWeights(weights: number[]) {
    this._weights = weights;
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
    this.started = false; // force onStart callback
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

      let rootBone = this.node.findChildByName(skin.skeleton);
      if (!rootBone) {
        rootBone = this._findParent(this.node, skin.skeleton);
        if (!rootBone) return;
      }

      const joints = skin.joints;
      const jointNodes = [];

      for (let i = joints.length - 1; i >= 0; i--) {
        if (joints[i] === skin.skeleton) {
          jointNodes[i] = rootBone;
        } else {
          jointNodes[i] = rootBone.findChildByName(joints[i]);
          if (!jointNodes[i] && rootBone.parentNode) {
            jointNodes[i] = rootBone.parentNode.findChildByName(joints[i]);
          }
        }
      } // end of for

      this.matrixPalette = new Float32Array(jointNodes.length * 16);
      this.jointNodes = jointNodes;
    }
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
  update(deltaTime: number) {
    super.update(deltaTime);
    if (this._skin) {
      const joints = this.jointNodes;
      const ibms = this._skin.inverseBindMatrices;
      const matrixPalette = this.matrixPalette;
      const worldToLocal = this.node.getInvModelMatrix();

      const mat = this._mat;
      for (let i = joints.length - 1; i >= 0; i--) {
        mat4.identity(mat);
        mat4.multiply(mat, joints[i].getModelMatrix(), ibms[i]);
        mat4.multiply(mat, worldToLocal, mat);
        matrixPalette.set(mat, i * 16);
      } // end of for
    }
  }
}
