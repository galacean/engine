import { Matrix3x3 } from "../src/Matrix3x3";
import { Matrix4x4 } from "../src/Matrix4x4";
import { Quaternion } from "../src/Quaternion";
import { Vector2 } from "../src/Vector2";
import { Vector3 } from "../src/Vector3";

describe("Matrix3x3 test", () => {
  it("static add", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.add(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(10, 10, 10, 10, 10, 10, 10, 10, 10))).toEqual(true);
  });

  it("static subtract", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.subtract(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(-8, -6, -4, -2, 0, 2, 4, 6, 8))).toEqual(true);
  });

  it("static multiply", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix3x3();

    Matrix3x3.multiply(a, b, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(90, 114, 138, 54, 69, 84, 18, 24, 30))).toEqual(true);
  });

  it("static equals", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const c = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    expect(Matrix3x3.equals(a, b)).toEqual(true);
    expect(Matrix3x3.equals(a, c)).toEqual(false);
  });

  it("static fromXXX", () => {
    const out = new Matrix3x3();
    const a = new Matrix4x4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    // matrix4x4
    Matrix3x3.fromMat4(a, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 5, 6, 7, 9, 10, 11))).toEqual(true);

    // quat
    const q = new Quaternion(1, 2, 3, 4);
    Matrix3x3.fromQuat(q, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(-25, 28, -10, -20, -19, 20, 22, 4, -9))).toEqual(true);

    // rotation
    Matrix3x3.fromRotation(Math.PI / 3, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(0.5, Math.sqrt(3) / 2, 0, -Math.sqrt(3) / 2, 0.5, 0, 0, 0, 1))).toEqual(
      true
    );

    // scaling
    const scale = new Vector2(1, 2);
    Matrix3x3.fromScaling(scale, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 2, 0, 0, 0, 1))).toEqual(true);

    // translation
    const trans = new Vector2(2, 3);
    Matrix3x3.fromTranslation(trans, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 1, 0, 2, 3, 1))).toEqual(true);
  });

  it("static invert", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 2, 2, 4, 3, 1, 3);

    Matrix3x3.invert(mat3, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, -1.5, 1, 3, -3, 1, -2, 2.5, -1))).toEqual(true);
  });

  it("static normalFromMat4", () => {
    const out = new Matrix3x3();
    const mat4 = new Matrix4x4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    Matrix3x3.normalFromMat4(mat4, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 0, 0, 0, 1, 0, 0, 0, 1))).toEqual(true);
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
    ).toEqual(true);
  });

  it("static scale", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.scale(mat3, new Vector2(1, 2), out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 8, 10, 12, 7, 8, 9))).toEqual(true);
  });

  it("static translate", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.translate(mat3, new Vector2(1, 2), out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 4, 5, 6, 16, 20, 24))).toEqual(true);
  });

  it("static transpose", () => {
    const out = new Matrix3x3();
    const mat3 = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    Matrix3x3.transpose(mat3, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 4, 7, 2, 5, 8, 3, 6, 9))).toEqual(true);
    Matrix3x3.transpose(out, out);
    expect(Matrix3x3.equals(out, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).toEqual(true);
  });

  it("setValue", () => {
    const a = new Matrix3x3();
    a.setValue(1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).toEqual(true);
  });

  it("clone", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = a.clone();

    expect(Matrix3x3.equals(a, b)).toEqual(true);
  });

  it("cloneTo", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const out = new Matrix3x3();

    a.cloneTo(out);
    expect(Matrix3x3.equals(a, out)).toEqual(true);
  });

  it("add", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.add(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(10, 10, 10, 10, 10, 10, 10, 10, 10))).toEqual(true);
  });

  it("static subtract", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.subtract(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(-8, -6, -4, -2, 0, 2, 4, 6, 8))).toEqual(true);
  });

  it("multiply", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = new Matrix3x3(9, 8, 7, 6, 5, 4, 3, 2, 1);

    a.multiply(b);
    expect(Matrix3x3.equals(a, new Matrix3x3(90, 114, 138, 54, 69, 84, 18, 24, 30))).toEqual(true);
  });

  it("determinant", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(a.determinant()).toEqual(0);
  });

  it("invert", () => {
    const a = new Matrix3x3(1, 2, 3, 2, 2, 4, 3, 1, 3);

    a.invert();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, -1.5, 1, 3, -3, 1, -2, 2.5, -1))).toEqual(true);
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
    ).toEqual(true);
  });

  it("scale", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.scale(new Vector2(1, 2));
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 8, 10, 12, 7, 8, 9))).toEqual(true);
  });

  it("translate", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.translate(new Vector2(1, 2));
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 16, 20, 24))).toEqual(true);
  });

  it("transpose", () => {
    const a = new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9);

    a.transpose();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 4, 7, 2, 5, 8, 3, 6, 9))).toEqual(true);
    a.transpose();
    expect(Matrix3x3.equals(a, new Matrix3x3(1, 2, 3, 4, 5, 6, 7, 8, 9))).toEqual(true);
  });
});
