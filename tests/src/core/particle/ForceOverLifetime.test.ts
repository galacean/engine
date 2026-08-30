import {
  Camera,
  CurveKey,
  Engine,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleMaterial,
  ParticleRenderer,
  ShaderMacro,
  ShaderProperty,
  WebGLEngine
} from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

const FOL_CONSTANT_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_CONSTANT_MODE");
const FOL_CURVE_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_CURVE_MODE");
const FOL_RANDOM_MODE_MACRO = ShaderMacro.getByName("RENDERER_FOL_IS_RANDOM_TWO");
const FOL_MIN_CONST = ShaderProperty.getByName("renderer_FOLMinConst");
const FOL_MAX_CONST = ShaderProperty.getByName("renderer_FOLMaxConst");

function createParticleRenderer(engine: Engine): ParticleRenderer {
  const scene = engine.sceneManager.activeScene;
  const entity = scene.getRootEntity().createChild("FOL_MixedAxis");
  const renderer = entity.addComponent(ParticleRenderer);
  renderer.setMaterial(new ParticleMaterial(engine));
  return renderer;
}

describe("ForceOverLifetime", () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const root = engine.sceneManager.activeScene.createRootEntity("root");
    root.createChild("Camera").addComponent(Camera);
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

    forceOverLifetime.forceX = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, -1), new CurveKey(1, -1)),
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1))
    );
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
});
