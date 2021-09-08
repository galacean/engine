import { Color } from "../src/Color";

describe("Color test", () => {
  it("Constructor", () => {
    const color1 = new Color(1, 0.5, 0.5, 1);
    const color2 = new Color();
    color2.r = 1;
    color2.g = 0.5;
    color2.b = 0.5;
    color2.a = 1;

    expect(Color.equals(color1, color2)).toEqual(true);
  });

  it("setValue", () => {
    const color1 = new Color(1, 0.5, 0.5, 1);
    const color2 = new Color();
    color2.setValue(1, 0.5, 0.5, 1);

    expect(Color.equals(color1, color2)).toEqual(true);
  });

  it("scale", () => {
    const color1 = new Color(0.5, 0.5, 0.5, 0.5);
    const color2 = new Color(1, 1, 1, 1);

    color1.scale(2);
    expect(color1).toEqual(color2);

    Color.scale(color1, 0.5, color2);
    expect(color2).toEqual(new Color(0.5, 0.5, 0.5, 0.5));
  });

  it("add", () => {
    const color1 = new Color(1, 0, 0, 0);
    const color2 = new Color(0, 1, 0, 0);

    color1.add(color2);
    expect(color1).toEqual(new Color(1, 1, 0, 0));

    Color.add(color1, new Color(0, 0, 1, 0), color2);
    expect(color2).toEqual(new Color(1, 1, 1, 0));
  });

  it("clone", () => {
    const a = new Color();
    const b = a.clone();

    expect(Color.equals(a, b)).toEqual(true);
  });

  it("cloneTo", () => {
    const a = new Color();
    const out = new Color();

    a.cloneTo(out);
    expect(Color.equals(a, out)).toEqual(true);
  });

  it("LinearAndGamma", () => {
    const fixColor = (color: Color) => {
      color.r = Math.floor(color.r * 1000) / 1000;
      color.g = Math.floor(color.g * 1000) / 1000;
      color.b = Math.floor(color.b * 1000) / 1000;
    };

    const colorLinear = new Color();
    const colorGamma = new Color();
    const colorNewLinear = new Color();

    for (let i = 0; i < 100; ++i) {
      colorLinear.r = Math.random();
      colorLinear.g = Math.random();
      colorLinear.b = Math.random();
      fixColor(colorLinear);

      colorLinear.toGamma(colorGamma);
      colorGamma.toLinear(colorNewLinear);

      fixColor(colorLinear);
      fixColor(colorNewLinear);

      expect(Color.equals(colorLinear, colorNewLinear)).toEqual(true);
    }
  });
});
