import { UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';
import { Resource } from '@alipay/r3-loader';

export default function createTrailMaterial() {
  let newMtl = new Material('cube_mtl');
  newMtl.technique = requireCubeTechnique();
  return newMtl;
}

function requireCubeTechnique() {
  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;

  attribute vec3 a_position; 
  attribute vec2 a_uv;    

  uniform mat4 matModelViewProjection;

  varying vec2 v_uv;

  void main() {
    v_uv = a_uv;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;

  varying vec2 v_uv;
  
  void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0 - v_uv.x);
  }
  `;

  const TECH_CONFIG = {
    attributes: {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      },
      a_uv: {
        name: 'a_uv',
        semantic: 'TEXCOORD_0',
        type: DataType.FLOAT_VEC2
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      }
    },
    states: {
      disable: [
        RenderState.CULL_FACE,
      ],
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA],
        depthMask: [false]
      }
    }
  };

  let tech = new RenderTechnique('test');
  tech.isValid = true;
  tech.uniforms = TECH_CONFIG.uniforms;
  tech.attributes = TECH_CONFIG.attributes;
  tech.states = TECH_CONFIG.states;
  tech.vertexShader = VERT_SHADER;
  tech.fragmentShader = FRAG_SHADER;

  return tech;
}
