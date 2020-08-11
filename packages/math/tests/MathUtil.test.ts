import { MathUtil } from "../src/MathUtil";

describe("MathUtil test", () => {
  it("clamp", () => {
    expect(MathUtil.clamp(1, 10, 20)).toEqual(10);
    expect(MathUtil.clamp(25, 10, 20)).toEqual(20);
    expect(MathUtil.clamp(15, 10, 20)).toEqual(15);
  });

  it("equals", () => {
    expect(MathUtil.equals(10, 10)).toEqual(true);

    let scale = 0.9;
    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance * scale)).toEqual(true);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance * scale)).toEqual(true);

    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance)).toEqual(true);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance)).toEqual(true);

    scale = 1.2;
    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance * scale)).toEqual(false);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance * scale)).toEqual(false);
  });

  it("isPowerOf2", () => {
    expect(MathUtil.isPowerOf2(16)).toEqual(true);
    expect(MathUtil.isPowerOf2(15)).toEqual(false);
  });

  it("radianToDegree", () => {
    const d = MathUtil.radianToDegree(Math.PI / 3);
    expect(MathUtil.equals(d, 60)).toEqual(true);
  });

  it("degreeToRadian", () => {
    const r = MathUtil.degreeToRadian(60);
    expect(MathUtil.equals(r, Math.PI / 3)).toEqual(true);
  });
});
