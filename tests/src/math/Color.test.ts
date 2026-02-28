import { Color } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("Color test", () => {
  it("Constructor", () => {
    const color1 = new Color(1, 0.5, 0.5, 1);
    const color2 = new Color();
    color2.r = 1;
    color2.g = 0.5;
    color2.b = 0.5;
    color2.a = 1;

    expect(Color.equals(color1, color2)).to.eq(true);
  });

  it("set", () => {
    const color1 = new Color(1, 0.5, 0.5, 1);
    const color2 = new Color();
    color2.set(1, 0.5, 0.5, 1);

    expect(Color.equals(color1, color2)).to.eq(true);
  });

  it("scale", () => {
    const color1 = new Color(0.5, 0.5, 0.5, 0.5);
    const color2 = new Color(1, 1, 1, 1);

    color1.scale(2);
    expect(color1).to.deep.eq(color2);

    Color.scale(color1, 0.5, color2);
    expect(color2).to.deep.eq(new Color(0.5, 0.5, 0.5, 0.5));
  });

  it("add", () => {
    const color1 = new Color(1, 0, 0, 0);
    const color2 = new Color(0, 1, 0, 0);

    color1.add(color2);
    expect(color1).to.deep.eq(new Color(1, 1, 0, 0));

    Color.add(color1, new Color(0, 0, 1, 0), color2);
    expect(color2).to.deep.eq(new Color(1, 1, 1, 0));
  });

  it("clone", () => {
    const a = new Color();
    const b = a.clone();

    expect(Color.equals(a, b)).to.eq(true);
  });

  it("copyFrom", () => {
    const a = new Color();
    const out = new Color();

    out.copyFrom(a);
    expect(Color.equals(a, out)).to.eq(true);
  });

  it("copyTo", () => {
    const a = new Color(1, 0, 0, 1);
    const out = new Color();

    a.copyTo(out);
    expect(Color.equals(a, out)).to.eq(true);
  });

  it("copyFromArray", () => {
    const a = new Color();
    const b = new Color(0, 0, 1, 1);
    const data = [1, 0, 0, 1, 1];

    a.copyFromArray(data, 1);
    expect(Color.equals(a, b)).to.eq(true);
  });

  it("copyToArray", () => {
    const a = new Color(0, 0, 1, 1);
    const data = [1, 0, 0, 0, 0];

    a.copyToArray(data, 1);
    expect(data).to.deep.eq([1, 0, 0, 1, 1]);
  });

  it("LinearAndGamma", () => {
    const fixColor = (color: Color) => {
      color.r = Math.floor(color.r * 1000) / 1000;
      color.g = Math.floor(color.g * 1000) / 1000;
      color.b = Math.floor(color.b * 1000) / 1000;
    };

    const colorLinear = new Color();
    const colorSRGB = new Color();
    const colorNewLinear = new Color();

    for (let i = 0; i < 100; ++i) {
      colorLinear.r = Math.random();
      colorLinear.g = Math.random();
      colorLinear.b = Math.random();
      fixColor(colorLinear);

      colorLinear.toSRGB(colorSRGB);
      colorSRGB.toLinear(colorNewLinear);

      fixColor(colorLinear);
      fixColor(colorNewLinear);

      expect(Color.equals(colorLinear, colorNewLinear)).to.eq(true);
    }
  });

  it("toJSON", () => {
    const color = new Color(1, 0.5, 0.5, 1);
    const json = color.toJSON();
    expect(json).to.deep.eq({ r: 1, g: 0.5, b: 0.5, a: 1 });
  });
});
