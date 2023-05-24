import { Matrix3x3, Matrix, Quaternion, Vector2 } from "@galacean/engine-math";
import { expect } from "chai";

describe("Matrix3x3 test", () => {
  it("static add", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.add(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(10, 10, 10, 10, 10, 10, 10, 10, 10))).to.eq(true);
  });

  it("static subtract", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.subtract(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(-8, -6, -4, -2, 0, 2, 4, 6, 8))).to.eq(true);
  });

  it("static multiply", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.multiply(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(90, 114, 138, 54, 69, 84, 18, 24, 30))).to.eq(true);
  });

  it("static equals", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const c = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    expect(Matrix3x3.equals(a, b)).to.eq(true);
    expect(Matrix3x3.equals(a, c)).to.eq(false);
  });

  it("static lerp", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const c = new Matrix3x3();
    Matrix3x3.lerp(a, b, 0.78, c);

    expect(Matrix3x3.equals(a, b)).to.eq(true);
    expect(Matrix3x3.equals(a, c)).to.eq(true);
  });

  it("static fromXXX", () => {
    const out = new Matrix3x3();
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    // Matrix
    out.copyFromMatrix(a);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 5, 6, 7, 9, 10, 11))).to.eq(true);

    // quat
    const q = new Quaternion(1, 2, 3, 4);
    Matrix3x3.rotationQuaternion(q, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(-25, 28, -10, -20, -19, 20, 22, 4, -9))).to.eq(true);

    // scaling
    const scale = new Vector2(1, 2);
    Matrix3x3.scaling(scale, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 2, 0, 0, 0, 1))).to.eq(true);

    // translation
    const translation = new Vector2(2, 3);
    Matrix3x3.translation(translation, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 1, 0, 2, 3, 1))).to.eq(true);
  });

  it("static invert", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 2, 2, 4, 3, 1, 3);

    Matrix3x3.invert(mat3, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, -1.5, 1, 3, -3, 1, -2, 2.5, -1))).to.eq(true);
  });

  it("static normalMatrix", () => {
    const out = new Matrix3x3();
    const mat4 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    Matrix3x3.normalMatrix(mat4, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 1, 0, 0, 0, 1))).to.eq(true);
  });

  it("static rotate", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.rotate(mat3, Math.PI / 3, out);
    expect(
      Matrix3x3.equals(
        out,
        new Matrix3x3(
          3.964101552963257,
          5.330127239227295,
          6.696152210235596,
          1.133974552154541,
          0.7679491639137268,
          0.4019237756729126,
          7,
          8,
          9
        )
      )
    ).to.eq(true);
  });

  it("static scale", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.scale(mat3, new Vector2(1, 2), out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 8, 10, 12, 7, 8, 9))).to.eq(true);
  });

  it("static translate", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.translate(mat3, new Vector2(1, 2), out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 4, 5, 6, 16, 20, 24))).to.eq(true);
  });

  it("static transpose", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.transpose(mat3, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 4, 7, 2, 5, 8, 3, 6, 9))).to.eq(true);
    Matrix3x3.transpose(out, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).to.eq(true);
  });

  it("set", () => {
    const a = new Matrix3x3();
    a.set(1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).to.eq(true);
  });

  it("copyFromXXX", () => {
    const a = new Matrix3x3();
    a.copyFromArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const b = new Matrix3x3();
    b.copyFromMatrix(new Matrix(1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 0, 0, 0, 1));
    const c = new Matrix3x3();
    const arr = [];
    a.copyToArray(arr);
    c.copyFromArray(arr);

    expect(Matrix3x3.equals(a, b)).to.eq(true);
    expect(Matrix3x3.equals(a, c)).to.eq(true);
    expect(Matrix3x3.equals(b, c)).to.eq(true);
  });

  it("clone", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = a.clone();

    expect(Matrix3x3.equals(a, b)).to.eq(true);
  });

  it("copyFrom", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const out = new Matrix3x3();

    out.copyFrom(a);
    expect(Matrix3x3.equals(a, out)).to.eq(true);
  });

  it("add", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.add(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(10, 10, 10, 10, 10, 10, 10, 10, 10))).to.eq(true);
  });

  it("static subtract", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.subtract(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(-8, -6, -4, -2, 0, 2, 4, 6, 8))).to.eq(true);
  });

  it("multiply", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.multiply(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(90, 114, 138, 54, 69, 84, 18, 24, 30))).to.eq(true);
  });

  it("determinant", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(a.determinant()).to.eq(0);
  });

  it("invert", () => {
    const a = new Matrix3x3(1, 2, 3, 2, 2, 4, 3, 1, 3);

    a.invert();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, -1.5, 1, 3, -3, 1, -2, 2.5, -1))).to.eq(true);
  });

  it("rotate", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.rotate(Math.PI / 3);
    expect(
      Matrix3x3.equals(
        a,
        new Matrix3x3(
          3.964101552963257,
          5.330127239227295,
          6.696152210235596,
          1.133974552154541,
          0.7679491639137268,
          0.4019237756729126,
          7,
          8,
          9
        )
      )
    ).to.eq(true);
  });

  it("scale", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.scale(new Vector2(1, 2));
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 8, 10, 12, 7, 8, 9))).to.eq(true);
  });

  it("translate", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.translate(new Vector2(1, 2));
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 16, 20, 24))).to.eq(true);
  });

  it("transpose", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.transpose();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 4, 7, 2, 5, 8, 3, 6, 9))).to.eq(true);
    a.transpose();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).to.eq(true);
  });
});
