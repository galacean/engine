import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleInheritVelocityMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  WebGLEngine
} from "../../../../../../galacean/dist/module.js";
import { afterEach, expect, it, vi } from "vitest";
import { createWebGL1Canvas } from "../../../../helpers/canvas";
import { createEngine } from "../../../../helpers/createEngine";

const originalNow = performance.now;
afterEach(() => {
  performance.now = originalNow;
});

function tick(engine: Engine, time: { value: number }, deltaMs: number = 100): void {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = time.value / 1000;
  performance.now = function () {
    time.value += deltaMs;
    return time.value;
  };
  engine.update();
}

function createParticleRenderer(engine: Engine, name: string): ParticleRenderer {
  const entity = engine.sceneManager.activeScene.createRootEntity(name);
  const renderer = entity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1, 1, 1, 1);
  renderer.setMaterial(material);

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.main.duration = 5;
  generator.main.maxParticles = 10;
  generator.main.startLifetime.constant = 1;
  generator.main.startSpeed.constant = 0;
  generator.main.simulationSpace = ParticleSimulationSpace.World;
  generator.emission.rateOverTime.constant = 0;
  generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1)));
  generator.inheritVelocity.enabled = true;
  generator.inheritVelocity.mode = ParticleInheritVelocityMode.Current;

  return renderer;
}

it("Initial Curve remains available on WebGL1", async () => {
  const webgl1Engine = await WebGLEngine.create({
    canvas: createWebGL1Canvas()
  });
  const camera = webgl1Engine.sceneManager.activeScene.createRootEntity("Camera");
  camera.addComponent(Camera);
  camera.transform.setPosition(0, 0, 10);
  webgl1Engine.run();

  const renderer = createParticleRenderer(webgl1Engine, "initial-inherit-velocity-webgl1");
  const generator = renderer.generator;
  generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
  generator.inheritVelocity.curve = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))
  );
  generator.emission.clearBurst();
  generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1)));
  expect(generator._feedbackSimulator).to.not.exist;

  const webgl1Time = { value: 0 };
  generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  generator.play();
  tick(webgl1Engine, webgl1Time);
  renderer.entity.transform.setPosition(1, 0, 0);
  tick(webgl1Engine, webgl1Time);

  const vertices = (generator as any)._instanceVertices as Float32Array;
  expect(vertices[15]).to.equal(0);
  expect(vertices[40]).to.be.closeTo(10, 1e-5);

  webgl1Engine.destroy();
});

it("updates emitter velocity on the CPU in World space with Current mode", async () => {
  const { engine, gl } = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene!;
    const renderer = scene.createRootEntity().addComponent(ParticleRenderer);
    const generator = renderer.generator;
    const inherit = generator.inheritVelocity;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    inherit.enabled = true;
    inherit.mode = ParticleInheritVelocityMode.Current;
    const resync = vi.spyOn(inherit, "_resyncEmitterVelocity");
    renderer.entity.transform.setPosition(1, 0, 0);
    inherit._updateEmitterVelocity(0.1);
    expect(resync).toHaveBeenCalledOnce();
    expect(inherit._needTransformFeedback()).toBe(false);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
