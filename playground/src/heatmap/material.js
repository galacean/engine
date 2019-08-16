import { UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';
import { Resource } from '@alipay/r3-loader';

export default function createCubeMaterial(loader) {
  let newMtl = new Material('cube_mtl');
  newMtl.technique = requireCubeTechnique(loader);
  return newMtl;
}

function requireCubeTechnique(loader) {
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position; 
  attribute vec4 a_color;    

  uniform mat4 matModelViewProjection;

  varying vec4 v_color;

  void main() {
    v_color = a_color;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  varying vec4 v_color;
  
  void main() {
    gl_FragColor = v_color;
  }
  `;

  const TECH_CONFIG = {
    attributes: {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      },
      a_color: {
        name: 'a_color',
        semantic: 'COLOR',
        type: DataType.FLOAT_VEC4
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
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE],
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
