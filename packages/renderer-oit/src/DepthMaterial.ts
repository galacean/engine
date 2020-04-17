import { Material, RenderTechnique } from "@alipay/o3-material";
import vs from "./shaders/depth.vs.glsl";
import fs from "./shaders/depth.fs.glsl";

const STATE = {
  functions: {
    colorMask: [false, false, false, false]
  }
};

export class DepthMaterial extends Material {
  prepareDrawing(camera, component, primitive) {
    if (!this._technique) {
      this.generateTechnique();
    }
    super.prepareDrawing(camera, component, primitive);
  }

  generateTechnique() {
    const tech = new RenderTechnique("DepthMaterial");

    tech.fragmentPrecision = "highp";
    tech.vertexShader = vs;
    tech.fragmentShader = fs;
    tech.states = STATE;
    this._technique = tech;
  }
}
