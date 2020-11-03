import { Matrix, Vector2, Vector3, Vector4 } from "@alipay/o3-math";
import { BlendFunc, CullFace, DataType, GLCapabilityType, MaterialType, RenderState, Side } from "../base/Constant";
import { Util } from "../base/Util";
import { Camera } from "../Camera";
import { Component } from "../Component";
import { Engine } from "../Engine";
import { LightFeature } from "../lighting/LightFeature";
import { Material } from "../material/Material";
import { RenderTechnique } from "../material/RenderTechnique";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Texture } from "../texture/Texture";
import fs from "./pbr.fs.glsl";
import vs from "./pbr.vs.glsl";
/**
 * PBR（Physically-Based Rendering）材质
 */
class PBRMaterial extends Material {
  private _uniformObj;
  private _stateObj;
  private _ambientLightCount: number;
  private _envMapLightCount: number;
  private _spotLightCount: number;
  private _directLightCount: number;
  private _pointLightCount: number;
  private _useDiffuseEnv: boolean;
  private _useSpecularEnv: boolean;
  private _clipPlaneCount: number;
  private _useOIT: boolean;

  /**
   * PBR 材质
   * @param {String} [name='PBR_MATERIAL'] 材质名
   * @param {Object} [props] 包含以下参数
   * @param {Vector4} [props.baseColorFactor=[1, 1, 1, 1]] 基础颜色因子
   * @param {Texture2D} [props.baseColorTexture] 基础颜色纹理
   * @param {Number} [props.metallicFactor=1] 金属度
   * @param {Number} [props.roughnessFactor=1] 粗糙度
   * @param {Texture2D} [props.metallicTexture] 金属纹理
   * @param {Texture2D} [props.roughnessTexture] 粗糙度纹理
   * @param {Texture2D} [props.metallicRoughnessTexture] 金属粗糙度纹理
   * @param {Texture2D} [props.normalTexture] 法线纹理
   * @param {Number} [props.normalScale=1] 法线缩放量
   * @param {Texture2D} [props.emissiveTexture] 发散光纹理
   * @param {Vector3} [props.emissiveFactor=[0, 0, 0]] 发散光因子
   * @param {Texture2D} [props.occlusionTexture] 遮蔽纹理
   * @param {Number} [props.occlusionStrength=1] 遮蔽强度
   * @param {Number} [props.alphaCutoff=0.5] alpha裁剪值
   * @param {String} [props.alphaMode='OPAQUE'] alpha混合模式
   * @param {Boolean} [props.doubleSided=false] 是否显示双面
   * @param {Side} [props.side=Side.Front] 显示哪一个面，向下兼容doubleSided
   * @param {Boolean} [props.unlit=false] 是否不使用光照
   * @param {Boolean} [props.srgb=false] 是否为 SRGB 色彩空间
   * @param {Boolean} [props.srgbFast=true] sRGB线性校正是否使用近似快速算法
   * @param {Boolean} [props.gamma=false] 是否使用 Gamma 纠正
   * @param {Number} [props.opacity=1] 透明度
   * @param {Texture2D} [props.opacityTexture] 透明度贴图
   * @param {boolean} [props.getOpacityFromRGB=false] true:取透明度贴图的rgb亮度，false:取alpha通道
   *
   * @param {boolean} [props.isMetallicWorkflow=true] ture:金属粗糙度模式，false：高光光泽度模式
   * @param {Vector3} [props.specularFactor=[1，1，1]] 高光度因子
   * @param {number} [props.glossinessFactor=0] 光泽度
   * @param {Texture2D} [props.specularGlossinessTexture] 高光光泽度纹理
   *
   * @param {number} [props.envMapIntensity] 反射模式时的反射强度；
   *
   *  todo: IOR 更加符合材质的属性，但是需要增加额外的属性来表示非真空折射率，如摄像机在水中等情况。
   * @param {number} [props.refractionRatio] 折射模式时的折射率的比例，如真空折射率/水折射率=1/1.33;
   * @param {boolean} [props.envMapModeRefract=false] 全局环境贴图使用 反射或者折射 模式;
   * @param {Texture2D} [props.refractionTexture] 局部 折射纹理;
   * @param {number} [props.refractionDepth] 局部 折射纹理 深度值，用来模拟折射距离;
   *
   * @param {Texture2D} [props.perturbationTexture] 扰动纹理
   * @param {number} [props.perturbationUOffset] 扰动纹理U偏移
   * @param {number} [props.perturbationVOffset] 扰动纹理V偏移
   *
   * @param {TextureCubeMap} [props.reflectionTexture] 局部反射贴图，可以覆盖 AEnvironmentMapLight
   *
   */
  constructor(engine: Engine, name = PBRMaterial.MATERIAL_NAME, props = {}) {
    super(engine, name);

    this.createDefaulteValues();
    this.setUniforms(props);
    this.setStates(props);
  }

  /**
   * 创建默认的参数值
   * @private
   */
  createDefaulteValues() {
    this._uniformObj = {
      baseColorFactor: new Vector4(1.0, 1.0, 1.0, 1.0),
      metallicFactor: 1,
      roughnessFactor: 1,
      metallicRoughness: new Vector2(1.0, 1.0),
      normalScale: 1,
      emissiveFactor: new Vector3(0.0, 0.0, 0.0),
      occlusionStrength: 1,
      alphaCutoff: 0.5,

      // specular-glossiness workflow
      specularFactor: new Vector3(1.0, 1.0, 1.0),
      glossinessFactor: 0,

      // reflect,refract
      envMapIntensity: 1,
      refractionRatio: 1 / 1.33,
      refractionDepth: 1,

      // perturbation
      perturbationUOffset: 0,
      perturbationVOffset: 0
    };

    this._stateObj = {
      alphaMode: "OPAQUE",
      doubleSided: false,
      side: Side.FRONT,
      unlit: false,
      srgb: false,
      srgbFast: false,
      gamma: false,
      blendFunc: [],
      blendFuncSeparate: [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA, BlendFunc.ONE, BlendFunc.ONE],
      depthMask: [false],
      getOpacityFromRGB: false,
      isMetallicWorkflow: true,
      envMapModeRefract: false
    };

    Object.keys(this._uniformObj).forEach((k) => this.setValueByParamName(k, this._uniformObj[k]));
  }

  /**
   * 设置使用到的Uniform信息
   * @param {Object} obj 使用到的Uniform信息
   * @private
   */
  setUniforms(obj) {
    Object.keys(obj).forEach((key) => {
      switch (key) {
        case "baseColorFactor":
          this.baseColorFactor = obj[key];
          break;
        case "opacity":
          this.opacity = obj[key];
          break;
        case "opacityTexture":
          this.opacityTexture = obj[key];
          break;
        case "baseColorTexture":
          this.baseColorTexture = obj[key];
          break;
        case "metallicFactor":
          this.metallicFactor = obj[key];
          break;
        case "roughnessFactor":
          this.roughnessFactor = obj[key];
          break;
        case "metallicTexture":
          this.metallicTexture = obj[key];
          break;
        case "roughnessTexture":
          this.roughnessTexture = obj[key];
          break;
        case "metallicRoughnessTexture":
          this.metallicRoughnessTexture = obj[key];
          break;
        case "normalTexture":
          this.normalTexture = obj[key];
          break;
        case "normalScale":
          this.normalScale = obj[key];
          break;
        case "emissiveTexture":
          this.emissiveTexture = obj[key];
          break;
        case "emissiveFactor":
          this.emissiveFactor = obj[key];
          break;
        case "occlusionTexture":
          this.occlusionTexture = obj[key];
          break;
        case "occlusionStrength":
          this.occlusionStrength = obj[key];
          break;
        case "alphaCutoff":
          this.alphaCutoff = obj[key];
          break;
        case "specularFactor":
          this.specularFactor = obj[key];
          break;
        case "glossinessFactor":
          this.glossinessFactor = obj[key];
          break;
        case "specularGlossinessTexture":
          this.specularGlossinessTexture = obj[key];
          break;
        case "reflectionTexture":
          this.reflectionTexture = obj[key];
          break;
        case "envMapIntensity":
          this.envMapIntensity = obj[key];
          break;
        case "refractionRatio":
          this.refractionRatio = obj[key];
          break;
        case "refractionDepth":
          this.refractionDepth = obj[key];
          break;
        case "refractionTexture":
          this.refractionTexture = obj[key];
          break;
        case "perturbationTexture":
          this.perturbationTexture = obj[key];
          break;
        case "perturbationUOffset":
          this.perturbationUOffset = obj[key];
          break;
        case "perturbationVOffset":
          this.perturbationVOffset = obj[key];
          break;
        default:
          break;
      }
    });
  }

  /**
   * 设置渲染状态信息
   * @param {Object} obj 渲染状态信息
   * @private
   */
  setStates(obj) {
    Object.keys(obj).forEach((key) => {
      switch (key) {
        case "doubleSided":
          this.doubleSided = obj[key];
          break;
        case "side":
          this.side = obj[key];
          break;
        case "alphaMode":
          this.alphaMode = obj[key];
          break;
        case "unlit":
          this.unlit = obj[key];
          break;
        case "srgb":
          this.srgb = obj[key];
          break;
        case "srgbFast":
          this.srgbFast = obj[key];
          break;
        case "gamma":
          this.gamma = obj[key];
          break;
        case "blendFunc":
          this.blendFunc = obj[key];
          break;
        case "blendFuncSeparate":
          this.blendFuncSeparate = obj[key];
          break;
        case "depthMask":
          this.depthMask = obj[key];
          break;
        case "getOpacityFromRGB":
          this.getOpacityFromRGB = obj[key];
          break;
        case "isMetallicWorkflow":
          this.isMetallicWorkflow = obj[key];
          break;
        case "envMapModeRefract":
          this.envMapModeRefract = obj[key];
          break;
      }
    });
  }

  /**
   * 根据 uniform 的参数名设置材质值
   * @private
   */
  setValueByParamName(paramName, value) {
    const uniforms = PBRMaterial.TECH_CONFIG.uniforms;
    const uniformName = Object.keys(uniforms).find((key) => uniforms[key].paramName === paramName);
    if (uniformName) {
      this.setValue(uniformName, value);
    }
  }

  /** 根据 state 跟新 technique */
  private updateTechnique(stateName: string, v) {
    if (this[stateName] === v) return;
    this._stateObj[stateName] = v;

    const states = this.technique?.states;
    if (!states) return;

    switch (stateName) {
      case "doubleSided":
      case "side":
        if (this.doubleSided) {
          states.disable.push(RenderState.CULL_FACE);
        } else {
          const index = states.disable.indexOf(RenderState.CULL_FACE);
          if (index > -1) {
            states.disable.splice(index, 1);
          }
          switch (this.side) {
            case Side.FRONT:
              states.functions.cullFace = [CullFace.BACK];
              break;
            case Side.BACK:
              states.functions.cullFace = [CullFace.FRONT];
              break;
            case Side.NONE:
              states.functions.cullFace = [CullFace.FRONT_AND_BACK];
              break;
            default:
              delete states.functions.cullFace;
          }
        }
        break;
      case "blendFunc":
      case "blendFuncSeparate":
        if (this.blendFunc.length) {
          states.functions.blendFunc = this.blendFunc;
        } else {
          states.functions.blendFuncSeparate = this.blendFuncSeparate;
        }
        break;
      case "depthMask":
        states.functions.depthMask = v;
        break;
      default:
        this._technique = null;
    }
  }

  /****************************************   uniform start **************************************** /

   /**
   * 基础颜色因子
   * @type {Vector4}
   */
  get baseColorFactor() {
    return this._uniformObj.baseColorFactor;
  }

  set baseColorFactor(v: Vector4) {
    this._uniformObj.baseColorFactor = v;
    this.setValueByParamName("baseColorFactor", v);
  }

  get opacity(): number {
    return this.baseColorFactor[3];
  }

  set opacity(val: number) {
    this.baseColorFactor[3] = val;
  }

  /**
   * 基础颜色纹理
   * @type {Texture2D}
   */
  get baseColorTexture() {
    return this._uniformObj.baseColorTexture;
  }

  set baseColorTexture(v) {
    this.setValueByParamName("baseColorTexture", v);
    this._uniformObj.baseColorTexture = v;
  }

  /**
   * 透明贴图
   * @type {Texture2D}
   * */
  get opacityTexture() {
    return this._uniformObj.opacityTexture;
  }

  set opacityTexture(v) {
    this.setValueByParamName("opacityTexture", v);
    this._uniformObj.opacityTexture = v;
  }

  /**
   * 金属度
   * @type {Number}
   */
  get metallicFactor() {
    return this._uniformObj.metallicFactor;
  }

  set metallicFactor(v) {
    this._uniformObj.metallicFactor = v;
    this._uniformObj.metallicRoughness.x = v;
    this.setValueByParamName("metallicRoughness", this._uniformObj.metallicRoughness);
  }

  /**
   * 粗糙度
   * @type {Number}
   */
  get roughnessFactor() {
    return this._uniformObj.roughnessFactor;
  }

  set roughnessFactor(v) {
    this._uniformObj.roughnessFactor = v;
    this._uniformObj.metallicRoughness.y = v;
    this.setValueByParamName("metallicRoughness", this._uniformObj.metallicRoughness);
  }

  /**
   * 金属纹理
   * @type {Texture2D}
   */
  get metallicTexture() {
    return this._uniformObj.metallicTexture;
  }

  set metallicTexture(v) {
    this.setValueByParamName("metallicTexture", v);
    this._uniformObj.metallicTexture = v;
  }

  /**
   * 粗糙度纹理
   * @type {Texture2D}
   */
  get roughnessTexture() {
    return this._uniformObj.roughnessTexture;
  }

  set roughnessTexture(v) {
    this.setValueByParamName("roughnessTexture", v);
    this._uniformObj.roughnessTexture = v;
  }

  /**
   * 金属粗糙度纹理
   * @type {Texture2D}
   */
  get metallicRoughnessTexture() {
    return this._uniformObj.metallicRoughnessTexture;
  }

  set metallicRoughnessTexture(v) {
    this.setValueByParamName("metallicRoughnessTexture", v);
    this._uniformObj.metallicRoughnessTexture = v;
  }

  /**
   * 法线纹理
   * @type {Texture2D}
   */
  get normalTexture() {
    return this._uniformObj.normalTexture;
  }

  set normalTexture(v) {
    this.setValueByParamName("normalTexture", v);
    this._uniformObj.normalTexture = v;
  }

  /**
   * 法线缩放量
   * @type {Number}
   */
  get normalScale() {
    return this._uniformObj.normalScale;
  }

  set normalScale(v) {
    this._uniformObj.normalScale = v;
    this.setValueByParamName("normalScale", v);
  }

  /**
   * 发散光纹理
   * @type {Texture2D}
   */
  get emissiveTexture() {
    return this._uniformObj.emissiveTexture;
  }

  set emissiveTexture(v) {
    this.setValueByParamName("emissiveTexture", v);
    this._uniformObj.emissiveTexture = v;
  }

  /**
   * 发散光因子
   * @type {Vector3}
   */
  get emissiveFactor() {
    return this._uniformObj.emissiveFactor;
  }

  set emissiveFactor(v: Vector3) {
    this._uniformObj.emissiveFactor = v;
    this.setValueByParamName("emissiveFactor", v);
  }

  /**
   * 遮蔽纹理
   * @type {Texture2D}
   */
  get occlusionTexture() {
    return this._uniformObj.occlusionTexture;
  }

  set occlusionTexture(v) {
    this.setValueByParamName("occlusionTexture", v);
    this._uniformObj.occlusionTexture = v;
  }

  /**
   * 遮蔽强度
   * @type {Number}
   */
  get occlusionStrength() {
    return this._uniformObj.occlusionStrength;
  }

  set occlusionStrength(v) {
    this._uniformObj.occlusionStrength = v;
    this.setValueByParamName("occlusionStrength", v);
  }

  /**
   * alpha裁剪值
   * @type {Number}
   */
  get alphaCutoff() {
    return this._uniformObj.alphaCutoff;
  }

  set alphaCutoff(v) {
    this._uniformObj.alphaCutoff = v;
    this.setValueByParamName("alphaCutoff", v);
  }

  /**
   * 高光度因子
   * @type {Vector3}
   */
  get specularFactor() {
    return this._uniformObj.specularFactor;
  }

  set specularFactor(v) {
    this.setValueByParamName("specularFactor", v);
    this._uniformObj.specularFactor = v;
  }

  /**
   * 光泽度
   * @type {Array}
   */
  get glossinessFactor() {
    return this._uniformObj.glossinessFactor;
  }

  set glossinessFactor(v) {
    this.setValueByParamName("glossinessFactor", v);
    this._uniformObj.glossinessFactor = v;
  }

  /**
   * 高光光泽度纹理
   * @type {Texture2D}
   */
  get specularGlossinessTexture() {
    return this._uniformObj.specularGlossinessTexture;
  }

  set specularGlossinessTexture(v) {
    this.setValueByParamName("specularGlossinessTexture", v);
    this._uniformObj.specularGlossinessTexture = v;
  }

  /**
   * 镜面反射纹理
   * @type {TextureCubeMap}
   */
  get reflectionTexture() {
    return this._uniformObj.reflectionTexture;
  }

  set reflectionTexture(v) {
    this.setValueByParamName("reflectionTexture", v);
    this._uniformObj.reflectionTexture = v;
  }

  /**
   * 反射强度
   * @type {number}
   */
  get envMapIntensity() {
    return this._uniformObj.envMapIntensity;
  }

  set envMapIntensity(v) {
    this.setValueByParamName("envMapIntensity", v);
    this._uniformObj.envMapIntensity = v;
  }

  /**
   * 折射率比
   * @type {number}
   */
  get refractionRatio() {
    return this._uniformObj.refractionRatio;
  }

  set refractionRatio(v) {
    this.setValueByParamName("refractionRatio", v);
    this._uniformObj.refractionRatio = v;
  }

  /**
   * 局部折射纹理的深度值，用来模拟折射距离
   * @type {number}
   */
  get refractionDepth() {
    return this._uniformObj.refractionDepth;
  }

  set refractionDepth(v) {
    this.setValueByParamName("refractionDepth", v);
    this._uniformObj.refractionDepth = v;
  }

  /**
   * 局部折射纹理
   * @type {Texture2D}
   */
  get refractionTexture() {
    return this._uniformObj.refractionTexture;
  }

  set refractionTexture(v) {
    this.setValueByParamName("refractionTexture", v);
    this._uniformObj.refractionTexture = v;
  }

  /**
   * 扰动纹理
   * @type {Texture2D}
   */
  get perturbationTexture() {
    return this._uniformObj.perturbationTexture;
  }

  set perturbationTexture(v) {
    this.setValueByParamName("perturbationTexture", v);
    this._uniformObj.perturbationTexture = v;
  }

  /**
   * 扰动纹理U偏移
   * @type {number}
   */
  get perturbationUOffset() {
    return this._uniformObj.perturbationUOffset;
  }

  set perturbationUOffset(v) {
    this.setValueByParamName("perturbationUOffset", v);
    this._uniformObj.perturbationUOffset = v;
  }

  /**
   * 扰动纹理V偏移
   * @type {number}
   */
  get perturbationVOffset() {
    return this._uniformObj.perturbationVOffset;
  }

  set perturbationVOffset(v) {
    this.setValueByParamName("perturbationVOffset", v);
    this._uniformObj.perturbationVOffset = v;
  }

  /****************************************   uniform end **************************************** /


  /****************************************   state start **************************************** /

   /**
   * alpha混合模式
   * @type {'OPAQUE'|'MASK'|'BLEND'}
   */
  get alphaMode() {
    return this._stateObj.alphaMode;
  }

  set alphaMode(v) {
    this.updateTechnique("alphaMode", v);
  }

  /**
   * 是否显示双面
   * @type {Boolean}
   */
  get doubleSided() {
    return this._stateObj.doubleSided;
  }

  set doubleSided(v) {
    if (v) {
      this._stateObj.side = Side.DOUBLE;
    } else if (this._stateObj.side === Side.DOUBLE) {
      this._stateObj.side = Side.FRONT;
    }
    this.updateTechnique("doubleSided", v);
  }

  /**
   * 显示哪个面
   * @type {Side}
   * */
  get side() {
    return this._stateObj.side;
  }

  set side(v: Side) {
    // 向下兼容doubleSided
    if (v === Side.DOUBLE) {
      this._stateObj.doubleSided = true;
    } else {
      this._stateObj.doubleSided = false;
    }

    this.updateTechnique("side", v);
  }

  /**
   * 是否使用光源
   * @type {Boolean}
   */
  get unlit() {
    return this._stateObj.unlit;
  }

  set unlit(v) {
    this.updateTechnique("unlit", v);
  }

  /**
   * 是否 SRGB 色彩空间
   * @type {Boolean}
   */
  get srgb() {
    return this._stateObj.srgb;
  }

  set srgb(v) {
    this.updateTechnique("srgb", v);
  }

  /**
   * sRGB线性校正是否使用近似快速算法
   * */
  get srgbFast(): boolean {
    return this._stateObj.srgbFast;
  }

  set srgbFast(v: boolean) {
    this.updateTechnique("srgbFast", v);
  }

  /**
   * 是否使用 Gamma 纠正
   * @type {Boolean}
   */
  get gamma() {
    return this._stateObj.gamma;
  }

  set gamma(v) {
    this.updateTechnique("gamma", v);
  }

  get blendFunc() {
    return this._stateObj.blendFunc;
  }

  set blendFunc(v) {
    this.updateTechnique("blendFunc", v);
  }

  get blendFuncSeparate() {
    return this._stateObj.blendFuncSeparate;
  }

  set blendFuncSeparate(v) {
    this.updateTechnique("blendFuncSeparate", v);
  }

  get depthMask() {
    return this._stateObj.depthMask;
  }

  set depthMask(v) {
    this.updateTechnique("depthMask", v);
  }

  /**
   * 透明度通道选择
   * true:取透明度贴图的rgb亮度，false:取alpha通道
   * @type{boolean}
   * */
  get getOpacityFromRGB(): boolean {
    return this._stateObj.getOpacityFromRGB;
  }

  set getOpacityFromRGB(v) {
    this.updateTechnique("getOpacityFromRGB", v);
  }

  /**
   * pbr工作流是否是金属粗糙度模式
   * @type{boolean}
   * */
  get isMetallicWorkflow(): boolean {
    return this._stateObj.isMetallicWorkflow;
  }

  set isMetallicWorkflow(v) {
    this.updateTechnique("isMetallicWorkflow", v);
  }

  /**
   * 是否使用折射模式，默认反射模式
   * @type{boolean}
   * */
  get envMapModeRefract(): boolean {
    return this._stateObj.envMapModeRefract;
  }

  set envMapModeRefract(v) {
    this.updateTechnique("envMapModeRefract", v);
  }

  /****************************************   state end **************************************** /

  /**
   * 绘制前准备
   * @param {Camera} camera 相机
   * @param {Component} component 组件
   * @private
   */
  prepareDrawing(context: RenderContext, component: Component, primitive) {
    const camera = context.camera;
    const scene = camera.scene;
    const canvas = scene.engine.canvas;
    const lightMgr = scene.findFeature(LightFeature);
    const canOIT = (<any>camera._renderPipeline).canOIT;

    /** 光源 uniform values */
    lightMgr.bindMaterialValues(this);
    /** 分辨率 */
    this.setValue("u_resolution", new Vector2(canvas.width, canvas.height));
    /** clipPlane */
    for (let i = 0; i < this._clipPlaneCount; i++) {
      this.setValue(`u_clipPlanes[${i}]`, scene.clipPlanes[i]);
    }

    /** oit  depth texture */
    if (canOIT) {
      this.setValue("u_depthSampler", (<any>camera._renderPipeline).depthTexture);
    }

    /** 是否需要重新编译 technique */
    const {
      ambientLightCount,
      directLightCount,
      pointLightCount,
      spotLightCount,
      envMapLightCount,
      useDiffuseEnv,
      useSpecularEnv
    } = lightMgr.lightSortAmount;
    if (
      !this._technique ||
      this._ambientLightCount !== ambientLightCount ||
      this._envMapLightCount !== envMapLightCount ||
      this._useDiffuseEnv !== useDiffuseEnv ||
      this._useSpecularEnv !== useSpecularEnv ||
      this._directLightCount !== directLightCount ||
      this._pointLightCount !== pointLightCount ||
      this._spotLightCount !== spotLightCount ||
      this._clipPlaneCount !== scene.clipPlanes?.length ||
      this._useOIT !== canOIT
    ) {
      this._ambientLightCount = ambientLightCount;
      this._envMapLightCount = envMapLightCount;
      this._useDiffuseEnv = useDiffuseEnv;
      this._useSpecularEnv = useSpecularEnv;
      this._directLightCount = directLightCount;
      this._pointLightCount = pointLightCount;
      this._spotLightCount = spotLightCount;
      this._clipPlaneCount = scene.clipPlanes?.length;
      this._useOIT = canOIT;
      this._generateTechnique(camera, component, primitive);
    }

    super.prepareDrawing(context, component, primitive);
  }

  /**
   * 创建Technique
   * @param {Camera} camera 相机
   * @param {Ability} component 组件
   * @private
   */
  _generateTechnique(camera: Camera, component, primitive) {
    const customMacros = this._generateShaderMacros(camera, component, primitive);
    const techName = PBRMaterial.TECHNIQUE_NAME;
    const vertex = PBRMaterial.STATIC_VERTEX_SHADER;
    const frag = PBRMaterial.STATIC_FRAGMENT_SHADER;
    const config = this._generateConfig();
    const lightMgr = camera.scene.findFeature(LightFeature);

    const tech = new RenderTechnique(techName);
    tech.isValid = true;
    tech.uniforms = { ...lightMgr.getUniformDefine(), ...config.uniforms };
    tech.attributes = config.attributes;
    tech.fragmentPrecision = "highp";
    tech.customMacros = customMacros;
    tech.states = config.states;
    tech.vertexShader = vertex;
    tech.fragmentShader = frag;
    this._technique = tech;
    return tech;
  }

  /**
   * 创建宏
   * @param {Camera} camera 相机
   * @param {Ability} component 组件
   * @private
   */
  _generateShaderMacros(camera: Camera, component, primitive) {
    const rhi = camera.scene.engine._hardwareRenderer;

    const _macros = ["O3_NEED_WORLDPOS"];

    if (!primitive._vertexElementMap.NORMAL || !primitive._vertexElementMap.TANGENT)
      if (rhi.canIUse(GLCapabilityType.standardDerivatives)) _macros.push("HAS_DERIVATIVES");

    const uniforms = Object.keys(this._values);
    if (uniforms.indexOf("u_baseColorSampler") > -1) _macros.push("HAS_BASECOLORMAP");
    if (uniforms.indexOf("u_normalSampler") > -1) _macros.push("O3_HAS_NORMALMAP");
    if (uniforms.indexOf("u_metallicSampler") > -1) _macros.push("HAS_METALMAP");
    if (uniforms.indexOf("u_roughnessSampler") > -1) _macros.push("HAS_ROUGHNESSMAP");
    if (uniforms.indexOf("u_metallicRoughnessSampler") > -1) _macros.push("HAS_METALROUGHNESSMAP");
    if (uniforms.indexOf("u_emissiveSampler") > -1) _macros.push("HAS_EMISSIVEMAP");
    if (uniforms.indexOf("u_occlusionSampler") > -1) _macros.push("HAS_OCCLUSIONMAP");
    if (uniforms.indexOf("u_specularGlossinessSampler") > -1) _macros.push("HAS_SPECULARGLOSSINESSMAP");
    if (uniforms.indexOf("u_perturbationSampler") > -1) _macros.push("HAS_PERTURBATIONMAP");
    if (uniforms.indexOf("u_reflectionSampler") > -1) _macros.push("HAS_REFLECTIONMAP");
    if (uniforms.indexOf("u_refractionSampler") > -1) {
      this.setValueByParamName(
        "PTMMatrix",
        new Matrix(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0)
      );
      _macros.push("HAS_REFRACTIONMAP");
    }

    if (this.alphaMode === "MASK") {
      _macros.push("ALPHA_MASK");
    } else if (this.alphaMode === "BLEND" && !this.refractionTexture) {
      _macros.push("ALPHA_BLEND");
      if (uniforms.indexOf("u_opacitySampler") > -1) {
        _macros.push("HAS_OPACITYMAP");
        if (this.getOpacityFromRGB) {
          _macros.push("GETOPACITYFROMRGB");
        }
      }
    }

    if (this._envMapLightCount) {
      _macros.push("O3_HAS_ENVMAP_LIGHT");

      if (this._useDiffuseEnv) _macros.push("O3_USE_DIFFUSE_ENV");

      if (this._useSpecularEnv) _macros.push("O3_USE_SPECULAR_ENV");

      if (rhi.canIUse(GLCapabilityType.shaderTextureLod)) _macros.push("HAS_TEX_LOD");
    }

    if (this._ambientLightCount) {
      _macros.push("O3_HAS_AMBIENT_LIGHT");
    }
    if (this._directLightCount) _macros.push(`O3_DIRECT_LIGHT_COUNT ${this._directLightCount}`);
    if (this._pointLightCount) _macros.push(`O3_POINT_LIGHT_COUNT ${this._pointLightCount}`);
    if (this._spotLightCount) _macros.push(`O3_SPOT_LIGHT_COUNT ${this._spotLightCount}`);
    if (this._clipPlaneCount) _macros.push(`O3_CLIPPLANE_NUM ${this._clipPlaneCount}`);

    if (this._stateObj.unlit) _macros.push("UNLIT");
    if (this._stateObj.srgb) _macros.push("MANUAL_SRGB");
    if (this._stateObj.srgbFast) _macros.push("SRGB_FAST_APPROXIMATION");
    if (this._stateObj.gamma) _macros.push("GAMMA");
    if (this._stateObj.isMetallicWorkflow) _macros.push("IS_METALLIC_WORKFLOW");
    if (this._stateObj.envMapModeRefract) _macros.push("ENVMAPMODE_REFRACT");

    if ((<any>camera._renderPipeline).canOIT) {
      _macros.push("OIT_ENABLE");
    }
    return _macros;
  }

  /**
   * 创建Technique配置信息
   */
  _generateConfig() {
    const defaultState = PBRMaterial.TECH_CONFIG.states;
    const states = {
      disable: defaultState.disable.slice(),
      enable: defaultState.enable.slice(),
      functions: Object.assign({}, defaultState.functions) as any
    };
    if (this.doubleSided) {
      states.disable.push(RenderState.CULL_FACE);
    } else {
      switch (this.side) {
        case Side.FRONT:
          states.functions.cullFace = [CullFace.BACK];
          break;
        case Side.BACK:
          states.functions.cullFace = [CullFace.FRONT];
          break;
        case Side.NONE:
          states.functions.cullFace = [CullFace.FRONT_AND_BACK];
          break;
        default:
          delete states.functions.cullFace;
      }
    }
    if (this.alphaMode === "BLEND" && !this.refractionTexture) {
      states.enable.push(RenderState.BLEND);
      if (this.blendFunc.length) {
        states.functions.blendFunc = this._stateObj.blendFunc;
      } else {
        states.functions.blendFuncSeparate = this._stateObj.blendFuncSeparate;
      }
      states.functions.depthMask = this._stateObj.depthMask;
      this.renderType = MaterialType.TRANSPARENT;
    } else {
      this.renderType = MaterialType.OPAQUE;
    }

    const clipPlaneUniforms = {};
    for (let i = 0; i < this._clipPlaneCount; i++) {
      clipPlaneUniforms[`u_clipPlanes[${i}]`] = {
        name: `u_clipPlanes[${i}]`,
        type: DataType.FLOAT_VEC4
      };
    }

    PBRMaterial.TECH_CONFIG.uniforms = Object.assign({}, PBRMaterial.TECH_CONFIG.uniforms, clipPlaneUniforms);

    return Object.assign({}, PBRMaterial.TECH_CONFIG, { states });
  }

  /**
   * 创建一个副本
   * @param {string} name - name
   */
  clone(name?: string) {
    const newMtl = new PBRMaterial(this._engine, name || this.name);

    newMtl.renderType = this.renderType;
    newMtl.useFog = this.useFog;

    for (const name in this._uniformObj) {
      const value = this._uniformObj[name];
      if (value instanceof Texture) {
        newMtl[name] = value;
      } else {
        newMtl[name] = Util.clone(value);
      }
    }

    if (this._stateObj) {
      newMtl._stateObj = Util.clone(this._stateObj);
    }
    return newMtl;
  }

  /**
   * 默认材质名 ‘PBR_MATERIAL’
   * @private
   */
  static MATERIAL_NAME = "PBR_MATERIAL";
  /**
   * 默认Technique名 ‘PBR_TECHNIQUE’
   * @private
   */
  static TECHNIQUE_NAME = "PBR_TECHNIQUE";

  /**
   * 顶点着色器
   * @private
   */
  static STATIC_VERTEX_SHADER = vs;

  /**
   * 片断着色器
   * @private
   */
  static STATIC_FRAGMENT_SHADER = fs;

  /**
   * 已占用定点着色器 Uniform Vector 个数
   * @private
   */
  static attribUniformVec4 = 12;

  /**
   * 默认 Technique 配置信息
   * @private
   */
  static TECH_CONFIG = {
    attributes: {},
    uniforms: Object.assign({
      u_baseColorSampler: {
        name: "u_baseColorSampler",
        paramName: "baseColorTexture",
        type: DataType.SAMPLER_2D
      },
      u_baseColorFactor: {
        name: "u_baseColorFactor",
        paramName: "baseColorFactor",
        type: DataType.FLOAT_VEC4
      },
      u_normalSampler: {
        name: "u_normalSampler",
        paramName: "normalTexture",
        type: DataType.SAMPLER_2D
      },
      u_normalScale: {
        name: "u_normalScale",
        paramName: "normalScale",
        type: DataType.FLOAT
      },
      u_lightDirection: {
        name: "u_lightDirection",
        type: DataType.FLOAT_VEC3
      },
      u_lightColor: {
        name: "u_lightColor",
        type: DataType.FLOAT_VEC3
      },
      u_metallicRoughnessValue: {
        name: "u_metallicRoughnessValue",
        paramName: "metallicRoughness",
        type: DataType.FLOAT_VEC2
      },
      u_metallicSampler: {
        name: "u_metallicSampler",
        paramName: "metallicTexture",
        type: DataType.SAMPLER_2D
      },
      u_roughnessSampler: {
        name: "u_roughnessSampler",
        paramName: "roughnessTexture",
        type: DataType.SAMPLER_2D
      },
      u_metallicRoughnessSampler: {
        name: "u_metallicRoughnessSampler",
        paramName: "metallicRoughnessTexture",
        type: DataType.SAMPLER_2D
      },
      u_emissiveFactor: {
        name: "u_emissiveFactor",
        paramName: "emissiveFactor",
        type: DataType.FLOAT_VEC3
      },
      u_emissiveSampler: {
        name: "u_emissiveSampler",
        paramName: "emissiveTexture",
        type: DataType.SAMPLER_2D
      },
      u_occlusionSampler: {
        name: "u_occlusionSampler",
        paramName: "occlusionTexture",
        type: DataType.SAMPLER_2D
      },
      u_occlusionStrength: {
        name: "u_occlusionStrength",
        paramName: "occlusionStrength",
        type: DataType.FLOAT
      },
      u_alphaCutoff: {
        name: "u_alphaCutoff",
        paramName: "alphaCutoff",
        type: DataType.FLOAT
      },
      u_opacitySampler: {
        name: "u_opacitySampler",
        paramName: "opacityTexture",
        type: DataType.SAMPLER_2D
      },
      u_specularFactor: {
        name: "u_specularFactor",
        paramName: "specularFactor",
        type: DataType.FLOAT_VEC3
      },
      u_glossinessFactor: {
        name: "u_glossinessFactor",
        paramName: "glossinessFactor",
        type: DataType.FLOAT
      },
      u_specularGlossinessSampler: {
        name: "u_specularGlossinessSampler",
        paramName: "specularGlossinessTexture",
        type: DataType.SAMPLER_2D
      },
      u_reflectionSampler: {
        name: "u_reflectionSampler",
        paramName: "reflectionTexture",
        type: DataType.SAMPLER_CUBE
      },
      u_PTMMatrix: {
        name: "u_PTMMatrix",
        paramName: "PTMMatrix",
        type: DataType.FLOAT_MAT4
      },
      u_envMapIntensity: {
        name: "u_envMapIntensity",
        paramName: "envMapIntensity",
        type: DataType.FLOAT
      },
      u_refractionRatio: {
        name: "u_refractionRatio",
        paramName: "refractionRatio",
        type: DataType.FLOAT
      },
      u_refractionDepth: {
        name: "u_refractionDepth",
        paramName: "refractionDepth",
        type: DataType.FLOAT
      },
      u_refractionSampler: {
        name: "u_refractionSampler",
        paramName: "refractionTexture",
        type: DataType.SAMPLER_2D
      },
      u_resolution: {
        name: "u_resolution",
        paramName: "resolution",
        type: DataType.FLOAT_VEC2
      },
      u_perturbationSampler: {
        name: "u_perturbationSampler",
        paramName: "perturbationTexture",
        type: DataType.SAMPLER_2D
      },
      u_perturbationUOffset: {
        name: "u_perturbationUOffset",
        paramName: "perturbationUOffset",
        type: DataType.FLOAT
      },
      u_perturbationVOffset: {
        name: "u_perturbationVOffset",
        paramName: "perturbationVOffset",
        type: DataType.FLOAT
      },
      u_depthSampler: {
        name: "u_depthSampler",
        type: DataType.SAMPLER_2D
      }
    }),
    states: {
      disable: [],
      enable: [],
      functions: {}
    }
  };
}

export { PBRMaterial };
