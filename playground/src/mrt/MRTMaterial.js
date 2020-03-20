import { Material, RenderState, DataType, BlendFunc, UniformSemantic, RenderTechnique, BlinnPhongMaterial, ACamera, LightFeature } from "@alipay/o3";
const vs = `
precision highp float;
precision highp int;

attribute vec3 a_position;
attribute vec2 a_uv;
attribute vec3 a_normal;

uniform mat4 u_modelMat;
uniform mat4 u_MVPMat;
uniform mat3 u_normalMat;

varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_pos;

void main() {
    vec4 position = vec4( a_position , 1.0 );
    v_uv = a_uv;
    // v_normal = normalize( u_normalMat * a_normal );
    v_normal = a_normal;
    vec4 temp_pos = u_modelMat * position;
    v_pos = temp_pos.xyz / temp_pos.w;
    gl_Position = u_MVPMat * position;
}
`;
const fs = `
precision highp float;

varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_pos;

uniform float u_shininess;
uniform vec4 u_diffuse;
uniform vec4 u_specular;

void main() {
    gl_FragData[0] = u_diffuse;
    gl_FragData[1] = normalize(vec4(u_shininess, 0.0, 0.0, 1.0));
    gl_FragData[2] = vec4(v_normal * 0.5 + 0.5, 1.0);
    gl_FragData[3] = normalize( vec4(v_pos, 1.0) );
}`;

export class MRTMaterial extends Material {
  /**
   * @private
   */
  prepareDrawing(camera, component, primitive, originalMaterial) {
    if (!this._technique) this.generateTechnique();

    this._values = originalMaterial._values;
    // originalMaterial.bindLightUniformDefine

    super.prepareDrawing(camera, component, primitive);
  }

  /**
   * @private
   */
  generateTechnique() {
    const tech = new RenderTechnique("MRTMaterial");

    tech.isValid = true;
    tech.attributes = {
      a_position: {
        name: "a_position",
        semantic: "POSITION",
        type: DataType.FLOAT_VEC3,
      },
      a_normal: {
        name: "a_normal",
        semantic: "NORMAL",
        type: DataType.FLOAT_VEC3,
      },
      a_uv: {
        name: "a_uv",
        semantic: "TEXCOORD_0",
        type: DataType.FLOAT_VEC2,
      },
    };
    tech.uniforms = {
      u_MVMat: {
        name: "u_MVMat",
        semantic: UniformSemantic.MODELVIEW,
        type: DataType.FLOAT_MAT4,
      },
      u_MVPMat: {
        name: "u_MVPMat",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      u_normalMat: {
        name: "u_normalMat",
        semantic: UniformSemantic.MODELINVERSETRANSPOSE,
        type: DataType.FLOAT_MAT3,
      },
      u_shininess: {
        name: "u_shininess",
        type: DataType.FLOAT,
      },
      u_diffuse: {
        name: "u_diffuse",
        type: DataType.FLOAT_VEC4,
      },
    };

    tech.states = {
      enable: [RenderState.DEPTH_TEST],
      functions: {
        depthMask: [true],
      },
    };

    tech.vertexShader = vs;
    tech.fragmentShader = fs;

    this._technique = tech;
    this.technique.isValid = true;
  }
}
