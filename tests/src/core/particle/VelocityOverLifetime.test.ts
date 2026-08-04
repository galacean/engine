import {
  Camera,
  CurveKey,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode,
  ShaderMacro,
  ShaderProperty
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Color, Vector3 } from "@galacean/engine-math";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("VelocityOverLifetimeModule", function () {
  let engine: Engine;
  let particleRenderer: ParticleRenderer;
  let entity: Entity;
  let isWebGL2: boolean;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    isWebGL2 = (engine as any)._hardwareRenderer.isWebGL2;
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

    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.enabled = false;
    vol.orbitalX = new ParticleCompositeCurve(0);
    vol.orbitalY = new ParticleCompositeCurve(0);
    vol.orbitalZ = new ParticleCompositeCurve(0);
    vol.radial = new ParticleCompositeCurve(0);
    vol.centerOffset = new Vector3(0, 0, 0);
  });

  it("orbital/radial default values", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    expect(vol.orbitalX).to.be.instanceOf(ParticleCompositeCurve);
    expect(vol.orbitalX.constant).to.eq(0);
    expect(vol.orbitalY.constant).to.eq(0);
    expect(vol.orbitalZ.constant).to.eq(0);
    expect(vol.radial.constant).to.eq(0);
    expect(vol.centerOffset.x).to.eq(0);
    expect(vol.centerOffset.y).to.eq(0);
    expect(vol.centerOffset.z).to.eq(0);
    expect(vol._isOrbitalActive()).to.eq(false);
    expect(vol._isRadialActive()).to.eq(false);
  });

  it("unauthored orbital/radial curves stay inactive", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.radial.mode = ParticleCurveMode.Curve;
    expect(vol.radial.curveMax).to.eq(undefined);
    expect((vol.radial as any)._isZero()).to.eq(true);
    expect(vol._isRadialActive()).to.eq(false);
    expect(vol._needTransformFeedback()).to.eq(false);
    expect(() => generator._updateShaderData(particleRenderer.shaderData)).to.not.throw();

    vol.orbitalX.mode = ParticleCurveMode.Curve;
    vol.orbitalY.mode = ParticleCurveMode.Curve;
    vol.orbitalZ.mode = ParticleCurveMode.Curve;
    expect(vol._isOrbitalActive()).to.eq(false);
    expect(vol._needTransformFeedback()).to.eq(false);
    expect(() => generator._updateShaderData(particleRenderer.shaderData)).to.not.throw();
  });

  it("orbital/radial pull in transform feedback when active", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    expect(vol._needTransformFeedback()).to.eq(false);
    expect((generator as any)._useTransformFeedback).to.eq(false);

    vol.orbitalY = new ParticleCompositeCurve(2);
    expect(vol._needTransformFeedback()).to.eq(isWebGL2);
    expect((generator as any)._useTransformFeedback).to.eq(isWebGL2);

    vol.orbitalY = new ParticleCompositeCurve(0);
    vol.radial = new ParticleCompositeCurve(1);
    expect(vol._needTransformFeedback()).to.eq(isWebGL2);
    expect((generator as any)._useTransformFeedback).to.eq(isWebGL2);

    vol.radial = new ParticleCompositeCurve(0);
    expect(vol._needTransformFeedback()).to.eq(false);
    expect((generator as any)._useTransformFeedback).to.eq(false);
  });

  it("integrates linear velocity after orbital displacement", function () {
    if (!isWebGL2) return;

    const testEntity = engine.sceneManager.activeScene.createRootEntity("orbital-linear-order");
    const testRenderer = testEntity.addComponent(ParticleRenderer);
    const generator = testRenderer.generator;
    const { main, velocityOverLifetime } = generator;
    const deltaTime = 1;

    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    main.startLifetime = new ParticleCompositeCurve(10);
    main.gravityModifier = new ParticleCompositeCurve(0);
    velocityOverLifetime.orbitalY = new ParticleCompositeCurve(Math.PI / 2);
    velocityOverLifetime.centerOffset.set(-1, 0, 0);
    velocityOverLifetime.enabled = true;

    const simulate = (startSpeed: number): Float32Array => {
      generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      main.startSpeed = new ParticleCompositeCurve(startSpeed);

      const particleIndex = generator._firstFreeElement;
      generator.emit(1);
      testRenderer._updateParticles(deltaTime);
      (engine as any)._hardwareRenderer._gl.finish();

      const result = new Float32Array(6);
      const binding = generator._feedbackSimulator.readBinding;
      binding.buffer.getData(result, particleIndex * binding.stride, 0, result.length);
      return result;
    };

    const orbitalOnly = simulate(0);
    const withLinearVelocity = simulate(1);

    expect(withLinearVelocity[0] - orbitalOnly[0]).to.be.closeTo(withLinearVelocity[3] * deltaTime, 1e-5);
    expect(withLinearVelocity[1] - orbitalOnly[1]).to.be.closeTo(withLinearVelocity[4] * deltaTime, 1e-5);
    expect(withLinearVelocity[2] - orbitalOnly[2]).to.be.closeTo(withLinearVelocity[5] * deltaTime, 1e-5);

    testEntity.destroy();
  });

  it("orbital/radial constants upload shader data", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(0.77);
    vol.orbitalY = new ParticleCompositeCurve(1.02);
    vol.orbitalZ = new ParticleCompositeCurve(0.94);
    vol.radial = new ParticleCompositeCurve(4);
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.include("RENDERER_VOL_ORBITAL_CONSTANT_MODE");
    expect(macros).to.include("RENDERER_VOL_RADIAL_CONSTANT_MODE");
    expect(macros).not.to.include("RENDERER_VOL_ORBITAL_CURVE_MODE");
    expect(macros).not.to.include("RENDERER_VOL_RADIAL_CURVE_MODE");

    const orbital = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalMaxConst"));
    expect(orbital.x).to.eq(0.77);
    expect(orbital.y).to.eq(1.02);
    expect(orbital.z).to.eq(0.94);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialMaxConst"))).to.eq(4);
  });

  it("orbital/radial two constants upload min/max shader data", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(-1, 1);
    vol.orbitalY = new ParticleCompositeCurve(-2, 2);
    vol.orbitalZ = new ParticleCompositeCurve(-3, 3);
    vol.radial = new ParticleCompositeCurve(4, 5);
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.include("RENDERER_VOL_ORBITAL_CONSTANT_MODE");
    expect(macros).to.include("RENDERER_VOL_ORBITAL_IS_RANDOM_TWO");
    expect(macros).to.include("RENDERER_VOL_RADIAL_CONSTANT_MODE");
    expect(macros).to.include("RENDERER_VOL_RADIAL_IS_RANDOM_TWO");

    const orbitalMin = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalMinConst"));
    const orbitalMax = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalMaxConst"));
    expect(orbitalMin.x).to.eq(-1);
    expect(orbitalMin.y).to.eq(-2);
    expect(orbitalMin.z).to.eq(-3);
    expect(orbitalMax.x).to.eq(1);
    expect(orbitalMax.y).to.eq(2);
    expect(orbitalMax.z).to.eq(3);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialMinConst"))).to.eq(4);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialMaxConst"))).to.eq(5);
  });

  it("orbital/radial two curves upload min/max shader data", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, -3), new CurveKey(1, -4)),
      new ParticleCurve(new CurveKey(0, 3), new CurveKey(1, 4))
    );
    vol.orbitalY = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, -1), new CurveKey(1, -2)),
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 2))
    );
    vol.orbitalZ = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, -5), new CurveKey(1, -6)),
      new ParticleCurve(new CurveKey(0, 5), new CurveKey(1, 6))
    );
    vol.radial = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 3), new CurveKey(1, 4)),
      new ParticleCurve(new CurveKey(0, 5), new CurveKey(1, 6))
    );
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.include("RENDERER_VOL_ORBITAL_CURVE_MODE");
    expect(macros).to.include("RENDERER_VOL_ORBITAL_IS_RANDOM_TWO");
    expect(macros).to.include("RENDERER_VOL_RADIAL_CURVE_MODE");
    expect(macros).to.include("RENDERER_VOL_RADIAL_IS_RANDOM_TWO");

    const orbitalMinY = particleRenderer.shaderData.getFloatArray(
      ShaderProperty.getByName("renderer_VOLOrbitalMinCurveY")
    );
    const orbitalMaxY = particleRenderer.shaderData.getFloatArray(
      ShaderProperty.getByName("renderer_VOLOrbitalMaxCurveY")
    );
    const radialMin = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLRadialMinCurve"));
    const radialMax = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLRadialMaxCurve"));

    expect(Array.from(orbitalMinY.slice(0, 4))).to.deep.eq([0, -1, 1, -2]);
    expect(Array.from(orbitalMaxY.slice(0, 4))).to.deep.eq([0, 1, 1, 2]);
    expect(Array.from(radialMin.slice(0, 4))).to.deep.eq([0, 3, 1, 4]);
    expect(Array.from(radialMax.slice(0, 4))).to.deep.eq([0, 5, 1, 6]);
  });

  it("orbital mixed axis modes do not use curve shader path", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 2)));
    vol.orbitalY = new ParticleCompositeCurve(3);
    vol.orbitalZ = new ParticleCompositeCurve(4);
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.not.include("RENDERER_VOL_ORBITAL_CURVE_MODE");
    expect(macros).to.not.include("RENDERER_VOL_ORBITAL_IS_RANDOM_TWO");
  });

  it("clone preserves orbital/radial/centerOffset", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(1);
    vol.orbitalZ = new ParticleCompositeCurve(-2);
    vol.radial = new ParticleCompositeCurve(3);
    vol.centerOffset = new Vector3(4, 5, 6);

    const cloneEntity = entity.clone();
    const clonedVol = cloneEntity.getComponent(ParticleRenderer).generator.velocityOverLifetime;

    expect(clonedVol.orbitalX.constant).to.eq(1);
    expect(clonedVol.orbitalZ.constant).to.eq(-2);
    expect(clonedVol.radial.constant).to.eq(3);
    expect(clonedVol.centerOffset.x).to.eq(4);
    expect(clonedVol.centerOffset.y).to.eq(5);
    expect(clonedVol.centerOffset.z).to.eq(6);
    expect(clonedVol._isOrbitalActive()).to.eq(true);
    expect(clonedVol._isRadialActive()).to.eq(true);
  });

  it("centerOffset component changes dirty bounds after clone", function () {
    // ParticleUpdateFlags: GeneratorVolume | TransformVolume | WorldVolume.
    const dirtyBoundsFlags = 0x7;
    // ParticleUpdateFlags.GeneratorVolume.
    const generatorBoundsFlag = 0x4;

    const renderer = particleRenderer as any;
    renderer._setDirtyFlagFalse(dirtyBoundsFlags);

    particleRenderer.generator.velocityOverLifetime.centerOffset.x = 1;

    expect(renderer._isContainDirtyFlag(generatorBoundsFlag)).to.eq(true);

    const cloneEntity = entity.clone();
    const clonedRenderer = cloneEntity.getComponent(ParticleRenderer) as any;
    clonedRenderer._setDirtyFlagFalse(dirtyBoundsFlags);

    clonedRenderer.generator.velocityOverLifetime.centerOffset.set(2, 0, 0);

    expect(clonedRenderer._isContainDirtyFlag(generatorBoundsFlag)).to.eq(true);
  });
});
