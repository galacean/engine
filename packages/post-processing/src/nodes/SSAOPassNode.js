import { DataType } from "@alipay/o3-core";
import { PostEffectNode } from "../PostEffectNode";
import SSAOShader from "../shaders/SSAOPass.glsl";

const SHADER_CONFIG = {
  source: SSAOShader,
  uniforms: {
    s_sourceRT: {
      name: "s_sourceRT",
      type: DataType.SAMPLER_2D
    },
    s_positionRT: {
      name: "s_positionRT",
      type: DataType.SAMPLER_2D
    },
    s_normalRT: {
      name: "s_normalRT",
      type: DataType.SAMPLER_2D
    },
    s_depthRT: {
      name: "s_depthRT",
      type: DataType.SAMPLER_2D
    },
    u_radius: {
      name: "u_radius",
      type: DataType.FLOAT
    },
    u_bias: {
      name: "u_bias",
      type: DataType.FLOAT
    },
    u_attenuation: {
      name: "u_attenuation",
      type: DataType.FLOAT_VEC2
    },
    u_zNear: {
      name: "u_zNear",
      type: DataType.FLOAT
    },
    u_zFar: {
      name: "u_zFar",
      type: DataType.FLOAT
    },
    u_fov: {
      name: "u_fov",
      type: DataType.FLOAT
    },
    u_resolutionX: {
      name: "u_resolutionX",
      type: DataType.FLOAT
    },
    u_resolutionY: {
      name: "u_resolutionY",
      type: DataType.FLOAT
    },
    u_projectionInvertMat: {
      name: "u_projectionInvertMat",
      type: DataType.FLOAT_MAT4
    },
    u_projectionMat: {
      name: "u_projectionMat",
      type: DataType.FLOAT_MAT4
    }
  }
};

/**
 * SSAO
 */
export class SSAOPassNode extends PostEffectNode {
  constructor(name, renderTarget, parent, props) {
    if (props.depthPack) {
      const macros = { USE_DEPTH_PACKING: 0 };
      SHADER_CONFIG.macros = macros;
    }

    super(name, renderTarget, parent, SHADER_CONFIG);

    const mtl = this.material;

    mtl.setValue("u_radius", 32.0);
    mtl.setValue("u_onlyAO", 0.0);
    mtl.setValue("u_bias", 0.04);
    mtl.setValue("u_attenuation", [1.0, 1.0]);
    mtl.setValue("u_resolutionX", renderTarget.width);
    mtl.setValue("u_resolutionY", renderTarget.height);

    this._radius = 32.0;
    //this.radius = 32.0;

    this._bias = 0.04;
    this._attenuation = [1.0, 1.0];
  }

  setupMaterial(camera) {
    super.setupMaterial(camera);
    const mtl = this.material;
    mtl.setValue("u_zNear", camera.near);
    mtl.setValue("u_zFar", camera.far);
    mtl.setValue("u_fov", camera.fov);
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

  get radius() {
    return this._radius;
  }

  set radius(value) {
    this._radius = value;
    if (this._radius) {
      this.material.setValue("u_radius", this._radius);
    }
  }

  get bias() {
    return this._bias;
  }

  set bias(value) {
    this._bias = value;
    if (this._bias) {
      this.material.setValue("u_bias", this._bias);
    }
  }

  get projectionInvertMat() {
    return this._projectionInvertMat;
  }

  set projectionInvertMat(value) {
    this._projectionInvertMat = value;

    if (this._projectionInvertMat) {
      this.material.setValue("u_projectionInvertMat", this._projectionInvertMat);
    }
  }

  get projectionMat() {
    return this._projectionMat;
  }

  set projectionMat(value) {
    this._projectionMat = value;
    if (this._projectionMat) {
      this.material.setValue("u_projectionMat", this._projectionMat);
    }
  }

  get attenuation_x() {
    return this._attenuation[0];
  }

  set attenuation_x(value) {
    this._attenuation[0] = value;
    if (this._attenuation[0]) {
      this.material.setValue("u_attenuation", this._attenuation);
    }
  }

  get attenuation_y() {
    return this._attenuation[1];
  }

  set attenuation_y(value) {
    this._attenuation[1] = value;
    if (this._attenuation[1]) {
      this.material.setValue("u_attenuation", this._attenuation);
    }
  }
}
