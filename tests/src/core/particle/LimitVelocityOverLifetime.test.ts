import {
  ParticleRenderer,
  ParticleMaterial,
  Camera,
  Entity,
  ParticleCurveMode,
  ParticleSimulationSpace,
  Engine,
  ParticleStopMode,
  ParticleCompositeCurve,
  ParticleCurve,
  CurveKey
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("LimitVelocityOverLifetimeModule", function () {
  let engine: Engine;
  let particleRenderer: ParticleRenderer;
  let entity: Entity;

  beforeAll(async function () {
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

    engine.run();
  });

  beforeEach(function () {
    particleRenderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);

    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.enabled = false;
    lvl.separateAxes = false;
    lvl.dampen = 1;
    lvl.speed = new ParticleCompositeCurve(1);
    lvl.speedY = new ParticleCompositeCurve(1);
    lvl.speedZ = new ParticleCompositeCurve(1);
    lvl.drag = new ParticleCompositeCurve(0);
    lvl.multiplyDragByParticleSize = false;
    lvl.multiplyDragByParticleVelocity = false;
    lvl.space = ParticleSimulationSpace.Local;
  });

  it("default values", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    expect(lvl.enabled).to.eq(false);
    expect(lvl.separateAxes).to.eq(false);
    expect(lvl.dampen).to.eq(1);
    expect(lvl.space).to.eq(ParticleSimulationSpace.Local);
    expect(lvl.multiplyDragByParticleSize).to.eq(false);
    expect(lvl.multiplyDragByParticleVelocity).to.eq(false);
  });

  it("enabled property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    expect(lvl.enabled).to.eq(false);
    lvl.enabled = true;
    expect(lvl.enabled).to.eq(true);
    lvl.enabled = false;
    expect(lvl.enabled).to.eq(false);
  });

  it("separateAxes property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    expect(lvl.separateAxes).to.eq(false);
    lvl.separateAxes = true;
    expect(lvl.separateAxes).to.eq(true);
    lvl.separateAxes = false;
    expect(lvl.separateAxes).to.eq(false);
  });

  it("speed property (alias for speedX)", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const curve = new ParticleCompositeCurve(10);
    lvl.speed = curve;
    expect(lvl.speed).to.eq(curve);
    expect(lvl.speedX).to.eq(curve);
  });

  it("speedX/Y/Z properties", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const curveX = new ParticleCompositeCurve(5);
    const curveY = new ParticleCompositeCurve(10);
    const curveZ = new ParticleCompositeCurve(15);

    lvl.speedX = curveX;
    lvl.speedY = curveY;
    lvl.speedZ = curveZ;

    expect(lvl.speedX).to.eq(curveX);
    expect(lvl.speedY).to.eq(curveY);
    expect(lvl.speedZ).to.eq(curveZ);
  });

  it("dampen property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.dampen = 0.5;
    expect(lvl.dampen).to.eq(0.5);
    lvl.dampen = 0;
    expect(lvl.dampen).to.eq(0);
    lvl.dampen = 1;
    expect(lvl.dampen).to.eq(1);
  });

  it("drag property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const dragCurve = new ParticleCompositeCurve(2.5);
    lvl.drag = dragCurve;
    expect(lvl.drag).to.eq(dragCurve);
    expect(lvl.drag.constant).to.eq(2.5);
  });

  it("drag with TwoConstants mode", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const dragCurve = new ParticleCompositeCurve(1, 5);
    lvl.drag = dragCurve;
    expect(lvl.drag.mode).to.eq(ParticleCurveMode.TwoConstants);
    expect(lvl.drag.constantMin).to.eq(1);
    expect(lvl.drag.constantMax).to.eq(5);
  });

  it("multiplyDragByParticleSize property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.multiplyDragByParticleSize = true;
    expect(lvl.multiplyDragByParticleSize).to.eq(true);
    lvl.multiplyDragByParticleSize = false;
    expect(lvl.multiplyDragByParticleSize).to.eq(false);
  });

  it("multiplyDragByParticleVelocity property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.multiplyDragByParticleVelocity = true;
    expect(lvl.multiplyDragByParticleVelocity).to.eq(true);
    lvl.multiplyDragByParticleVelocity = false;
    expect(lvl.multiplyDragByParticleVelocity).to.eq(false);
  });

  it("space property", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.space = ParticleSimulationSpace.World;
    expect(lvl.space).to.eq(ParticleSimulationSpace.World);
    lvl.space = ParticleSimulationSpace.Local;
    expect(lvl.space).to.eq(ParticleSimulationSpace.Local);
  });

  it("speed with Constant mode", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.speed = new ParticleCompositeCurve(5);
    expect(lvl.speed.mode).to.eq(ParticleCurveMode.Constant);
    expect(lvl.speed.constant).to.eq(5);
  });

  it("speed with TwoConstants mode", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.speed = new ParticleCompositeCurve(2, 8);
    expect(lvl.speed.mode).to.eq(ParticleCurveMode.TwoConstants);
    expect(lvl.speed.constantMin).to.eq(2);
    expect(lvl.speed.constantMax).to.eq(8);
  });

  it("speed with Curve mode", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const curve = new ParticleCurve(new CurveKey(0, 10), new CurveKey(1, 0));
    lvl.speed = new ParticleCompositeCurve(curve);
    expect(lvl.speed.mode).to.eq(ParticleCurveMode.Curve);
  });

  it("speed with TwoCurves mode", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    const curveMin = new ParticleCurve(new CurveKey(0, 2), new CurveKey(1, 0));
    const curveMax = new ParticleCurve(new CurveKey(0, 10), new CurveKey(1, 5));
    lvl.speed = new ParticleCompositeCurve(curveMin, curveMax);
    expect(lvl.speed.mode).to.eq(ParticleCurveMode.TwoCurves);
  });

  it("_isSpeedRandomMode returns false for Constant", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.speed = new ParticleCompositeCurve(5);
    expect(lvl._isSpeedRandomMode()).to.eq(false);
  });

  it("_isSpeedRandomMode returns true for TwoConstants", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.speed = new ParticleCompositeCurve(2, 8);
    expect(lvl._isSpeedRandomMode()).to.eq(true);
  });

  it("_isSpeedRandomMode with separateAxes", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.separateAxes = true;
    lvl.speedX = new ParticleCompositeCurve(1, 5);
    lvl.speedY = new ParticleCompositeCurve(1, 5);
    lvl.speedZ = new ParticleCompositeCurve(1, 5);
    expect(lvl._isSpeedRandomMode()).to.eq(true);

    // Mixed modes: not all random
    lvl.speedZ = new ParticleCompositeCurve(5);
    expect(lvl._isSpeedRandomMode()).to.eq(false);
  });

  it("enabling module triggers shader update without error", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.enabled = true;
    lvl.speed = new ParticleCompositeCurve(5);
    lvl.dampen = 0.8;
    lvl.drag = new ParticleCompositeCurve(0.5);

    // Should not throw when updating shader data
    particleRenderer.generator.play();
    expect(() => {
      //@ts-ignore
      engine._vSyncCount = Infinity;
      //@ts-ignore
      engine._time._lastSystemTime = 0;
      let times = 0;
      performance.now = function () {
        times++;
        return times * 100;
      };
      for (let i = 0; i < 10; ++i) {
        engine.update();
      }
    }).to.not.throw();
  });

  it("separateAxes with curve mode triggers shader update without error", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.enabled = true;
    lvl.separateAxes = true;
    lvl.speedX = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 10), new CurveKey(1, 2)));
    lvl.speedY = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 8), new CurveKey(1, 1)));
    lvl.speedZ = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 5), new CurveKey(1, 0)));
    lvl.dampen = 0.5;

    particleRenderer.generator.play();
    expect(() => {
      //@ts-ignore
      engine._vSyncCount = Infinity;
      //@ts-ignore
      engine._time._lastSystemTime = 0;
      let times = 0;
      performance.now = function () {
        times++;
        return times * 100;
      };
      for (let i = 0; i < 10; ++i) {
        engine.update();
      }
    }).to.not.throw();
  });

  it("drag with curve mode triggers shader update without error", function () {
    const lvl = particleRenderer.generator.limitVelocityOverLifetime;
    lvl.enabled = true;
    lvl.speed = new ParticleCompositeCurve(5);
    lvl.drag = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 2)));
    lvl.multiplyDragByParticleSize = true;
    lvl.multiplyDragByParticleVelocity = true;

    particleRenderer.generator.play();
    expect(() => {
      //@ts-ignore
      engine._vSyncCount = Infinity;
      //@ts-ignore
      engine._time._lastSystemTime = 0;
      let times = 0;
      performance.now = function () {
        times++;
        return times * 100;
      };
      for (let i = 0; i < 10; ++i) {
        engine.update();
      }
    }).to.not.throw();
  });
});
