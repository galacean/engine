import { UniformSemantic, DataType, RenderState } from "@alipay/o3-base";
import { Material } from "@alipay/o3-material";
import { Resource } from "@alipay/o3-loader";

export default function createCubeMaterial(loader) {
  let newMtl = new Material("cube_mtl");
  newMtl.technique = requireCubeTechnique(loader);
  return newMtl;
}

function requireCubeTechnique(loader) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = "cube_tech";

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
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
  uniform samplerCube u_cube;
  uniform sampler2D u_texture;

  varying vec3 v_uv;

  void main() {
    vec4 color = texture2D(u_texture,v_uv);
    gl_FragColor = textureCube(u_cube, v_uv);
    // gl_FragColor = texture2D(u_texture,v_uv);
  }
  `;

  const TECH_CONFIG = {
    name: TECH_NAME,
    attributes: {
      a_position: {
        name: "a_position",
        semantic: "POSITION",
        type: DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: "matModelViewProjection",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4
      },
      u_cube: {
        name: "u_cube",
        type: DataType.SAMPLER_CUBE
      },
      u_texture: {
        name: "u_texture",
        type: DataType.SAMPLER_2D
      }
    },
    states: {
      disable: [RenderState.CULL_FACE]
    }
  };

  const techRes = new Resource(TECH_NAME, {
    type: "technique",
    data: {
      technique: TECH_CONFIG,
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER
    }
  });

  loader.load(techRes);

  return techRes.asset;
}
