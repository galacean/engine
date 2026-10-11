import {
  Burst,
  Camera,
  CurveKey,
  Engine,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode,
  ShaderMacro,
  ShaderProperty,
  WebGLEngine
} from "@galacean/engine";
import { beforeAll, describe, expect, it, vi } from "vitest";

const FOL_CONSTANT_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_CONSTANT_MODE");
const FOL_CURVE_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_CURVE_MODE");
const FOL_RANDOM_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_IS_RANDOM_TWO");
const FOL_MIN_CONST = ShaderProperty.getByName("renderer_FOLMinConst");
const FOL_MAX_CONST = ShaderProperty.getByName("renderer_FOLMaxConst");
// ParticleBufferUtils.instanceVertexFloatStride
const FLOAT_STRIDE = 42;

function updateEngine(engine: Engine, frames: number, deltaTime = 100) {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  const now = vi.spyOn(performance, "now").mockImplementation(() => ++times * deltaTime);
  try {
    for (let i = 0; i < frames; i++) {
      engine.update();
    }
  } finally {
    now.mockRestore();
  }
}

function createParticleRenderer(engine: Engine): ParticleRenderer {
  const scene = engine.sceneManager.activeScene;
  const entity = scene.getRootEntity().createChild("FOL_MixedAxis");
  const renderer = entity.addComponent(ParticleRenderer);
  renderer.setMaterial(new ParticleMaterial(engine));

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.main.duration = 5;
  generator.main.isLoop = false;
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 10;
  generator.emission.rateOverTime.constant = 0;
  return renderer;
}

describe("ForceOverLifetime", () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const root = engine.sceneManager.activeScene.createRootEntity("root");
    root.createChild("Camera").addComponent(Camera);
    engine.run();
  });

  it("keeps constant axes fixed when another axis is random", () => {
    const renderer = createParticleRenderer(engine);
    const { forceOverLifetime } = renderer.generator;
    forceOverLifetime.enabled = true;
    forceOverLifetime.forceX = new ParticleCompositeCurve(-1, 1);
    forceOverLifetime.forceY.constant = 2;
    forceOverLifetime.forceZ.constant = -3;

    renderer.generator._updateShaderData(renderer.shaderData);

    const macros = renderer.shaderData["_macroCollection"];
    expect(macros.isEnable(FOL_CONSTANT_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(FOL_CURVE_MODE_MACRO)).to.eq(false);
    expect(macros.isEnable(FOL_RANDOM_MODE_MACRO)).to.eq(true);
    const minConstant = renderer.shaderData.getVector3(FOL_MIN_CONST);
    const maxConstant = renderer.shaderData.getVector3(FOL_MAX_CONST);
    expect([minConstant.x, minConstant.y, minConstant.z]).to.deep.eq([-1, 2, -3]);
    expect([maxConstant.x, maxConstant.y, maxConstant.z]).to.deep.eq([1, 2, -3]);

    forceOverLifetime.forceX = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, -1), new CurveKey(1, 1)));
    forceOverLifetime.forceY = new ParticleCompositeCurve(-2, 3);
    renderer.generator._updateShaderData(renderer.shaderData);

    expect(macros.isEnable(FOL_CONSTANT_MODE_MACRO)).to.eq(false);
    expect(macros.isEnable(FOL_CURVE_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(FOL_RANDOM_MODE_MACRO)).to.eq(true);
    const curveMin = renderer.shaderData.getFloatArray("renderer_FOLMinGradientX");
    const curveMax = renderer.shaderData.getFloatArray("renderer_FOLMaxGradientX");
    expect(Array.from(curveMin)).to.deep.eq(Array.from(curveMax));
    const twoConstantsMin = renderer.shaderData.getFloatArray("renderer_FOLMinGradientY");
    const twoConstantsMax = renderer.shaderData.getFloatArray("renderer_FOLMaxGradientY");
    expect([twoConstantsMin[1], twoConstantsMin[3], twoConstantsMin[5], twoConstantsMin[7]]).to.deep.eq([
      -2, -2, -2, -2
    ]);
    expect([twoConstantsMax[1], twoConstantsMax[3], twoConstantsMax[5], twoConstantsMax[7]]).to.deep.eq([3, 3, 3, 3]);
    const constantMin = renderer.shaderData.getFloatArray("renderer_FOLMinGradientZ");
    const constantMax = renderer.shaderData.getFloatArray("renderer_FOLMaxGradientZ");
    expect(Array.from(constantMin)).to.deep.eq(Array.from(constantMax));

    forceOverLifetime.forceX = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, -1), new CurveKey(1, -1)),
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1))
    );
    forceOverLifetime.forceY = new ParticleCompositeCurve(2);
    renderer.generator._updateShaderData(renderer.shaderData);

    expect(macros.isEnable(FOL_CONSTANT_MODE_MACRO)).to.eq(false);
    expect(macros.isEnable(FOL_CURVE_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(FOL_RANDOM_MODE_MACRO)).to.eq(true);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMinGradientX")[1]).to.eq(-1);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMaxGradientX")[1]).to.eq(1);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMinGradientY")[1]).to.eq(2);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMaxGradientY")[1]).to.eq(2);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMinGradientZ")[1]).to.eq(-3);
    expect(renderer.shaderData.getFloatArray("renderer_FOLMaxGradientZ")[1]).to.eq(-3);

    renderer.entity.destroy();
  });

  it("writes random factors for particles when only one force axis is random", () => {
    const renderer = createParticleRenderer(engine);
    const generator = renderer.generator;
    const { forceOverLifetime } = generator;
    forceOverLifetime.enabled = true;
    forceOverLifetime.forceX = new ParticleCompositeCurve(-1, 1);
    forceOverLifetime.forceY.constant = 2;
    forceOverLifetime.forceZ.constant = -3;

    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    updateEngine(engine, 3);

    expect(generator._getAliveParticleCount()).to.eq(2);
    const vertices = (generator as any)._instanceVertices as Float32Array;
    const first = Array.from(vertices.slice(38, 41));
    const second = Array.from(vertices.slice(FLOAT_STRIDE + 38, FLOAT_STRIDE + 41));
    expect(first.every((value) => value > 0 && value < 1)).to.eq(true);
    expect(second.every((value) => value > 0 && value < 1)).to.eq(true);
    expect(first).to.not.deep.eq(second);

    renderer.entity.destroy();
  });
});
