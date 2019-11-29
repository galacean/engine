import { vec3, vec4 } from "@alipay/o3-math";
import { CullFace, DataType, RenderState, Side } from "@alipay/o3-base";
import { Texture2D } from "@alipay/o3-material";
import { Material, RenderTechnique } from "@alipay/o3-material";
import { TechniqueStates } from "@alipay/o3-material/types/type";
import { LightFeature, AAmbientLight } from "@alipay/o3-lighting";

import VertexShader from "./shader/Vertex.glsl";

/**
 * 材质的通用参数管理，其他常用材质的基类
 * @class
 */
export abstract class CommonMaterial extends Material {
  private _side: Side = Side.FRONT;
  private _emission;
  private _ambient;
  public renderStates: TechniqueStates = {
    enable: [],
    disable: [],
    functions: {}
  };

  constructor(name: string) {
    super(name);
    this._emission = vec4.fromValues(0, 0, 0, 1);

    this._ambient = vec4.fromValues(0, 0, 0, 1);

    /**
     * Technique 渲染状态控制
     * @member {object}
     */
  }

  /**
   * 显示哪个面
   * @type {Side}
   * */
  get side(): Side {
    return this._side;
  }

  set side(v: Side) {
    this._side = v;
    this._technique = null;
  }

  /**
   * 自发光属性
   * @member {vec4|Texture2D}
   */
  get emission() {
    return this._emission;
  }

  set emission(val) {
    this._emission = val;
    this.setValue("u_emission", val);
  }

  /**
   * 环境光反射属性
   * @member {vec4|Texture2D}
   */
  get ambient() {
    return this._ambient;
  }

  set ambient(val) {
    this._ambient = val;
    this.setValue("u_ambient", val);
  }

  clone(name?: string) {
    let newMaterial = super.clone(name);
    newMaterial.side = this.side;

    if (this.ambient instanceof Texture2D) {
      newMaterial.ambient = this.ambient;
    } else {
      newMaterial.ambient = vec4.clone(this.ambient);
    }
    if (this.emission instanceof Texture2D) {
      newMaterial.emission = this.emission;
    } else {
      newMaterial.emission = vec4.clone(this.emission);
    }

    return newMaterial;
  }

  /**
   * 重写基类方法，添加 ambientLight 计算
   */
  prepareDrawing(camera, component, primitive) {
    if (this._technique === null) {
      this._generateTechnique();
    }

    this._updateAmbientLight(camera);
    super.prepareDrawing(camera, component, primitive);
  }

  protected abstract _generateTechnique();

  /**
   * 计算场景中的环境光总量
   * @private
   */
  _updateAmbientLight(camera) {
    //-- 累加场景中所有的 AmbientLighting，计算总的颜色
    const scene = camera.scene;
    const lightMgr = scene.findFeature(LightFeature);
    if (lightMgr) {
      const lights = lightMgr.visibleLights;
      const ambientLight = vec3.fromValues(0, 0, 0);
      const color = vec3.create();
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights[i];
        if (lgt instanceof AAmbientLight) {
          vec3.scale(color, lgt.color, lgt.intensity);
          vec3.add(ambientLight, ambientLight, color);
        }
      } // end of for

      this.setValue("u_ambientLight", vec4.fromValues(ambientLight[0], ambientLight[1], ambientLight[2], 1));
    } // end of if
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _internalGenerate(name, fragmentShader) {
    const customMacros = this._generateMacros();
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique(name);
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = this._generateTechniqueStates();
    tech.customMacros = customMacros;
    tech.vertexShader = VertexShader;
    tech.fragmentShader = fragmentShader;

    //-- set default values
    this._technique = tech;
    this.setValue("u_emission", this._emission);
    this.setValue("u_ambient", this._ambient);
    this.setValue("u_ambientLight", vec4.fromValues(1, 1, 1, 1));
  }

  _generateMacros() {
    const macros = [];

    if (this._emission instanceof Texture2D) macros.push("O3_EMISSION_TEXTURE");

    if (this._ambient instanceof Texture2D) macros.push("O3_AMBIENT_TEXTURE");

    return macros;
  }

  /**
   * 根据自身的参数类型，生成相应的 Fragment Shader 所需的 Unifrom 定义
   * @private
   */
  _generateFragmentUniform() {
    const fragmentUniform = {
      u_emission: {
        name: "u_emission",
        type: DataType.FLOAT_VEC4
      },
      u_ambient: {
        name: "u_ambient",
        type: DataType.FLOAT_VEC4
      },
      u_ambientLight: {
        name: "u_ambientLight",
        type: DataType.FLOAT_VEC4
      }
    };

    if (this._emission instanceof Texture2D) {
      fragmentUniform.u_emission.type = DataType.SAMPLER_2D;
    }
    if (this._ambient instanceof Texture2D) {
      fragmentUniform.u_ambient.type = DataType.SAMPLER_2D;
    }

    return fragmentUniform;
  }

  /**
   * 处理techniqueStates
   * */
  protected _generateTechniqueStates(): TechniqueStates {
    let states: TechniqueStates = (this.renderStates = {
      enable: [],
      disable: [],
      functions: {},
      ...this.renderStates
    });

    // 处理side相关的states
    let cullFaceIndex = states.disable.indexOf(RenderState.CULL_FACE);
    if (this.side === Side.DOUBLE) {
      delete states.functions.cullFace;
      if (cullFaceIndex === -1) {
        states.disable.push(RenderState.CULL_FACE);
      }
    } else {
      if (cullFaceIndex !== -1) {
        states.disable.splice(cullFaceIndex, 1);
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
      }
    }

    return states;
  }
}
