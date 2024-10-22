import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("SphericalHarmonics3 test", () => {
  it("addLight", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const b = Float32Array.from([
      2.8209500312805176, 0, 0, -4.886030197143555, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -3.1539199352264404, 0, 0,
      0, 0, 0, -5.462739944458008, 0, 0
    ]);
    expect(a.coefficients.length).to.eq(b.length);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).to.eq(b[i]);
    }
  });

  it("evaluate", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const color = new Color();
    a.evaluate(new Vector3(0, 1, 0), color);
    expect(color.r).to.eq(10.625004777489186);
  });

  it("scale", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    a.scale(0.5);
    const b = Float32Array.from([
      1.4104750156402588, 0, 0, -2.4430150985717773, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1.5769599676132202, 0,
      0, 0, 0, 0, -2.731369972229004, 0, 0
    ]);
    expect(a.coefficients.length).to.eq(b.length);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).to.eq(b[i]);
    }
  });

  it("setValueByArray | toArray", () => {
    const a = new SphericalHarmonics3();
    const b = [
      1.4104750156402588, 0, 0, -2.4430150985717773, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1.5769599676132202, 0,
      0, 0, 0, 0, -2.731369972229004, 0, 0
    ];
    a.copyFromArray(b);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).to.eq(b[i]);
    }
    const c = [];
    a.copyToArray(c);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(c[i]).to.eq(b[i]);
    }
  });

  it("clone | copyFrom", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const b = a.clone();
    const c = new SphericalHarmonics3();
    c.copyFrom(a);

    const aCoe = a.coefficients;
    const bCoe = b.coefficients;
    for (let i = 0, l = aCoe.length; i < l; ++i) {
      expect(aCoe[i]).to.eq(bCoe[i]);
    }
  });
});
