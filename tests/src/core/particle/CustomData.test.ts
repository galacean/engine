import {
  ParticleRenderer,
  ParticleMaterial,
  Camera,
  Entity,
  ParticleCurveMode,
  ParticleGradientMode,
  Engine,
  ParticleStopMode,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleGradient,
  GradientColorKey,
  GradientAlphaKey,
  CurveKey,
  Logger
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { describe, beforeAll, beforeEach, afterAll, expect, it } from "vitest";

describe("CustomDataModule", function () {
  let engine: Engine;
  let particleRenderer: ParticleRenderer;
  let entity: Entity;

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: new LitePhysics()
    });
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

  afterAll(function () {
    engine.destroy();
  });

  beforeEach(function () {
    particleRenderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);

    const customData = particleRenderer.generator.customData;
    customData.enabled = false;
    for (const name of Object.keys(customData.curves)) {
      customData.removeCurve(name);
    }
    for (const name of Object.keys(customData.gradients)) {
      customData.removeGradient(name);
    }
  });

  it("starts empty", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.enabled).to.eq(false);
    expect(Object.keys(customData.curves).length).to.eq(0);
    expect(Object.keys(customData.gradients).length).to.eq(0);
  });

  it("addCurve registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const curve = new ParticleCompositeCurve(1.0);
    customData.addCurve("Intensity", curve);
    expect(customData.curves["Intensity"]).to.eq(curve);
  });

  it("addCurve rejects invalid identifiers (Logger.error, no insert)", function () {
    const customData = particleRenderer.generator.customData;
    Logger.enable();
    customData.addCurve("", new ParticleCompositeCurve(0));
    customData.addCurve("has space", new ParticleCompositeCurve(0));
    customData.addCurve("dash-name", new ParticleCompositeCurve(0));
    customData.addCurve("中文", new ParticleCompositeCurve(0));
    expect(Object.keys(customData.curves).length).to.eq(0);
  });

  it("addCurve accepts digit-leading names — the renderer_ prefix keeps the final GLSL identifier valid", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("0intensity", new ParticleCompositeCurve(0.5));
    customData.addCurve("42", new ParticleCompositeCurve(1));
    expect(Object.keys(customData.curves).length).to.eq(2);
  });

  it("addCurve rejects duplicate name (cross with gradients)", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("Foo", new ParticleCompositeCurve(1));
    customData.addCurve("Foo", new ParticleCompositeCurve(2));
    customData.addGradient("Foo", new ParticleCompositeGradient(new Color(1, 1, 1, 1)));
    expect(Object.keys(customData.curves).length).to.eq(1);
    expect(Object.keys(customData.gradients).length).to.eq(0);
    expect(customData.curves["Foo"].constantMax).to.eq(1);
  });

  it("addGradient registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const gradient = new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1));
    customData.addGradient("Tint", gradient);
    expect(customData.gradients["Tint"]).to.eq(gradient);
  });

  it("removeCurve / removeGradient clear entries", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("A", new ParticleCompositeCurve(1));
    customData.addGradient("B", new ParticleCompositeGradient(new Color()));
    customData.removeCurve("A");
    customData.removeGradient("B");
    customData.removeCurve("A"); // no-op
    customData.removeGradient("B"); // no-op
    expect(Object.keys(customData.curves).length).to.eq(0);
    expect(Object.keys(customData.gradients).length).to.eq(0);
  });

  it("removeCurve / removeGradient zero out shaderData uniforms", function () {
    const customData = particleRenderer.generator.customData;
    const shaderData = particleRenderer.shaderData;
    customData.enabled = true;

    customData.addCurve("Intensity", new ParticleCompositeCurve(0.8));
    customData.addGradient("Tint", new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1)));
    //@ts-ignore - drive the upload directly
    customData._updateShaderData(shaderData);

    expect(shaderData.getFloat("renderer_IntensityMaxConst")).to.eq(0.8);
    expect(shaderData.getVector4("renderer_TintMaxConst").x).to.be.closeTo(1, 1e-6);

    customData.removeCurve("Intensity");
    customData.removeGradient("Tint");

    // Without the explicit clear in remove*, these would still read the
    // stale values (0.8 / red), breaking the JSDoc contract.
    expect(shaderData.getFloat("renderer_IntensityMaxConst")).to.eq(0);
    const tintAfter = shaderData.getVector4("renderer_TintMaxConst");
    expect(tintAfter.x).to.eq(0);
    expect(tintAfter.y).to.eq(0);
    expect(tintAfter.z).to.eq(0);
    expect(tintAfter.w).to.eq(0);
  });

  it("_updateShaderData no-op when disabled", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("Intensity", new ParticleCompositeCurve(1));
    customData.enabled = false;
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData handles all curve modes", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addCurve("C1", new ParticleCompositeCurve(1));
    customData.addCurve("C2", new ParticleCompositeCurve(1, 5));
    customData.addCurve(
      "C3",
      new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)))
    );
    customData.addCurve(
      "C4",
      new ParticleCompositeCurve(
        new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0.5)),
        new ParticleCurve(new CurveKey(0, 0.5), new CurveKey(1, 1))
      )
    );
    expect(customData.curves["C2"].mode).to.eq(ParticleCurveMode.TwoConstants);
    expect(customData.curves["C4"].mode).to.eq(ParticleCurveMode.TwoCurves);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData handles gradient constant + twoConstants modes", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addGradient("G1", new ParticleCompositeGradient(new Color(1, 0.5, 0.25, 1)));
    customData.addGradient(
      "G2",
      new ParticleCompositeGradient(new Color(0, 0, 0, 1), new Color(1, 1, 1, 1))
    );
    expect(customData.gradients["G2"].mode).to.eq(ParticleGradientMode.TwoConstants);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData throws when gradient stream uses an unsupported mode", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    const keyedGradient = new ParticleGradient(
      [new GradientColorKey(0, new Color(1, 0, 0)), new GradientColorKey(1, new Color(0, 0, 1))],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 1)]
    );
    customData.addGradient("Bad", new ParticleCompositeGradient(keyedGradient));
    expect(customData.gradients["Bad"].mode).to.eq(ParticleGradientMode.Gradient);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.throw(/only constant and twoConstants are supported/);
  });

  it("clones deep — entries detached, internal caches rebuilt", function () {
    // Bug guard: CloneManager can't recurse into Record entries, so the
    // default field-by-field clone leaves `cloned.curves === source.curves`
    // (mutation aliasing) and an empty `_curveStreams` (silent no-op
    // _updateShaderData). The module's `_cloneTo` hook deep-clones each
    // entry and rebuilds the internal caches via addCurve / addGradient.
    const scene = engine.sceneManager.activeScene;
    const sourceEntity = scene.createRootEntity("source-particle");
    const sourceRenderer = sourceEntity.addComponent(ParticleRenderer);
    sourceRenderer.setMaterial(new ParticleMaterial(engine));
    const sourceCustomData = sourceRenderer.generator.customData;
    sourceCustomData.enabled = true;
    sourceCustomData.addCurve("Intensity", new ParticleCompositeCurve(0.8));
    sourceCustomData.addGradient("Tint", new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1)));

    const clonedEntity = sourceEntity.clone();
    const clonedRenderer = clonedEntity.getComponent(ParticleRenderer);
    const clonedCustomData = clonedRenderer.generator.customData;

    // Record containers are fresh, not aliased.
    expect(clonedCustomData.curves).to.not.eq(sourceCustomData.curves);
    expect(clonedCustomData.gradients).to.not.eq(sourceCustomData.gradients);

    // Entries themselves are fresh (deep clone), not shared.
    expect(clonedCustomData.curves["Intensity"]).to.not.eq(sourceCustomData.curves["Intensity"]);
    expect(clonedCustomData.curves["Intensity"].constantMax).to.eq(0.8);
    expect(clonedCustomData.gradients["Tint"]).to.not.eq(sourceCustomData.gradients["Tint"]);
    expect(clonedCustomData.gradients["Tint"].constantMax.r).to.be.closeTo(1, 1e-6);

    // Internal caches are rebuilt — _updateShaderData would now upload uniforms.
    //@ts-ignore - inspecting private internal cache
    const clonedCurveStreams = (clonedCustomData as any)._curveStreams;
    //@ts-ignore
    const clonedGradientStreams = (clonedCustomData as any)._gradientStreams;
    expect(Object.keys(clonedCurveStreams)).to.deep.eq(["Intensity"]);
    expect(Object.keys(clonedGradientStreams)).to.deep.eq(["Tint"]);

    // Mutation isolation: bumping the clone does not bleed back into the source.
    clonedCustomData.curves["Intensity"].constantMax = 0.1;
    expect(sourceCustomData.curves["Intensity"].constantMax).to.eq(0.8);

    sourceEntity.destroy();
    clonedEntity.destroy();
  });

  it("enabling module triggers engine update without error", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addCurve("Intensity", new ParticleCompositeCurve(1, 5));
    customData.addGradient("Tint", new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1)));

    particleRenderer.generator.play();
    //@ts-ignore
    const originalVSyncCount = engine._vSyncCount;
    //@ts-ignore
    const originalLastSystemTime = engine._time._lastSystemTime;
    const originalNow = performance.now;
    try {
      //@ts-ignore
      engine._vSyncCount = Infinity;
      //@ts-ignore
      engine._time._lastSystemTime = 0;
      let times = 0;
      performance.now = function () {
        times++;
        return times * 100;
      };
      expect(() => {
        for (let i = 0; i < 10; ++i) {
          engine.update();
        }
      }).to.not.throw();
    } finally {
      performance.now = originalNow;
      //@ts-ignore
      engine._vSyncCount = originalVSyncCount;
      //@ts-ignore
      engine._time._lastSystemTime = originalLastSystemTime;
    }
  });
});
