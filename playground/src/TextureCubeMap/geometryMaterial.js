import { UniformSemantic, DataType, RenderState } from '@alipay/r3-base';
import { Material } from '@alipay/r3-material';
import { Resource } from '@alipay/r3-loader';

export default function createCubeMaterial(loader) {
  let newMtl = new Material('cube_mtl');
  newMtl.technique = requireCubeTechnique(loader);
  return newMtl;
}

function requireCubeTechnique(loader) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = 'cube_tech';

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position;

  uniform mat4 matModelViewProjection;

  varying vec3 v_uv;

  void main() {
    v_uv = a_position.xyz;
    vec4 pos = matModelViewProjection * vec4(a_position, 1.0);
    gl_Position = pos;//.xyww;
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  uniform samplerCube u_cube;

  varying vec3 v_uv;

  void main() {
    gl_FragColor = textureCube(u_cube, v_uv);
  }
  `;

  const TECH_CONFIG = {
    name: TECH_NAME,
    attributes: {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      u_cube: {
        name: 'u_cube',
        type: DataType.SAMPLER_CUBE,
      },
    },
    states: {
      disable: [
        RenderState.CULL_FACE,
      ]
    }
  };

  const techRes = new Resource(TECH_NAME, {
    type: 'technique',
    data: {
      technique: TECH_CONFIG,
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER,
    }
  });

  loader.load(techRes);

  return techRes.asset;
}
