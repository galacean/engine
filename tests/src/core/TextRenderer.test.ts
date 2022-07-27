import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { TextRenderer } from "@oasis-engine/core";
import { expect } from "chai";

describe("TextRenderer", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const rootEntity = scene.getRootEntity();
    const textRenderer = rootEntity.addComponent(TextRenderer);

    expect(textRenderer instanceof TextRenderer).to.eq(true);
    expect(textRenderer.text == "").to.eq(true);
    expect(textRenderer.fontSize).to.eq(24);
    expect(textRenderer.lineSpacing).to.eq(0);
    expect(textRenderer.enableWrapping).to.eq(false);
  });

  it("set text", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.text = "hello world";
    expect(textRenderer.text).to.eq("hello world");
  });

  it("set fontSize", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.fontSize = 30;
    expect(textRenderer.fontSize).to.eq(30);
  });

  it("set lineSpacing", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.lineSpacing = 1;
    expect(textRenderer.lineSpacing).to.eq(1);
  });

  it("set enableWrapping", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.enableWrapping = true;
    expect(textRenderer.enableWrapping).to.eq(true);
  });
});

