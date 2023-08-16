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
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 0);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 10));

    textRendererEntity = rootEntity.createChild("TextRenderer");
    textRenderer = textRendererEntity.addComponent(TextRenderer);

    engine.run();
  });

  it("color", () => {
    // Test that return default color.
    expect(textRenderer.color).to.be.deep.include({ r: 1, g: 1, b: 1, a: 1 });

    // Test that set color works correctly.
    const newColor = new Color(0.54, 0.33, 0.72, 0.81);
    textRenderer.color = newColor;
    expect(textRenderer.color).to.be.deep.include({ r: 0.54, g: 0.33, b: 0.72, a: 0.81 });
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

    // Test that font reference count decrease, while set font to null.
    textRenderer.font = newFont;
    expect(newFont2.refCount).to.be.equal(newFontReferCount);
  });

  it("enableWrapping", () => {
    // Test that return default enable wrapping.
    expect(textRenderer.enableWrapping).to.be.equal(false);

    // Test that set enable wrapping works correctly.
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
    const width = 0.2;
    textRenderer.width = width;
    expect(textRenderer.width).to.be.equal(width);
  });

  it("height", () => {
    // Test that return default height.
    expect(textRenderer.height).to.be.equal(0);

    // Test that set height works correctly.
    const height = 1;
    textRenderer.height = height;
    expect(textRenderer.height).to.be.equal(height);
  });

  it("fontSize", () => {
    // Test that return default font size.
    expect(textRenderer.fontSize).to.be.equal(24);

    // Test that set font size works correctly.
    const fontSize = 30;
    textRenderer.fontSize = fontSize;
    expect(textRenderer.fontSize).to.be.equal(fontSize);
  });

  it("fontStyle", () => {
    // Test that return default font style.
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.None);

    // Test that set font style works correctly.
    textRenderer.fontStyle = FontStyle.Bold;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Bold);

    textRenderer.fontStyle = FontStyle.Italic;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Italic);

    // Test that font style is equal to the sum of FontStyle.Bold and FontStyle.Italic.
    textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic;
    expect(textRenderer.fontStyle).to.be.equal(FontStyle.Bold | FontStyle.Italic);
  });

  it("lineSpacing", () => {
    // Test that return default line spacing.
    expect(textRenderer.lineSpacing).to.be.equal(0);

    // Test that set line spacing works correctly.
    const lineSpacing = 10;
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
    textRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(textRenderer.maskInteraction).to.be.equal(SpriteMaskInteraction.VisibleOutsideMask);

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

    const text1 = "阳光明媚，the weather is great today。";
    const text2 = "😢😭🥹🥲";
    const text3 = '<color="#ff00ff">\n\r\t\t\n\r</color>';
    const text4 = "趚喥嘟説孒汾掱湜徳荖dj";

    // Test that set text works correctly.
    textRenderer.text = text1;
    expect(textRenderer.text).to.be.equal(text1);
    textRenderer.text = text2;
    expect(textRenderer.text).to.be.equal(text2);
    textRenderer.text = text3;
    expect(textRenderer.text).to.be.equal(text3);
    textRenderer.text = text4;
    expect(textRenderer.text).to.be.equal(text4);
  });

  it("bounds", () => {
    textRenderer.fontSize = 24;
    textRenderer.font = rootEntity.engine["_textDefaultFont"];
    textRenderer.fontStyle = FontStyle.None;
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

    // Test that bounds is correct, while verticalAlignment is top and horizontalAlignment is left.
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

    // Test that bounds is correct, while verticalAlignment is top and horizontalAlignment is right.
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

    // Test that bounds is correct, while verticalAlignment is bottom and horizontalAlignment is right.
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
    expect(() => renderer.destroy()).not.to.throw("TextRenderer destroy error.");
  });

  after(() => {
    engine.destroy();
  });
});
