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
  attribute vec3 a_color;    

  uniform mat4 matModelViewProjection;

  varying vec3 v_color;

  void main() {
    v_color = a_color;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  varying vec3 v_color;
  
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
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
      a_color: {
        name: 'a_color',
        semantic: 'COLOR',
        type: DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
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
