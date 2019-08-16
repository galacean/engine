import {mat2, mat2d, MathUtil, vec2} from '../src';

describe('index', () => {

  it(`should work with mat2d`, () => {

    // add
    let a = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    let b = mat2d.fromValues(4, 3, 2, 1, 1, 1);
    let out = mat2d.create();
    mat2d.add(out, a, b);
    expect(mat2d.str(out)).to.equal('mat2d(5, 5, 5, 5, 2, 2)');

    // clone
    out = mat2d.clone(a);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 3, 4, 1, 1)');

    // copy
    out = mat2d.create();
    mat2d.copy(out, a);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 3, 4, 1, 1)');

    // create
    out = mat2d.create();
    expect(mat2d.str(out)).to.equal('mat2d(1, 0, 0, 1, 0, 0)');

    // determinant - return a[0] * a[3] - a[2] * a[1]
    expect(mat2d.determinant(a)).to.equal(-2);

    // equals
    // exactEquals
    a = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    b = mat2d.fromValues(1 + MathUtil.EPSILON/2, 2 + MathUtil.EPSILON/2, 3 + MathUtil.EPSILON/2, 4 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2);
    expect(mat2d.equals(a, b)).to.be.true;
    expect(mat2d.exactEquals(a, b)).to.be.false;

    // frob
    a = mat2d.fromValues(0, 0, 3, 4, 1, 1);
    expect(MathUtil.equals(mat2d.frob(a), Math.sqrt(25 + 2 + 1))).to.be.true;

    // fromRotation
    out = mat2d.create();
    mat2d.fromRotation(out, Math.PI/3);
    expect(mat2d.equals(out, mat2d.fromValues(0.5, Math.sqrt(3)/2, -Math.sqrt(3)/2, 0.5, 0, 0))).to.be.true;

    // fromScaling
    let v = vec2.fromValues(1, 2);
    mat2d.fromScaling(out, v);
    expect(mat2d.str(out)).to.equal('mat2d(1, 0, 0, 2, 0, 0)');

    // fromTranslation
    mat2d.fromTranslation(out, v);
    expect(mat2d.str(out)).to.equal('mat2d(1, 0, 0, 1, 1, 2)');

    // fromValues
    out = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 3, 4, 1, 1)');

    // identity
    mat2d.identity(out);
    expect(mat2d.str(out)).to.equal('mat2d(1, 0, 0, 1, 0, 0)');

    // invert
    a = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    mat2d.invert(out, a);
    expect(mat2d.str(out)).to.equal('mat2d(-2, 1, 1.5, -0.5, 0.5, -0.5)');

    // mul
    // multiply
    a = mat2d.fromValues(1, 2, 3, 4, 0, 0);
    b = mat2d.fromValues(4, 3, 2, 1, 0, 0);
    out = mat2d.create();
    mat2d.mul(out, a, b);
    expect(mat2d.str(out)).to.equal('mat2d(13, 20, 5, 8, 0, 0)');
    mat2d.multiply(out, a, b);
    expect(mat2d.str(out)).to.equal('mat2d(13, 20, 5, 8, 0, 0)');

    // multiplyScalar
    mat2d.multiplyScalar(out, a, 0.5);
    expect(mat2d.str(out)).to.equal('mat2d(0.5, 1, 1.5, 2, 0, 0)');

    // multiplyScalarAndAdd
    mat2d.multiplyScalarAndAdd(out, a, b, 0.5);
    expect(mat2d.str(out)).to.equal('mat2d(3, 3.5, 4, 4.5, 0, 0)');

    // rotate sssgit
    mat2d.rotate(out, a, Math.PI/3);
    // expect(mat2d.str(out)).to.equal('mat2d(3, 3.5, 4, 4.5));

    // scale
    v = vec2.fromValues(1, 2);
    mat2d.scale(out, a, v);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 6, 8, 0, 0)');

    // set
    out = mat2d.create();
    mat2d.set(out, 1, 2, 3, 4, 1, 1);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 3, 4, 1, 1)');

    // str
    out = mat2d.create();
    expect(mat2d.str(out)).to.equal('mat2d(1, 0, 0, 1, 0, 0)');

    // sub
    // subtract
    a = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    b = mat2d.fromValues(4, 3, 2, 1, 1, 1);
    out = mat2d.create();
    mat2d.sub(out, a, b);
    expect(mat2d.str(out)).to.equal('mat2d(-3, -1, 1, 3, 0, 0)');
    mat2d.subtract(out, a, b);
    expect(mat2d.str(out)).to.equal('mat2d(-3, -1, 1, 3, 0, 0)');

    // translate
    a = mat2d.fromValues(1, 2, 3, 4, 1, 1);
    v = vec2.fromValues(1, 2);
    out = mat2d.create();
    mat2d.translate(out, a, v);
    expect(mat2d.str(out)).to.equal('mat2d(1, 2, 3, 4, 8, 11)');

    });

});
