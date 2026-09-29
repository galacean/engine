import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleStopMode,
  PrimitiveMesh,
  ShaderMacro,
  WebGLEngine
} from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

const SOL_CURVE_MODE_MACRO = ShaderMacro.getByName("RENDERER_SOL_CURVE_MODE");
const SOL_RANDOM_TWO_MACRO = ShaderMacro.getByName("RENDERER_SOL_IS_RANDOM_TWO");
const SOL_SEPARATE_MACRO = ShaderMacro.getByName("RENDERER_SOL_IS_SEPARATE");
// ParticleBufferUtils.instanceVertexFloatStride
const FLOAT_STRIDE = 42;

function updateEngine(engine: Engine, frames: number, deltaTime = 100) {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < frames; i++) {
    engine.update();
  }
}

function createParticleRenderer(engine: Engine, name: string): ParticleRenderer {
  const scene = engine.sceneManager.activeScene;
  const entity = scene.getRootEntity().createChild(name);
  const renderer = entity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1, 1, 1, 1);
  renderer.setMaterial(material);

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.main.duration = 5;
  generator.main.isLoop = false;
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 10;
  generator.emission.rateOverTime.constant = 0;

  return renderer;
}

function createTwoCurves(): ParticleCompositeCurve {
  return new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(1, 0.4)),
    new ParticleCurve(new CurveKey(0, 0.8), new CurveKey(1, 1))
  );
}

describe("SizeOverLifetime", () => {
  let engine: Engine;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);
    engine.run();
  });

  it("TwoCurves mode enables curve-mode and random-two macros and uploads both curves", () => {
    const renderer = createParticleRenderer(engine, "SOL_Macro");
    const sol = renderer.generator.sizeOverLifetime;
    sol.enabled = true;
    sol.size = createTwoCurves();
    expect(sol.size.mode).to.eq(ParticleCurveMode.TwoCurves);

    // Emit a particle so the renderer is not frustum-culled (macros derive during render)
    renderer.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    renderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    renderer.generator.play();
    updateEngine(engine, 3);

    const macros = renderer.shaderData["_macroCollection"];
    expect(macros.isEnable(SOL_CURVE_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(SOL_RANDOM_TWO_MACRO)).to.eq(true);
    expect(renderer.shaderData.getFloatArray("renderer_SOLMaxCurveX")).to.not.be.undefined;
    expect(renderer.shaderData.getFloatArray("renderer_SOLMinCurveX")).to.not.be.undefined;

    renderer.entity.destroy();
  });

  it("single Curve mode enables curve-mode macro without random-two", () => {
    const renderer = createParticleRenderer(engine, "SOL_Curve");
    const sol = renderer.generator.sizeOverLifetime;
    sol.enabled = true;
    sol.size = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));

    renderer.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    renderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    renderer.generator.play();
    updateEngine(engine, 3);

    const macros = renderer.shaderData["_macroCollection"];
    expect(macros.isEnable(SOL_CURVE_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(SOL_RANDOM_TWO_MACRO)).to.eq(false);

    renderer.entity.destroy();
  });

  it("TwoCurves mode writes per-particle random factor to a_Random0.z when noise is disabled", () => {
    const renderer = createParticleRenderer(engine, "SOL_Rand");
    const generator = renderer.generator;
    const sol = generator.sizeOverLifetime;
    sol.enabled = true;
    sol.size = createTwoCurves();

    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    updateEngine(engine, 3);

    expect(generator._getAliveParticleCount()).to.eq(2);
    const verts = (generator as any)._instanceVertices as Float32Array;
    const first = verts[21];
    const second = verts[FLOAT_STRIDE + 21];
    expect(first).to.be.greaterThan(0);
    expect(first).to.be.lessThan(1);
    expect(second).to.be.greaterThan(0);
    expect(second).to.be.lessThan(1);
    expect(first).to.not.eq(second);

    renderer.entity.destroy();
  });

  it("slot a_Random0.z stays untouched for non-random SOL modes", () => {
    const renderer = createParticleRenderer(engine, "SOL_NoRand");
    const generator = renderer.generator;
    const sol = generator.sizeOverLifetime;
    sol.enabled = true;
    sol.size = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));

    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    updateEngine(engine, 3);

    expect(generator._getAliveParticleCount()).to.eq(1);
    const verts = (generator as any)._instanceVertices as Float32Array;
    expect(verts[21]).to.eq(0);

    renderer.entity.destroy();
  });

  it("noise random keeps precedence on the shared slot when both modules are enabled", () => {
    const rendererNoiseOnly = createParticleRenderer(engine, "SOL_NoiseOnly");
    const rendererBoth = createParticleRenderer(engine, "SOL_NoiseAndSOL");

    for (const renderer of [rendererNoiseOnly, rendererBoth]) {
      const generator = renderer.generator;
      generator.randomSeed = 42;
      generator.noise.enabled = true;
      generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    }
    const solBoth = rendererBoth.generator.sizeOverLifetime;
    solBoth.enabled = true;
    solBoth.size = createTwoCurves();

    rendererNoiseOnly.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    rendererBoth.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    rendererNoiseOnly.generator.play();
    rendererBoth.generator.play();
    updateEngine(engine, 3);

    const vertsNoiseOnly = (rendererNoiseOnly.generator as any)._instanceVertices as Float32Array;
    const vertsBoth = (rendererBoth.generator as any)._instanceVertices as Float32Array;
    expect(vertsNoiseOnly[21]).to.be.greaterThan(0);
    expect(vertsBoth[21]).to.eq(vertsNoiseOnly[21]);

    rendererNoiseOnly.entity.destroy();
    rendererBoth.entity.destroy();
  });

  it("mesh render mode with separateAxes TwoCurves enables macros, uploads all axis curves and writes the random slot", () => {
    const renderer = createParticleRenderer(engine, "SOL_MeshSeparate");
    renderer.renderMode = ParticleRenderMode.Mesh;
    renderer.mesh = PrimitiveMesh.createCuboid(engine);

    const generator = renderer.generator;
    const sol = generator.sizeOverLifetime;
    sol.enabled = true;
    sol.separateAxes = true;
    sol.sizeX = createTwoCurves();
    sol.sizeY = createTwoCurves();
    sol.sizeZ = createTwoCurves();

    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    updateEngine(engine, 3);

    const macros = renderer.shaderData["_macroCollection"];
    expect(macros.isEnable(SOL_CURVE_MODE_MACRO)).to.eq(true);
    expect(macros.isEnable(SOL_RANDOM_TWO_MACRO)).to.eq(true);
    expect(macros.isEnable(SOL_SEPARATE_MACRO)).to.eq(true);
    for (const axis of ["X", "Y", "Z"]) {
      expect(renderer.shaderData.getFloatArray(`renderer_SOLMaxCurve${axis}`)).to.not.be.undefined;
      expect(renderer.shaderData.getFloatArray(`renderer_SOLMinCurve${axis}`)).to.not.be.undefined;
    }

    const verts = (generator as any)._instanceVertices as Float32Array;
    expect(verts[21]).to.be.greaterThan(0);
    expect(verts[21]).to.be.lessThan(1);

    renderer.entity.destroy();
  });
});
