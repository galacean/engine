import { BlendFunc, RenderState, FrontFace, GeometryRenderer, PlaneGeometry, CylinderGeometry } from "@alipay/o3-core";
import { Vector4, Vector2 } from "@alipay/o3-math";
import { RfuiMaterial } from "./rfuiMaterial";
import { RfuiAnimation } from "./animation/rfuiAnimation";
import { Texture2D } from "@alipay/o3-core";

/**
 * Rfui 渲染类
 * @extends GeometryRenderer
 */
export class RfuiRenderer extends GeometryRenderer {
  public type;
  public texrureType;
  public geometryType;
  public animationManager;
  private _animationParam;
  private _geometryParam;
  private _blendFunc;
  private _diffuse: Vector4;
  private _mask;
  private _uvVelocity: Vector2;
  private _isAnimatingTexture;
  private _states;

  /**
   * 几何体参数
   * @typedef {Object} GeometryParam
   * @property {number} [horizontalSegments = 1] 平面水平分段数
   * @property {number} [verticalSegments = 1] 平面垂直分段数
   * @property {number} [thetaLength = Math.PI / 6] 弧面扇区的中心角
   * @property {number} [thetaStart = Math.PI - thetaLength / 2] 弧面起始角度
   */

  /**
   * 转场动画参数
   * @typedef {Object} AnimationParam
   * @property {number} [duration = 300] 动画时长
   * @property {Function} [easing = Easing.linear] 缓动函数
   * @property {Function} onComplete 完成回调
   * @property {Loops} loops 循环参数
   * @property {number} loops.type 循环类型：0（Yoyo）、1（Restart）
   * @property {number} loops.count 循环次数： -1（无限次）
   */

  /**
   * @constructor
   * @param {Entity} entity 节点对象
   * @param {Props} props 渲染类配置
   * @param {string} [props.texrureType = image]  贴图类型
   * @param {string} [props.geometryType = plane]  几何体类型
   * @param {GeometryParam} [props.geometryParam]  几何体参数
   * @param {AnimationParam} [props.animationParam]  转场动画参数
   * @param {Array} [props.blendFunc] 混合模式，[SRC_ALPHA, ONE_MINUS_SRC_ALPHA];
   * @param {Vector4|Texture2D} [props.diffuse = vec4.fromValues( 1, 1, 1, 1 )]  贴图
   * @param {Texture2D} [props.mask]  遮罩贴图
   * @param {Vector2} [props.uvVelocity]  UV 动画速度
   * @param {boolean} [props.isAnimatingTexture = false]  是否为动画贴图（需要每帧刷新贴图内容）
   */
  constructor(entity, props) {
    super(entity, props);
    this.type = "rfui";
    this.texrureType = props.texrureType || "image";
    this.geometryType = props.geometryType || "plane";

    this._animationParam = props.animationParam;
    this._geometryParam = props.geometryParam || {};
    this._blendFunc = props.blendFunc || [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA];
    this._diffuse = props.diffuse || new Vector4(1, 1, 1, 1);
    this._mask = props.mask;
    this._uvVelocity = props.uvVelocity;
    this._isAnimatingTexture = props.isAnimatingTexture || false;
    this._states = {
      // disable: [RenderState.CULL_FACE],
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: this._blendFunc,
        depthMask: [false]
      }
    };

    this.initGeometry();
    this.initMaterial();
    this.initAnimation();
  }

  initGeometry() {
    if ((this._props as any).geometry) {
      this.geometry = (this._props as any).geometry;
    } else {
      if (this.geometryType === "plane") {
        const horizontalSegments = this._geometryParam.horizontalSegments || 1;
        const verticalSegments = this._geometryParam.verticalSegments || 1;
        this.geometry = new PlaneGeometry(1, 1, horizontalSegments, verticalSegments, this.engine);
      } else {
        const thetaLength = this._geometryParam.thetaLength || Math.PI / 6;
        const thetaStart = this._geometryParam.thetaStart || Math.PI - thetaLength / 2;
        this.geometry = new CylinderGeometry(1, 1, 1, 12, 1, true, thetaStart, thetaLength, FrontFace.CW, this.engine);
      }
    }
  }

  initMaterial() {
    if ((this._props as any).material) {
      this.material = (this._props as any)._material;
    } else {
      if (this.geometryType === "cylinder") {
        this._states.functions.frontFace = [FrontFace.CW];
      }

      const material = new RfuiMaterial("rfui_mtl");
      material.renderStates = Object.assign({}, this._states, (this._props as any).renderStates);
      material.diffuse = this._diffuse;
      material.mask = this._mask;
      material.uvVelocity = this._uvVelocity;
      this.material = material;
    }
  }

  initAnimation() {
    this.animationManager = new RfuiAnimation(this.entity, {
      material: this.material,
      param: this._animationParam
    });
  }

  // update(deltaTime) {
  //   if (this._isAnimatingTexture) {
  //     this._diffuse.updateTexture();
  //   }
  // }

  set diffuse(diffuse) {
    this._diffuse = diffuse;
    (<RfuiMaterial>this._material).diffuse = this._diffuse;
  }
}
