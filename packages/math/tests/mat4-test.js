import { mat4, MathUtil, quat, vec3 } from '../src';
import * as glMatrix from 'gl-matrix';

describe('index', () => {

  it(`should work with mat4`, () => {
    // add
    let a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    let b = mat4.fromValues(16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1);
    let out = mat4.create();
    mat4.add(out, a, b);
    expect(mat4.str(out)).to.equal('mat4(17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17)');

    // adjoint 伴随矩阵
    mat4.adjoint(out, a);
    let glOut = glMatrix.mat4.create();
    glMatrix.mat4.adjoint(glOut, a);
    expect(mat4.equals(out, glOut)).to.be.true;

    // clone
    out = mat4.clone(a);
    expect(mat4.str(out)).to.equal('mat4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)');

    // copy
    out = mat4.create();
    mat4.copy(out, a);
    expect(mat4.str(out)).to.equal('mat4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)');

    // create
    out = mat4.create();
    expect(mat4.str(out)).to.equal('mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');

    // determinant - 行列式
    expect(mat4.determinant(a)).to.equal(glMatrix.mat4.determinant(a));
    expect(mat4.determinant(a)).to.equal(0);

    // equals
    // exactEquals
    a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    b = mat4.fromValues(1 + MathUtil.EPSILON/2, 2 + MathUtil.EPSILON/2, 3 + MathUtil.EPSILON/2,
      4 + MathUtil.EPSILON/2, 5 + MathUtil.EPSILON/2, 6 + MathUtil.EPSILON/2,
      7 + MathUtil.EPSILON/2, 8 + MathUtil.EPSILON/2, 9 + MathUtil.EPSILON/2,
      10 + MathUtil.EPSILON/2, 11 + MathUtil.EPSILON/2, 12 + MathUtil.EPSILON/2,
      13 + MathUtil.EPSILON/2, 14 + MathUtil.EPSILON/2, 15 + MathUtil.EPSILON/2,
      16 + MathUtil.EPSILON/2);
    expect(mat4.equals(a, b)).to.be.true;
    expect(mat4.exactEquals(a, b)).to.be.false;

    // frob  范数
    a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    expect(mat4.frob(a) === glMatrix.mat4.frob(a)).to.be.true;

    // fromQuat 四元数
    let q = quat.fromValues(1, 2, 3, 4);
    out = mat4.create();
    mat4.fromQuat(out, q);
    glOut = glMatrix.mat4.create();
    glMatrix.mat4.fromQuat(glOut, q);
    expect(mat4.equals(out, glOut)).to.be.true;
    // expect(mat4.str(out)).to.equal('mat4(-25, 28, -10, -20, -19, 20, 22, 4, -9)');

    // fromRotation
    out = mat4.create();
    mat4.fromRotation(out, Math.PI/3, [0, 1, 0]);
    glOut = glMatrix.mat4.create();
    glMatrix.mat4.fromRotation(glOut, Math.PI/3, [0, 1, 0]);
    expect(mat4.equals(out, glOut)).to.be.true;

    // fromRotationTranslation
    q = quat.fromValues(1, 0.5, 2, 1);
    let v = vec3.fromValues(1, 1, 1);

    out = mat4.create();
    mat4.fromRotationTranslation(out, q, v);
    glOut = glMatrix.mat4.create();
    glMatrix.mat4.fromRotationTranslation(glOut, q, v);
    expect(mat4.equals(out, glOut)).to.be.true;

    // fromRotationTranslationScale
    let s = vec3.fromValues(1, 0.5, 2);

    out = mat4.create();
    mat4.fromRotationTranslationScale(out, q, v, s);
    glOut = glMatrix.mat4.create();
    glMatrix.mat4.fromRotationTranslationScale(glOut, q, v, s);
    expect(mat4.equals(out, glOut)).to.be.true;

    // fromRotationTranslationScaleOrigin
    let o = vec3.fromValues(1, 0.5, 2);
    out = mat4.create();
    mat4.fromRotationTranslationScaleOrigin(out, q, v, s, o);
    glOut = glMatrix.mat4.create();
    glMatrix.mat4.fromRotationTranslationScaleOrigin(glOut, q, v, s, o);
    expect(mat4.equals(out, glOut)).to.be.true;

    // fromScaling
    out = mat4.create();
    v = vec3.fromValues(1, 2, 0.5);
    mat4.fromScaling(out, v);
    expect(mat4.str(out)).to.equal('mat4(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1)');

    // fromTranslation
    out = mat4.create();
    mat4.fromTranslation(out, v);
    expect(mat4.str(out)).to.equal('mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 0.5, 1)');

    // fromValues
    out = mat4.fromValues(1, 2, 3, 4, 1, 1, 1, 1, 4, 3, 2, 1, 1, 1, 1, 1);
    expect(mat4.str(out)).to.equal('mat4(1, 2, 3, 4, 1, 1, 1, 1, 4, 3, 2, 1, 1, 1, 1, 1)');

    // fromXRotation
    // fromYRotation
    // fromZRotation
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.fromXRotation(out, 0.5);
    glMatrix.mat4.fromXRotation(glOut, 0.5);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.fromYRotation(out, 0.5);
    glMatrix.mat4.fromYRotation(glOut, 0.5);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.fromZRotation(out, 0.5);
    glMatrix.mat4.fromZRotation(glOut, 0.5);
    expect(mat4.equals(out, glOut)).to.be.true;

    // frustum
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.frustum(out, 0, 2, -1, 1, 0.1, 100);
    glMatrix.mat4.frustum(glOut, 0, 2, -1, 1, 0.1, 100);
    expect(mat4.equals(out, glOut)).to.be.true;

    // getRotation
    // getScaling
    // getTranslation
    a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    let glA = glMatrix.mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    q = quat.create();
    let glQ = glMatrix.quat.create();
    expect(quat.equals(mat4.getRotation(q, a), glMatrix.mat4.getRotation(glQ, glA))).to.be.true;

    v = vec3.create();
    let glV = glMatrix.vec3.create();
    expect(vec3.equals(mat4.getScaling(v, a), glMatrix.mat4.getScaling(glV, glA))).to.be.true;

    v = vec3.create();
    glV = glMatrix.vec3.create();
    expect(vec3.equals(mat4.getTranslation(v, a), glMatrix.mat4.getTranslation(glV, glA))).to.be.true;

    // identity 单位矩阵
    mat4.identity(out);
    expect(mat4.str(out)).to.equal('mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');

    // invert 逆矩阵
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1);
    mat4.invert(out, a);
    glMatrix.mat4.invert(glOut, a);
    expect(mat4.equals(out, glOut)).to.be.true;

    // lookAt
    out = mat4.create();
    glOut = glMatrix.mat4.create();
    mat4.lookAt(out, [0, 0, -8], [0, 0, 0], [0, 1, 0]);
    glMatrix.mat4.lookAt(glOut, [0, 0, -8], [0, 0, 0], [0, 1, 0]);
    expect(mat4.equals(out, glOut)).to.be.true;

    // mul
    // multiply 乘法
    a = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    b = mat4.fromValues(16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1);

    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.mul(out, a, b);
    glMatrix.mat4.mul(glOut, a, b);
    expect(mat4.equals(out, glOut)).to.be.true;
    mat4.multiply(out, a, b);

    // multiplyScalar
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.multiplyScalar(out, a, 0.5);
    glMatrix.mat4.multiplyScalar(glOut, a, 0.5);
    expect(mat4.equals(out, glOut)).to.be.true;

    // multiplyScalarAndAdd
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.multiplyScalarAndAdd(out, a, b, 0.5);
    glMatrix.mat4.multiplyScalarAndAdd(glOut, a, b, 0.5);
    expect(mat4.equals(out, glOut)).to.be.true;

    // ortho
    // perspective
    // perspectiveFromFieldOfView
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.ortho(out, 0, 2, -1, 1, 0.1, 100);
    glMatrix.mat4.ortho(glOut, 0, 2, -1, 1, 0.1, 100);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.perspective(out, 1, 1.5, 0.1, 100);
    glMatrix.mat4.perspective(glOut, 1, 1.5, 0.1, 100);
    expect(mat4.equals(out, glOut)).to.be.true;

    let fovObj = {
      upDegrees: 60,
      downDegrees: 10,
      leftDegrees: 0,
      rightDegrees: 30
    };
    mat4.perspectiveFromFieldOfView(out, fovObj, 0.1, 100);
    glMatrix.mat4.perspectiveFromFieldOfView(glOut, fovObj, 0.1, 100);
    expect(mat4.equals(out, glOut)).to.be.true;

    // rotate
    // rotateX
    // rotateY
    // rotateZ
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.rotate(out, a, Math.PI/3, [0, 1, 0]);
    glMatrix.mat4.rotate(glOut, a, Math.PI/3, [0, 1, 0]);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.rotateX(out, a, Math.PI/3);
    glMatrix.mat4.rotateX(glOut, a, Math.PI/3);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.rotateY(out, a, Math.PI/3);
    glMatrix.mat4.rotateY(glOut, a, Math.PI/3);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.rotateZ(out, a, Math.PI/3);
    glMatrix.mat4.rotateZ(glOut, a, Math.PI/3);
    expect(mat4.equals(out, glOut)).to.be.true;

    // scale
    v = vec3.fromValues(1, 2, 0.5);
    mat4.scale(out, a, v);
    expect(mat4.str(out)).to.equal('mat4(1, 2, 3, 4, 10, 12, 14, 16, 4.5, 5, 5.5, 6, 13, 14, 15, 16)');

    // set
    out = mat4.create();
    mat4.set(out, 1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1);
    expect(mat4.str(out)).to.equal('mat4(1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1)');

    // str
    out = mat4.create();
    expect(mat4.str(out)).to.equal('mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');

    // sub
    // subtract
    a = mat4.fromValues(1,  2,  3,  4,   5,  6,  7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    b = mat4.fromValues(16, 15, 14, 13, 12, 11, 10, 9, 8,  7,  6,  5,  4,  3,  2,  1);
    out = mat4.create();
    mat4.sub(out, a, b);
    expect(mat4.str(out)).to.equal('mat4(-15, -13, -11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11, 13, 15)');
    mat4.subtract(out, a, b);
    expect(mat4.str(out)).to.equal('mat4(-15, -13, -11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11, 13, 15)');

    // targetTo
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    mat4.targetTo(out, [0, 0, -8], [0, 0, 0], [0, 1, 0]);
    glMatrix.mat4.targetTo(glOut, [0, 0, -8], [0, 0, 0], [0, 1, 0]);
    expect(mat4.equals(out, glOut)).to.be.true;

    // translate
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    a = mat4.fromValues(1,  2,  3,  4,   5,  6,  7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    v = vec3.fromValues(1, 2, 0.5);
    mat4.translate(out, a, v);
    glMatrix.mat4.translate(glOut, a, v);
    expect(mat4.equals(out, glOut)).to.be.true;

    // transpose
    out = mat4.create();
    glOut = glMatrix.mat4.create();

    a = mat4.fromValues(1,  2,  3,  4,  5,  6,  7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    mat4.transpose(out, a);
    glMatrix.mat4.transpose(glOut, a);
    expect(mat4.equals(out, glOut)).to.be.true;

    mat4.transpose(out, out);
    glMatrix.mat4.transpose(glOut, glOut);
    expect(mat4.equals(out, glOut)).to.be.true;

  });

});
