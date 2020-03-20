import { Material, RenderState, DataType, BlendFunc, UniformSemantic, RenderTechnique, BlinnPhongMaterial, LightFeature } from "@alipay/o3";
const vs = `
precision highp float;
precision highp int;

attribute vec4 a_position; 
attribute vec2 a_uv;

varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = a_position;
}
`;
const fs = `
  precision mediump float;
  precision mediump int;
  
  varying vec2 v_uv;
    
  uniform sampler2D shininessTexture;
  uniform sampler2D positionTexture;
  uniform sampler2D normalTexture;
  uniform sampler2D diffuseTexture;
  
  void main() {
    // 漫反射颜色
    if(v_uv.x < 0.5 && v_uv.y < 0.5) {
      gl_FragColor = texture2D(positionTexture, v_uv * 2.0);
    } else if(v_uv.x > 0.5 && v_uv.y < 0.5){
      gl_FragColor = texture2D(normalTexture, vec2(v_uv.x - 0.5, v_uv.y) * 2.0);
    } else if(v_uv.x < 0.5 && v_uv.y > 0.5) {
      gl_FragColor = texture2D(shininessTexture, vec2(v_uv.x, v_uv.y  - 0.5) * 2.0);
    } else if(v_uv.x > 0.5 && v_uv.y > 0.5) {
      gl_FragColor = texture2D(diffuseTexture, vec2(v_uv.x - 0.5, v_uv.y  - 0.5) * 2.0);
    }
  }
`;

export class DeferredMaterial extends Material {
  /**
   * @private
   */
  prepareDrawing(camera, component, primitive, originalMaterial) {
    if (!this._technique) {
      this.generateTechnique();
    }

    // (this._values = originalMaterial as any)._values;
    // feature.bindMaterialValues();
    const feature = camera.scene.findFeature(LightFeature);
    const lightUniforms = feature.getUniformDefine();
    const currentUniforms = this._technique.uniforms;
    this._technique._uniforms = { ...currentUniforms, ...lightUniforms };
    feature.bindMaterialValues(this);
    // originalMaterial.bindLightUniformDefine
    super.prepareDrawing(camera, component, primitive);
  }

  customUniform = {
    u_shininess: {
      name: "u_shininess",
      type: DataType.FLOAT,
    },
    shininessTexture: {
      name: "shininessTexture",
      type: DataType.SAMPLER_2D,
    },
    positionTexture: {
      name: "positionTexture",
      type: DataType.SAMPLER_2D,
    },
    normalTexture: {
      name: "normalTexture",
      type: DataType.SAMPLER_2D,
    },
    diffuseTexture: {
      name: "diffuseTexture",
      type: DataType.SAMPLER_2D,
    },
  };

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
    tech.uniforms = this.customUniform;

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
