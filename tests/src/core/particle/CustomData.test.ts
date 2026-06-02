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
    for (const name of [...customData.curves.keys()]) {
      customData.removeCurve(name);
    }
    for (const name of [...customData.gradients.keys()]) {
      customData.removeGradient(name);
    }
  });

  it("starts empty", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.enabled).to.eq(false);
    expect(customData.curves.size).to.eq(0);
    expect(customData.gradients.size).to.eq(0);
  });

  it("addCurve registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const curve = new ParticleCompositeCurve(1.0);
    customData.addCurve("Intensity", curve);
    expect(customData.curves.get("Intensity")).to.eq(curve);
  });

  it("addCurve rejects invalid identifiers (Logger.error, no insert)", function () {
    const customData = particleRenderer.generator.customData;
    Logger.enable();
    customData.addCurve("", new ParticleCompositeCurve(0));
    customData.addCurve("has space", new ParticleCompositeCurve(0));
    customData.addCurve("dash-name", new ParticleCompositeCurve(0));
    customData.addCurve("中文", new ParticleCompositeCurve(0));
    expect(customData.curves.size).to.eq(0);
  });

  it("addCurve accepts Object.prototype names (no prototype-chain false-positive on dup check)", function () {
    // Pre-Map storage used a plain `{}` which inherited `toString` / `hasOwnProperty`
    // / `constructor` / `__proto__` from `Object.prototype`; the dup check
    // `name in this._curves` would then fire on these names even when no entry
    // existed. With Map backing, only explicitly-registered keys count.
    const customData = particleRenderer.generator.customData;
    customData.addCurve("toString", new ParticleCompositeCurve(0.1));
    customData.addCurve("hasOwnProperty", new ParticleCompositeCurve(0.2));
    customData.addCurve("constructor", new ParticleCompositeCurve(0.3));
    expect(customData.curves.size).to.eq(3);
    expect(customData.curves.get("toString")!.constantMax).to.eq(0.1);
  });

  it("addCurve accepts __proto__ as a name without polluting the container's prototype", function () {
    // On a plain `{}`, `obj["__proto__"] = curve` mutates the object's prototype
    // chain — subsequent `for...in` would walk through the curve's own enumerable
    // properties. Map.set on the literal key "__proto__" has no such effect.
    const customData = particleRenderer.generator.customData;
    const curve = new ParticleCompositeCurve(0.5);
    customData.addCurve("__proto__", curve);
    expect(customData.curves.size).to.eq(1);
    expect(customData.curves.get("__proto__")).to.eq(curve);
    // The map's own prototype is still Map.prototype, not the curve.
    expect(Object.getPrototypeOf(customData.curves)).to.eq(Map.prototype);
  });

  it("addCurve accepts digit-leading names — the renderer_ prefix keeps the final GLSL identifier valid", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("0intensity", new ParticleCompositeCurve(0.5));
    customData.addCurve("42", new ParticleCompositeCurve(1));
    expect(customData.curves.size).to.eq(2);
  });

  it("addCurve / addGradient reject names that collide with engine particle module namespaces", function () {
    const customData = particleRenderer.generator.customData;
    Logger.enable();
    // Bare prefixes (exact collision with module's MaxConst/MaxGradient*…)
    customData.addCurve("VOL", new ParticleCompositeCurve(0));
    customData.addGradient("COL", new ParticleCompositeGradient(new Color()));
    // Suffix-extended also rejected (`FOLSpeedMaxConst` collides with FOL's existing uniform space)
    customData.addCurve("FOLSpeed", new ParticleCompositeCurve(0));
    customData.addGradient("TSAFrame", new ParticleCompositeGradient(new Color()));
    expect(customData.curves.size).to.eq(0);
    expect(customData.gradients.size).to.eq(0);
    // Names that merely happen to contain the substring are NOT rejected — only the leading prefix matters.
    customData.addCurve("MyVOL", new ParticleCompositeCurve(0));
    expect(customData.curves.size).to.eq(1);
  });

  it("addCurve rejects duplicate name (cross with gradients)", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("Foo", new ParticleCompositeCurve(1));
    customData.addCurve("Foo", new ParticleCompositeCurve(2));
    customData.addGradient("Foo", new ParticleCompositeGradient(new Color(1, 1, 1, 1)));
    expect(customData.curves.size).to.eq(1);
    expect(customData.gradients.size).to.eq(0);
    expect(customData.curves.get("Foo")!.constantMax).to.eq(1);
  });

  it("addGradient registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const gradient = new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1));
    customData.addGradient("Tint", gradient);
    expect(customData.gradients.get("Tint")).to.eq(gradient);
  });

  it("removeCurve / removeGradient clear entries", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("A", new ParticleCompositeCurve(1));
    customData.addGradient("B", new ParticleCompositeGradient(new Color()));
    customData.removeCurve("A");
    customData.removeGradient("B");
    customData.removeCurve("A"); // no-op
    customData.removeGradient("B"); // no-op
    expect(customData.curves.size).to.eq(0);
    expect(customData.gradients.size).to.eq(0);
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
    expect(shaderData.getColor("renderer_TintMaxConst").r).to.be.closeTo(1, 1e-6);

    customData.removeCurve("Intensity");
    customData.removeGradient("Tint");

    // Without the explicit clear in remove*, these would still read the
    // stale values (0.8 / red), breaking the JSDoc contract.
    expect(shaderData.getFloat("renderer_IntensityMaxConst")).to.eq(0);
    const tintAfter = shaderData.getColor("renderer_TintMaxConst");
    expect(tintAfter.r).to.eq(0);
    expect(tintAfter.g).to.eq(0);
    expect(tintAfter.b).to.eq(0);
    expect(tintAfter.a).to.eq(0);
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
    expect(customData.curves.get("C2")!.mode).to.eq(ParticleCurveMode.TwoConstants);
    expect(customData.curves.get("C4")!.mode).to.eq(ParticleCurveMode.TwoCurves);
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
    expect(customData.gradients.get("G2")!.mode).to.eq(ParticleGradientMode.TwoConstants);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData handles gradient + twoGradients modes", function () {
    const customData = particleRenderer.generator.customData;
    const shaderData = particleRenderer.shaderData;
    customData.enabled = true;
    const gMax = new ParticleGradient(
      [new GradientColorKey(0, new Color()), new GradientColorKey(0.7, new Color())],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 1)]
    );
    const gMin = new ParticleGradient(
      [new GradientColorKey(0, new Color())],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(0.5, 1)]
    );
    customData.addGradient("G3", new ParticleCompositeGradient(gMax));
    customData.addGradient("G4", new ParticleCompositeGradient(gMin, gMax));
    //@ts-ignore
    customData._updateShaderData(shaderData);

    // Single Gradient: min falls back to max, so xy === zw.
    const g3 = shaderData.getVector4("renderer_G3KeysCount");
    expect(g3.x).to.be.closeTo(0.7, 1e-6);
    expect(g3.z).to.be.closeTo(g3.x, 1e-6);

    // TwoGradients: xy from min keys, zw from max keys.
    const g4 = shaderData.getVector4("renderer_G4KeysCount");
    expect(g4.y).to.be.closeTo(0.5, 1e-6);
    expect(g4.z).to.be.closeTo(0.7, 1e-6);
  });

  it("_uploadCurveStream clears stale uniforms when curve.mode flips at runtime", function () {
    const customData = particleRenderer.generator.customData;
    const shaderData = particleRenderer.shaderData;
    customData.enabled = true;

    // Start in Constant mode: writes MaxConst, leaves MaxGradient[] untouched.
    const curve = new ParticleCompositeCurve(0.8);
    customData.addCurve("FlipScalar", curve);
    //@ts-ignore
    customData._updateShaderData(shaderData);
    expect(shaderData.getFloat("renderer_FlipScalarMaxConst")).to.eq(0.8);

    // Flip to Curve mode. The stale 0.8 in MaxConst must be cleared by the
    // transition so the GPU doesn't keep reading it through a user-declared
    // `uniform float renderer_FlipScalarMaxConst`.
    curve.curveMax = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1));
    curve.mode = ParticleCurveMode.Curve;
    //@ts-ignore
    customData._updateShaderData(shaderData);
    expect(shaderData.getFloat("renderer_FlipScalarMaxConst")).to.eq(0);
  });

  it("_uploadGradientStream clears stale uniforms when gradient.mode flips at runtime", function () {
    const customData = particleRenderer.generator.customData;
    const shaderData = particleRenderer.shaderData;
    customData.enabled = true;

    // Start in Constant mode: writes MaxConst color, leaves gradient arrays untouched.
    const gradient = new ParticleCompositeGradient(new Color(0.4, 0.4, 0.4, 1));
    customData.addGradient("FlipColor", gradient);
    //@ts-ignore
    customData._updateShaderData(shaderData);
    expect(shaderData.getColor("renderer_FlipColorMaxConst").r).to.be.closeTo(0.4, 1e-6);

    // Flip to Gradient mode. Stale MaxConst must be zeroed on transition.
    gradient.gradientMax = new ParticleGradient(
      [new GradientColorKey(0, new Color(1, 0, 0)), new GradientColorKey(1, new Color(0, 0, 1))],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 1)]
    );
    gradient.mode = ParticleGradientMode.Gradient;
    //@ts-ignore
    customData._updateShaderData(shaderData);
    expect(shaderData.getColor("renderer_FlipColorMaxConst").r).to.eq(0);
  });

  it("clones deep — entries detached, internal caches rebuilt", function () {
    // Bug guard: CloneManager can't recurse into Map entries, so the default
    // field-by-field clone would leave `cloned.curves === source.curves`
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

    // Map containers are fresh, not aliased.
    expect(clonedCustomData.curves).to.not.eq(sourceCustomData.curves);
    expect(clonedCustomData.gradients).to.not.eq(sourceCustomData.gradients);

    // Entries themselves are fresh (deep clone), not shared.
    expect(clonedCustomData.curves.get("Intensity")).to.not.eq(sourceCustomData.curves.get("Intensity"));
    expect(clonedCustomData.curves.get("Intensity")!.constantMax).to.eq(0.8);
    expect(clonedCustomData.gradients.get("Tint")).to.not.eq(sourceCustomData.gradients.get("Tint"));
    expect(clonedCustomData.gradients.get("Tint")!.constantMax.r).to.be.closeTo(1, 1e-6);

    // Internal caches are rebuilt — _updateShaderData would now upload uniforms.
    //@ts-ignore - inspecting private internal cache
    const clonedCurveStreams = (clonedCustomData as any)._curveStreams as Map<string, unknown>;
    //@ts-ignore
    const clonedGradientStreams = (clonedCustomData as any)._gradientStreams as Map<string, unknown>;
    expect([...clonedCurveStreams.keys()]).to.deep.eq(["Intensity"]);
    expect([...clonedGradientStreams.keys()]).to.deep.eq(["Tint"]);

    // Mutation isolation: bumping the clone does not bleed back into the source.
    clonedCustomData.curves.get("Intensity")!.constantMax = 0.1;
    expect(sourceCustomData.curves.get("Intensity")!.constantMax).to.eq(0.8);

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
