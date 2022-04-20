// @ts-nocheck
import { WebGLEngine } from "../../rhi-webgl/src/WebGLEngine";
import { TextRenderer } from "../src/index";

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

    expect(textRenderer instanceof TextRenderer).toEqual(true);
    expect(textRenderer.text == "").toEqual(true);
    expect(textRenderer.fontSize).toEqual(24);
    expect(textRenderer.lineSpacing).toEqual(0);
    expect(textRenderer.enableWrapping).toEqual(false);
  });

  it("set text", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.text = "hello world";
    expect(textRenderer.text).toEqual("hello world");
  });

  it("set fontSize", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.fontSize = 30;
    expect(textRenderer.fontSize).toEqual(30);
  });

  it("set lineSpacing", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.lineSpacing = 1;
    expect(textRenderer.lineSpacing).toEqual(1);
  });

  it("set enableWrapping", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.enableWrapping = true;
    expect(textRenderer.enableWrapping).toEqual(true);
  });
});

