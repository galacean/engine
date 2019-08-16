import { UniformSemantic, DataType } from '@alipay/r3-base';

export default function getWavaTechniqueData(name) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = name;

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position; 

  uniform mat4 matModelViewProjection;
  uniform float u_time;

  void main() {
    float x = (a_position.x - u_time * 2.0) * 0.03;
    float y = (a_position.y - u_time * 2.0) * 0.03;
    float z = cos(x) + sin(y);
    gl_Position = matModelViewProjection * vec4(a_position.x, a_position.y, a_position.z + z , 1.0);
    z = clamp(z, 0.0, 1.0);
    gl_PointSize = 500.0 * (0.5 - (gl_Position.z / gl_Position.w) * 0.5 ) * z;
  }
  `;
  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  void main() {
    float dist = step(distance(gl_PointCoord, vec2(0.5, 0.5)), 0.5);
    vec3 color = vec3(0.6) * dist;
    gl_FragColor = vec4(color, 1.0);
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
        semantic: 'UV',
        type: DataType.FLOAT_VEC2
      }
    },
    uniforms: {
      matModel: {
        name: 'matModel',
        semantic: UniformSemantic.MODEL,
        type: DataType.FLOAT_MAT4,
      },
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      u_time: {
        name: "u_time",
        semantic: 'TIME',
        type: DataType.FLOAT
      }
    }
  };

  return {
    technique: TECH_CONFIG,
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
  }
}
