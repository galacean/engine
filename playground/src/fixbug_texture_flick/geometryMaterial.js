import { UniformSemantic, DataType } from '@alipay/r3-base';
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
  precision mediump int;

  uniform sampler2D u_t1;
  uniform sampler2D u_t2;

  varying vec2 v_uv;

  void main() {
    if(v_uv.s > 0.5){
      gl_FragColor = texture2D(u_t1, v_uv);
    }
    else {
      gl_FragColor = texture2D(u_t2, v_uv);
    }
  }
  `;

  const TECH_CONFIG = {
    name: TECH_NAME,
    attributes: {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      },
      a_uv: {
        name: 'a_uv',
        semantic: 'TEXCOORD_0',
        type: DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      u_t1: {
        name: 'u_t1',
        type: DataType.SAMPLER_2D,
      },
      u_t2: {
        name: 'u_t2',
        type: DataType.SAMPLER_2D,
      }
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
