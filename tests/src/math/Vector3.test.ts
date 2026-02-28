import { MathUtil, Vector3, Vector4, Quaternion, Matrix3x3, Matrix } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

function toString(v: Vector3): string {
  return `vec3(${v.x}, ${v.y}, ${v.z})`;
}

describe("Vector3 test", () => {
  it("static add", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 0);
    const out = new Vector3();

    Vector3.add(a, b, out);
    expect(toString(out)).to.eq("vec3(-1, 8, 4)");
  });

  it("static subtract", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 1);
    const out = new Vector3();

    Vector3.subtract(a, b, out);
    expect(toString(out)).to.eq("vec3(5, -2, 3)");
  });

  it("static multiply", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-3, 5, 0.2);
    const out = new Vector3();

    Vector3.multiply(a, b, out);
    expect(toString(out)).to.eq("vec3(-6, 15, 0.8)");
  });

  it("static divide", () => {
    const a = new Vector3(2, 3, 4);
    const b = new Vector3(-4, 5, 16);
    const out = new Vector3();

    Vector3.divide(a, b, out);
    expect(toString(out)).to.eq("vec3(-0.5, 0.6, 0.25)");
  });

  it("static dot", () => {
    const a = new Vector3(2, 3, 1);
    const b = new Vector3(-4, 5, 1);

    expect(Vector3.dot(a, b)).to.eq(8);
  });

  it("static cross", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    const out = new Vector3();

    Vector3.cross(a, b, out);
    expect(toString(out)).to.eq("vec3(-3, 6, -3)");
  });

  it("static distance", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 6, 3);

    expect(Vector3.distance(a, b)).to.eq(5);
    expect(Vector3.distanceSquared(a, b)).to.eq(25);
  });

  it("static equals", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(1 + MathUtil.zeroTolerance * 0.9, 2, 3);

    expect(Vector3.equals(a, b)).to.eq(true);
  });

  it("static lerp", () => {
    const a = new Vector3(0, 1, 2);
    const b = new Vector3(2, 2, 0);
    const out = new Vector3();

    Vector3.lerp(a, b, 0.5, out);
    expect(toString(out)).to.eq("vec3(1, 1.5, 1)");
  });

  it("static max", () => {
    const a = new Vector3(0, 10, 1);
    const b = new Vector3(2, 3, 5);
    const out = new Vector3();

    Vector3.max(a, b, out);
    expect(toString(out)).to.eq("vec3(2, 10, 5)");
  });

  it("static min", () => {
    const a = new Vector3(0, 10, 1);
    const b = new Vector3(2, 3, 5);
    const out = new Vector3();

    Vector3.min(a, b, out);
    expect(toString(out)).to.eq("vec3(0, 3, 1)");
  });

  it("static negate", () => {
    const a = new Vector3(4, -4, 0);
    const out = new Vector3();

    Vector3.negate(a, out);
    expect(toString(out)).to.eq("vec3(-4, 4, 0)");
  });

  it("static normalize", () => {
    const a = new Vector3(3, 4, 0);
    const out = new Vector3();

    Vector3.normalize(a, out);
    expect(Vector3.equals(out, new Vector3(0.6, 0.8, 0))).to.eq(true);
  });

  it("static scale", () => {
    const a = new Vector3(3, 4, 5);
    const out = new Vector3();

    Vector3.scale(a, 3, out);
    expect(toString(out)).to.eq("vec3(9, 12, 15)");
  });

  it("static transform", () => {
    const a = new Vector3(2, 3, 4);
    const out = new Vector3();

    const m44 = new Matrix(2, 7, 17, 0, 3, 11, 19, 0, 5, 13, 23, 0, 0, 0, 0, 1);
    Vector3.transformNormal(a, m44, out);
    expect(toString(out)).to.eq("vec3(33, 99, 183)");

    const b = new Vector4(2, 3, 4, 1);
    const out4 = new Vector4();
    const m4 = new Matrix();
    m4.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    Vector3.transformCoordinate(a, m4, out);
    Vector4.transform(b, m4, out4);
    expect(out.x).to.eq(out4.x / out4.w);
    expect(out.y).to.eq(out4.y / out4.w);
    expect(out.z).to.eq(out4.z / out4.w);

    Vector3.transformByQuat(a, new Quaternion(), out);
    expect(toString(a)).to.eq(toString(out));
    Vector3.transformByQuat(a, new Quaternion(2, 3, 4, 5), out);
    expect(toString(out)).to.eq("vec3(108, 162, 216)");
  });

  it("set", () => {
    const a = new Vector3(3, 4, 5);
    expect(toString(a.set(5, 6, 7))).to.eq("vec3(5, 6, 7)");
  });

  it("copyFromArray", () => {
    const a = new Vector3(3, 4, 3);
    expect(toString(a.copyFromArray([5, 6, 4]))).to.eq("vec3(5, 6, 4)");
    const b = [];
    a.copyToArray(b);
    expect(b[0]).to.eq(5);
    expect(b[1]).to.eq(6);
    expect(b[2]).to.eq(4);
  });

  it("clone", () => {
    const a = new Vector3(3, 4, 5);
    const b = a.clone();
    expect(toString(a)).to.eq(toString(b));
  });

  it("copyFrom", () => {
    const a = new Vector3(3, 4, 5);
    const out = new Vector3();
    out.copyFrom(a);
    expect(toString(a)).to.eq(toString(out));
  });

  it("copyTo", () => {
    const a = new Vector3(3, 4, 5);
    const out = new Vector3();
    a.copyTo(out);
    expect(toString(a)).to.eq(toString(out));
  });

  it("add", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 4);
    expect(toString(ret.add(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec3(4, 6, 9)");
  });

  it("subtract", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 8);
    expect(toString(ret.subtract(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec3(-2, -2, 3)");
  });

  it("multiply", () => {
    const a = new Vector3(3, 4, 5);
    const ret = new Vector3(1, 2, 1);
    expect(toString(ret.multiply(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec3(3, 8, 5)");
  });

  it("divide", () => {
    const a = new Vector3(1, 2, 3);
    const ret = new Vector3(3, 4, 12);
    expect(toString(ret.divide(a))).to.eq(toString(ret));
    expect(toString(ret)).to.eq("vec3(3, 2, 4)");
  });

  it("length", () => {
    const a = new Vector3(3, 4, 5);
    expect(MathUtil.equals(Math.sqrt(50), a.length())).to.eq(true);
    expect(a.lengthSquared()).to.eq(50);
  });

  it("negate", () => {
    const a = new Vector3(3, 4, 5);
    expect(toString(a.negate())).to.eq(toString(a));
    expect(toString(a)).to.eq("vec3(-3, -4, -5)");
  });

  it("normalize", () => {
    const a = new Vector3(3, 4, 0);
    expect(toString(a.normalize())).to.eq(toString(a));
    expect(Vector3.equals(a, new Vector3(0.6, 0.8, 0))).to.eq(true);
  });

  it("scale", () => {
    const a = new Vector3(3, 4, 0);
    expect(toString(a.scale(2))).to.eq(toString(a));
    expect(toString(a)).to.eq("vec3(6, 8, 0)");
  });

  it("transformToVec3", () => {
    const a = new Vector3(2, 3, 4);
    const out = new Vector3(2, 3, 5);
    const m = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    a.transformToVec3(m);
    expect(a.x).to.eq(out.x);
    expect(a.y).to.eq(out.y);
    expect(a.z).to.eq(out.z);
  });

  it("transformCoordinate", () => {
    const a = new Vector3(2, 3, 4);
    const out = new Vector3();
    const b = new Vector4(2, 3, 4, 1);
    const out4 = new Vector4();
    const m4 = new Matrix();
    m4.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    Vector3.transformCoordinate(a, m4, out);
    Vector4.transform(b, m4, out4);
    expect(out.x).to.eq(out4.x / out4.w);
    expect(out.y).to.eq(out4.y / out4.w);
    expect(out.z).to.eq(out4.z / out4.w);
  });

  it("transformByQuat", () => {
    const a = new Vector3(2, 3, 4);
    a.transformByQuat(new Quaternion(2, 3, 4, 5));
    expect(toString(a)).to.eq("vec3(108, 162, 216)");
  });

  it("toJSON", () => {
    const a = new Vector3(2, 3, 4);
    expect(JSON.stringify(a)).to.eq('{"x":2,"y":3,"z":4}');
  });
});
