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
  CurveKey,
  ShaderMacro,
  ShaderProperty
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("LimitVelocityOverLifetimeModule", function () {
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

    const vol = particleRenderer.generator.velocityOverLifetime;
    vol.enabled = false;
    vol.orbitalX = new ParticleCompositeCurve(0);
    vol.orbitalY = new ParticleCompositeCurve(0);
    vol.orbitalZ = new ParticleCompositeCurve(0);
    vol.radial = new ParticleCompositeCurve(0);
    vol.offset = new Vector3(0, 0, 0);
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

  it("velocity over lifetime orbital/radial default values", function () {
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

  it("velocity over lifetime orbital/radial pull in transform feedback when active", function () {
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

  it("velocity over lifetime orbital/radial constants upload shader data", function () {
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

  it("velocity over lifetime orbital/radial two constants upload min/max shader data", function () {
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
    const orbitalMax = particleRenderer.shaderData.getVector3(ShaderProperty.getByName("renderer_VOLOrbitalConst"));
    expect(orbitalMin.x).to.eq(-1);
    expect(orbitalMin.y).to.eq(-2);
    expect(orbitalMin.z).to.eq(-3);
    expect(orbitalMax.x).to.eq(1);
    expect(orbitalMax.y).to.eq(2);
    expect(orbitalMax.z).to.eq(3);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialMinConst"))).to.eq(4);
    expect(particleRenderer.shaderData.getFloat(ShaderProperty.getByName("renderer_VOLRadialConst"))).to.eq(5);
  });

  it("velocity over lifetime orbital/radial two curves upload min/max shader data", function () {
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
      ShaderProperty.getByName("renderer_VOLOrbitalCurveY")
    );
    const radialMin = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLRadialMinCurve"));
    const radialMax = particleRenderer.shaderData.getFloatArray(ShaderProperty.getByName("renderer_VOLRadialCurve"));

    expect(Array.from(orbitalMinY.slice(0, 4))).to.deep.eq([0, -1, 1, -2]);
    expect(Array.from(orbitalMaxY.slice(0, 4))).to.deep.eq([0, 1, 1, 2]);
    expect(Array.from(radialMin.slice(0, 4))).to.deep.eq([0, 3, 1, 4]);
    expect(Array.from(radialMax.slice(0, 4))).to.deep.eq([0, 5, 1, 6]);
  });

  it("velocity over lifetime orbital mixed axis modes do not use curve shader path", function () {
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

  it("velocity over lifetime clone preserves orbital/radial/offset", function () {
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

  it("velocity over lifetime offset component changes dirty bounds after clone", function () {
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
