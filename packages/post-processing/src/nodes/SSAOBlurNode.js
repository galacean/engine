import { DataType } from "@alipay/o3-core";
import { PostEffectNode } from "../PostEffectNode";
import SSAOBlurShader from "../shaders/SSAOBlur.glsl";


export class SSAOBlurNode extends PostEffectNode {
  constructor(name, renderTarget, parent, filterSize) {
    super(name, renderTarget, parent, makeShaderConfig(filterSize));

    const rtSize = renderTarget.width;

    this.material.setValue("u_rtSize", rtSize);
    this.material.setValue("u_depthBias", 0.002);
    this._depthBias = 0.002;
    this.material.setValue("u_blurSize", 1.0);
    this._blurSize = 1.0;
    this.material.setValue("u_direction", -1.0);
  }

  setupMaterial(camera) {
    super.setupMaterial(camera);
    const mtl = this.material;
    mtl.setValue("u_zNear", camera.near);
    mtl.setValue("u_zFar", camera.far);
  }

  get blurSize() {
    return this._blurSize;
  }

  set blurSize(value) {
    this._blurSize = value;
    if (this._blurSize) {
      this.material.setValue("u_blurSize", this._blurSize);
    }
  }

  get depthBias() {
    return this._depthBias;
  }

  set depthBias(value) {
    this._depthBias = value;
    if (this._depthBias) {
      this.material.setValue("u_depthBias", this._depthBias);
    }
  }

  get direction() {
    return this._direction;
  }

  set direction(value) {
    this._direction = value;
    if (this._direction) {
      this.material.setValue("u_direction", this._direction);
    }
  }

  get depthTexture() {
    return this._depthTexture;
  }

  set depthTexture(value) {
    this._depthTexture = value;
    if (this._depthTexture) {
      this.material.setValue("s_depthRT", this._depthTexture);
    }
  }

  get normalTexture() {
    return this._normalTexture;
  }

  set normalTexture(value) {
    this._normalTexture = value;
    if (this._normalTexture) {
      this.material.setValue("s_normalRT", this._normalTexture);
    }
  }
}

function makeShaderConfig(filterSize) {
  return {
    source: SSAOBlurShader,
    uniforms: {
      s_sourceRT: {
        name: "s_sourceRT",
        type: DataType.SAMPLER_2D
      },
      u_texelSize: {
        name: "u_texelSize",
        type: DataType.FLOAT
      },
      u_direction: {
        name: "u_direction",
        type: DataType.FLOAT
      },
      s_normalRT: {
        name: "s_normalRT",
        type: DataType.SAMPLER_2D
      },
      s_depthRT: {
        name: "s_depthRT",
        type: DataType.SAMPLER_2D
      },
      u_blurSize: {
        name: "u_blurSize",
        type: DataType.FLOAT
      },
      u_zNear: {
        name: "u_zNear",
        type: DataType.FLOAT
      },
      u_zFar: {
        name: "u_zFar",
        type: DataType.FLOAT
      },
      u_depthBias: {
        name: "u_depthBias",
        type: DataType.FLOAT
      },
      u_rtSize: {
        name: "u_rtSize",
        type: DataType.FLOAT
      }
    }
  };
}
