import { Component, Entity } from "@alipay/o3-core";
import { LightFeature } from "./LightFeature";
import { Matrix, Vector3 } from "@alipay/o3-math";

const _tempVec3 = new Vector3(0, 1, 0);

/**
 * 灯光基类
 */
export abstract class Light extends Component {
  protected _viewMat: Matrix;
  protected _modelMat: Matrix;
  protected name: string;

  /**
   * 将灯光参数绑定到指定的材质对象上
   * @param {Material} mtl 材质对象
   * @param {string} uniformName 材质对象
   * @private
   */
  abstract bindMaterialValues(mtl, uniformName: string);

  /**
   * 生成 Technique 所需的 uniform 定义
   * @example
   * const name = `u_pointLights[0]`;
   * const lgtUniforms = APointLight.getUniformDefine(name)
   * @param {string} uniformName
   */
  static getUniformDefine(uniformName: string) {
    return {};
  }

  /**
   * @constructor
   * @param {Entity} entity 节点对象
   */
  constructor(entity: Entity, props?: any) {
    super(entity, props);
    entity.addEventListener("removedFromScene", this._onDisable.bind(this));
  }

  /** 在对象Enable的时候，挂载到当前的Scene
   * @private
   */
  _onEnable() {
    this.scene.findFeature(LightFeature).attachRenderLight(this);
  }

  /** 在对象Disable的时候，从当前的Scene移除
   * @private
   */
  _onDisable() {
    this.scene.findFeature(LightFeature).detachRenderLight(this);
  }

  /**
   * View 矩阵
   * @member {Matrix}
   * @readonly
   */
  get viewMatrix() {
    if (!this._viewMat) this._viewMat = new Matrix();
    Matrix.invert(this.inverseViewMatrix, this._viewMat);
    return this._viewMat;
  }

  /**
   * View 矩阵的逆矩阵
   * @member {Matrix}
   * @readonly
   */
  get inverseViewMatrix() {
    if (!this._modelMat) this._modelMat = new Matrix();
    Matrix.rotate(this.entity.transform.worldMatrix, _tempVec3, Math.PI, this._modelMat);

    return this._modelMat;
  }
}
