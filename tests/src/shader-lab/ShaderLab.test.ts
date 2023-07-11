import { ShaderLab } from "@galacean/engine-shaderlab";
import { WebGLEngine, Shader } from "@galacean/engine";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "demo.shader")).toString();

const shaderLab = new ShaderLab();
const canvas = document.createElement("canvas");

describe("ShaderLab", () => {
  before(async () => {
    await shaderLab.initialize();
  });

  it("create shaderlab", async () => {
    expect(shaderLab).not.be.null;
  });

  it("shader parse result", () => {
    const shader = shaderLab.parseShader(demoShader);
    expect(shader.name).to.equal("Water");
    const subShader = shader.subShaders[0];
    expect(subShader.name).to.equal("water");
    const pass = subShader.passes[0];
    expect(pass.name).equal("default");
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
