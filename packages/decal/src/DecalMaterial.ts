import { MaterialType, UniformSemantic, DataType, RenderState, BlendFunc } from "@alipay/o3-core";
import { Material, RenderTechnique } from "@alipay/o3-material";

const VERT_SHADER = `
uniform mat4 matModelViewProjection;
uniform float u_angle;

attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  float angle = radians(u_angle);
  float sin_factor = sin(angle);
  float cos_factor = cos(angle);
  v_uv = vec2(a_uv.x - 0.5, a_uv.y - 0.5) * mat2(cos_factor, sin_factor, -sin_factor, cos_factor);
  v_uv.x += 0.5;
  v_uv.y += 0.5;
  gl_Position = matModelViewProjection * vec4(a_position, 1.0 );
}
`;

const FRAG_SHADER = `
#include <common>
#include <common_frag>

uniform sampler2D s_diffuse;
varying vec2 v_uv;

void main()
{  

  gl_FragColor = texture2D(s_diffuse, v_uv);

}`;

export class DecalMaterial extends Material {
  _technique: RenderTechnique;
  name: string;
  renderType: MaterialType;
  constructor(name: string) {
    super(name);
    this.name = name;
  }
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique(camera, component) {
    const customMacros = [];
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique(this.name);
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = customMacros;
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      enable: [RenderState.BLEND, RenderState.POLYGON_OFFSET_FILL, RenderState.DEPTH_TEST],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA],
        depthMask: [false],
        polygonOffset: [-1, -4]
      }
    };

    this._technique = tech;
    this.renderType = MaterialType.TRANSPARENT;
  }

  prepareDrawing(camera, component, primitive) {
    if (!this._technique) {
      this._generateTechnique(camera, component);
    }

    super.prepareDrawing(camera, component, primitive);
  }

  /**
   * 设定材质参数值
   * @param {string} name 参数名称
   * @param {*} value 参数值
   */
  setValue(name, value) {
    if (name === "doubleSided") {
      this._setDoubleSidedDisplay(value);
    }

    super.setValue(name, value);
  }

  /**
   * 纹理贴图
   * @member {Texture2D}
   */
  set texture(v) {
    this.setValue("s_diffuse", v);
  }
  get texture() {
    return this.getValue("s_diffuse");
  }

  /**
   * 是否双面显示
   * @member {boolean}
   */
  set doubleSided(v) {
    this.setValue("doubleSided", v);
  }
  get doubleSided() {
    return this.getValue("doubleSided");
  }

  set rotation(v) {
    this.setValue("u_angle", v);
  }

  get rotation() {
    return this.getValue("u_angle");
  }

  /**
   * 添加 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    const uniforms = {
      matModelViewProjection: {
        name: "matModelViewProjection",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4
      },
      s_diffuse: {
        name: "s_diffuse",
        paramName: "_MainTex",
        type: DataType.SAMPLER_2D
      },
      doubleSided: {
        name: "doubleSided",
        paramName: "doubleSided",
        type: DataType.BOOL
      },
      u_angle: {
        name: "u_angle",
        type: DataType.FLOAT
      }
    };
    return uniforms;
  }

  /**
   * 设置材质是否双面显示
   * @private
   */
  _setDoubleSidedDisplay(value) {
    this._technique.states.disable = [];
    this._technique.customMacros = [];

    if (value) {
      this._technique.states.disable.push(RenderState.CULL_FACE);
    }
  }
}
