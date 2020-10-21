import { Matrix, Matrix3x3 } from "@alipay/o3-math";
import { ReferenceObject } from "../asset/ReferenceObject";
import { MaterialType, UniformSemantic } from "../base/Constant";
import { Util } from "../base/Util";
import { Engine } from "../Engine";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Texture } from "../texture/Texture";
import { RenderTechnique } from "./RenderTechnique";

/**
 * 材质对象：RenderTechniqe + 实例化参数，对应 glTF 中的 material 对象
 */
export class Material extends ReferenceObject {
  /**
   * 名称
   * @member {string}
   */
  name: string;
  /**
   * 材质类型：透明 or 不透明
   * @member {MaterialType}
   */
  renderType: MaterialType;
  /**
   * 是否受到全局雾效影响
   * @member {boolean}
   */
  useFog: boolean;
  /**
   * 最大骨骼关节数
   * @member {number}
   */
  maxJointsNum: number;

  protected _technique: RenderTechnique;
  protected _values;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name: string, engine?: Engine) {
    super(engine);
    this.name = name;

    this.renderType = MaterialType.OPAQUE;

    this.useFog = true;

    this.maxJointsNum = 0;

    this._technique = null;
    this._values = {};
  }

  /** 创建一个本材质对象的深拷贝对象
   * @param {string} name - 复制的材质名字
   * @param {boolean} cloneTexture - 是否复制纹理，默认 false,共用纹理
   * // todo: texture.clone()
   * */
  clone(name: string = this.name, cloneTexture: boolean = false) {
    const newMtl = new (this.constructor as any)(name);

    newMtl.renderType = this.renderType;
    newMtl.useFog = this.useFog;

    for (const name in this._values) {
      if (this._values.hasOwnProperty(name)) {
        const val = this._values[name];
        if (val instanceof Texture) {
          newMtl.setValue(name, val);
        } else {
          newMtl.setValue(name, Util.clone(val));
        }
      }
    } // end of for

    return newMtl;
  }

  /**
   * 是否透明
   * @member {boolean}
   */
  get transparent(): boolean {
    return this.renderType === MaterialType.TRANSPARENT;
  }

  set transparent(val: boolean) {
    this.renderType = val ? MaterialType.TRANSPARENT : MaterialType.OPAQUE;
  }

  /**
   * 获取所引用的RenderTechnique对象
   * @member {RenderTechnique}
   */
  get technique(): RenderTechnique {
    return this._technique;
  }

  /**
   * 设置所引用的RenderTechnique对象
   */
  set technique(tech: RenderTechnique) {
    this._technique = tech;

    //-- 重新加载材质参数
    this._values = {};
  }

  /**
   * 设定材质参数值
   * 当 texture 发生 无 <-> 有 变化时，需要重新编译
   * TODO: 重构成不需要重新编译 technique 的机制
   * @param {string} name 参数名称
   * @param {*} value 参数值
   */
  setValue(name: string, value) {
    const oriValue = this.getValue(name);
    const oriIsTexture = oriValue instanceof Texture;
    const curIsTexture = value instanceof Texture;
    if (oriIsTexture) {
      this._removeReferenceChild(oriValue);
    }
    if (curIsTexture) {
      this._addReferenceChild(value);
    }

    if ((this as any)._generateTechnique && oriIsTexture !== curIsTexture) {
      this._technique = null;
    }
    if (value) {
      this._values[name] = value;
    } else {
      this.delValue(name);
    }
  }

  /**
   * 删除材质参数值
   * @param {string} name
   * */
  delValue(name: string) {
    delete this._values[name];
  }

  /**
   * 取得某个参数的当前值
   * @param {string} name 参数名称
   * @return {*} 参数的当前值
   */
  getValue(name: string): any {
    return this._values[name];
  }

  /**
   * 开始渲染指定对象
   * @param {CameraComponent} camera 当前摄像机
   * @param {Component} component 当前渲染的对象
   * @param {Primitive} primitive 几何对象
   * @param {Material} originalMaterial 物体本来的材质，用于renderPass使用replaceMaterial时的识别
   * @private
   */
  prepareDrawing(context, component, primitive, originalMaterial?: Material) {
    const camera = context.camera;
    // 设置Unifroms
    const uniforms = this._technique.uniforms;
    for (const name in uniforms) {
      const uniform = uniforms[name];
      this._updateValueBySemantic(uniform, context, component);
    }

    const scene = camera.scene;
    if (scene.hasFogFeature) {
      scene.bindFogToMaterial(this);
    }

    this._technique.compile(camera, component, primitive, this);
  }

  /** 编译前钩子，在编译前可以自定义替换tech的shader,customMacros等配置
   * @param {RenderTechnique} tech - technique
   * @example
   *  tech.fragmentShader=tech.fragmentShader.replace(**,**);
   *  tech.fragmentPrecision='highp'
   * */
  preCompile(tech: RenderTechnique) {}

  /**
   * 编译后钩子
   * */
  postCompile(tech: RenderTechnique) {}

  /**
   * 材质渲染前钩子
   * @param {Component} component
   * @param {Primitive} primitive
   * */
  preRender(component, primitive) {}

  /**
   * 材质渲染后钩子
   * */
  postRender(component, primitive) {}

  /**
   * 按照Uniform的Semantic，自动更新部分参数值
   * @param {object} uniform
   * @param {CameraComponent} camera
   * @param {Component} component
   * @private
   */
  _updateValueBySemantic(uniform, context: RenderContext, component) {
    const values = this._values;

    switch (uniform.semantic) {
      // Transforms from the node's coordinate system to its parent's.
      case UniformSemantic.LOCAL: {
        values[uniform.name] = component._entity.transform.localMatrix;
        break;
      }
      // Transforms from model to world coordinates
      case UniformSemantic.MODEL:
        values[uniform.name] = component._entity.transform.worldMatrix;
        break;
      // Transforms from world to view coordinates
      case UniformSemantic.VIEW:
        values[uniform.name] = context.viewMatrix;
        break;
      //Transforms from view to clip
      case UniformSemantic.PROJECTION:
        values[uniform.name] = context.projectionMatrix;
        break;
      // Combined MODEL and VIEW.
      case UniformSemantic.MODELVIEW: {
        const view = context.viewMatrix;
        const model = component._entity.transform.worldMatrix;
        let modelView = values[uniform.name];
        if (!modelView) modelView = new Matrix();
        Matrix.multiply(view, model, modelView);
        values[uniform.name] = modelView;
        break;
      }
      // Combined VIEW and PROJECTION.
      case UniformSemantic.VIEWPROJECTION: {
        const viewProj = context.viewProjectMatrix;
        values[uniform.name] = viewProj;
        break;
      }
      // Combined MODEL, VIEW, and PROJECTION
      case UniformSemantic.MODELVIEWPROJECTION: {
        const viewProj = context.viewProjectMatrix;
        const model = component._entity.transform.worldMatrix;
        let MVP = values[uniform.name];
        if (!MVP) MVP = new Matrix();
        Matrix.multiply(viewProj, model, MVP);
        values[uniform.name] = MVP;
        break;
      }
      // Inverse of MODEL
      case UniformSemantic.MODELINVERSE:
        values[uniform.name] = component.invModelMatrixs;
        break;
      // Inverse of VIEW
      case UniformSemantic.VIEWINVERSE:
        values[uniform.name] = context.inverseViewMatrix;
        break;
      // Inverse of PROJECTION
      case UniformSemantic.PROJECTIONINVERSE:
        values[uniform.name] = context.inverseProjectionMatrix;
        break;
      // Inverse of MODELVIEW
      case UniformSemantic.MODELVIEWINVERSE: {
        const view = context.viewMatrix;
        const model = component._entity.transform.worldMatrix;
        let invMV = values[uniform.name];
        if (!invMV) invMV = new Matrix();
        Matrix.multiply(view, model, invMV);
        Matrix.invert(invMV, invMV);
        values[uniform.name] = invMV;
        break;
      }
      // Inverse of MODELVIEWPROJECTION
      case UniformSemantic.MODELVIEWPROJECTIONINVERSE: {
        const viewProj = context.viewProjectMatrix;
        const model = component._entity.transform.worldMatrix;
        let invMVP = values[uniform.name];
        if (!invMVP) invMVP = new Matrix();
        Matrix.multiply(viewProj, model, invMVP);
        Matrix.invert(invMVP, invMVP);
        values[uniform.name] = invMVP;
        break;
      }
      // The inverse-transpose of MODEL without the translation
      case UniformSemantic.MODELINVERSETRANSPOSE: {
        let modelIT = values[uniform.name];
        if (!modelIT) modelIT = new Matrix3x3();
        Matrix3x3.normalMatrix(component._entity.transform.worldMatrix, modelIT);
        values[uniform.name] = modelIT;
        break;
      }
      // The inverse-transpose of MODELVIEW without the translation.
      case UniformSemantic.MODELVIEWINVERSETRANSPOSE: {
        let modelViewIT = values[uniform.name];
        if (!modelViewIT) modelViewIT = new Matrix();
        Matrix.multiply(context.viewMatrix, component._entity.transform.worldMatrix, modelViewIT);
        Matrix.invert(modelViewIT, modelViewIT);
        Matrix.transpose(modelViewIT, modelViewIT);
        values[uniform.name] = modelViewIT;
        break;
      }
      // The viewport's x, y, width, and height properties stored in the x, y, z, and w components, respectively.
      case UniformSemantic.VIEWPORT:
        values[uniform.name] = context.viewport;
        break;
      // Transforms mesh coordinates for a particular joint for skinning and animation.
      case UniformSemantic.JOINTMATRIX:
        values[uniform.name] = component.matrixPalette;
        break;
      case UniformSemantic.JOINTTEXTURE:
        values[uniform.name] = component.jointTexture;
        break;
      case UniformSemantic.JOINTCOUNT:
        values[uniform.name] = component.jointNodes?.length;
        break;
      case UniformSemantic.MORPHWEIGHTS:
        values[uniform.name] = component.weights;
        break;

      // Camera 的世界坐标位置
      case UniformSemantic.EYEPOS:
        values[uniform.name] = context.cameraPosition;
        break;
      // 页面启动之后的总时长，单位：秒
      case UniformSemantic.TIME:
        values[uniform.name] = component.engine.time.timeSinceStartup * 0.001;
        break;
    } // end of switch
  }

  onDestroy() {
    // TODO: 待材质重构
    const values = Object.values(this._values);
    for (let i = 0, len = values.length; i < len; i++) {
      const value = values[i];
      if (value instanceof Texture) {
        value._addRefCount(-1);
      }
    }

    // this._technique._finalize();
    this._technique = null;
  }
}
