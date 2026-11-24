import { Matrix, Vector3, Quaternion } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("Matrix test", () => {
  it("static multiply", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const b = new Matrix(16, 15, 14, 13, 12, 11, 10, 9, 8.88, 7, 6, 5, 4, 3, 2, 1);
    const out = new Matrix();

    Matrix.multiply(a, b, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          386,
          456.6,
          506.8,
          560,
          274,
          325,
          361.6,
          400,
          162.88,
          195.16000000000003,
          219.304,
          243.52,
          50,
          61.8,
          71.2,
          80
        )
      )
    ).to.eq(true);
  });

  it("static equals", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const b = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const c = new Matrix(16, 15, 14, 13, 12, 11, 10, 9, 8.88, 7, 6, 5, 4, 3, 2, 1);

    expect(Matrix.equals(a, b)).to.eq(true);
    expect(Matrix.equals(a, c)).to.eq(false);
  });

  it("static lerp", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const c = new Matrix();
    Matrix.lerp(a, b, 0.7, c);

    expect(Matrix.equals(a, c)).to.eq(true);
    expect(Matrix.equals(b, c)).to.eq(true);
  });

  it("static rotationQuaternion", () => {
    const q = new Quaternion(1, 2, 3, 4);
    const out = new Matrix();

    Matrix.rotationQuaternion(q, out);
    expect(Matrix.equals(out, new Matrix(-25, 28, -10, 0, -20, -19, 20, 0, 22, 4, -9, 0, 0, 0, 0, 1))).to.eq(true);
  });

  it("static rotationAxisAngle", () => {
    const out = new Matrix();

    Matrix.rotationAxisAngle(new Vector3(0, 1, 0), Math.PI / 3, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          0.5000000000000001,
          0,
          -0.8660254037844386,
          0,
          0,
          1,
          0,
          0,
          0.8660254037844386,
          0,
          0.5000000000000001,
          0,
          0,
          0,
          0,
          1
        )
      )
    ).to.eq(true);
  });

  it("static rotationTranslation", () => {
    const q = new Quaternion(1, 0.5, 2, 1);
    const v = new Vector3(1, 1, 1);
    const out = new Matrix();

    Matrix.rotationTranslation(q, v, out);
    expect(Matrix.equals(out, new Matrix(-7.5, 5, 3, 0, -3, -9, 4, 0, 5, 0, -1.5, 0, 1, 1, 1, 1))).to.eq(true);
  });

  it("static affineTransformation", () => {
    const q = new Quaternion(1, 0.5, 2, 1);
    const v = new Vector3(1, 1, 1);
    const s = new Vector3(1, 0.5, 2);
    const out = new Matrix();

    Matrix.affineTransformation(s, q, v, out);
    expect(Matrix.equals(out, new Matrix(-7.5, 5, 3, 0, -1.5, -4.5, 2, 0, 10, 0, -3, 0, 1, 1, 1, 1))).to.eq(true);
  });

  it("static scaling", () => {
    const a = new Matrix();
    const out = new Matrix();

    Matrix.scale(a, new Vector3(1, 2, 0.5), out);
    expect(Matrix.equals(out, new Matrix(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1))).to.eq(true);
  });

  it("static translation", () => {
    const out = new Matrix();
    const v = new Vector3(1, 2, 0.5);

    Matrix.translation(v, out);
    expect(Matrix.equals(out, new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 0.5, 1))).to.eq(true);
  });

  it("static invert", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    Matrix.invert(a, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          -1.1111111111111172,
          1.3703703703703825,
          -0.7407407407407528,
          0.1481481481481532,
          0,
          -0.5555555555555607,
          1.1111111111111214,
          -0.5555555555555607,
          3.3333333333333863,
          -5.000000000000064,
          0,
          1.6666666666666867,
          -2.222222222222265,
          4.0601851851852375,
          -0.3703703703703687,
          -1.134259259259275
        )
      )
    ).to.eq(true);
  });

  it("static lookAt", () => {
    const out = new Matrix();
    const eye = new Vector3(0, 0, -8);
    const target = new Vector3(0, 0, 0);
    const up = new Vector3(0, 1, 0);

    Matrix.lookAt(eye, target, up, out);
    expect(Matrix.equals(out, new Matrix(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -8, 1))).to.eq(true);

    eye.set(0, 0, 0);
    target.set(0, 1, -1);
    up.set(0, 1, 0);
    Matrix.lookAt(eye, target, up, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          1,
          0,
          0,
          0,
          0,
          0.7071067690849304,
          -0.7071067690849304,
          0,
          0,
          0.7071067690849304,
          0.7071067690849304,
          0,
          0,
          0,
          0,
          1
        )
      )
    ).to.eq(true);
  });

  it("static ortho", () => {
    const out = new Matrix();
    Matrix.ortho(0, 2, -1, 1, 0.1, 100, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.02002002002002002, 0, -1, 0, -1.002002002002002, 1)
      )
    ).to.eq(true);
  });

  it("static perspective", () => {
    const out = new Matrix();
    Matrix.perspective(1, 1.5, 0.1, 100, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          1.2203251478083013,
          0,
          0,
          0,
          0,
          1.830487721712452,
          0,
          0,
          0,
          0,
          -1.002002002002002,
          -1,
          0,
          0,
          -0.20020020020020018,
          0
        )
      )
    ).to.eq(true);
  });

  it("static rotateAxisAngle", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    Matrix.rotateAxisAngle(a, new Vector3(0, 1, 0), Math.PI / 3, out);
    expect(
      Matrix.equals(
        out,
        new Matrix(
          -7.294228634059947,
          -8.439676901250381,
          -7.876279441628824,
          -8.392304845413264,
          5,
          6,
          7,
          8,
          5.366025403784439,
          7.182050807568878,
          8.357883832488648,
          9.464101615137757,
          13,
          14,
          15,
          16
        )
      )
    ).to.eq(true);
  });

  it("static scale", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    Matrix.scale(a, new Vector3(1, 2, 0.5), out);
    expect(Matrix.equals(out, new Matrix(1, 2, 3, 4, 10, 12, 14, 16, 4.5, 5, 5.5, 6, 13, 14, 15, 16))).to.eq(true);
  });

  it("static translate", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    Matrix.translate(a, new Vector3(1, 2, 0.5), out);
    expect(Matrix.equals(out, new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 28.5, 33.45, 37.8, 42))).to.eq(
      true
    );
  });

  it("static transpose", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    Matrix.transpose(a, out);
    expect(Matrix.equals(out, new Matrix(1, 5, 9, 13, 2, 6, 10.9, 14, 3.3, 7, 11, 15, 4, 8, 12, 16))).to.eq(true);
  });

  it("set", () => {
    const a = new Matrix();
    a.set(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    expect(Matrix.equals(a, new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16))).to.eq(true);
  });

  it("set", () => {
    const a = new Matrix();
    a.set(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    expect(Matrix.equals(a, new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16))).to.eq(true);
  });

  it("copyToArray", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const b = [];
    a.copyToArray(b);
    const c = new Matrix();
    c.set(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    expect(Matrix.equals(a, c)).to.eq(true);
  });

  it("clone", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const b = a.clone();

    expect(Matrix.equals(a, b)).to.eq(true);
  });

  it("copyFrom", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const out = new Matrix();

    out.copyFrom(a);
    expect(Matrix.equals(a, out)).to.eq(true);
  });

  it("multiply", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    const b = new Matrix(16, 15, 14, 13, 12, 11, 10, 9, 8.88, 7, 6, 5, 4, 3, 2, 1);

    a.multiply(b);
    expect(
      Matrix.equals(
        a,
        new Matrix(
          386,
          456.6,
          506.8,
          560,
          274,
          325,
          361.6,
          400,
          162.88,
          195.16000000000003,
          219.304,
          243.52,
          50,
          61.8,
          71.2,
          80
        )
      )
    ).to.eq(true);
  });

  it("determinant", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    expect(a.determinant()).to.eq(0);
  });

  it("decompose", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
    // const a = new Matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();

    a.decompose(pos, quat, scale);
    expect(Vector3.equals(pos, new Vector3(13, 14, 15))).to.eq(true);
    expect(
      Quaternion.equals(
        quat,
        new Quaternion(0.01879039477474769, -0.09554131404261303, 0.01844761344901482, 0.783179537258594)
      )
    ).to.eq(true);
    expect(Vector3.equals(scale, new Vector3(3.7416573867739413, 10.488088481701515, 17.91116946723357))).to.eq(true);
  });

  it("getXXX", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    // getRotation
    const quat = new Quaternion();
    a.getRotation(quat);
    expect(
      Quaternion.equals(
        quat,
        new Quaternion(-0.44736068104759547, 0.6882472016116852, -0.3441236008058426, 2.179449471770337)
      )
    ).to.eq(true);

    // getScaling
    const scale = new Vector3();
    a.getScaling(scale);
    expect(Vector3.equals(scale, new Vector3(3.7416573867739413, 10.488088481701515, 17.911169699380327))).to.eq(true);

    // getTranslation
    const translation = new Vector3();
    a.getTranslation(translation);
    expect(Vector3.equals(translation, new Vector3(13, 14, 15))).to.eq(true);
  });

  it("invert", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    a.invert();
    expect(
      Matrix.equals(
        a,
        new Matrix(
          -1.1111111111111172,
          1.3703703703703825,
          -0.7407407407407528,
          0.1481481481481532,
          0,
          -0.5555555555555607,
          1.1111111111111214,
          -0.5555555555555607,
          3.3333333333333863,
          -5.000000000000064,
          0,
          1.6666666666666867,
          -2.222222222222265,
          4.0601851851852375,
          -0.3703703703703687,
          -1.134259259259275
        )
      )
    ).to.eq(true);

    // Affine matrix fast path (rotation + non-uniform/negative scale + translation)
    const q = new Quaternion();
    Quaternion.rotationYawPitchRoll(0.5, -0.3, 0.7, q);
    const affine = new Matrix();
    Matrix.affineTransformation(new Vector3(-2, 3, 0.5), q, new Vector3(10, -20, 30), affine);
    const inv = new Matrix();
    expect(Matrix.invert(affine, inv)).to.eq(undefined);
    const prod = new Matrix();
    Matrix.multiply(affine, inv, prod);
    for (let i = 0; i < 16; i++) {
      expect(prod.elements[i]).to.be.closeTo(i % 5 === 0 ? 1 : 0, 1e-5);
    }

    // In-place affine invert
    const inPlace = affine.clone();
    inPlace.invert();
    for (let i = 0; i < 16; i++) {
      expect(inPlace.elements[i]).to.be.closeTo(inv.elements[i], 1e-5);
    }

    // Singular affine matrix returns null and leaves out untouched
    const singular = new Matrix(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1);
    const sentinel = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17);
    const out = sentinel.clone();
    expect(Matrix.invert(singular, out)).to.eq(null);
    expect(Matrix.equals(out, sentinel)).to.eq(true);

    // Duplicate-column singular affine matrix returns null without float residual drift
    const duplicateColSingular = new Matrix(0.1, 0.1, 0.2, 0, 0.1, 0.1, 0.2, 0, 0.1, 0.2, 0.1, 0, 1, 2, 3, 1);
    expect(Matrix.invert(duplicateColSingular, out)).to.eq(null);
    expect(Matrix.equals(out, sentinel)).to.eq(true);

    // Extreme-scale affine cancellation sums unscaled cofactors before dividing by det
    const s = 2 ** -100;
    const h = 2 ** 100;
    const extremeAffine = new Matrix(2 * s, s, 0, 0, 3 * h, 7 * h, 0, 0, 0, 0, 1, 0, 3 * h, 7 * h, 0, 1);
    const invExtreme = new Matrix();
    expect(Matrix.invert(extremeAffine, invExtreme)).to.eq(undefined);
    expect(invExtreme.elements[12]).to.eq(0);
    expect(invExtreme.elements[13]).to.eq(-1);
    expect(invExtreme.elements[14]).to.eq(0);

    const smallDet = new Matrix(s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(Matrix.invert(smallDet, smallDet)).to.eq(undefined);
    expect(smallDet.elements[0]).to.eq(1 / s);

    // Non-affine perspective projection matrix still inverts accurately
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 16 / 9, 0.1, 1000, proj);
    const invProj = new Matrix();
    expect(Matrix.invert(proj, invProj)).to.eq(undefined);
    Matrix.multiply(proj, invProj, prod);
    for (let i = 0; i < 16; i++) {
      expect(prod.elements[i]).to.be.closeTo(i % 5 === 0 ? 1 : 0, 1e-4);
    }
  });

  it("inverts an affine translation equal to the third linear column", () => {
    const n = 2 ** 18;
    const a = new Matrix(2 ** -40, 0, 0, 0, n, n - 1, n, 0, n + 1, n, 1, 0, n + 1, n, 1, 1);
    const out = new Matrix();

    expect(Matrix.invert(a, out)).to.eq(undefined);
    expect(out.elements.slice(12, 15)).to.deep.eq(new Float32Array([0, 0, -1]));
    expect(Matrix.invert(a, a)).to.eq(undefined);
    expect(a.elements).to.deep.eq(out.elements);
  });

  it.each([
    { index: 10, component: "scale" },
    { index: 12, component: "translation" }
  ])("rejects affine matrices with non-finite $component without modifying out", ({ index }) => {
    const a = new Matrix();
    a.elements[index] = 2 ** 128; // Overflows Float32 matrix storage.
    const sentinel = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17);
    const out = sentinel.clone();

    expect(Matrix.invert(a, out)).to.eq(null);
    expect(out.elements).to.deep.eq(sentinel.elements);
  });

  it("rotateAxisAngle", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    a.rotateAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);
    expect(
      Matrix.equals(
        a,
        new Matrix(
          -7.294228634059947,
          -8.439676901250381,
          -7.876279441628824,
          -8.392304845413264,
          5,
          6,
          7,
          8,
          5.366025403784439,
          7.182050807568878,
          8.357883832488648,
          9.464101615137757,
          13,
          14,
          15,
          16
        )
      )
    ).to.eq(true);
  });

  it("scale", () => {
    const a = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    a.scale(new Vector3(1, 2, 0.5));
    expect(Matrix.equals(a, new Matrix(1, 2, 3, 4, 10, 12, 14, 16, 4.5, 5, 5.5, 6, 13, 14, 15, 16))).to.eq(true);
  });

  it("translate", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    a.translate(new Vector3(1, 2, 0.5));
    expect(Matrix.equals(a, new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 28.5, 33.45, 37.8, 42))).to.eq(true);
  });

  it("transpose", () => {
    const a = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

    a.transpose();
    expect(Matrix.equals(a, new Matrix(1, 5, 9, 13, 2, 6, 10.9, 14, 3.3, 7, 11, 15, 4, 8, 12, 16))).to.eq(true);
  });
});
