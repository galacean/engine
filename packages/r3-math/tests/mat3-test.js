import {vec2, mat2d, mat3, mat4, quat, MathUtil, mat2} from '../src';
import * as glMatrix from 'gl-matrix';

describe('index', () => {

  it(`should work with mat3`, () => {

    // add
    let a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    let b = mat3.fromValues(9, 8, 7, 6, 5, 4, 3, 2, 1);
    let out = mat3.create();
    mat3.add(out, a, b);
    expect(mat3.str(out)).to.equal('mat3(10, 10, 10, 10, 10, 10, 10, 10, 10)');

    // adjoint 伴随矩阵
    mat3.adjoint(out, a);
    let glOut = glMatrix.mat3.create();
    glMatrix.mat3.adjoint(glOut, a);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(-3, 6, -3, 6, -12, 6, -3, 6, -3)');

    // clone
    out = mat3.clone(a);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 5, 6, 7, 8, 9)');

    // copy
    out = mat3.create();
    mat3.copy(out, a);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 5, 6, 7, 8, 9)');

    // create
    out = mat3.create();
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 1, 0, 0, 0, 1)');

    // determinant - 行列式
    expect(mat3.determinant(a)).to.equal(glMatrix.mat3.determinant(a));
    expect(mat3.determinant(a)).to.equal(0);

    // equals
    // exactEquals
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    b = mat3.fromValues(1 + MathUtil.EPSILON/2, 2 + MathUtil.EPSILON/2, 3 + MathUtil.EPSILON/2,
                        4 + MathUtil.EPSILON/2, 5 + MathUtil.EPSILON/2, 6 + MathUtil.EPSILON/2,
                        7 + MathUtil.EPSILON/2, 8 + MathUtil.EPSILON/2, 9 + MathUtil.EPSILON/2);
    expect(mat3.equals(a, b)).to.be.true;
    expect(mat3.exactEquals(a, b)).to.be.false;

    // frob  范数
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(MathUtil.equals(mat3.frob(a), Math.sqrt(1 + 4 + 9 + 16 + 25 + 36 + 49 + 64 + 81))).to.be.true;

    // fromMat2d
    let m2d = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    out = mat3.create();
    mat3.fromMat2d(out, m2d);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 0, 3, 4, 0, 1, 1, 1)');

    // fromMat4 
    let m4 = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    out = mat3.create();
    mat3.fromMat4(out, m4);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 5, 6, 7, 9, 10, 11)');

    // fromQuat 四元数 
    let q = quat.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    out = mat3.create();
    mat3.fromQuat(out, q);
    glOut = glMatrix.mat3.create();
    glMatrix.mat3.fromQuat(glOut, q);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(-25, 28, -10, -20, -19, 20, 22, 4, -9)');

    // fromRotation
    out = mat3.create();
    mat3.fromRotation(out, Math.PI/3);
    expect(mat3.equals(out, mat3.fromValues(0.5, Math.sqrt(3)/2, 0, -Math.sqrt(3)/2, 0.5, 0, 0, 0, 1))).to.be.true;

    // fromScaling
    let v = vec2.fromValues(1, 2);
    mat3.fromScaling(out, v);
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 2, 0, 0, 0, 1)');

    // fromTranslation
    mat3.fromTranslation(out, v);
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 1, 0, 1, 2, 1)');

    // fromValues
    out = mat3.fromValues(1, 2, 3, 4, 1, 1, 1, 1, 1);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 1, 1, 1, 1, 1)');

    // identity 单位矩阵
    mat3.identity(out);
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 1, 0, 0, 0, 1)');

    // invert 逆矩阵 
    a = mat3.fromValues(1, 2, 3, 4, 5, 4, 3, 2, 1);
    mat3.invert(out, a);
    glOut = glMatrix.mat3.create();
    glMatrix.mat3.invert(glOut, a);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(0.375, -0.5, 0.875, -1, 1, -1, 0.875, -0.5, 0.375)');

    // mul
    // multiply 乘法 
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    b = mat3.fromValues(9, 8, 7, 6, 5, 4, 3, 2, 1);
    out = mat3.create();

    mat3.mul(out, a, b);

    glOut = glMatrix.mat3.create();
    glMatrix.mat3.mul(glOut, a, b);
    expect(mat3.equals(out, glOut)).to.be.true;

    expect(mat3.str(out)).to.equal('mat3(90, 114, 138, 54, 69, 84, 18, 24, 30)');
    mat3.multiply(out, a, b);
    expect(mat3.str(out)).to.equal('mat3(90, 114, 138, 54, 69, 84, 18, 24, 30)');

    // multiplyScalar 
    mat3.multiplyScalar(out, a, 0.5);

    glOut = glMatrix.mat3.create();
    glMatrix.mat3.multiplyScalar(glOut, a, 0.5);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5)');

    // multiplyScalarAndAdd 
    mat3.multiplyScalarAndAdd(out, a, b, 0.5);

    glOut = glMatrix.mat3.create();
    glMatrix.mat3.multiplyScalarAndAdd(glOut, a, b, 0.5);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5)');

    // normalFromMat4 
    m4 = mat4.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    out = mat3.create();
    mat3.normalFromMat4(out, m4);

    glOut = glMatrix.mat3.create();
    glMatrix.mat3.normalFromMat4(glOut, m4);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 1, 0, 0, 0, 1)');

    // projection 投影矩阵
    out = mat3.create();
    mat3.projection(out, 1, 1);
    expect(mat3.str(out)).to.equal('mat3(2, 0, 0, 0, -2, 0, -1, 1, 1)');

    // rotate 
    mat3.rotate(out, a, Math.PI/3);
    glOut = glMatrix.mat3.create();
    glMatrix.mat3.rotate(glOut, a, Math.PI/3);
    expect(mat3.equals(out, glOut)).to.be.true;
    expect(mat3.str(out)).to.equal('mat3(3.964101552963257, 5.330127239227295, 6.696152210235596, 1.133974552154541, 0.7679491639137268, 0.4019237756729126, 7, 8, 9)');

    // scale
    v = vec2.fromValues(1, 2);
    mat3.scale(out, a, v);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 8, 10, 12, 7, 8, 9)');

    // set
    out = mat3.create();
    mat3.set(out, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 5, 6, 7, 8, 9)');

    // str
    out = mat3.create();
    expect(mat3.str(out)).to.equal('mat3(1, 0, 0, 0, 1, 0, 0, 0, 1)');

    // sub
    // subtract
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    b = mat3.fromValues(9, 8, 7, 6, 5, 4, 3, 2, 1);
    out = mat3.create();
    mat3.sub(out, a, b);
    expect(mat3.str(out)).to.equal('mat3(-8, -6, -4, -2, 0, 2, 4, 6, 8)');
    mat3.subtract(out, a, b);
    expect(mat3.str(out)).to.equal('mat3(-8, -6, -4, -2, 0, 2, 4, 6, 8)');

    // translate
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    v = vec2.fromValues(1, 2);
    out = mat3.create();
    mat3.translate(out, a, v);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 5, 6, 16, 20, 24)');

    // transpose
    a = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    out = mat3.create();
    mat3.transpose(out, a);
    expect(mat3.str(out)).to.equal('mat3(1, 4, 7, 2, 5, 8, 3, 6, 9)');
    mat3.transpose(out, out);
    expect(mat3.str(out)).to.equal('mat3(1, 2, 3, 4, 5, 6, 7, 8, 9)');

    });

});
