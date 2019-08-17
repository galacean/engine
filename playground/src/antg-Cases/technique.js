import { UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/o3-base';

export default function getTechniqueData(name) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = name;

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position; 
  attribute vec2 a_uv; 

  uniform mat4 matModelViewProjection;
  uniform mat4 matModel;
  uniform float u_time;

  varying vec2 v_uv;
  varying vec3 v_normal;
  varying float v_time;

  void main() {
    v_uv = a_uv;
    v_time = u_time / 1000.0;
    v_normal = vec3(a_uv, 1.0);
    float x = (a_position.x + u_time) * 0.05;
    float y = (a_position.y - u_time) * 0.05;
    float z = sin(x) + sin(y);
    gl_Position = matModelViewProjection * vec4(a_position.x, a_position.y, a_position.z + z * 2.0 , 1.0);
    float slopeX = cos(x) * 0.3;
    float slopeY = cos(y) * 0.3;
    vec3 tangentX = normalize(vec3(1.0, 0.0, slopeX));
    vec3 tangentY = normalize(vec3(0.0, 1.0, slopeY));
    v_normal = mat3(matModel) * normalize(cross(tangentY, tangentX));
  }
  `;
  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  uniform sampler2D s_diffuse;
  uniform sampler2D s_normal;

  struct DirectLight {
    vec3 color;
    float intensity;
    vec3 direction;
  };

  varying vec2 v_uv;
  varying float v_time;
  varying vec3 v_normal;

  void main() {
    DirectLight u_directLight;
    u_directLight.color = vec3(0.5, 0.5, 0.5);
    u_directLight.direction = vec3(-1.0, 1.0, -1.0);
    u_directLight.intensity = 0.5;
    vec4 diffuse = texture2D(s_diffuse, v_uv);
    float normal_uv_x = (v_uv.x + v_time);
    normal_uv_x = normal_uv_x - floor(normal_uv_x);
    float normal_uv_y = (v_uv.y + v_time);
    normal_uv_y = normal_uv_y - floor(normal_uv_y);
    vec4 normal = texture2D(s_normal, vec2(normal_uv_x, normal_uv_y));

    vec3 N = normalize(v_normal + normal.rgb);
    vec3 lightColor = u_directLight.color * u_directLight.intensity;
    lightColor *= max(dot(-N, normalize(u_directLight.direction)), 0.0);

    diffuse += vec4(lightColor, 0.0);

    gl_FragColor = diffuse;
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
      },
      s_diffuse: {
        name: "s_diffuse",
        type: DataType.SAMPLER_2D
      },
      s_normal: {
        name: "s_normal",
        type: DataType.SAMPLER_2D
      }
    }
  };

  return {
    technique: TECH_CONFIG,
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
  }
}
