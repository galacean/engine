import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  Layer,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleInheritVelocityMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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

function getFeedbackPositionX(renderer: ParticleRenderer): number {
  const feedback = new Float32Array(6);
  renderer.generator._feedbackSimulator.readBinding.buffer.getData(feedback, 0, 0, feedback.length);
  return feedback[0];
}

describe("InheritVelocityModule", () => {
  let engine: Engine;
  let camera: Camera;
  let time: { value: number };

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const cameraEntity = engine.sceneManager.activeScene.createRootEntity("Camera");
    camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);
    engine.run();
    time = { value: 0 };
  });

  afterEach(() => {
    camera.cullingMask = Layer.Everything;
  });

  afterAll(function () {
    engine.destroy();
  });

  it("keeps finite conservative bounds for world-space inherited velocity", () => {
    const renderer = createParticleRenderer(engine, "inherit-velocity-bounds");
    const generator = renderer.generator;
    generator.inheritVelocity.curve.constant = 3;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);

    tick(engine, time);
    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);
    renderer.entity.transform.setPosition(2, 0, 0);
    tick(engine, time);

    const bounds = renderer.bounds;
    const feedbackPosition = getFeedbackPositionX(renderer);
    expect(Number.isFinite(bounds.min.x)).to.equal(true);
    expect(Number.isFinite(bounds.max.x)).to.equal(true);
    expect(bounds.min.x).to.be.lessThanOrEqual(feedbackPosition);
    expect(bounds.max.x).to.be.greaterThanOrEqual(feedbackPosition);
    expect(bounds.max.x).to.be.lessThan(100);

    const previousMax = bounds.max.x;
    generator.inheritVelocity.curve.constant = 6;
    const expandedMax = renderer.bounds.max.x;
    expect(expandedMax).to.be.greaterThan(previousMax);

    generator.main.startLifetime.constant = 0.1;
    expect(renderer.bounds.max.x).to.be.greaterThanOrEqual(expandedMax);

    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    expect(renderer.bounds.min.x).to.equal(2);
    expect(renderer.bounds.max.x).to.equal(2);

    renderer.entity.destroy();
  });

  it("includes world-space emission overrides without disabling culling", () => {
    const renderer = createParticleRenderer(engine, "inherit-velocity-world-emission-bounds");
    const generator = renderer.generator;
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    expect(renderer.bounds.max.x).to.equal(0);
    generator._emit(0, 1, new Vector3(100, 0, 0));

    const bounds = renderer.bounds;
    expect(Number.isFinite(bounds.min.x)).to.equal(true);
    expect(Number.isFinite(bounds.max.x)).to.equal(true);
    expect(bounds.min.x).to.be.lessThanOrEqual(100);
    expect(bounds.max.x).to.be.greaterThanOrEqual(100);

    renderer.entity.destroy();
  });

  it("keeps inherited displacement inside orbital bounds", () => {
    const renderer = createParticleRenderer(engine, "inherit-velocity-orbital-bounds");
    const generator = renderer.generator;
    generator.main.startLifetime.constant = 2;
    generator.inheritVelocity.curve.constant = 1;
    generator.velocityOverLifetime.enabled = true;
    generator.velocityOverLifetime.orbitalZ.constant = 10;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);

    tick(engine, time);
    renderer.entity.transform.setPosition(10, 0, 0);
    tick(engine, time);
    tick(engine, time);

    const feedback = new Float32Array(6);
    generator._feedbackSimulator.readBinding.buffer.getData(feedback, 0, 0, feedback.length);
    const bounds = renderer.bounds;
    expect(Math.abs(feedback[1])).to.be.greaterThan(2.5);
    expect(bounds.min.y).to.be.lessThanOrEqual(feedback[1]);
    expect(bounds.max.y).to.be.greaterThanOrEqual(feedback[1]);

    renderer.entity.destroy();
  });

  it("Initial captures the particle system Entity velocity at birth", () => {
    const renderer = createParticleRenderer(engine, "initial-inherit-velocity");
    const generator = renderer.generator;
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.inheritVelocity.curve.constant = 1;
    generator.emission.clearBurst();
    generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1)));
    expect(generator._useTransformFeedback).to.equal(false);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);

    expect(generator._getAliveParticleCount()).to.equal(1);
    const vertices = (generator as any)._instanceVertices as Float32Array;
    expect(vertices[4]).to.be.closeTo(1, 1e-5);
    expect(vertices[5]).to.be.closeTo(0, 1e-5);
    expect(vertices[6]).to.be.closeTo(0, 1e-5);
    expect(vertices[18]).to.be.closeTo(10, 1e-5);

    renderer.entity.destroy();
  });

  it("resets the emitter velocity baseline while simulation is culled", () => {
    const renderer = createParticleRenderer(engine, "culled-inherit-velocity");
    const generator = renderer.generator;
    renderer.entity.layer = Layer.Layer1;
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.inheritVelocity.curve.constant = 1;
    generator.emission.clearBurst();
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);

    tick(engine, time);
    camera.cullingMask = Layer.Layer0;
    tick(engine, time);
    renderer.entity.transform.setPosition(100, 0, 0);
    tick(engine, time);

    camera.cullingMask = Layer.Everything;
    tick(engine, time);
    tick(engine, time);
    generator.emit(1);

    const vertices = (generator as any)._instanceVertices as Float32Array;
    expect(vertices[18]).to.equal(0);

    renderer.entity.destroy();
  });

  it("Initial Curve keeps birth velocity separate without requiring transform feedback", () => {
    const renderer = createParticleRenderer(engine, "initial-inherit-velocity-forward-curve");
    const generator = renderer.generator;
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))
    );
    generator.emission.clearBurst();
    generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1)));
    expect(generator._useTransformFeedback).to.equal(false);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);

    const vertices = (generator as any)._instanceVertices as Float32Array;
    expect(vertices[18]).to.equal(0);
    expect(vertices[42]).to.be.closeTo(10, 1e-5);
    expect(vertices[43]).to.equal(0);
    expect(vertices[44]).to.equal(0);

    generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 2), new CurveKey(1, 2))
    );
    expect(renderer.bounds.max.x).to.be.greaterThanOrEqual(21);

    renderer.entity.destroy();
  });

  it("Initial Curve remains available on WebGL1", async () => {
    const webgl1Engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      webGLMode: WebGLMode.WebGL1
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
    expect(generator._useTransformFeedback).to.equal(false);

    const webgl1Time = { value: 0 };
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(webgl1Engine, webgl1Time);
    renderer.entity.transform.setPosition(1, 0, 0);
    tick(webgl1Engine, webgl1Time);

    const vertices = (generator as any)._instanceVertices as Float32Array;
    expect(vertices[18]).to.equal(0);
    expect(vertices[42]).to.be.closeTo(10, 1e-5);

    webgl1Engine.destroy();
  });

  it("Initial evaluates TwoCurves over each particle lifetime using its birth velocity", () => {
    const renderer = createParticleRenderer(engine, "initial-inherit-velocity-curve");
    const generator = renderer.generator;
    const curve = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1));
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.inheritVelocity.curve = new ParticleCompositeCurve(
      curve,
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))
    );
    generator.emission.clearBurst();
    generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1)));
    generator.noise.strengthX.constant = 0;
    generator.noise.enabled = true;
    expect(generator._useTransformFeedback).to.equal(true);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);

    const vertices = (generator as any)._instanceVertices as Float32Array;
    expect(vertices[18]).to.equal(0);
    expect(vertices[42]).to.be.closeTo(10, 1e-5);
    expect(vertices[43]).to.equal(0);
    expect(vertices[44]).to.equal(0);
    expect(vertices[45]).to.be.within(0, 1);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(1.0125, 1e-5);

    renderer.entity.transform.setPosition(3, 0, 0);
    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(1.1125, 1e-5);

    renderer.entity.destroy();
  });

  it("Initial Curve keeps its analytic displacement through a no-op velocity limit", () => {
    const renderer = createParticleRenderer(engine, "initial-inherit-velocity-curve-limit");
    const generator = renderer.generator;
    generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
    generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))
    );
    generator.limitVelocityOverLifetime.enabled = true;
    generator.limitVelocityOverLifetime.dampen = 0;
    generator.emission.clearBurst();
    generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1)));
    expect(generator._useTransformFeedback).to.equal(true);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(1.0125, 1e-5);

    renderer.entity.destroy();
  });

  it("Current applies the emitter velocity after particles are born", () => {
    const renderer = createParticleRenderer(engine, "current-inherit-velocity");
    renderer.generator.inheritVelocity.curve.constant = 1;
    expect(renderer.generator._useTransformFeedback).to.equal(true);

    renderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    renderer.generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(1, 1e-5);

    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(1, 1e-5);

    renderer.entity.destroy();
  });

  it("Current evaluates TwoCurves against the child particle age", () => {
    const renderer = createParticleRenderer(engine, "current-inherit-velocity-curve");
    const curve = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1));
    renderer.generator.inheritVelocity.curve = new ParticleCompositeCurve(
      curve,
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))
    );
    expect(renderer.generator._useTransformFeedback).to.equal(true);

    renderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    renderer.generator.play();
    tick(engine, time);

    renderer.entity.transform.setPosition(1, 0, 0);
    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(0.2, 1e-5);

    renderer.entity.transform.setPosition(2, 0, 0);
    tick(engine, time);
    expect(getFeedbackPositionX(renderer)).to.be.closeTo(0.5, 1e-5);

    renderer.entity.destroy();
  });
});
