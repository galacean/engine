import { MathUtil } from "../src/MathUtil";
import { Quaternion } from "../src/Quaternion";
import { Vector3 } from "../src/Vector3";
import { Matrix3x3 } from "../src/Matrix3x3";

function toString(q: Quaternion): string {
  return `quat(${q.x}, ${q.y}, ${q.z}, ${q.w})`;
}

describe("Quaternion test", () => {
  it("static add", () => {
    const a = new Quaternion(2, 3, 4, 1);
    const b = new Quaternion(-3, 5, 0, 2);
    const out = new Quaternion();

    Quaternion.add(a, b, out);
    expect(toString(out)).toEqual("quat(-1, 8, 4, 3)");
  });

  it("static multiply", () => {
    const a = new Quaternion(2, 3, 4, 1);
    const b = new Quaternion(-3, 5, 0, 2);
    const out = new Quaternion();

    Quaternion.multiply(a, b, out);
    expect(toString(out)).toEqual("quat(-19, -1, 27, -7)");
  });

  it("static conjugate", () => {
    const a = new Quaternion(2, 3, 4, 5);
    const out = new Quaternion();

    Quaternion.conjugate(a, out);
    expect(toString(out)).toEqual("quat(-2, -3, -4, 5)");
  });

  it("static dot", () => {
    const a = new Quaternion(2, 3, 1, 1);
    const b = new Quaternion(-4, 5, 1, 1);

    expect(Quaternion.dot(a, b)).toEqual(9);
  });

  it("static equals", () => {
    const a = new Quaternion(1, 2, 3, 4);
    const b = new Quaternion(1 + MathUtil.zeroTolerance * 0.9, 2, 3, 4);

    expect(Quaternion.equals(a, b)).toEqual(true);
  });

  it("static rotationAxisAngle", () => {
    const a = new Vector3(3, 7, 5);
    const b = new Vector3();
    const out = new Quaternion();
    Quaternion.rotationAxisAngle(a, Math.PI / 3, out);
    const rad = out.getAxisAngle(b);

    expect(MathUtil.equals(rad, Math.PI / 3)).toEqual(true);
    expect(Vector3.equals(b.normalize(), a.normalize())).toEqual(true);
  });

  it("static rotationEuler | rotationYawPitchRoll", () => {
    const out1 = new Quaternion();
    const out2 = new Quaternion();
    Quaternion.rotationEuler(0, Math.PI / 3, Math.PI / 2, out1);
    Quaternion.rotationYawPitchRoll(0, Math.PI / 3, Math.PI / 2, out2);

    const a = out1.toEuler();
    const b = out2.toYawPitchRoll();
    expect(Vector3.equals(a, new Vector3(0, Math.PI / 3, Math.PI / 2))).toEqual(true);
    expect(Vector3.equals(b, new Vector3(0, Math.PI / 3, Math.PI / 2))).toEqual(true);
  });

  it("static rotationMatrix3x3", () => {
    const a1 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const a2 = new Matrix3x3(1, 2, 3, 4, -5, 6, 7, 8, -9);
    const a3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, -9);
    const a4 = new Matrix3x3(-7, 2, 3, 4, -5, 6, 7, 8, 9);
    const out = new Quaternion();

    Quaternion.rotationMatrix3x3(a1, out);
    expect(Quaternion.equals(out, new Quaternion(-0.25, 0.5, -0.25, 2))).toEqual(true);
    Quaternion.rotationMatrix3x3(a2, out);
    expect(Quaternion.equals(out, new Quaternion(2, 0.75, 1.25, -0.25))).toEqual(true);
    Quaternion.rotationMatrix3x3(a3, out);
    expect(
      Quaternion.equals(
        out,
        new Quaternion(0.8017837257372732, 1.8708286933869707, 1.8708286933869709, 0.5345224838248488)
      )
    ).toEqual(true);
    Quaternion.rotationMatrix3x3(a4, out);
    expect(
      Quaternion.equals(
        out,
        new Quaternion(1.066003581778052, 1.4924050144892729, 2.345207879911715, -0.21320071635561041)
      )
    ).toEqual(true);
  });

  it("static invert", () => {
    const a = new Quaternion(1, 1, 1, 0.5);
    const out = new Quaternion();

    Quaternion.invert(a, out);
    expect(
      Quaternion.equals(
        out,
        new Quaternion(-0.3076923076923077, -0.3076923076923077, -0.3076923076923077, 0.15384615384615385)
      )
    ).toEqual(true);
  });

  it("static lerp", () => {
    const a = new Quaternion(0, 1, 2, 0);
    const b = new Quaternion(2, 2, 0, 0);
    const normal = new Quaternion(1, 1.5, 1, 0);
    const out = new Quaternion();

    Quaternion.lerp(a, b, 0.5, out);
    expect(Quaternion.equals(out, normal.normalize())).toEqual(true);
  });

  it("static slerp", () => {
    const a = new Quaternion(1, 1, 1, 0.5);
    const b = new Quaternion(0.5, 0.5, 0.5, 0.5);
    const out = new Quaternion();

    Quaternion.slerp(a, b, 0.5, out);
    expect(toString(out)).toEqual("quat(0.75, 0.75, 0.75, 0.5)");
  });

  it("static normalize", () => {
    const a = new Quaternion(3, 4, 0, 0);
    const out = new Quaternion();

    Quaternion.normalize(a, out);
    expect(Quaternion.equals(out, new Quaternion(0.6, 0.8, 0, 0))).toEqual(true);
  });

  it("static rotation", () => {
    const out = new Quaternion();

    Quaternion.rotationX(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0.6816387600233341, 0, 0, 0.7316888688738209))).toEqual(true);

    Quaternion.rotationY(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0, 0.6816387600233341, 0, 0.7316888688738209))).toEqual(true);

    Quaternion.rotationZ(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0, 0, 0.6816387600233341, 0.7316888688738209))).toEqual(true);
  });

  it("static scale", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const out = new Quaternion();

    Quaternion.scale(a, 3, out);
    expect(toString(out)).toEqual("quat(9, 12, 15, 0)");
  });

  it("static toEuler", () => {
    const a = new Quaternion();
    Quaternion.rotationEuler(0, Math.PI / 3, 0, a);
    const euler = a.toEuler();
    const ypr = a.toYawPitchRoll();
    expect(Vector3.equals(euler, new Vector3(0, Math.PI / 3, 0))).toEqual(true);
    expect(Vector3.equals(ypr, new Vector3(Math.PI / 3, 0, 0))).toEqual(true);
  });

  it("clone", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const b = a.clone();
    expect(toString(a)).toEqual(toString(b));
  });

  it("cloneTo", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const out = new Quaternion();
    a.cloneTo(out);
    expect(toString(a)).toEqual(toString(out));
  });

  it("conjugate", () => {
    const a = new Quaternion(1, 1, 1, 1);
    expect(toString(a.conjugate())).toEqual("quat(-1, -1, -1, 1)");
  });

  it("identity", () => {
    const a = new Quaternion();
    a.identity();

    expect(toString(a)).toEqual("quat(0, 0, 0, 1)");
  });

  it("length", () => {
    const a = new Quaternion(3, 4, 5, 0);
    expect(MathUtil.equals(Math.sqrt(50), a.length())).toEqual(true);
    expect(a.lengthSquared()).toEqual(50);
  });
});
