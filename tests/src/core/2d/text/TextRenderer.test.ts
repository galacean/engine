import { expect } from "chai";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import {
  TextRenderer,
  Entity,
  Camera,
  Font,
  FontStyle,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  OverflowMode,
  SpriteMaskInteraction,
  SpriteMaskLayer
} from "@galacean/engine-core";
import { BoundingBox, Color, Vector3 } from "@galacean/engine-math";

describe("TextRenderer", () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let textRendererEntity: Entity;
  let textRenderer: TextRenderer;

  before(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });
    engine.canvas.resizeByClientSize();

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");

    const cameraEntity = rootEntity.createChild("Camera");
    const camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 0);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 10));

    textRendererEntity = rootEntity.createChild("TextRenderer");
    textRenderer = textRendererEntity.addComponent(TextRenderer);

    engine.run();
  });

  it("color", () => {
    // Test that return default color.
    expect(textRenderer.color).to.be.deep.equal(new Color(1, 1, 1, 1));

    // Test that set color works correctly.
    const newColor = textRenderer.color;
    newColor.r = 0;
    newColor.b = 0;
    textRenderer.color = newColor;
    expect(textRenderer.color).to.be.deep.equal(newColor);

    const newColor2 = new Color(1, 1, 1, 1);
    textRenderer.color = newColor2;
    expect(textRenderer.color).to.be.deep.equal(newColor2);

    const newColor3 = new Color(0.54, 0.33, 0.72, 0.81);
    textRenderer.color = newColor3;
    expect(textRenderer.color).to.be.deep.equal(newColor3);
  });

  it("font", () => {
    // Test that return default font.
    expect(textRenderer.font).to.be.equal(rootEntity.engine["_textDefaultFont"]);
    // Test that set font works correctly.
    const newFont = new Font(rootEntity.engine, "Arial");
    textRenderer.font = newFont;
    expect(textRenderer.font).to.be.equal(newFont);

    // Test that font reference count changed, while set font.
    const newFont2 = new Font(rootEntity.engine, "Arial Black");
    const newFontReferCount = newFont2.refCount;
    textRenderer.font = newFont2;
    expect(newFont2.refCount).to.be.equal(newFontReferCount + 1);

    // Test that font reference count is not changed, while set font twice with same font.
    textRenderer.font = newFont2;
    expect(newFont2.refCount).to.be.equal(newFontReferCount + 1);

    // Test that font reference count is not changed, while set font to null.
    // Note: If set font to null or undefined, engine will be blocked and throw error.
    // textRenderer.font = null;
    // expect(newFont2.refCount).to.be.equal(newFontReferCount);
  });

  it("enableWrapping", () => {
    // Test that return default enable wrapping.
    expect(textRenderer.enableWrapping).to.be.equal(false);

    // Test that set enable wrapping works correctly.
    const enableWrapping = textRenderer.enableWrapping;
    textRenderer.enableWrapping = enableWrapping;
    expect(textRenderer.enableWrapping).to.be.equal(enableWrapping);

    textRenderer.enableWrapping = true;
    expect(textRenderer.enableWrapping).to.be.equal(true);
  });

  it("overflowMode", () => {
    // Test that return default overflow mode.
    expect(textRenderer.overflowMode).to.be.equal(OverflowMode.Overflow);

    // Test that set overflow mode works correctly.
    textRenderer.overflowMode = OverflowMode.Truncate;
    expect(textRenderer.overflowMode).to.be.equal(OverflowMode.Truncate);
  });

  it("width", () => {
    // Test that return default width.
    expect(textRenderer.width).to.be.equal(0);

    // Test that set width works correctly.
    let width = textRenderer.width;
    textRenderer.width = width;
    expect(textRenderer.width).to.be.equal(width);

    width = 0.2;
    textRenderer.width = width;
    expect(textRenderer.width).to.be.equal(width);
  });

  it("height", () => {
    // Test that return default height.
    expect(textRenderer.height).to.be.equal(0);

    // Test that set height works correctly.
    let height = textRenderer.height;
    textRenderer.height = height;
    expect(textRenderer.height).to.be.equal(height);

    height = 1;
    textRenderer.height = height;
    expect(textRenderer.height).to.be.equal(height);
  });

  it("fontSize", () => {
    // Test that return default font size.
    expect(textRenderer.fontSize).to.be.equal(24);

    // Test that set font size works correctly.
    let fontSize = textRenderer.fontSize;
    textRenderer.fontSize = fontSize;
    expect(textRenderer.fontSize).to.be.equal(fontSize);

    fontSize = 30;
    textRenderer.fontSize = fontSize;
    expect(textRenderer.fontSize).to.be.equal(fontSize);
  });

  it("fontStyle", () => {
    // Test that return default font style.
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.None);

    // Test that set font style works correctly.
    const fontStyle = textRenderer.fontStyle;
    textRenderer.fontStyle = fontStyle;
    expect(textRenderer.fontStyle).to.be.equal(fontStyle);

    textRenderer.fontStyle = FontStyle.Bold;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Bold);

    textRenderer.fontStyle = FontStyle.Italic;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Italic);

    // Test that font style is equal to the sum of FontStyle.Bold and FontStyle.Italic.
    textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Bold | FontStyle.Italic);

    textRenderer.fontStyle = FontStyle.None;
  });

  it("lineSpacing", () => {
    // Test that return default line spacing.
    expect(textRenderer.lineSpacing).to.be.equal(0);

    // Test that set line spacing works correctly.
    let lineSpacing = textRenderer.lineSpacing;
    textRenderer.lineSpacing = lineSpacing;
    expect(textRenderer.lineSpacing).to.be.equal(lineSpacing);

    lineSpacing = 10;
    textRenderer.lineSpacing = lineSpacing;
    expect(textRenderer.lineSpacing).to.be.equal(lineSpacing);
  });

  it("horizontalAlignment", () => {
    // Test that return default horizontal alignment.
    expect(textRenderer.horizontalAlignment).to.be.equal(TextHorizontalAlignment.Center);

    // Test that set horizontal alignment works correctly.
    const hAlignment = textRenderer.horizontalAlignment;
    textRenderer.horizontalAlignment = hAlignment;
    expect(textRenderer.horizontalAlignment).to.be.equal(hAlignment);

    textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;
    expect(textRenderer.horizontalAlignment).to.be.equal(TextHorizontalAlignment.Left);

    textRenderer.horizontalAlignment = TextHorizontalAlignment.Right;
    expect(textRenderer.horizontalAlignment).to.be.equal(TextHorizontalAlignment.Right);
  });

  it("verticalAlignment", () => {
    // Test that return default vertical alignment.
    expect(textRenderer.verticalAlignment).to.be.equal(TextVerticalAlignment.Center);

    // Test that set vertical alignment works correctly.
    const vAlignment = textRenderer.verticalAlignment;
    textRenderer.verticalAlignment = vAlignment;
    expect(textRenderer.verticalAlignment).to.be.equal(vAlignment);

    textRenderer.verticalAlignment = TextVerticalAlignment.Top;
    expect(textRenderer.verticalAlignment).to.be.equal(TextVerticalAlignment.Top);

    textRenderer.verticalAlignment = TextVerticalAlignment.Bottom;
    expect(textRenderer.verticalAlignment).to.be.equal(TextVerticalAlignment.Bottom);
  });

  it("maskInteraction", () => {
    // Test that return default mask interaction.
    expect(textRenderer.maskInteraction).to.be.equal(SpriteMaskInteraction.None);

    // Test that set mask interaction works correctly.
    const maskInteraction = textRenderer.maskInteraction;
    textRenderer.maskInteraction = maskInteraction;
    expect(textRenderer.maskInteraction).to.be.equal(maskInteraction);

    textRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(textRenderer.maskInteraction).to.be.equal(SpriteMaskInteraction.VisibleInsideMask);
  });

  it("maskLayer", () => {
    // Test that return default mask layer.
    expect(textRenderer.maskLayer).to.be.equal(SpriteMaskLayer.Layer0);

    // Test that set mask layer works correctly.
    textRenderer.maskLayer = SpriteMaskLayer.Layer1;
    expect(textRenderer.maskLayer).to.be.equal(SpriteMaskLayer.Layer1);
  });

  it("text", () => {
    // Test that return default text.
    expect(textRenderer.text).to.be.equal("");

    const text1 = "今天天气很好，阳光明媚。我 在公园里 漫步。";
    const text2 = "The weather is great today.";
    const text3 = "阳光明媚，the weather is great today。";
    const text4 = "         \n       World";
    const text5 = "😢😭🥹🥲";
    const text6 = '<color="#ff00ff">\n\r\t\t\n\r</color>';
    const text7 = "趚喥嘟説孒汾掱湜徳弗里凘諴萉\n汸荖dj";

    // Test that set text works correctly.
    textRenderer.text = text1;
    expect(textRenderer.text).to.be.equal(text1);
    textRenderer.text = text2;
    expect(textRenderer.text).to.be.equal(text2);
    textRenderer.text = text3;
    expect(textRenderer.text).to.be.equal(text3);
    textRenderer.text = text4;
    expect(textRenderer.text).to.be.equal(text4);
    textRenderer.text = text5;
    expect(textRenderer.text).to.be.equal(text5);
    textRenderer.text = text6;
    expect(textRenderer.text).to.be.equal(text6);
    textRenderer.text = text7;
    expect(textRenderer.text).to.be.equal(text7);

    textRenderer.text = "";
    expect(textRenderer.text).to.be.equal("");
  });

  it("bounds", () => {
    textRenderer.fontSize = 24;
    textRenderer.font = rootEntity.engine["_textDefaultFont"];
    textRenderer.lineSpacing = 0;
    textRenderer.enableWrapping = true;
    textRenderer.overflowMode = OverflowMode.Truncate;
    textRenderer.horizontalAlignment = TextHorizontalAlignment.Center;
    textRenderer.verticalAlignment = TextVerticalAlignment.Center;
    textRenderer.text = "";

    // Test that bounds is zero, while text is empty string.
    let box = new BoundingBox(new Vector3(0, 0, 0), new Vector3(0, 0, 0));
    expect(textRenderer.bounds.min.x).to.be.equal(box.min.x);
    expect(textRenderer.bounds.min.y).to.be.equal(box.min.y);
    expect(textRenderer.bounds.min.z).to.be.equal(box.min.z);
    expect(textRenderer.bounds.max.x).to.be.equal(box.max.x);
    expect(textRenderer.bounds.max.y).to.be.equal(box.max.y);
    expect(textRenderer.bounds.max.z).to.be.equal(box.max.z);

    textRenderer.text = "The weather is great today.";
    textRenderer.width = 3;
    textRenderer.height = 3;

    textRenderer.verticalAlignment = TextVerticalAlignment.Top;
    textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;
    BoundingBox.transform(
      new BoundingBox(new Vector3(-1.5, 1.28, 0), new Vector3(1.39, 1.5, 0)),
      textRendererEntity.transform.worldMatrix,
      box
    );
    expect(textRenderer.bounds.min.x).to.be.closeTo(
      box.min.x,
      0.01,
      "Request textRenderer.bounds.min.x close to box.min.x"
    );
    expect(textRenderer.bounds.min.y).to.be.closeTo(
      box.min.y,
      0.01,
      "Request textRenderer.bounds.min.y close to box.min.y"
    );
    expect(textRenderer.bounds.min.z).to.be.closeTo(
      box.min.z,
      0.01,
      "Request textRenderer.bounds.min.z close to box.min.z"
    );
    expect(textRenderer.bounds.max.x).to.be.closeTo(
      box.max.x,
      0.01,
      "Request textRenderer.bounds.max.x close to box.max.x"
    );
    expect(textRenderer.bounds.max.y).to.be.closeTo(
      box.max.y,
      0.01,
      "Request textRenderer.bounds.max.y close to box.max.y"
    );
    expect(textRenderer.bounds.max.z).to.be.closeTo(
      box.max.z,
      0.01,
      "Request textRenderer.bounds.max.z close to box.max.z"
    );

    textRenderer.horizontalAlignment = TextHorizontalAlignment.Right;
    textRendererEntity.transform.setPosition(0, 1, 0);
    textRendererEntity.transform.setRotation(10, 3, 0);
    BoundingBox.transform(
      new BoundingBox(new Vector3(-1.39, 1.28, 0), new Vector3(1.5, 1.5, 0)),
      textRendererEntity.transform.worldMatrix,
      box
    );
    expect(textRenderer.bounds.min.x).to.be.closeTo(
      box.min.x,
      0.01,
      "Request textRenderer.bounds.min.x close to box.min.x"
    );
    expect(textRenderer.bounds.min.y).to.be.closeTo(
      box.min.y,
      0.01,
      "Request textRenderer.bounds.min.y close to box.min.y"
    );
    expect(textRenderer.bounds.min.z).to.be.closeTo(
      box.min.z,
      0.01,
      "Request textRenderer.bounds.min.z close to box.min.z"
    );
    expect(textRenderer.bounds.max.x).to.be.closeTo(
      box.max.x,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.x"
    );
    expect(textRenderer.bounds.max.y).to.be.closeTo(
      box.max.y,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.y"
    );
    expect(textRenderer.bounds.max.z).to.be.closeTo(
      box.max.z,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.z"
    );

    textRenderer.verticalAlignment = TextVerticalAlignment.Bottom;
    BoundingBox.transform(
      new BoundingBox(new Vector3(-1.39, 1.25, 0), new Vector3(1.5, 1.47, 0)),
      textRendererEntity.transform.worldMatrix,
      box
    );
    expect(textRenderer.bounds.min.x).to.be.closeTo(
      box.min.x,
      0.01,
      "Request textRenderer.bounds.min.x close to box.min.x"
    );
    expect(textRenderer.bounds.min.y).to.be.closeTo(
      box.min.y,
      0.01,
      "Request textRenderer.bounds.min.y close to box.min.y"
    );
    expect(textRenderer.bounds.min.z).to.be.closeTo(
      box.min.z,
      0.01,
      "Request textRenderer.bounds.min.z close to box.min.z"
    );
    expect(textRenderer.bounds.max.x).to.be.closeTo(
      box.max.x,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.x"
    );
    expect(textRenderer.bounds.max.y).to.be.closeTo(
      box.max.y,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.y"
    );
    expect(textRenderer.bounds.max.z).to.be.closeTo(
      box.max.z,
      0.01,
      "Request textRenderer.bounds.min.z close to box.max.z"
    );
  });

  it("clone", () => {
    // Test that clone works correctly.
    const entity2 = textRendererEntity.clone();
    entity2.parent = textRendererEntity.parent;
    entity2.name = "TextRenderer2";
    const renderer2 = entity2.getComponent(TextRenderer);
    expect(renderer2).not.to.be.undefined;
  });

  it("destroy", () => {
    // Test that destroy works correctly.
    let entity = rootEntity.findByName("TextRenderer2");
    let renderer = entity.getComponent(TextRenderer);

    // Test that renderer destroy correctly.
    renderer.destroy();
  });

  after(() => {
    engine.destroy();
  });
});
