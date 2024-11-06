import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Camera, Font, TextRenderer, Entity } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, expect, it, afterAll } from "vitest";

describe("Font", function () {
  let engine: WebGLEngine;
  let textRendererEntity: Entity;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.canvas.resizeByClientSize();

    const rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
    const camera = rootEntity.addComponent(Camera);
    rootEntity.transform.setPosition(0, 0, 10);
    rootEntity.transform.lookAt(new Vector3(0, 0, 0));

    textRendererEntity = rootEntity.createChild("TextRenderer");
    textRendererEntity.addComponent(TextRenderer);

    engine.run();
  });

  it("Font constructor", () => {
    // Test that Font constructor works correctly.
    expect(() => {
      new Font(engine, "TestFont");
      new Font(engine);
      new Font(engine, undefined);
    }).not.to.throw();
  });

  it("Font createFromOS", () => {
    // Test that createFromOS returns null, while the name is empty string or undefined.
    expect(Font.createFromOS(engine, "")).to.be.null;
    expect(Font.createFromOS(engine, undefined)).to.be.null;

    const sysFont = Font.createFromOS(engine, "Arial");
    const sysFont2 = Font.createFromOS(engine, "Arial Black");
    const sysFont3 = Font.createFromOS(engine, "Rockwell");

    // Test that fonts are same object, while call createFromOS with same parameter.
    expect(Font.createFromOS(engine, "Arial")).to.be.eq(sysFont);
    expect(Font.createFromOS(engine, "Arial Black")).to.be.eq(sysFont2);
    expect(Font.createFromOS(engine, "Rockwell")).to.be.eq(sysFont3);

    // Test font name is right.
    expect(sysFont.name).to.eq("Arial");
    expect(sysFont2.name).to.eq("Arial Black");
    expect(sysFont3.name).to.eq("Rockwell");
  });

  it("Destroy font", () => {
    // Test that destroy a font works correctly.
    expect(textRendererEntity.destroy()).not.to.throw;
  });

  afterAll(() => {
    engine.destroy();
  });
});
