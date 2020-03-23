import { UniformSemantic, DataType } from '@alipay/o3-base';
import { Material } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';
import { NodeAbility } from '@alipay/o3-core';

export function createCubeMaterial(loader) {
  let newMtl = new Material('cube_mtl');
  newMtl.technique = requireCubeTechnique(loader);
  return newMtl;
}

let time = 0;
export class UpdateMaterialAbility extends NodeAbility {
  onUpdate(deltaTime) {
    const material = this.node.abilityArray[1].material;
    time += deltaTime;
    material.setValue('time', time * 0.001);
  }
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
  attribute vec3 offset;
  attribute vec3 random; 

  uniform mat4 matModelViewProjection;
  uniform float time;

  varying vec3 v_color;

  void rotate2d(inout vec2 v, float a){
    mat2 m = mat2(cos(a), -sin(a), sin(a),  cos(a));
    v = m * v;
  }

  void main() {
    v_color = a_color;
    vec3 pos = a_position;
                
    rotate2d(pos.xz, random.x * 6.28 + time * 4.0 * (random.y - 0.5));
    rotate2d(pos.zy, random.z * 0.5 * sin(time * random.x + random.z * 3.14));

    pos += offset * 15.;

    gl_Position = matModelViewProjection * vec4(pos, 1.0);
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
      },
      offset: {
        name: 'a_color',
        semantic: 'COLOR',
        type: DataType.FLOAT_VEC3
      },
      random: {
        name: 'random',
        semantic: 'random',
        type: DataType.FLOAT_VEC3
      },
      offset: {
        name: 'offset',
        semantic: 'offset',
        type: DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      time: {
        name: 'time',
        type: DataType.FLOAT,
      }
    }
  };

  const techRes = new Resource(TECH_NAME, {
    type: 'technique',
    data: {
      technique: TECH_CONFIG,
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER
    }
  });

  loader.load(techRes);

  return techRes.asset;
}
