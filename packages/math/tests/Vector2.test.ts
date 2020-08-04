import { MathUtil } from "../src/MathUtil";
import { Vector2 } from "../src/Vector2";
import { Matrix3x3 } from "../src/Matrix3x3";
import { Matrix4x4 } from "../src/Matrix4x4";

function toString(v: Vector2): string {
  return `vec2(${v.x}, ${v.y})`;
}

describe("Vector2 test", () => {
  it("static add", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.add(a, b, out);
    expect(toString(out)).toEqual("vec2(-1, 8)");
  });

  it("static substract", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.subtract(a, b, out);
    expect(toString(out)).toEqual("vec2(5, -2)");
  });

  it("static multiply", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-3, 5);
    const out = new Vector2();

    Vector2.multiply(a, b, out);
    expect(toString(out)).toEqual("vec2(-6, 15)");
  });

  it("static divide", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-4, 5);
    const out = new Vector2();

    Vector2.divide(a, b, out);
    expect(toString(out)).toEqual("vec2(-0.5, 0.6)");
  });

  it("static dot", () => {
    const a = new Vector2(2, 3);
    const b = new Vector2(-4, 5);

    expect(Vector2.dot(a, b)).toEqual(7);
  });

  it("static distance", () => {
    const a = new Vector2(1, 1);
    const b = new Vector2(4, 5);

    expect(Vector2.distance(a, b)).toEqual(5);
  });

  it("static distanceSquared", () => {
    const a = new Vector2(1, 1);
    const b = new Vector2(4, 5);

    expect(Vector2.distanceSquared(a, b)).toEqual(25);
  });

  it("static equals", () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(1 + MathUtil.ZeroTolerance * 0.9, 2);

    expect(Vector2.equals(a, b)).toEqual(true);
  });

  it("static lerp", () => {
    const a = new Vector2(0, 1);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.lerp(a, b, 0.5, out);
    expect(toString(out)).toEqual("vec2(1, 2)");
  });

  it("static max", () => {
    const a = new Vector2(0, 10);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.max(a, b, out);
    expect(toString(out)).toEqual("vec2(2, 10)");
  });

  it("static min", () => {
    const a = new Vector2(0, 10);
    const b = new Vector2(2, 3);
    const out = new Vector2();

    Vector2.min(a, b, out);
    expect(toString(out)).toEqual("vec2(0, 3)");
  });

  it("static negate", () => {
    const a = new Vector2(4, -4);
    const out = new Vector2();

    Vector2.negate(a, out);
    expect(toString(out)).toEqual("vec2(-4, 4)");
  });

  it("static normalize", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();

    Vector2.normalize(a, out);
    expect(Vector2.equals(out, new Vector2(0.6, 0.8))).toEqual(true);
  });

  it("static scale", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();

    Vector2.scale(a, 3, out);
    expect(toString(out)).toEqual("vec2(9, 12)");
  });

  it("setValue", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.setValue(5, 6))).toEqual("vec2(5, 6)");
  });

  it("clone", () => {
    const a = new Vector2(3, 4);
    const b = a.clone();
    expect(toString(a)).toEqual(toString(b));
  });

  it("cloneTo", () => {
    const a = new Vector2(3, 4);
    const out = new Vector2();
    a.cloneTo(out);
    expect(toString(a)).toEqual(toString(out));
  });

  it("add", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.add(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec2(4, 6)");
  });

  it("subtract", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.subtract(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec2(-2, -2)");
  });

  it("multiply", () => {
    const a = new Vector2(3, 4);
    const ret = new Vector2(1, 2);
    expect(toString(ret.multiply(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec2(3, 8)");
  });

  it("divide", () => {
    const a = new Vector2(1, 2);
    const ret = new Vector2(3, 4);
    expect(toString(ret.divide(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec2(3, 2)");
  });

  it("length", () => {
    const a = new Vector2(3, 4);
    expect(a.length()).toEqual(5);
  });

  it("lengthSquared", () => {
    const a = new Vector2(3, 4);
    expect(a.lengthSquared()).toEqual(25);
  });

  it("negate", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.negate())).toEqual(toString(a));
    expect(toString(a)).toEqual("vec2(-3, -4)");
  });

  it("normalize", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.normalize())).toEqual(toString(a));
    expect(Vector2.equals(a, new Vector2(0.6, 0.8))).toEqual(true);
  });

  it("scale", () => {
    const a = new Vector2(3, 4);
    expect(toString(a.scale(2))).toEqual(toString(a));
    expect(toString(a)).toEqual("vec2(6, 8)");
  });
});
