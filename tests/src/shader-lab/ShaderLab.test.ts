import { ShaderLab } from "@galacean/engine-shader-lab";
import { Shader } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "demo.shader")).toString();

const shaderLab = new ShaderLab();
const canvas = document.createElement("canvas");

describe("ShaderLab", () => {
  let shader: ReturnType<typeof shaderLab.parseShader>;

  before(() => {
    shader = shaderLab.parseShader(demoShader);
  });

  it("create shaderLab", async () => {
    expect(shaderLab).not.be.null;
  });

  it("shader name", () => {
    expect(shader.name).to.equal("Water");
    const subShader = shader.subShaders[0];
    const pass = subShader.passes[0];
    expect(pass.name).equal("default");
  });

  it("render state", () => {
    const subShader = shader.subShaders[0];
    const pass = subShader.passes[0];
    expect(pass.renderStates).not.be.null;

    const stencilState = pass.renderStates[0];
    expect(stencilState).not.be.null;
    expect(stencilState.renderStateType).to.equal("StencilState");
    expect(stencilState.properties).to.have.lengthOf(5);
    expect(stencilState.properties[0]).eql({ property: "Enabled", value: "true", index: undefined });
    expect(stencilState.properties[1]).eql({ property: "ReferenceValue", value: "2", index: undefined });
    expect(stencilState.properties[4]).eql({
      property: "CompareFunctionFront",
      value: "CompareFunction.Less",
      index: undefined
    });

    const blendState = pass.renderStates[1];
    expect(blendState).not.be.undefined;
    expect(blendState.properties[0]).eql({ property: "Enabled", value: "true", index: 2 });
    expect(blendState.properties[1]).eql({ property: "ColorWriteMask", value: "0.8", index: 2 });
    expect(blendState.properties[2]).eql({
      property: "BlendColor",
      value: "vec4(1.0, 1.0, 1.0, 1.0)",
      index: undefined
    });
  });
});

describe("engine shader", () => {
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas, shaderLab });
  });

  it("engine init", () => {
    expect(engine).not.be.null;
  });

  it("shader create", () => {
    const shader = Shader.create(demoShader);
    expect(shader).not.be.null;
  });
});
