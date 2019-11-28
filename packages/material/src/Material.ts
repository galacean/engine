import { mat4, mat3 } from "@alipay/o3-math";
import { MaterialType, UniformSemantic } from "@alipay/o3-base";
import { RenderTechnique } from "./RenderTechnique";

/**
 * 材质对象：RenderTechniqe + 实例化参数，对应 glTF 中的 material 对象
 * @class
 */
export class Material {
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

  protected _technique: RenderTechnique;
  protected _values;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name: string) {
    /**
     * 名称
     * @member {string}
     */
    this.name = name;

    /**
     * 材质类型：透明 or 不透明
     * @member {MaterialType}
     */
    this.renderType = MaterialType.OPAQUE;

    /**
     * 是否受到全局雾效影响
     * @member {boolean}
     */
    this.useFog = true;

    //--
    this._technique = null;
    this._values = {};
  }

  /** 创建一个本材质对象的深拷贝对象 */
  clone() {
    const newMtl = new Material(this.name);

    newMtl.renderType = this.renderType;
    newMtl._technique = this._technique;
    newMtl.useFog = this.useFog;

    for (const name in this._values) {
      if (this._values.hasOwnProperty(name)) {
        newMtl._values[name] = this._values[name];
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
   * @param {string} name 参数名称
   * @param {*} value 参数值
   */
  setValue(name: string, value) {
    this._values[name] = value;
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
  prepareDrawing(camera, component, primitive, originalMaterial?: Material) {
    // 设置Unifroms
    const uniforms = this._technique.uniforms;
    for (const name in uniforms) {
      const uniform = uniforms[name];
      this._updateValueBySemantic(uniform, camera, component);
    }

    const scene = camera.scene;
    if (scene.hasFogFeature) {
      scene.bindFogToMaterial(this);
    }

    this._technique.compile(camera, component, primitive, this);
  }

  onBeforeCompile(tech: RenderTechnique) {
    /** 在编译前可以自定义替换tech的shader,customMacros等配置
     * @example
     *  tech.fragmentShader=tech.fragmentShader.replace(**,**);
     *  tech.fragmentPrecision='highp'
     * */
  }

  /**
   * 按照Uniform的Semantic，自动更新部分参数值
   * @param {object} uniform
   * @param {CameraComponent} camera
   * @param {Component} component
   * @private
   */
  _updateValueBySemantic(uniform, camera, component) {
    const values = this._values;

    switch (uniform.semantic) {
      // Transforms from the node's coordinate system to its parent's.
      case UniformSemantic.LOCAL: {
        let matLocal = values[uniform.name];
        if (!matLocal) matLocal = mat4.create();
        const node = component.node;
        mat4.fromRotationTranslationScale(matLocal, node.rotation, node.position, node.scale);
        values[uniform.name] = matLocal;
        break;
      }
      // Transforms from model to world coordinates
      case UniformSemantic.MODEL:
        values[uniform.name] = component.modelMatrix;
        break;
      // Transforms from world to view coordinates
      case UniformSemantic.VIEW:
        values[uniform.name] = camera.viewMatrix;
        break;
      //Transforms from view to clip
      case UniformSemantic.PROJECTION:
        values[uniform.name] = camera.projectionMatrix;
        break;
      // Combined MODEL and VIEW.
      case UniformSemantic.MODELVIEW: {
        const view = camera.viewMatrix;
        const model = component.modelMatrix;
        let modelView = values[uniform.name];
        if (!modelView) modelView = mat4.create();
        mat4.mul(modelView, view, model);
        values[uniform.name] = modelView;
        break;
      }
      // Combined MODEL, VIEW, and PROJECTION
      case UniformSemantic.MODELVIEWPROJECTION: {
        const view = camera.viewMatrix;
        const proj = camera.projectionMatrix;
        const model = component.modelMatrix;
        let MVP = values[uniform.name];
        if (!MVP) MVP = mat4.create();
        mat4.mul(MVP, view, model);
        mat4.mul(MVP, proj, MVP);
        values[uniform.name] = MVP;
        break;
      }
      // Inverse of MODEL
      case UniformSemantic.MODELINVERSE:
        values[uniform.name] = component.invModelMatrixs;
        break;
      // Inverse of VIEW
      case UniformSemantic.VIEWINVERSE:
        values[uniform.name] = camera.inverseViewMatrix;
        break;
      // Inverse of PROJECTION
      case UniformSemantic.PROJECTIONINVERSE:
        values[uniform.name] = camera.inverseProjectionMatrix;
        break;
      // Inverse of MODELVIEW
      case UniformSemantic.MODELVIEWINVERSE: {
        const view = camera.viewMatrix;
        const model = component.modelMatrix;
        let invMV = values[uniform.name];
        if (!invMV) invMV = mat4.create();
        mat4.mul(invMV, view, model);
        mat4.invert(invMV, invMV);
        values[uniform.name] = invMV;
        break;
      }
      // Inverse of MODELVIEWPROJECTION
      case UniformSemantic.MODELVIEWPROJECTIONINVERSE: {
        const view = camera.viewMatrix;
        const proj = camera.projectionMatrix;
        const model = component.modelMatrix;
        let invMVP = values[uniform.name];
        if (!invMVP) invMVP = mat4.create();
        mat4.mul(invMVP, view, model);
        mat4.mul(invMVP, proj, invMVP);
        mat4.invert(invMVP, invMVP);
        values[uniform.name] = invMVP;
        break;
      }
      // The inverse-transpose of MODEL without the translation
      case UniformSemantic.MODELINVERSETRANSPOSE: {
        let modelIT = values[uniform.name];
        if (!modelIT) modelIT = mat3.create();
        mat3.normalFromMat4(modelIT, component.modelMatrix);
        values[uniform.name] = modelIT;
        break;
      }
      // The inverse-transpose of MODELVIEW without the translation.
      case UniformSemantic.MODELVIEWINVERSETRANSPOSE: {
        let modelViewIT = values[uniform.name];
        if (!modelViewIT) modelViewIT = mat4.create();
        mat4.multiply(modelViewIT, camera.viewMatrix, component.modelMatrix);
        mat4.invert(modelViewIT, modelViewIT);
        mat4.transpose(modelViewIT, modelViewIT);
        values[uniform.name] = modelViewIT;
        break;
      }
      // The viewport's x, y, width, and height properties stored in the x, y, z, and w components, respectively.
      case UniformSemantic.VIEWPORT:
        values[uniform.name] = camera.viewport;
        break;
      // Transforms mesh coordinates for a particular joint for skinning and animation.
      case UniformSemantic.JOINTMATRIX:
        values[uniform.name] = component.matrixPalette;
        break;
      case UniformSemantic.MORPHWEIGHTS:
        values[uniform.name] = component.weights;
        break;

      // Camera 的世界坐标位置
      case UniformSemantic.EYEPOS:
        values[uniform.name] = camera.eyePos;
        break;
      // 页面启动之后的总时长，单位：秒
      case UniformSemantic.TIME:
        values[uniform.name] = component.engine.time.timeSinceStartup * 0.001;
        break;
    } // end of switch
  }
}
