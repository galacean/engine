import { MathUtil } from "../src/MathUtil";
import { Vector4 } from "../src/Vector4";
import { Quaternion } from "../src/Quaternion";
import { Matrix } from "../src/Matrix";

function toString(v: Vector4): string {
  return `vec4(${v.x}, ${v.y}, ${v.z}, ${v.w})`;
}

describe("Vector4 test", () => {
  it("static add", () => {
    const a = new Vector4(2, 3, 4, 1);
    const b = new Vector4(-3, 5, 0, 2);
    const out = new Vector4();

    Vector4.add(a, b, out);
    expect(toString(out)).toEqual("vec4(-1, 8, 4, 3)");
  });

  it("static substract", () => {
    const a = new Vector4(2, 3, 4, 1);
    const b = new Vector4(-3, 5, 1, 2);
    const out = new Vector4();

    Vector4.subtract(a, b, out);
    expect(toString(out)).toEqual("vec4(5, -2, 3, -1)");
  });

  it("static multiply", () => {
    const a = new Vector4(2, 3, 4, 1);
    const b = new Vector4(-3, 5, 0.2, 2);
    const out = new Vector4();

    Vector4.multiply(a, b, out);
    expect(toString(out)).toEqual("vec4(-6, 15, 0.8, 2)");
  });

  it("static divide", () => {
    const a = new Vector4(2, 3, 4, 1);
    const b = new Vector4(-4, 5, 16, 2);
    const out = new Vector4();

    Vector4.divide(a, b, out);
    expect(toString(out)).toEqual("vec4(-0.5, 0.6, 0.25, 0.5)");
  });

  it("static dot", () => {
    const a = new Vector4(2, 3, 1, 1);
    const b = new Vector4(-4, 5, 1, 1);

    expect(Vector4.dot(a, b)).toEqual(9);
  });

  it("static distance", () => {
    const a = new Vector4(1, 2, 3, 0);
    const b = new Vector4(4, 6, 3, 0);

    expect(Vector4.distance(a, b)).toEqual(5);
    expect(Vector4.distanceSquared(a, b)).toEqual(25);
  });

  it("static equals", () => {
    const a = new Vector4(1, 2, 3, 4);
    const b = new Vector4(1 + MathUtil.ZeroTolerance * 0.9, 2, 3, 4);

    expect(Vector4.equals(a, b)).toEqual(true);
  });

  it("static lerp", () => {
    const a = new Vector4(0, 1, 2, 0);
    const b = new Vector4(2, 2, 0, 0);
    const out = new Vector4();

    Vector4.lerp(a, b, 0.5, out);
    expect(toString(out)).toEqual("vec4(1, 1.5, 1, 0)");
  });

  it("static max", () => {
    const a = new Vector4(0, 10, 1, -1);
    const b = new Vector4(2, 3, 5, -5);
    const out = new Vector4();

    Vector4.max(a, b, out);
    expect(toString(out)).toEqual("vec4(2, 10, 5, -1)");
  });

  it("static min", () => {
    const a = new Vector4(0, 10, 1, -1);
    const b = new Vector4(2, 3, 5, -5);
    const out = new Vector4();

    Vector4.min(a, b, out);
    expect(toString(out)).toEqual("vec4(0, 3, 1, -5)");
  });

  it("static negate", () => {
    const a = new Vector4(4, -4, 0, 1);
    const out = new Vector4();

    Vector4.negate(a, out);
    expect(toString(out)).toEqual("vec4(-4, 4, 0, -1)");
  });

  it("static normalize", () => {
    const a = new Vector4(3, 4, 0, 0);
    const out = new Vector4();

    Vector4.normalize(a, out);
    expect(Vector4.equals(out, new Vector4(0.6, 0.8, 0, 0))).toEqual(true);
  });

  it("static scale", () => {
    const a = new Vector4(3, 4, 5, 0);
    const out = new Vector4();

    Vector4.scale(a, 3, out);
    expect(toString(out)).toEqual("vec4(9, 12, 15, 0)");
  });

  it("static transform", () => {
    const a = new Vector4(2, 3, 4, 5);
    const out = new Vector4();
    const m4 = new Matrix();
    m4.setValue(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0);
    Vector4.transformByMat4x4(a, m4, out);
    expect(toString(out)).toEqual("vec4(2, 3, 9, 0)");

    Vector4.transformByQuat(a, new Quaternion(), out);
    expect(toString(a)).toEqual(toString(out));
    Vector4.transformByQuat(a, new Quaternion(2, 3, 4, 5), out);
    expect(toString(out)).toEqual("vec4(108, 162, 216, 5)");
  });

  it("setValue", () => {
    const a = new Vector4(3, 4, 5, 0);
    expect(toString(a.setValue(5, 6, 7, 1))).toEqual("vec4(5, 6, 7, 1)");
  });

  it("clone", () => {
    const a = new Vector4(3, 4, 5, 0);
    const b = a.clone();
    expect(toString(a)).toEqual(toString(b));
  });

  it("cloneTo", () => {
    const a = new Vector4(3, 4, 5, 0);
    const out = new Vector4();
    a.cloneTo(out);
    expect(toString(a)).toEqual(toString(out));
  });

  it("add", () => {
    const a = new Vector4(3, 4, 5, 1);
    const ret = new Vector4(1, 2, 4, 1);
    expect(toString(ret.add(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec4(4, 6, 9, 2)");
  });

  it("subtract", () => {
    const a = new Vector4(3, 4, 5, 1);
    const ret = new Vector4(1, 2, 8, 1);
    expect(toString(ret.subtract(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec4(-2, -2, 3, 0)");
  });

  it("multiply", () => {
    const a = new Vector4(3, 4, 5, 1);
    const ret = new Vector4(1, 2, 1, 1);
    expect(toString(ret.multiply(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec4(3, 8, 5, 1)");
  });

  it("divide", () => {
    const a = new Vector4(1, 2, 3, 1);
    const ret = new Vector4(3, 4, 12, 1);
    expect(toString(ret.divide(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec4(3, 2, 4, 1)");
  });

  it("length", () => {
    const a = new Vector4(3, 4, 5, 0);
    expect(MathUtil.equals(Math.sqrt(50), a.length())).toEqual(true);
    expect(a.lengthSquared()).toEqual(50);
  });

  it("negate", () => {
    const a = new Vector4(3, 4, 5, 0);
    expect(toString(a.negate())).toEqual(toString(a));
    expect(toString(a)).toEqual("vec4(-3, -4, -5, 0)");
  });

  it("normalize", () => {
    const a = new Vector4(3, 4, 0, 0);
    expect(toString(a.normalize())).toEqual(toString(a));
    expect(Vector4.equals(a, new Vector4(0.6, 0.8, 0, 0))).toEqual(true);
  });

  it("scale", () => {
    const a = new Vector4(3, 4, 0, 0);
    expect(toString(a.scale(2))).toEqual(toString(a));
    expect(toString(a)).toEqual("vec4(6, 8, 0, 0)");
  });
});
