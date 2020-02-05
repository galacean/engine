import { UniformSemantic, DataType } from '@alipay/o3-base';
import { Material } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';

export default function createShapeMaterial(loader) {
  let newMtl = new Material('shape_mtl');
  newMtl.technique = requireShapeTechnique(loader);
  return newMtl;
}

function requireShapeTechnique(loader) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = 'shape_tech';

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

  varying vec2 v_uv;
  
  void main() {
    gl_FragColor = vec4(v_uv, 0.5, 1.0);
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
      a_normal: {
        name: 'a_normal',
        semantic: 'NORMAL',
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
