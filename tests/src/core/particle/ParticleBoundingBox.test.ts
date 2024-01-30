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
  ParticleCurveMode
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { LitePhysics } from "@galacean/engine-physics-lite";

import { expect } from "chai";

const delta = 0.2;

function expectObjectToBeCloseTo(actual, expected, delta) {
  Object.keys(expected).forEach((key) => {
    expect(actual[key]).to.be.closeTo(expected[key], delta);
  });
}

describe("ParticleBoundingBox", () => {
  let particleRenderer: ParticleRenderer;
  let entity: Entity;

  before(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new LitePhysics() });
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

  beforeEach(() => {
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

  it("EmptyShape", () => {
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.414, y: -1.414, z: -26.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 1.414, y: 1.414, z: 1.414 }, delta);
  });

  it("BoxShape", () => {
    const shape = new BoxShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that box shape works correctly on boundingBox
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.914, y: -1.914, z: -26.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 1.914, y: 1.914, z: 1.914 }, delta);

    // Test that size works correctly on boundingBox
    shape.size.set(1, 2, 4);
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.914, y: -2.414, z: -28.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 1.914, y: 2.414, z: 3.414 }, delta);

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -14.414, y: -14.914, z: -28.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 14.414, y: 14.914, z: 15.914 }, delta);
  });

  it("SphereShape", () => {
    const shape = new SphereShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that sphere shape works correctly on boundingBox
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -27.414, y: -27.414, z: -27.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 27.414, y: 27.414, z: 27.414 }, delta);

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 28.914 }, delta);

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 28.914 }, delta);
  });

  it("HemisphereShape", () => {
    const shape = new HemisphereShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that hemisphere shape works correctly on boundingBox
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -27.414, y: -27.414, z: -27.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 27.414, y: 27.414, z: 1.414 }, delta);

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 1.414 }, delta);

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 28.914 }, delta);
  });

  it("CircleShape", () => {
    const shape = new CircleShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that circle shape works correctly on boundingBox
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -27.414, y: -27.414, z: -2.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 27.414, y: 27.414, z: 2.414 }, delta);

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 3.914 }, delta);

    // Test that arc works correctly on boundingBox
    shape.arc = 45;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -3.914, y: -3.914, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 21.59, z: 3.914 }, delta);

    shape.arc = 135;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -21.59, y: -3.914, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 3.914 }, delta);

    shape.arc = 225;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -21.59, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 3.914 }, delta);

    shape.arc = 315;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 3.914 }, delta);

    // Test that arc mode loop works correctly on boundingBox
    shape.arcMode = ParticleShapeArcMode.Loop;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -3.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 3.914 }, delta);

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -28.914, y: -28.914, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 28.914, y: 28.914, z: 28.914 }, delta);
  });

  it("ConeShape", () => {
    const shape = new ConeShape();
    particleRenderer.generator.emission.shape = shape;

    // Test that cone shape works correctly on boundingBox
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -12.979, y: -12.979, z: -27.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 12.979, y: 12.979, z: 1.414 }, delta);

    // Test that radius works correctly on boundingBox
    shape.radius = 2.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -14.479, y: -14.479, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 14.479, y: 14.479, z: 1.414 }, delta);

    // Test that angle works correctly on boundingBox
    shape.angle = 30;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -16.414, y: -16.414, z: -28.914 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 16.414, y: 16.414, z: 1.414 }, delta);

    // Test that arc mode loop works correctly on boundingBox
    shape.emitType = ConeEmitType.Volume;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -18.914, y: -18.914, z: -31.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 18.914, y: 18.914, z: 1.414 }, delta);

    // Test that arc mode loop works correctly on boundingBox
    shape.length = 10;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -21.414, y: -21.414, z: -36.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 21.414, y: 21.414, z: 1.414 }, delta);

    // Test that randomDirectionAmount works correctly on boundingBox
    shape.randomDirectionAmount = 0.5;
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -33.914, y: -33.914, z: -36.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 33.914, y: 33.914, z: 26.414 }, delta);
  });

  it("Transform", () => {
    entity.transform.position.set(1, 2, 3);
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -0.414, y: 0.586, z: -23.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 2.414, y: 3.414, z: 4.414 }, delta);

    entity.transform.scale.set(1, 2, 3);
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -0.414, y: -0.827, z: -76.242 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 2.414, y: 4.828, z: 7.242 }, delta);

    entity.transform.rotation.set(30, 60, 120);
    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -60.445, y: -2.406, z: -34.0 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 6.195, y: 43.9, z: 7.523 }, delta);
  });

  it("StartSpeed", () => {
    particleRenderer.generator.main.startSpeed.mode = ParticleCurveMode.TwoConstants;
    particleRenderer.generator.main.startSpeed.constantMin = -10;
    particleRenderer.generator.main.startSpeed.constantMax = 2;

    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.414, y: -1.414, z: -11.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 1.414, y: 1.414, z: 51.414 }, delta);
  });

  it("Gravity", () => {
    particleRenderer.generator.main.gravityModifier.mode = ParticleCurveMode.TwoConstants;
    particleRenderer.generator.main.gravityModifier.constantMin = -10;
    particleRenderer.generator.main.gravityModifier.constantMax = 2;

    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.414, y: -243.836, z: -26.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 1.414, y: 1224.836, z: 1.414 }, delta);
  });

  it("VelocityOverLifetime", () => {
    const velocityOverLifetime = particleRenderer.generator.velocityOverLifetime;
    const { velocityX, velocityY, velocityZ } = velocityOverLifetime;
    velocityOverLifetime.enabled = true;
    velocityX.constant = 10;
    velocityY.constant = 10;
    velocityZ.mode = ParticleCurveMode.TwoConstants;
    velocityZ.constantMin = -10;
    velocityZ.constantMax = 2;

    expectObjectToBeCloseTo(particleRenderer.bounds.min, { x: -1.414, y: -1.414, z: -76.414 }, delta);
    expectObjectToBeCloseTo(particleRenderer.bounds.max, { x: 51.414, y: 51.414, z: 11.414 }, delta);
  });
});
