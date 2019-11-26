import { NodeAbility, Node } from "@alipay/o3-core";
import { LightFeature } from "./LightFeature";
import { mat4 } from "@alipay/o3-math";

/**
 * 灯光基类
 * @extends NodeAbility
 */
export class ALight extends NodeAbility {
  protected _viewMat;
  protected _modelMat;
  protected name: string;
  /**
   * @constructor
   * @param {Node} node 节点对象
   */
  constructor(node: Node) {
    super(node);

    this.addEventListener("enabled", this.onEnable);
    this.addEventListener("disabled", this.onDisable);

    node.addEventListener("removedFromScene", this.onDisable.bind(this));
  }

  /** 在对象Enable的时候，挂载到当前的Scene
   * @private
   */
  onEnable() {
    this.scene.findFeature(LightFeature).attachRenderLight(this);
  }

  /** 在对象Disable的时候，从当前的Scene移除
   * @private
   */
  onDisable() {
    this.scene.findFeature(LightFeature).detachRenderLight(this);
  }

  /**
   * 将灯光参数绑定到指定的材质对象上
   * @param {Material} mtl 材质对象
   * @private
   */
  bindMaterialValues(mtl, uniformName) {}

  /**
   * View 矩阵
   * @member {mat4}
   * @readonly
   */
  get viewMatrix() {
    if (!this._viewMat) this._viewMat = mat4.create();
    mat4.invert(this._viewMat, this.inverseViewMatrix);
    return this._viewMat;
  }

  /**
   * View 矩阵的逆矩阵
   * @member {mat4}
   * @readonly
   */
  get inverseViewMatrix() {
    if (!this._modelMat) this._modelMat = mat4.create();
    mat4.rotate(this._modelMat, this.node.getModelMatrix(), Math.PI, [0, 1, 0]);

    return this._modelMat;
  }
}
