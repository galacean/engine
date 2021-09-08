import { Color } from "../src/Color";
import { SphericalHarmonics3 } from "../src/SphericalHarmonics3";
import { Vector3 } from "../src/Vector3";

describe("SphericalHarmonics3 test", () => {
  it("addLight", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const b = Float32Array.from([
      2.8209500312805176,
      0,
      0,
      -4.886030197143555,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      -3.1539199352264404,
      0,
      0,
      0,
      0,
      0,
      -5.462739944458008,
      0,
      0
    ]);
    expect(a.coefficients.length).toEqual(b.length);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).toEqual(b[i]);
    }
  });

  it("evaluate", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const color = new Color();
    a.evaluate(new Vector3(0, 1, 0), color);
    expect(color.r).toEqual(10.625004777489186);
  });

  it("scale", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    a.scale(0.5);
    const b = Float32Array.from([
      1.4104750156402588,
      0,
      0,
      -2.4430150985717773,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      -1.5769599676132202,
      0,
      0,
      0,
      0,
      0,
      -2.731369972229004,
      0,
      0
    ]);
    expect(a.coefficients.length).toEqual(b.length);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).toEqual(b[i]);
    }
  });

  it("setValueByArray | toArray", () => {
    const a = new SphericalHarmonics3();
    const b = [
      1.4104750156402588,
      0,
      0,
      -2.4430150985717773,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      -1.5769599676132202,
      0,
      0,
      0,
      0,
      0,
      -2.731369972229004,
      0,
      0
    ];
    a.setValueByArray(b);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(a.coefficients[i]).toEqual(b[i]);
    }
    const c = [];
    a.toArray(c);
    for (let i = 0, l = b.length; i < l; ++i) {
      expect(c[i]).toEqual(b[i]);
    }
  });

  it("clone | cloneTo", () => {
    const a = new SphericalHarmonics3();
    a.addLight(new Vector3(0, 1, 0), new Color(1, 0, 0, 1), 10);
    const b = a.clone();
    const c = new SphericalHarmonics3();
    a.cloneTo(c);

    const aCoe = a.coefficients;
    const bCoe = b.coefficients;
    for (let i = 0, l = aCoe.length; i < l; ++i) {
      expect(aCoe[i]).toEqual(bCoe[i]);
    }
  });
});
