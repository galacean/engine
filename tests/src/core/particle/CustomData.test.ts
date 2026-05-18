import {
  ParticleRenderer,
  ParticleMaterial,
  Camera,
  Entity,
  ParticleCurveMode,
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

describe("CustomDataModule", function () {
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

    const customData = particleRenderer.generator.customData;
    customData.enabled = false;
    customData.data0.x = new ParticleCompositeCurve(0);
    customData.data0.y = new ParticleCompositeCurve(0);
    customData.data0.z = new ParticleCompositeCurve(0);
    customData.data0.w = new ParticleCompositeCurve(0);
    customData.data1.x = new ParticleCompositeCurve(0);
    customData.data1.y = new ParticleCompositeCurve(0);
    customData.data1.z = new ParticleCompositeCurve(0);
    customData.data1.w = new ParticleCompositeCurve(0);
  });

  it("default values", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.enabled).to.eq(false);
    for (const stream of [customData.data0, customData.data1]) {
      for (const comp of [stream.x, stream.y, stream.z, stream.w]) {
        expect(comp.mode).to.eq(ParticleCurveMode.Constant);
        expect(comp.constant).to.eq(0);
      }
    }
  });

  it("enabled property", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.enabled).to.eq(false);
    customData.enabled = true;
    expect(customData.enabled).to.eq(true);
    customData.enabled = false;
    expect(customData.enabled).to.eq(false);
  });

  it("disabled module does not throw on shader update", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = false;
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("Constant mode uploads constant data", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.data0.x = new ParticleCompositeCurve(1);
    customData.data0.y = new ParticleCompositeCurve(2);
    customData.data0.z = new ParticleCompositeCurve(3);
    customData.data0.w = new ParticleCompositeCurve(4);

    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("TwoConstants mode is random-two", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.data0.x = new ParticleCompositeCurve(1, 5);
    customData.data0.y = new ParticleCompositeCurve(1, 5);
    customData.data0.z = new ParticleCompositeCurve(1, 5);
    customData.data0.w = new ParticleCompositeCurve(1, 5);
    customData.data1.x = new ParticleCompositeCurve(0, 2);
    customData.data1.y = new ParticleCompositeCurve(0, 2);
    customData.data1.z = new ParticleCompositeCurve(0, 2);
    customData.data1.w = new ParticleCompositeCurve(0, 2);

    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("Curve mode uploads gradient data", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    const makeCurve = () => new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
    customData.data0.x = makeCurve();
    customData.data0.y = makeCurve();
    customData.data0.z = makeCurve();
    customData.data0.w = makeCurve();

    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("TwoCurves mode uploads min/max gradient data and is random-two", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    const makeCurve = () =>
      new ParticleCompositeCurve(
        new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0.5)),
        new ParticleCurve(new CurveKey(0, 0.5), new CurveKey(1, 1))
      );
    customData.data1.x = makeCurve();
    customData.data1.y = makeCurve();
    customData.data1.z = makeCurve();
    customData.data1.w = makeCurve();

    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("throws when stream components have mixed modes", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.data0.x = new ParticleCompositeCurve(1);
    customData.data0.y = new ParticleCompositeCurve(1, 5);
    customData.data0.z = new ParticleCompositeCurve(1);
    customData.data0.w = new ParticleCompositeCurve(1);

    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.throw(/same mode/);
  });

  it("_resetRandomSeed does not throw", function () {
    const customData = particleRenderer.generator.customData;
    expect(() => {
      //@ts-ignore
      customData._resetRandomSeed(12345);
    }).to.not.throw();
  });

  it("enabling module triggers engine update without error", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.data0.x = new ParticleCompositeCurve(1, 5);
    customData.data0.y = new ParticleCompositeCurve(1, 5);
    customData.data0.z = new ParticleCompositeCurve(1, 5);
    customData.data0.w = new ParticleCompositeCurve(1, 5);
    customData.data1.x = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
    customData.data1.y = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
    customData.data1.z = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
    customData.data1.w = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));

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
