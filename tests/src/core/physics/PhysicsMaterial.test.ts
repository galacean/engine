import { PhysicsMaterial, PhysicsMaterialCombineMode } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("PhysicsMaterial", () => {
  let material: PhysicsMaterial;

  before(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.run();

    material = new PhysicsMaterial();
  });

  it("test bounciness", () => {
    // Test that set bounciness will change the value of bounciness.
    let bounciness = material.bounciness;
    material.bounciness = bounciness;
    expect(material.bounciness).to.eq(bounciness);

    bounciness = 1;
    material.bounciness = bounciness;
    expect(material.bounciness).to.eq(bounciness);

    bounciness = -1;
    material.bounciness = bounciness;
    expect(material.bounciness).to.eq(bounciness);
  });

  it("test dynamicFriction", () => {
    // Test that set dynamicFriction will change the value of dynamicFriction.
    let dynamicFriction = material.dynamicFriction;
    material.dynamicFriction = dynamicFriction;
    expect(material.dynamicFriction).to.eq(dynamicFriction);

    dynamicFriction = 1;
    material.dynamicFriction = dynamicFriction;
    expect(material.dynamicFriction).to.eq(dynamicFriction);

    dynamicFriction = -1;
    material.dynamicFriction = dynamicFriction;
    expect(material.dynamicFriction).to.eq(dynamicFriction);
  });

  it("test staticFriction", () => {
    // Test that set staticFriction will change the value of staticFriction.
    let staticFriction = material.staticFriction;
    material.staticFriction = staticFriction;
    expect(material.staticFriction).to.eq(staticFriction);

    staticFriction = 1;
    material.staticFriction = staticFriction;
    expect(material.staticFriction).to.eq(staticFriction);

    staticFriction = -1;
    material.staticFriction = staticFriction;
    expect(material.staticFriction).to.eq(staticFriction);
  });

  it("test bounceCombine", () => {
    // Test that set bounceCombine will change the value of bounceCombine.
    let bounceCombine = PhysicsMaterialCombineMode.Average;
    material.bounceCombine = bounceCombine;
    expect(material.bounceCombine).to.be.eq(bounceCombine);

    bounceCombine = PhysicsMaterialCombineMode.Minimum;
    material.bounceCombine = bounceCombine;
    expect(material.bounceCombine).to.be.eq(bounceCombine);

    bounceCombine = PhysicsMaterialCombineMode.Multiply;
    material.bounceCombine = bounceCombine;
    expect(material.bounceCombine).to.be.eq(bounceCombine);

    bounceCombine = PhysicsMaterialCombineMode.Maximum;
    material.bounceCombine = bounceCombine;
    expect(material.bounceCombine).to.be.eq(bounceCombine);
  });

  it("test frictionCombine", () => {
    // Test that set frictionCombine will change the value of frictionCombine.
    let frictionCombine = PhysicsMaterialCombineMode.Average;
    material.frictionCombine = frictionCombine;
    expect(material.frictionCombine).to.be.eq(frictionCombine);

    frictionCombine = PhysicsMaterialCombineMode.Minimum;
    material.frictionCombine = frictionCombine;
    expect(material.frictionCombine).to.be.eq(frictionCombine);

    frictionCombine = PhysicsMaterialCombineMode.Multiply;
    material.frictionCombine = frictionCombine;
    expect(material.frictionCombine).to.be.eq(frictionCombine);

    frictionCombine = PhysicsMaterialCombineMode.Maximum;
    material.frictionCombine = frictionCombine;
    expect(material.frictionCombine).to.be.eq(frictionCombine);
  });
});
