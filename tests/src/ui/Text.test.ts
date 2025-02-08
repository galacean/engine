import { WebGLEngine } from "@galacean/engine";
import { Text, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("Text", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const label = canvasEntity.addComponent(Text);

  it("Constructor", () => {
    expect(label instanceof Text).to.eq(true);
    expect(label.text == "").to.eq(true);
    expect(label.fontSize).to.eq(24);
    expect(label.lineSpacing).to.eq(0);
    expect(label.enableWrapping).to.eq(false);
  });

  it("set text", () => {
    label.text = "hello world";
    expect(label.text).to.eq("hello world");
  });

  it("set fontSize", () => {
    label.fontSize = 30;
    expect(label.fontSize).to.eq(30);
  });

  it("set lineSpacing", () => {
    label.lineSpacing = 1;
    expect(label.lineSpacing).to.eq(1);
  });

  it("set enableWrapping", () => {
    label.enableWrapping = true;
    expect(label.enableWrapping).to.eq(true);
  });

  it("get bounds", () => {
    const textWithoutCanvas = root.addComponent(Text);
    textWithoutCanvas.text = "hello world";
    const bounds = textWithoutCanvas.bounds;
    expect(bounds.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(bounds.max).to.deep.include({ x: 50, y: 50, z: 0 });

    const labelBounds = label.bounds;
    expect(labelBounds.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(labelBounds.max).to.deep.include({ x: 50, y: 50, z: 0 });
    label.text = "hello world";
    const labelBounds2 = label.bounds;
    expect(labelBounds2.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(labelBounds2.max).to.deep.include({ x: 50, y: 50, z: 0 });
    (<UITransform>label.entity.transform).size.x = 200;
    const labelBounds3 = label.bounds;
    expect(labelBounds3.min).to.deep.include({ x: -100, y: -50, z: 0 });
    expect(labelBounds3.max).to.deep.include({ x: 100, y: 50, z: 0 });
  });

  it("emoji", () => {
    const textEntity = canvasEntity.createChild("text");

    const label1 = textEntity.addComponent(Text);
    label1.text = "͞**͟";
    const label2 = textEntity.addComponent(Text);
    label2.text = "😋月😜狮😝😋🌹❤️😘🎉🤪😍🎊🎵🇧🇸";
    const label3 = textEntity.addComponent(Text);
    label3.text = "️我们" + "️" + "hello";
    const label4 = textEntity.addComponent(Text);
    label4.text = "Ajkq趚喥嘟説孒汾掱湜徳弗里凘諴萉\n汸荖djp溮哋看琺湜獨竝房簡湜汏琺溮哋汸鉽哋汸";
  });

  it("wrap", () => {
    const textEntity = canvasEntity.createChild("text");

    const label1 = textEntity.addComponent(Text);
    const transform1 = <UITransform>label1.entity.transform;
    const size1 = transform1.size;
    size1.x = 2;
    size1.y = 3;
    label1.enableWrapping = true;
    label1.text = "helloworld dfd                       dlfgds    dd df\n    ds f";
    const label2 = textEntity.addComponent(Text);
    const transform2 = <UITransform>label2.entity.transform;
    const size2 = transform2.size;
    size2.x = 2;
    size2.y = 3;
    label2.enableWrapping = true;
    label2.text = "a a a a a a a a a b    a    a";
    const label3 = textEntity.addComponent(Text);
    const transform3 = <UITransform>label3.entity.transform;
    const size3 = transform3.size;
    size3.x = 2;
    size3.y = 3;
    label3.enableWrapping = true;
    label3.text = "hello world\nddl\nsdfjdslfsdfdssdfsdf";
  });
});
