import { MathUtil, Quaternion, Vector3, Matrix3x3, Matrix } from "@galacean/engine-math";
import { expect } from "chai";

function toString(q: Quaternion): string {
  return `quat(${q.x}, ${q.y}, ${q.z}, ${q.w})`;
}

describe("Quaternion test", () => {
  it("static add", () => {
    const a = new Quaternion(2, 3, 4, 1);
    const b = new Quaternion(-3, 5, 0, 2);
    const out = new Quaternion();

    Quaternion.add(a, b, out);
    expect(toString(out)).to.eq("quat(-1, 8, 4, 3)");
  });

  it("static multiply", () => {
    const a = new Quaternion(2, 3, 4, 1);
    const b = new Quaternion(-3, 5, 0, 2);
    const out = new Quaternion();

    Quaternion.multiply(a, b, out);
    expect(toString(out)).to.eq("quat(-19, -1, 27, -7)");
  });

  it("static conjugate", () => {
    const a = new Quaternion(2, 3, 4, 5);
    const out = new Quaternion();

    Quaternion.conjugate(a, out);
    expect(toString(out)).to.eq("quat(-2, -3, -4, 5)");
  });

  it("static dot", () => {
    const a = new Quaternion(2, 3, 1, 1);
    const b = new Quaternion(-4, 5, 1, 1);

    expect(Quaternion.dot(a, b)).to.eq(9);
    expect(a.dot(b)).to.eq(9);
  });

  it("static equals", () => {
    const a = new Quaternion(1, 2, 3, 4);
    const b = new Quaternion(1 + MathUtil.zeroTolerance * 0.9, 2, 3, 4);

    expect(Quaternion.equals(a, b)).to.eq(true);
  });

  it("static rotationAxisAngle", () => {
    const a = new Vector3(3, 7, 5);
    const b = new Vector3();
    const out = new Quaternion();
    Quaternion.rotationAxisAngle(a, Math.PI / 3, out);
    const rad = out.getAxisAngle(b);

    expect(MathUtil.equals(rad, Math.PI / 3)).to.eq(true);
    expect(Vector3.equals(b.normalize(), a.normalize())).to.eq(true);
  });

  it("static rotationEuler | rotationYawPitchRoll", () => {
    const out1 = new Quaternion();
    const out2 = new Quaternion();
    Quaternion.rotationEuler(0, Math.PI / 3, Math.PI / 2, out1);
    Quaternion.rotationYawPitchRoll(0, Math.PI / 3, Math.PI / 2, out2);

    const a = out1.toEuler(new Vector3());
    const b = out2.toYawPitchRoll(new Vector3());
    expect(Vector3.equals(a, new Vector3(0, Math.PI / 3, Math.PI / 2))).to.eq(true);
    expect(Vector3.equals(b, new Vector3(0, Math.PI / 3, Math.PI / 2))).to.eq(true);
  });

  it("static rotationMatrix3x3", () => {
    const a1 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const a2 = new Matrix3x3(1, 2, 3, 4, -5, 6, 7, 8, -9);
    const a3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, -9);
    const a4 = new Matrix3x3(-7, 2, 3, 4, -5, 6, 7, 8, 9);
    const out = new Quaternion();

    Quaternion.rotationMatrix3x3(a1, out);
    expect(Quaternion.equals(out, new Quaternion(-0.25, 0.5, -0.25, 2))).to.eq(true);
    Quaternion.rotationMatrix3x3(a2, out);
    expect(Quaternion.equals(out, new Quaternion(2, 0.75, 1.25, -0.25))).to.eq(true);
    Quaternion.rotationMatrix3x3(a3, out);
    expect(
      Quaternion.equals(
        out,
        new Quaternion(0.8017837257372732, 1.8708286933869707, 1.8708286933869709, 0.5345224838248488)
      )
    ).to.eq(true);
    Quaternion.rotationMatrix3x3(a4, out);
    expect(
      Quaternion.equals(
        out,
        new Quaternion(1.066003581778052, 1.4924050144892729, 2.345207879911715, -0.21320071635561041)
      )
    ).to.eq(true);
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
    ).to.eq(true);
  });

  it("static lerp", () => {
    const a = new Quaternion(0, 1, 2, 0);
    const b = new Quaternion(2, 2, 0, 0);
    const normal = new Quaternion(1, 1.5, 1, 0);
    const out = new Quaternion();

    Quaternion.lerp(a, b, 0.5, out);
    expect(Quaternion.equals(out, normal.normalize())).to.eq(true);
    a.lerp(b, 0.5);
    expect(Quaternion.equals(a, normal.normalize())).to.eq(true);
  });

  it("static slerp", () => {
    const a = new Quaternion(1, 1, 1, 0.5);
    const b = new Quaternion(0.5, 0.5, 0.5, 0.5);
    const out = new Quaternion();

    Quaternion.slerp(a, b, 0.5, out);
    expect(toString(out)).to.eq("quat(0.75, 0.75, 0.75, 0.5)");
  });

  it("static normalize", () => {
    const a = new Quaternion(3, 4, 0, 0);
    const out = new Quaternion();

    Quaternion.normalize(a, out);
    expect(Quaternion.equals(out, new Quaternion(0.6, 0.8, 0, 0))).to.eq(true);
  });

  it("static rotation", () => {
    const out = new Quaternion();

    Quaternion.rotationX(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0.6816387600233341, 0, 0, 0.7316888688738209))).to.eq(true);

    Quaternion.rotationY(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0, 0.6816387600233341, 0, 0.7316888688738209))).to.eq(true);

    Quaternion.rotationZ(1.5, out);
    expect(Quaternion.equals(out, new Quaternion(0, 0, 0.6816387600233341, 0.7316888688738209))).to.eq(true);
  });

  it("static rotate", () => {
    const a = new Quaternion();
    const b = new Quaternion();
    const out = new Quaternion();

    Quaternion.rotateX(a, 1.5, out);
    b.rotateX(1.5);
    expect(Quaternion.equals(out, new Quaternion(0.6816387600233341, 0, 0, 0.7316888688738209))).to.eq(true);
    expect(Quaternion.equals(out, b)).to.eq(true);

    Quaternion.rotateY(a, 1.5, out);
    b.set(0, 0, 0, 1);
    b.rotateY(1.5);
    expect(Quaternion.equals(out, new Quaternion(0, 0.6816387600233341, 0, 0.7316888688738209))).to.eq(true);
    expect(Quaternion.equals(out, b)).to.eq(true);

    Quaternion.rotateZ(a, 1.5, out);
    b.set(0, 0, 0, 1);
    b.rotateZ(1.5);
    expect(Quaternion.equals(out, new Quaternion(0, 0, 0.6816387600233341, 0.7316888688738209))).to.eq(true);
    expect(Quaternion.equals(out, b)).to.eq(true);
  });

  it("static rotatAxisAngle", () => {
    const a = new Vector3(0, 5, 0);
    const b = 0.5 * Math.PI;
    const out = new Quaternion(0, 0, 0, 1);
    out.rotateAxisAngle(a, b);
    expect(Quaternion.equals(out, new Quaternion(0, 0.7071067811865475, 0, 0.7071067811865476))).to.eq(true);
  });

  it("static scale", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const out = new Quaternion();

    Quaternion.scale(a, 3, out);
    expect(toString(out)).to.eq("quat(9, 12, 15, 0)");
  });

  it("static toEuler", () => {
    const a = new Quaternion();
    Quaternion.rotationEuler(0, Math.PI / 3, 0, a);
    const euler = a.toEuler(new Vector3());
    const ypr = a.toYawPitchRoll(new Vector3());
    expect(Vector3.equals(euler, new Vector3(0, Math.PI / 3, 0))).to.eq(true);
    expect(Vector3.equals(ypr, new Vector3(Math.PI / 3, 0, 0))).to.eq(true);

    a.set(0.5, 0.5, 0.5, -0.5);
    a.toEuler(euler);
    expect(MathUtil.radianToDegree(euler.x)).to.eq(-90);
    expect(MathUtil.radianToDegree(euler.y)).to.eq(-90);
    expect(MathUtil.radianToDegree(euler.z)).to.eq(0);

    a.set(0.5, -0.5, 0.5, 0.5);
    a.toEuler(euler);
    expect(MathUtil.radianToDegree(euler.x)).to.eq(90);
    expect(MathUtil.radianToDegree(euler.y)).to.eq(-90);
    expect(MathUtil.radianToDegree(euler.z)).to.eq(0);

    const matrixBef = new Matrix();
    const matrixAft = new Matrix();
    const scale = new Vector3(1, 1, 1);
    const transform = new Vector3(0, 0, 0);
    for (let x = 0; x <= 180; x += 10) {
      for (let y = 0; y <= 180; y += 10) {
        for (let z = 0; z <= 180; z += 10) {
          Quaternion.rotationEuler(
            MathUtil.degreeToRadian(x),
            MathUtil.degreeToRadian(y),
            MathUtil.degreeToRadian(z),
            a
          );
          Matrix.affineTransformation(scale, a, transform, matrixBef);
          a.toEuler(euler);
          Quaternion.rotationEuler(euler.x, euler.y, euler.z, a);
          Matrix.affineTransformation(scale, a, transform, matrixAft);
          expect(Matrix.equals(matrixBef, matrixAft)).to.eq(true);
        }
      }
    }
  });

  it("setValue", () => {
    const a = new Quaternion();
    a.set(1, 1, 1, 1);
    const b = new Quaternion();
    b.copyFromArray([1, 1, 1, 1]);
    expect(Quaternion.equals(a, b)).to.eq(true);

    const c = [];
    b.copyToArray(c);
    const d = new Quaternion();
    d.copyFromArray(c);
    expect(Quaternion.equals(a, d)).to.eq(true);
  });

  it("clone", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const b = a.clone();
    expect(toString(a)).to.eq(toString(b));
  });

  it("copyFrom", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const out = new Quaternion();
    out.copyFrom(a);
    expect(toString(a)).to.eq(toString(out));
  });

  it("copyTo", () => {
    const a = new Quaternion(3, 4, 5, 0);
    const out = new Quaternion();
    a.copyTo(out);
    expect(toString(a)).to.eq(toString(out));
  });

  it("conjugate", () => {
    const a = new Quaternion(1, 1, 1, 1);
    expect(toString(a.conjugate())).to.eq("quat(-1, -1, -1, 1)");
  });

  it("identity", () => {
    const a = new Quaternion();
    a.identity();

    expect(toString(a)).to.eq("quat(0, 0, 0, 1)");
  });

  it("length", () => {
    const a = new Quaternion(3, 4, 5, 0);
    expect(MathUtil.equals(Math.sqrt(50), a.length())).to.eq(true);
    expect(a.lengthSquared()).to.eq(50);
  });
});
