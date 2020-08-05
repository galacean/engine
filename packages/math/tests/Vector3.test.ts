import { MathUtil } from "../src/MathUtil";
import { Vector3 } from "../src/Vector3";
import { Vector4 } from "../src/Vector4";
import { Quaternion } from "../src/Quaternion";
import { Matrix3x3 } from "../src/Matrix3x3";
import { Matrix } from "../src/Matrix";

function toString(v: Vector3): string {
  return `vec3(${v.x}, ${v.y}, ${v.z})`;
}

describe("Vector3 test", () => {
  it("static add", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 0);
    const out = new Vector3();

    Vector3.add(a, b, out);
    expect(toString(out)).toEqual("vec3(-1, 8, 4)");
  });

  it("static substract", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 1);
    const out = new Vector3();

    Vector3.subtract(a, b, out);
    expect(toString(out)).toEqual("vec3(5, -2, 3)");
  });

  it("static multiply", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 0.2);
    const out = new Vector3();

    Vector3.multiply(a, b, out);
    expect(toString(out)).toEqual("vec3(-6, 15, 0.8)");
  });

  it("static divide", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-4, 5, 16);
    const out = new Vector3();

    Vector3.divide(a, b, out);
    expect(toString(out)).toEqual("vec3(-0.5, 0.6, 0.25)");
  });

  it("static dot", () => {
    const a = new Vector3(2, 3, 1);
    const b = new Vector3(-4, 5, 1);

    expect(Vector3.dot(a, b)).toEqual(8);
  });

  it("static cross", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    const out = new Vector3();

    Vector3.cross(a, b, out);
    expect(toString(out)).toEqual("vec3(-3, 6, -3)");
  });

  it("static distance", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 6, 3);

    expect(Vector3.distance(a, b)).toEqual(5);
    expect(Vector3.distanceSquared(a, b)).toEqual(25);
  });

  it("static equals", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(1 + MathUtil.ZeroTolerance * 0.9, 2, 3);

    expect(Vector3.equals(a, b)).toEqual(true);
  });

  it("static lerp", () => {
    const a = new Vector3(0, 1, 2);
    const b = new Vector3(2, 2, 0);
    const out = new Vector3();

    Vector3.lerp(a, b, 0.5, out);
    expect(toString(out)).toEqual("vec3(1, 1.5, 1)");
  });

  it("static max", () => {
    const a = new Vector3(0, 10, 1);
    const b = new Vector3(2, 3, 5);
    const out = new Vector3();

    Vector3.max(a, b, out);
    expect(toString(out)).toEqual("vec3(2, 10, 5)");
  });

  it("static min", () => {
    const a = new Vector3(0, 10, 1);
    const b = new Vector3(2, 3, 5);
    const out = new Vector3();

    Vector3.min(a, b, out);
    expect(toString(out)).toEqual("vec3(0, 3, 1)");
  });

  it("static negate", () => {
    const a = new Vector3(4, -4, 0);
    const out = new Vector3();

    Vector3.negate(a, out);
    expect(toString(out)).toEqual("vec3(-4, 4, 0)");
  });

  it("static normalize", () => {
    const a = new Vector3(3, 4, 0);
    const out = new Vector3();

    Vector3.normalize(a, out);
    expect(Vector3.equals(out, new Vector3(0.6, 0.8, 0))).toEqual(true);
  });

  it("static projectOnVector", () => {
    const a = new Vector3();
    const n = new Vector3(10, 0, 0);
    const out = new Vector3();

    a.setValue(1, 0, 0);
    Vector3.projectOnVector(a, n, out);
    expect(toString(out)).toEqual("vec3(1, 0, 0)");

    a.setValue(0, 1, 0);
    Vector3.projectOnVector(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 0, 0)");

    a.setValue(0, 0, -1);
    Vector3.projectOnVector(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 0, 0)");

    a.setValue(-1, 0, 0);
    Vector3.projectOnVector(a, n, out);
    expect(toString(out)).toEqual("vec3(-1, 0, 0)");
  });

  it("static projectOnPlane", () => {
    const a = new Vector3();
    const n = new Vector3(1, 0, 0);
    const out = new Vector3();

    a.setValue(1, 0, 0);
    Vector3.projectOnPlane(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 0, 0)");

    a.setValue(0, 1, 0);
    Vector3.projectOnPlane(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 1, 0)");

    a.setValue(0, 0, -1);
    Vector3.projectOnPlane(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 0, -1)");

    a.setValue(-1, 0, 0);
    Vector3.projectOnPlane(a, n, out);
    expect(toString(out)).toEqual("vec3(0, 0, 0)");
  });

  it("static scale", () => {
    const a = new Vector3(3, 4, 5);
    const out = new Vector3();

    Vector3.scale(a, 3, out);
    expect(toString(out)).toEqual("vec3(9, 12, 15)");
  });

  it("static transform", () => {
    const a = new Vector3(2, 3, 4);
    const out = new Vector3();

    const m44 = new Matrix(2, 7, 17, 0, 3, 11, 19, 0, 5, 13, 23, 0, 0, 0, 0, 1);
    Vector3.transformNormal(a, m44, out);
    expect(toString(out)).toEqual("vec3(33, 99, 183)");

    const b = new Vector4(2, 3, 4, 1);
    const out4 = new Vector4();
    const m4 = new Matrix();
    m4.setValue(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    Vector3.transformCoordinate(a, m4, out);
    Vector4.transformByMat4x4(b, m4, out4);
    expect(out.x).toEqual(out4.x / out4.w);
    expect(out.y).toEqual(out4.y / out4.w);
    expect(out.z).toEqual(out4.z / out4.w);

    Vector3.transformByQuat(a, new Quaternion(), out);
    expect(toString(a)).toEqual(toString(out));
    Vector3.transformByQuat(a, new Quaternion(2, 3, 4, 5), out);
    expect(toString(out)).toEqual("vec3(108, 162, 216)");
  });

  it("setValue", () => {
    const a = new Vector3(3, 4, 5);
    expect(toString(a.setValue(5, 6, 7))).toEqual("vec3(5, 6, 7)");
  });

  it("clone", () => {
    const a = new Vector3(3, 4, 5);
    const b = a.clone();
    expect(toString(a)).toEqual(toString(b));
  });

  it("cloneTo", () => {
    const a = new Vector3(3, 4, 5);
    const out = new Vector3();
    a.cloneTo(out);
    expect(toString(a)).toEqual(toString(out));
  });

  it("add", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 4);
    expect(toString(ret.add(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec3(4, 6, 9)");
  });

  it("subtract", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 8);
    expect(toString(ret.subtract(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec3(-2, -2, 3)");
  });

  it("multiply", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 1);
    expect(toString(ret.multiply(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec3(3, 8, 5)");
  });

  it("divide", () => {
    const a = new Vector3(1, 2, 3);
    const ret = new Vector3(3, 4, 12);
    expect(toString(ret.divide(a))).toEqual(toString(ret));
    expect(toString(ret)).toEqual("vec3(3, 2, 4)");
  });

  it("length", () => {
    const a = new Vector3(3, 4, 5);
    expect(MathUtil.equals(Math.sqrt(50), a.length())).toEqual(true);
    expect(a.lengthSquared()).toEqual(50);
  });

  it("negate", () => {
    const a = new Vector3(3, 4, 5);
    expect(toString(a.negate())).toEqual(toString(a));
    expect(toString(a)).toEqual("vec3(-3, -4, -5)");
  });

  it("normalize", () => {
    const a = new Vector3(3, 4, 0);
    expect(toString(a.normalize())).toEqual(toString(a));
    expect(Vector3.equals(a, new Vector3(0.6, 0.8, 0))).toEqual(true);
  });

  it("scale", () => {
    const a = new Vector3(3, 4, 0);
    expect(toString(a.scale(2))).toEqual(toString(a));
    expect(toString(a)).toEqual("vec3(6, 8, 0)");
  });
});
