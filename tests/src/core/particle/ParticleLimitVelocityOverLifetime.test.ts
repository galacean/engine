import {
  Camera,
  Engine,
  Entity,
  LimitVelocityOverLifetimeModule,
  ParticleCompositeCurve,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { expect } from "chai";

export const updateEngine = (engine: Engine, deltaTime = 100) => {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < 50; ++i) {
    engine.update();
  }
};

describe.only("LimitVelocityOverLifetimeModule", () => {
  let engine: Engine;
  let entity: Entity;
  let particleRenderer: ParticleRenderer;
  let limitVelocityOverLifetime: LimitVelocityOverLifetimeModule;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new LitePhysics() });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, -10);
    cameraEntity.transform.lookAt(new Vector3());

    entity = rootEntity.createChild("particle");
    particleRenderer = entity.addComponent(ParticleRenderer);
    const material = new ParticleMaterial(engine);
    material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
    particleRenderer.setMaterial(material);

    limitVelocityOverLifetime = particleRenderer.generator.limitVelocityOverLifetime;
    limitVelocityOverLifetime.enabled = true;

    engine.run();
  });

  beforeEach(function () {
    particleRenderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    limitVelocityOverLifetime.drag.mode = ParticleCurveMode.Constant;
    limitVelocityOverLifetime.drag.constant = 0;

    limitVelocityOverLifetime.separateAxes = false;
    limitVelocityOverLifetime.speed.mode = ParticleCurveMode.Constant;
    limitVelocityOverLifetime.speed.constant = 0;

    limitVelocityOverLifetime.dampen = 0;

    // restart
    particleRenderer.generator.play();
    updateEngine(engine);
  });

  it("Drag", () => {
    const drag = new ParticleCompositeCurve(0.5);
    limitVelocityOverLifetime.drag = drag;
    expect(limitVelocityOverLifetime.drag).to.equal(drag);
  });

  it("Dampen", () => {
    limitVelocityOverLifetime.dampen = 0.1;
    expect(limitVelocityOverLifetime.dampen).to.equal(0.1);

    limitVelocityOverLifetime.dampen = 2;
    expect(limitVelocityOverLifetime.dampen).to.equal(1);

    limitVelocityOverLifetime.dampen = -5;
    expect(limitVelocityOverLifetime.dampen).to.equal(0);
  });

  it("SeparateAxes", () => {
    limitVelocityOverLifetime.separateAxes = true;
    expect(limitVelocityOverLifetime.separateAxes).to.be.true;
  });

  it("Speed", () => {
    const speed = new ParticleCompositeCurve(1.0);
    limitVelocityOverLifetime.speed = speed;
    expect(limitVelocityOverLifetime.speed).to.equal(speed);
  });

  it("SpeedX", () => {
    const speedX = new ParticleCompositeCurve(2.0);
    limitVelocityOverLifetime.speedX = speedX;
    expect(limitVelocityOverLifetime.speedX).to.equal(speedX);
  });

  it("SpeedY", () => {
    const speedY = new ParticleCompositeCurve(3.0);
    limitVelocityOverLifetime.speedY = speedY;
    expect(limitVelocityOverLifetime.speedY).to.equal(speedY);
  });

  it("SpeedZ", () => {
    const speedZ = new ParticleCompositeCurve(4.0);
    limitVelocityOverLifetime.speedZ = speedZ;
    expect(limitVelocityOverLifetime.speedZ).to.equal(speedZ);
  });
});
