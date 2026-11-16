import {
  Burst,
  Camera,
  Color,
  Engine,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode,
  ParticleSubEmitterType,
  WebGLEngine
} from "../../../../../../galacean/dist/module.js";
import { afterEach, expect, it } from "vitest";
import { createWebGL1Canvas } from "../../../../helpers/canvas";

const originalNow = performance.now;
afterEach(() => {
  performance.now = originalNow;
});

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
  const currentTime = times * deltaTime;
  performance.now = () => currentTime;
}

function createSubEmitter(engine: Engine, name: string, scene = engine.sceneManager.activeScene): ParticleRenderer {
  const root = scene.getRootEntity() ?? scene.createRootEntity();
  const entity = root.createChild(name);
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

it("Sub-emitter stays inert on WebGL1 instead of crashing on Death", async () => {
  const fallback = await WebGLEngine.create({
    canvas: createWebGL1Canvas()
  });
  fallback.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
  const parent = createSubEmitter(fallback, "WebGL1_Parent");
  const child = createSubEmitter(fallback, "WebGL1_Child");
  parent.generator.main.startLifetime.constant = 0.5;

  try {
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

    expect(parent.generator.subEmitters.enabled).to.equal(false);
    expect((parent.generator as any)._feedbackSimulator).to.not.exist;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();
    expect(() => updateEngine(fallback, 10)).to.not.throw(); // parent death must not crash
    expect(child.generator._getAliveParticleCount()).to.equal(0); // Death inert on WebGL1
  } finally {
    fallback.destroy();
  }
});
