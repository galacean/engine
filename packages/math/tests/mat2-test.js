import { mat2, MathUtil, vec2 } from '../src';

describe('index', () => {

  it(`should work with mat2`, () => {

    // LDU

    // add
    let a = mat2.fromValues(1, 2, 3, 4);
    let b = mat2.fromValues(4, 3, 2, 1);
    let out = mat2.create();
    mat2.add(out, a, b);
    expect(mat2.str(out)).to.equal('mat2(5, 5, 5, 5)');

    // adjoint
    mat2.adjoint(out, a);
    expect(mat2.str(out)).to.equal('mat2(4, -2, -3, 1)');

    // clone
    out = mat2.clone(a);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 3, 4)');

    // copy
    out = mat2.create();
    mat2.copy(out, a);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 3, 4)');

    // create
    out = mat2.create();
    expect(mat2.str(out)).to.equal('mat2(1, 0, 0, 1)');

    // determinant - return a[0] * a[3] - a[2] * a[1]
    expect(mat2.determinant(a)).to.equal(-2);

    // equals
    // exactEquals
    a = mat2.fromValues(1, 2, 3, 4);
    b = mat2.fromValues(1 + MathUtil.EPSILON/2, 2 + MathUtil.EPSILON/2, 3 + MathUtil.EPSILON/2, 4 + MathUtil.EPSILON/2);
    expect(mat2.equals(a, b)).to.be.true;
    expect(mat2.exactEquals(a, b)).to.be.false;

    // frob
    a = mat2.fromValues(0, 0, 3, 4);
    expect(mat2.frob(a)).to.equal(5);

    // fromRotation
    out = mat2.create();
    mat2.fromRotation(out, Math.PI/3);
    expect(mat2.equals(out, mat2.fromValues(0.5, Math.sqrt(3)/2, -Math.sqrt(3)/2, 0.5))).to.be.true;

    // fromScaling
    let v = vec2.fromValues(1, 2);
    mat2.fromScaling(out, v);
    expect(mat2.str(out)).to.equal('mat2(1, 0, 0, 2)');

    // fromValues
    out = mat2.fromValues(1, 2, 3, 4);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 3, 4)');

    // identity
    mat2.identity(out);
    expect(mat2.str(out)).to.equal('mat2(1, 0, 0, 1)');

    // invert
    a = mat2.fromValues(1, 2, 3, 4);
    mat2.invert(out, a);
    expect(mat2.str(out)).to.equal('mat2(-2, 1, 1.5, -0.5)');

    // mul
    // multiply
    a = mat2.fromValues(1, 2, 3, 4);
    b = mat2.fromValues(4, 3, 2, 1);
    out = mat2.create();
    mat2.mul(out, a, b);
    expect(mat2.str(out)).to.equal('mat2(13, 20, 5, 8)');
    mat2.mul(out, a, b);
    expect(mat2.str(out)).to.equal('mat2(13, 20, 5, 8)');

    // multiplyScalar
    mat2.multiplyScalar(out, a, 0.5);
    expect(mat2.str(out)).to.equal('mat2(0.5, 1, 1.5, 2)');

    // multiplyScalarAndAdd
    mat2.multiplyScalarAndAdd(out, a, b, 0.5);
    expect(mat2.str(out)).to.equal('mat2(3, 3.5, 4, 4.5)');

    // rotate
    mat2.rotate(out, a, Math.PI/3);
    // expect(mat2.str(out)).to.equal('mat2(3, 3.5, 4, 4.5)');

    // scale
    v = vec2.fromValues(1, 2);
    mat2.scale(out, a, v);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 6, 8)');

    // set
    out = mat2.create();
    mat2.set(out, 1, 2, 3, 4);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 3, 4)');

    // str
    out = mat2.create();
    expect(mat2.str(out)).to.equal('mat2(1, 0, 0, 1)');

    // sub
    // subtract
    a = mat2.fromValues(1, 2, 3, 4);
    b = mat2.fromValues(4, 3, 2, 1);
    out = mat2.create();
    mat2.sub(out, a, b);
    expect(mat2.str(out)).to.equal('mat2(-3, -1, 1, 3)');
    mat2.subtract(out, a, b);
    expect(mat2.str(out)).to.equal('mat2(-3, -1, 1, 3)');

    // transpose
    a = mat2.fromValues(1, 2, 3, 4);
    out = mat2.create();
    mat2.transpose(out, a);
    expect(mat2.str(out)).to.equal('mat2(1, 3, 2, 4)');
    mat2.transpose(out, out);
    expect(mat2.str(out)).to.equal('mat2(1, 2, 3, 4)');

  });

});
