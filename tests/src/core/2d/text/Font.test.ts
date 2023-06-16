import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Font, FontStyle, TextUtils } from "@galacean/engine-core";
import { expect } from "chai";
import exp from "constants";

describe("Font", function () {
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.canvas.resizeByClientSize();

    engine.run();
  });

  it("Font constructor", () => {
    // Test that Font constructor works correctly
    expect(() => {
      new Font(engine, "TestFont");
      new Font(engine);
      new Font(engine, undefined);
    }).not.to.throw();
  });

  let sysFont: Font;
  it("Font createFromOS", () => {
    // Test that createFromOS returns null, while the name is empty string or undefined
    expect(Font.createFromOS(engine, "")).to.be.null;
    expect(Font.createFromOS(engine, undefined)).to.be.null;

    sysFont = Font.createFromOS(engine, "Arial");
    const sysFont2 = Font.createFromOS(engine, "Arial Black");
    const sysFont3 = Font.createFromOS(engine, "Rockwell");

    expect(engine["_fontMap"]).to.be.has.keys("Arial", "Arial Black", "Rockwell");

    // Test that fonts are same object, while call createFromOS with same parameter
    expect(Font.createFromOS(engine, "Arial")).to.be.eq(sysFont);
    expect(Font.createFromOS(engine, "Arial Black")).to.be.eq(sysFont2);
    expect(Font.createFromOS(engine, "Rockwell")).to.be.eq(sysFont3);

    // Test font name is right
    expect(sysFont.name).to.eq("Arial");
    expect(sysFont2.name).to.eq("Arial Black");
    expect(sysFont3.name).to.eq("Rockwell");

    // Test _subFontMap is not undefined
    expect(sysFont["_subFontMap"]).not.to.be.undefined;
    expect(sysFont2["_subFontMap"]).not.to.be.undefined;
    expect(sysFont3["_subFontMap"]).not.to.be.undefined;
  });

  it("Destroy font", () => {
    // Test that destroy a font works correctly
    const subFont12None = sysFont["_getSubFont"](12, FontStyle.None);
    sysFont["_getSubFont"](13, FontStyle.Italic | FontStyle.Bold);
    sysFont["_getSubFont"](14, FontStyle.Italic);
    sysFont["_getSubFont"](15, FontStyle.Bold);

    // Test that get same subFont object, while call _getSubFont with same parameter
    const subFont12None2 = sysFont["_getSubFont"](12, FontStyle.None);
    expect(subFont12None).to.be.equal(subFont12None2);

    expect(sysFont.destroy()).to.throw;
    expect(engine["_fontMap"]).not.to.has.key("Arial");
    expect(sysFont["_subFontMap"]).to.be.null;
  });
});
