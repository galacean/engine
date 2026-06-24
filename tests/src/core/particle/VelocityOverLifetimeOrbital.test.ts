import {
  ParticleRenderer,
  ParticleMaterial,
  Camera,
  Entity,
  Engine,
  ParticleStopMode,
  ParticleCompositeCurve,
  ParticleCurve,
  CurveKey,
  ShaderMacro,
  ShaderProperty
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("VelocityOverLifetimeModule orbital/radial", function () {
  let engine: Engine;
  let particleRenderer: ParticleRenderer;
  let entity: Entity;
  let isWebGL2: boolean;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new LitePhysics() });
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
    vol.offset = new Vector3(0, 0, 0);
  });

  it("default values", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    expect(vol.orbitalX).to.be.instanceOf(ParticleCompositeCurve);
    expect(vol.orbitalX.constant).to.eq(0);
    expect(vol.orbitalY.constant).to.eq(0);
    expect(vol.orbitalZ.constant).to.eq(0);
    expect(vol.radial.constant).to.eq(0);
    expect(vol.offset.x).to.eq(0);
    expect(vol.offset.y).to.eq(0);
    expect(vol.offset.z).to.eq(0);
    expect(vol._isOrbitalActive()).to.eq(false);
    expect(vol._isRadialActive()).to.eq(false);
  });

  it("orbital property set/get + active detection", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    const curve = new ParticleCompositeCurve(2);
    vol.orbitalY = curve;
    expect(vol.orbitalY).to.eq(curve);
    expect(vol.orbitalY.constant).to.eq(2);
    expect(vol._isOrbitalActive()).to.eq(true);

    vol.orbitalY = new ParticleCompositeCurve(0);
    expect(vol._isOrbitalActive()).to.eq(false);
  });

  it("radial property set/get + active detection", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    expect(vol._isRadialActive()).to.eq(false);
    vol.radial = new ParticleCompositeCurve(3);
    expect(vol.radial.constant).to.eq(3);
    expect(vol._isRadialActive()).to.eq(true);
  });

  it("offset property copies value", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.offset = new Vector3(1, 2, 3);
    expect(vol.offset.x).to.eq(1);
    expect(vol.offset.y).to.eq(2);
    expect(vol.offset.z).to.eq(3);
  });

  it("orbital/radial pull in transform feedback when active", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    // Plain (linear) velocity must not require transform feedback.
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

  it("single orbital curve axis uploads curve shader data", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalY = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 3)));
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.include("RENDERER_VOL_ORBITAL_CURVE_MODE");
    expect(macros).not.to.include("RENDERER_VOL_ORBITAL_CONSTANT_MODE");

    const curveX = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLOrbitalCurveX"));
    const curveY = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLOrbitalCurveY"));
    const curveZ = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLOrbitalCurveZ"));

    expect(Array.from(curveX.slice(0, 4))).to.deep.eq([0, 0, 1, 0]);
    expect(Array.from(curveY.slice(0, 4))).to.deep.eq([0, 1, 1, 3]);
    expect(Array.from(curveZ.slice(0, 4))).to.deep.eq([0, 0, 1, 0]);
  });

  it("orbital/radial constants upload constant shader data", function () {
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

    const orbital = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalConst"));
    expect(orbital.x).to.eq(0.77);
    expect(orbital.y).to.eq(1.02);
    expect(orbital.z).to.eq(0.94);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialConst"))).to.eq(4);
  });

  it("switching orbital curve back to constants restores constant shader data", function () {
    const generator = particleRenderer.generator;
    const vol = generator.velocityOverLifetime;

    vol.enabled = true;
    vol.orbitalY = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 3)));
    generator._updateShaderData(particleRenderer.shaderData);

    vol.orbitalX = new ParticleCompositeCurve(0.77);
    vol.orbitalY = new ParticleCompositeCurve(1.02);
    vol.orbitalZ = new ParticleCompositeCurve(0.94);
    generator._updateShaderData(particleRenderer.shaderData);

    const macros = particleRenderer.shaderData.getMacros().map((macro: ShaderMacro) => macro.name);
    expect(macros).to.include("RENDERER_VOL_ORBITAL_CONSTANT_MODE");
    expect(macros).not.to.include("RENDERER_VOL_ORBITAL_CURVE_MODE");

    const orbital = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalConst"));
    expect(orbital.x).to.eq(0.77);
    expect(orbital.y).to.eq(1.02);
    expect(orbital.z).to.eq(0.94);
  });

  it("disabled module never requires transform feedback", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.enabled = false;
    vol.orbitalY = new ParticleCompositeCurve(2);
    expect(vol._needTransformFeedback()).to.eq(false);
  });

  it("clone preserves orbital/radial/offset", function () {
    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.enabled = true;
    vol.orbitalX = new ParticleCompositeCurve(1);
    vol.orbitalZ = new ParticleCompositeCurve(-2);
    vol.radial = new ParticleCompositeCurve(3);
    vol.offset = new Vector3(4, 5, 6);

    const cloneEntity = entity.clone();
    const clonedVol = cloneEntity.getComponent(ParticleRenderer).generator.velocityOverLifetime;

    expect(clonedVol.orbitalX.constant).to.eq(1);
    expect(clonedVol.orbitalZ.constant).to.eq(-2);
    expect(clonedVol.radial.constant).to.eq(3);
    expect(clonedVol.offset.x).to.eq(4);
    expect(clonedVol.offset.y).to.eq(5);
    expect(clonedVol.offset.z).to.eq(6);
    expect(clonedVol._isOrbitalActive()).to.eq(true);
    expect(clonedVol._isRadialActive()).to.eq(true);
  });

  it("offset component changes dirty bounds after clone", function () {
    const dirtyBoundsFlags = 0x7;
    const generatorBoundsFlag = 0x4;

    const renderer = particleRenderer as any;
    renderer._setDirtyFlagFalse(dirtyBoundsFlags);

    particleRenderer.generator.velocityOverLifetime.offset.x = 1;

    expect(renderer._isContainDirtyFlag(generatorBoundsFlag)).to.eq(true);

    const cloneEntity = entity.clone();
    const clonedRenderer = cloneEntity.getComponent(ParticleRenderer) as any;
    clonedRenderer._setDirtyFlagFalse(dirtyBoundsFlags);

    clonedRenderer.generator.velocityOverLifetime.offset.set(2, 0, 0);

    expect(clonedRenderer._isContainDirtyFlag(generatorBoundsFlag)).to.eq(true);
  });
});
