import { MathUtil, Vector2 } from "@galacean/engine-math";
import { expect } from "chai";

function toString(v: Vector2): string {
  return `vec2(${v.x}, ${v.y})`;
}

describe("Vector2 test", () => {
  it("static add", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.add(a, b, out);
    expect(toString(out)).to.eq("vec2(-1, 8)");
  });

  it("static subtract", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.subtract(a, b, out);
    expect(toString(out)).to.eq("vec2(5, -2)");
  });

  it("static multiply", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.multiply(a, b, out);
    expect(toString(out)).to.eq("vec2(-6, 15)");
  });

  it("static divide", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-4, 5);
    const out = new Vector2();

    Vector2.divide(a, b, out);
    expect(toString(out)).to.eq("vec2(-0.5, 0.6)");
  });

  it("static dot", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-4, 5);

    expect(Vector2.dot(a, b)).to.eq(7);
  });

  it("static distance", () => {
    const a = new Vector2(1, 1);
    const b = new Vector2(4, 5);

    expect(Vector2.distance(a, b)).to.eq(5);
  });

  it("static distanceSquared", () => {
    const a = new Vector2(1, 1);
    const b = new Vector2(4, 5);

    expect(Vector2.distanceSquared(a, b)).to.eq(25);
  });

  it("static equals", () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(1 + MathUtil.zeroTolerance * 0.9, 2);

    expect(Vector2.equals(a, b)).to.eq(true);
  });

  it("static lerp", () => {
    const a = new Vector2(0, 1);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.lerp(a, b, 0.5, out);
    expect(toString(out)).to.eq("vec2(1, 2)");
  });

  it("static max", () => {
    const a = new Vector2(0, 10);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.max(a, b, out);
    expect(toString(out)).to.eq("vec2(2, 10)");
  });

  it("static min", () => {
    const a = new Vector2(0, 10);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.min(a, b, out);
    expect(toString(out)).to.eq("vec2(0, 3)");
  });

  it("static negate", () => {
    const a = new Vector2(4, -4);
    const out = new Vector2();

    Vector2.negate(a, out);
    expect(toString(out)).to.eq("vec2(-4, 4)");
  });

  it("static normalize", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();

    Vector2.normalize(a, out);
    expect(Vector2.equals(out, new Vector2(0.6, 0.8))).to.eq(true);
  });

  it("static scale", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();

    Vector2.scale(a, 3, out);
    expect(toString(out)).to.eq("vec2(9, 12)");
  });

  it("set", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.set(5, 6))).to.eq("vec2(5, 6)");
  });

  it("copyFromArray", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.copyFromArray([5, 6]))).to.eq("vec2(5, 6)");
    const b = [];
    a.copyToArray(b);
    expect(b[0]).to.eq(5);
    expect(b[1]).to.eq(6);
  });

  it("clone", () => {
    const a = new Vector2(3, 4);
    const b = a.clone();
    expect(toString(a)).to.eq(toString(b));
  });

  it("copyFrom", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();
    out.copyFrom(a);
    expect(toString(a)).to.eq(toString(out));
  });

  it("copyTo", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();
    a.copyTo(out);
    expect(toString(a)).to.eq(toString(out));
  });

  it("add", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.add(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec2(4, 6)");
  });

  it("subtract", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.subtract(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec2(-2, -2)");
  });

  it("multiply", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.multiply(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec2(3, 8)");
  });

  it("divide", () => {
    const a = new Vector2(1, 2);
    const ret = new Vector2(3, 4);
    expect(toString(ret.divide(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec2(3, 2)");
  });

  it("length", () => {
    const a = new Vector2(3, 4);
    expect(a.length()).to.eq(5);
  });

  it("lengthSquared", () => {
    const a = new Vector2(3, 4);
    expect(a.lengthSquared()).to.eq(25);
  });

  it("negate", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.negate())).to.eq(toString(a));
    expect(toString(a)).to.eq("vec2(-3, -4)");
  });

  it("normalize", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.normalize())).to.eq(toString(a));
    expect(Vector2.equals(a, new Vector2(0.6, 0.8))).to.eq(true);
  });

  it("scale", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.scale(2))).to.eq(toString(a));
    expect(toString(a)).to.eq("vec2(6, 8)");
  });

  it("toJSON", () => {
    const a = new Vector2(3, 4);
    expect(a.toJSON()).to.deep.eq({ x: 3, y: 4 });
  });
});
