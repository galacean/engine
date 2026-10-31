import { WebGLEngine } from "@galacean/engine";
import { TextRenderer } from "@galacean/engine-core";
import { describe, it, expect, beforeEach } from "vitest";

describe("TextRenderer", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
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

  it("emoji", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");

    const textRenderer1 = textEntity.addComponent(TextRenderer);
    textRenderer1.text = "͞**͟";
    const textRenderer2 = textEntity.addComponent(TextRenderer);
    textRenderer2.text = "😋月😜狮😝😋🌹❤️😘🎉🤪😍🎊🎵🇧🇸";
    const textRenderer3 = textEntity.addComponent(TextRenderer);
    textRenderer3.text = "️我们" + "️" + "hello";
    const textRenderer4 = textEntity.addComponent(TextRenderer);
    textRenderer4.text = "Ajkq趚喥嘟説孒汾掱湜徳弗里凘諴萉\n汸荖djp溮哋看琺湜獨竝房簡湜汏琺溮哋汸鉽哋汸";
  });

  it("wrap", () => {
    const rootEntity = scene.getRootEntity();
    const textEntity = rootEntity.createChild("text");

    const textRenderer1 = textEntity.addComponent(TextRenderer);
    textRenderer1.width = 2;
    textRenderer1.height = 3;
    textRenderer1.enableWrapping = true;
    textRenderer1.text = "helloworld dfd                       dlfgds    dd df\n    ds f";
    const textRenderer2 = textEntity.addComponent(TextRenderer);
    textRenderer2.width = 2;
    textRenderer2.height = 3;
    textRenderer2.enableWrapping = true;
    textRenderer2.text = "a a a a a a a a a b    a    a";
    const textRenderer3 = textEntity.addComponent(TextRenderer);
    textRenderer3.width = 2;
    textRenderer3.height = 3;
    textRenderer3.enableWrapping = true;
    textRenderer3.text = "hello world\nddl\nsdfjdslfsdfdssdfsdf";
  });
});
