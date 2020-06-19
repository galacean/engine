import { UniformSemantic, DataType, RenderState, BlendFunc } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";

export default function createShapeMaterial() {
  let newMtl = new Material("shape_mtl");
  newMtl.technique = requireShapeTechnique();
  return newMtl;
}

function requireShapeTechnique() {
  /** Technique 对象的资源名称 */
  const TECH_NAME = "shape_tech";

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  uniform mat4 matModelViewProjection;

  attribute vec3 a_position; 
  attribute vec3 a_normal;    
  attribute vec2 a_uv;    

  varying vec2 v_uv;

  void main() {
    v_uv = a_uv;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;
  uniform sampler2D s_diffuse;

  varying vec2 v_uv;
  
  void main() {

    gl_FragColor = texture2D(s_diffuse, v_uv);
  }
  `;

  const TECH_CONFIG = {
    attributes: {
      a_position: {
        name: "a_position",
        semantic: "POSITION",
        type: DataType.FLOAT_VEC3
      },
      a_normal: {
        name: "a_normal",
        semantic: "NORMAL",
        type: DataType.FLOAT_VEC3
      },
      a_uv: {
        name: "a_uv",
        semantic: "TEXCOORD_0",
        type: DataType.FLOAT_VEC2
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: "matModelViewProjection",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4
      },
      s_diffuse: {
        name: "s_diffuse",
        type: DataType.SAMPLER_2D
      }
    },
    states: {
      disable: [RenderState.CULL_FACE],
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.ONE, BlendFunc.ONE_MINUS_SRC_ALPHA],
        depthMask: [false]
      }
    }
  };

  //--
  let tech = new RenderTechnique(TECH_NAME);
  tech.isValid = true;
  tech.vertexShader = VERT_SHADER;
  tech.fragmentShader = FRAG_SHADER;
  tech.attributes = TECH_CONFIG.attributes;
  tech.uniforms = TECH_CONFIG.uniforms;
  tech.states = TECH_CONFIG.states;

  return tech;
}
