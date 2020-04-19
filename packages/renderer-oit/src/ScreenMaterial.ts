import { Material, RenderTechnique } from "@alipay/o3-material";
import { RenderState, DataType, BlendFunc } from "@alipay/o3-base";
import vs from "./shaders/screen.vs.glsl";
import fs from "./shaders/weighted_average.fs.glsl";

const ATTRIBUTES = {
  a_position: {
    name: "a_position",
    semantic: "POSITION",
    type: DataType.FLOAT_VEC2
  },
  a_uv: {
    name: "a_uv",
    semantic: "TEXCOORD_0",
    type: DataType.FLOAT_VEC2
  }
};

const UNIFORMS = {
  u_Sampler1: {
    name: "u_Sampler1",
    type: DataType.SAMPLER_2D
  },
  u_Sampler2: {
    name: "u_Sampler2",
    type: DataType.SAMPLER_2D
  },
  u_resolution: {
    name: "u_resolution",
    type: DataType.FLOAT_VEC2
  }
};

const STATE = {
  enable: [RenderState.BLEND],
  disable: [RenderState.DEPTH_TEST],
  functions: {
    depthMask: [false],
    blendFunc: [BlendFunc.ONE_MINUS_SRC_ALPHA, BlendFunc.SRC_ALPHA]
  }
};

export class ScreenMaterial extends Material {
  constructor(name, textures) {
    super(name);
    this.setValue("u_Sampler1", textures[0]);
    this.setValue("u_Sampler2", textures[1]);
  }

  prepareDrawing(camera, component, primitive) {
    const { drawingBufferWidth, drawingBufferHeight } = camera.renderHardware.gl;
    this.setValue("u_resolution", [drawingBufferWidth, drawingBufferHeight]);

    if (!this._technique) {
      this.generateTechnique();
    }
    this.technique.compile(camera, component, primitive, this);
  }

  generateTechnique() {
    const tech = new RenderTechnique("WeightedAverageMaterial");

    tech.fragmentPrecision = "highp";
    tech.vertexShader = vs;
    tech.fragmentShader = fs;
    tech.attributes = ATTRIBUTES;
    tech.uniforms = UNIFORMS;
    tech.states = STATE;
    this._technique = tech;
  }
}
