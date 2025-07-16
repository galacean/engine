import {
  ParticleRenderer,
  BoxShape,
  ParticleMaterial,
  Camera,
  SphereShape,
  HemisphereShape,
  CircleShape,
  ConeShape,
  ParticleShapeArcMode,
  ConeEmitType,
  Entity,
  ParticleCurveMode,
  Engine,
  ParticleStopMode
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

const delta = 0.2;

function expectObjectToBeCloseTo(actual, expected, delta) {
  Object.keys(expected).forEach((key) => {
    expect(actual[key]).to.be.closeTo(expected[key], delta);
  });
}

export const updateEngine = (engine: Engine, deltaTime = 100) => {
  //@ts-ignore
  engine.vSyncCount = Infinity;
  //@ts-ignore
  engine.time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < 50; ++i) {
    engine.update();
  }
};

function testParticleRendererBounds(
  engine: Engine,
  render: ParticleRenderer,
  expectedMinBounds: { x: number; y: number; z: number },
  expectedMaxBounds: { x: number; y: number; z: number },
  delta: number
) {
  render.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  render.generator.play();
  updateEngine(engine);
  expectObjectToBeCloseTo(render.bounds.min, expectedMinBounds, delta);
  expectObjectToBeCloseTo(render.bounds.max, expectedMaxBounds, delta);
}

describe("ParticleBoundingBox", function () {
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
    entity.transform.position.set(0, 0, 0);
    entity.transform.rotation.set(0, 0, 0);
    entity.transform.scale.set(1, 1, 1);

    particleRenderer.generator.main.startSpeed.mode = ParticleCurveMode.Constant;
    particleRenderer.generator.main.startSpeed.constant = 5;

    particleRenderer.generator.main.gravityModifier.mode = ParticleCurveMode.Constant;
    particleRenderer.generator.main.gravityModifier.constant = 0;

    particleRenderer.generator.velocityOverLifetime.enabled = false;

    particleRenderer.generator.emission.shape = null;
  });

  it("EmptyShape", function () {
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.414, y: -1.414, z: -26.414 },
      { x: 1.414, y: 1.414, z: 1.414 },
      delta
    );
  });

  it("BoxShape", function () {
    const shape = new BoxShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that box shape works correctly on boundingBox
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.914, y: -1.914, z: -26.914 },
      { x: 1.914, y: 1.914, z: 1.914 },
      delta
    );

    // Test that size works correctly on boundingBox
    shape.size.set(1, 2, 4);
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.914, y: -2.414, z: -28.414 },
      { x: 1.914, y: 2.414, z: 3.414 },
      delta
    );

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -26.914, y: -27.414, z: -28.414 },
      { x: 26.914, y: 27.414, z: 3.414 },
      delta
    );
  });

  it("SphereShape", function () {
    const shape = new SphereShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that sphere shape works correctly on boundingBox
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -27.414, y: -27.414, z: -27.414 },
      { x: 27.414, y: 27.414, z: 27.414 },
      delta
    );

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -28.914 },
      { x: 28.914, y: 28.914, z: 28.914 },
      delta
    );

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -28.914 },
      { x: 28.914, y: 28.914, z: 28.914 },
      delta
    );
  });

  it("HemisphereShape", function () {
    const shape = new HemisphereShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that hemisphere shape works correctly on boundingBox
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -27.414, y: -27.414, z: -27.414 },
      { x: 27.414, y: 27.414, z: 1.414 },
      delta
    );

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -28.914 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -28.914 },
      { x: 28.914, y: 28.914, z: 19.092 },
      delta
    );
  });

  it("CircleShape", function () {
    const shape = new CircleShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that circle shape works correctly on boundingBox
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -27.414, y: -27.414, z: -1.414 },
      { x: 27.414, y: 27.414, z: 1.414 },
      delta
    );

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -1.414 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    // Test that arc works correctly on boundingBox
    shape.arc = 45;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.414, y: -1.414, z: -1.414 },
      { x: 28.914, y: 20.859, z: 1.414 },
      delta
    );

    shape.arc = 135;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -20.859, y: -1.414, z: -1.414 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    shape.arc = 225;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -20.859, z: -1.414 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    shape.arc = 315;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -1.414 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    // Test that arc mode loop works correctly on boundingBox
    shape.arcMode = ParticleShapeArcMode.Loop;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -1.414 },
      { x: 28.914, y: 28.914, z: 1.414 },
      delta
    );

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -28.914, y: -28.914, z: -26.414 },
      { x: 28.914, y: 28.914, z: 26.414 },
      delta
    );
  });

  it("ConeShape", function () {
    const shape = new ConeShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that cone shape works correctly on boundingBox
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -12.979, y: -12.979, z: -26.414 },
      { x: 12.979, y: 12.979, z: 1.414 },
      delta
    );

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -14.479, y: -14.479, z: -26.414 },
      { x: 14.479, y: 14.479, z: 1.414 },
      delta
    );

    // Test that angle works correctly on boundingBox
    shape.angle = 30;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -16.414, y: -16.414, z: -26.414 },
      { x: 16.414, y: 16.414, z: 1.414 },
      delta
    );

    // Test that arc mode loop works correctly on boundingBox
    shape.emitType = ConeEmitType.Volume;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -18.4, y: -18.4, z: -31.414 },
      { x: 18.4, y: 18.4, z: 1.414 },
      delta
    );

    // Test that arc mode loop works correctly on boundingBox
    shape.length = 10;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -20.9, y: -20.9, z: -36.414 },
      { x: 20.9, y: 20.9, z: 1.414 },
      delta
    );

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -29.478, y: -29.478, z: -36.414 },
      { x: 29.478, y: 29.478, z: 1.414 },
      delta
    );
  });

  it("StartSpeed", function () {
    particleRenderer.generator.main.startSpeed.mode = ParticleCurveMode.TwoConstants;
    particleRenderer.generator.main.startSpeed.constantMin = -10;
    particleRenderer.generator.main.startSpeed.constantMax = 2;

    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.414, y: -1.414, z: -11.414 },
      { x: 1.414, y: 1.414, z: 51.414 },
      delta
    );
  });

  it("Gravity", function () {
    particleRenderer.generator.main.gravityModifier.mode = ParticleCurveMode.TwoConstants;
    particleRenderer.generator.main.gravityModifier.constantMin = -1;
    particleRenderer.generator.main.gravityModifier.constantMax = 0.2;

    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.414, y: -25.939, z: -26.414 },
      { x: 1.414, y: 124.039, z: 1.414 },
      delta
    );
  });

  it("VelocityOverLifetime", function () {
    particleRenderer.generator.main.startSpeed.mode = ParticleCurveMode.Constant;
    particleRenderer.generator.main.startSpeed.constant = 0;

    const velocityOverLifetime = particleRenderer.generator.velocityOverLifetime;
    const { velocityX, velocityY, velocityZ } = velocityOverLifetime;
    velocityOverLifetime.enabled = true;
    velocityX.constant = 1;
    velocityY.constant = 1;
    velocityZ.mode = ParticleCurveMode.TwoConstants;
    velocityZ.constantMin = -1;
    velocityZ.constantMax = 0.5;

    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -1.414, y: -1.414, z: -6.414 },
      { x: 6.414, y: 6.414, z: 3.914 },
      delta
    );
  });

  it("Transform", function () {
    entity.transform.position.set(1, 2, 3);
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -0.414, y: 0.586, z: -23.414 },
      { x: 2.414, y: 3.414, z: 4.414 },
      delta
    );

    entity.transform.rotation.set(30, 60, 120);
    testParticleRendererBounds(
      engine,
      particleRenderer,
      { x: -19.906, y: -0.3798, z: -10.239 },
      { x: 3.156, y: 16.88, z: 5.414 },
      delta
    );
  });
});
