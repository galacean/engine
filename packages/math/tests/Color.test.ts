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

  it("LinearAndGamma", () => {
    const fixColor = (color: Color) => {
      color.r = Math.floor(color.r * 1000) / 1000;
      color.g = Math.floor(color.g * 1000) / 1000;
      color.b = Math.floor(color.b * 1000) / 1000;
    }

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
  console.log(`hehehe`)
});
