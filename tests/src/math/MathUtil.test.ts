import { MathUtil } from "@galacean/engine-math";
import { expect } from "chai";

describe("MathUtil test", () => {
  it("clamp", () => {
    expect(MathUtil.clamp(1, 10, 20)).to.eq(10);
    expect(MathUtil.clamp(25, 10, 20)).to.eq(20);
    expect(MathUtil.clamp(15, 10, 20)).to.eq(15);
  });

  it("equals", () => {
    expect(MathUtil.equals(10, 10)).to.eq(true);

    let scale = 0.9;
    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance * scale)).to.eq(true);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance * scale)).to.eq(true);

    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance)).to.eq(true);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance)).to.eq(true);

    scale = 1.2;
    expect(MathUtil.equals(10, 10 - MathUtil.zeroTolerance * scale)).to.eq(false);
    expect(MathUtil.equals(10, 10 + MathUtil.zeroTolerance * scale)).to.eq(false);
  });

  it("isPowerOf2", () => {
    expect(MathUtil.isPowerOf2(16)).to.eq(true);
    expect(MathUtil.isPowerOf2(15)).to.eq(false);
  });

  it("radianToDegree", () => {
    const d = MathUtil.radianToDegree(Math.PI / 3);
    expect(MathUtil.equals(d, 60)).to.eq(true);
  });

  it("degreeToRadian", () => {
    const r = MathUtil.degreeToRadian(60);
    expect(MathUtil.equals(r, Math.PI / 3)).to.eq(true);
  });
});
