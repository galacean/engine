import { vec3, mat3, MathUtil, quat} from '../src';
import * as glMatrix from 'gl-matrix';

describe('index', () => {

  it(`should work with quat`, () => {

    // add
    let a = quat.fromValues(1, 1, 1, 0.5);
    let b = quat.fromValues(0.5, 0.5, 0.5, 0.5);
    let out = quat.create();
    quat.add(out, a, b);
    expect(quat.str(out)).to.equal('quat(1.5, 1.5, 1.5, 1)');

    // calculateW
    a = quat.fromValues(0, 1, 2, 0);
    out = quat.create();
    quat.calculateW(out, a);
    expect(quat.str(out)).to.equal('quat(0, 1, 2, 2)');

    // clone
    out = quat.clone(a);
    expect(quat.str(out)).to.equal('quat(0, 1, 2, 0)');

    // conjugate
    a = quat.fromValues(1, 1, 1, 0.5);

    out = quat.create();
    quat.conjugate(out, a);
    expect(quat.str(out)).to.equal('quat(-1, -1, -1, 0.5)');

    // copy
    out = quat.create();
    quat.copy(out, a);
    expect(quat.str(out)).to.equal('quat(1, 1, 1, 0.5)');

    // create
    out = quat.create();
    expect(quat.str(out)).to.equal('quat(0, 0, 0, 1)');

    // dot
    a = quat.fromValues(1, 1, 1, 0.5);
    b = quat.fromValues(0.5, 0.5, 0.5, 0.5);
    expect(quat.dot(a, b) === 1.75).to.be.true;

    // equals
    // exactEquals
    a = quat.fromValues(1, 1, 1, 0.5);
    b = quat.fromValues(1 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2, 0.5 + MathUtil.EPSILON/2);
    expect(quat.equals(a, b)).to.be.true;
    expect(quat.exactEquals(a, b)).to.be.false;

    // fromEuler
    a = quat.create();
    let glA = glMatrix.quat.create();

    quat.fromEuler(a, 0, 60, 60);
    glMatrix.quat.fromEuler(glA, 0, 60, 60);
    expect(quat.equals(a, glA)).to.be.true;

    // fromMat3
    a = quat.create();
    glA = glMatrix.quat.create();

    let m3 = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    quat.fromMat3(a, m3);
    glMatrix.quat.fromMat3(glA, m3);
    expect(quat.equals(a, glA)).to.be.true;

    // fromValues
    a = quat.fromValues(1, 1, 1, 0.5);
    expect(quat.str(a)).to.equal('quat(1, 1, 1, 0.5)');

    // getAxisAngle
    a = quat.fromValues(1, 1, 1, 0.5);

    let axis = vec3.create();
    let rad = quat.getAxisAngle(axis, a);
    let glAxis = glMatrix.vec3.create();
    let glRad = glMatrix.quat.getAxisAngle(glAxis, a);
    expect(rad === glRad && vec3.equals(axis, glAxis)).to.be.true;

    // identity
    out = quat.create();
    quat.identity(out);
    expect(quat.str(out)).to.equal('quat(0, 0, 0, 1)');

    // invert
    out = quat.create();
    let glOut = glMatrix.quat.create();

    a = quat.fromValues(1, 1, 1, 0.5);
    quat.invert(out, a);
    glMatrix.quat.invert(glOut, a);
    expect(quat.equals(out, glOut)).to.be.true;

    // len
    // length
    a = quat.fromValues(1, 1, 1, 1);
    expect(quat.len(a) === quat.length(a)).to.be.true;
    expect(quat.len(a) === 2).to.be.true;

    // lerp
    a = quat.fromValues(1, 1, 1, 0.5);
    b = quat.fromValues(0.5, 0.5, 0.5, 0.5);

    out = quat.create();
    quat.lerp(out, a, b, 0.5);
    expect(quat.str(out)).to.equal('quat(0.75, 0.75, 0.75, 0.5)');

    // mul
    // multiply
    a = quat.fromValues(1, 1, 1, 0.5);
    b = quat.fromValues(0.5, 0.5, 0.5, 0.5);

    out = quat.create();
    quat.mul(out, a, b);
    expect(quat.str(out)).to.equal('quat(0.75, 0.75, 0.75, -1.25)');
    quat.multiply(out, a, b);
    expect(quat.str(out)).to.equal('quat(0.75, 0.75, 0.75, -1.25)');

    // normalize
    a = quat.fromValues(1, 1, 1, 1);

    out = quat.create();
    quat.normalize(out, a);
    expect(quat.str(out)).to.equal('quat(0.5, 0.5, 0.5, 0.5)');

    // rotateX
    // rotateY
    // rotateZ
    a = quat.fromValues(1, 1, 1, 1);

    out = quat.create();
    glOut = glMatrix.quat.create();

    quat.rotateX(out, a, 1.5);
    glMatrix.quat.rotateX(glOut, a, 1.5);
    expect(quat.equals(out, glOut)).to.be.true;

    quat.rotateY(out, a, 1.5);
    glMatrix.quat.rotateY(glOut, a, 1.5);
    expect(quat.equals(out, glOut)).to.be.true;

    quat.rotateZ(out, a, 1.5);
    glMatrix.quat.rotateZ(glOut, a, 1.5);
    expect(quat.equals(out, glOut)).to.be.true;

    // rotationTo
    out = quat.create();
    glOut = glMatrix.quat.create();

    quat.rotationTo(out, [0, 1, 0], [1, 0, 0]);
    glMatrix.quat.rotationTo(glOut, [0, 1, 0], [1, 0, 0]);
    expect(quat.equals(out, glOut)).to.be.true;

    // scale
    a = quat.fromValues(1, 1, 1, 1);

    out = quat.create();
    quat.scale(out, a, 2);
    expect(quat.str(out)).to.equal('quat(2, 2, 2, 2)');

    // set
    out = quat.create();
    quat.set(out, 1, 2, 3, 4);
    expect(quat.str(out)).to.equal('quat(1, 2, 3, 4)');

    // setAxes
    out = quat.create();
    glOut = glMatrix.quat.create();

    quat.setAxes(out, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    glMatrix.quat.setAxes(glOut,  [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    expect(quat.equals(out, glOut)).to.be.true;

    // setAxisAngle
    out = quat.create();
    quat.setAxisAngle(out, [0, 1, 0], Math.PI/3);
    let rt = quat.fromValues(0, 0.5, 0, Math.sqrt(3)/2);
    expect(quat.equals(out, rt)).to.be.true;

    // slerp
    a = quat.fromValues(1, 1, 1, 0.5);
    b = quat.fromValues(0.5, 0.5, 0.5, 0.5);

    out = quat.create();
    glOut = glMatrix.quat.create();

    quat.slerp(out, a, b, 0.5);
    glMatrix.quat.slerp(glOut, a, b, 0.5);
    expect(quat.equals(out, glOut)).to.be.true;

    // sqlerp
    let c = quat.fromValues(1, 1, 1, 0.5);
    let d = quat.fromValues(0.5, 0.5, 0.5, 0.5);

    quat.sqlerp(out, a, b, c, d, 0.5);
    glMatrix.quat.sqlerp(glOut, a, b, c, d, 0.5);
    expect(quat.equals(out, glOut)).to.be.true;

    // sqrLen
    // squaredLength
    a = quat.fromValues(1, 1, 1, 1);
    expect(quat.sqrLen(a) === 4).to.be.true;
    expect(quat.squaredLength(a) === 4).to.be.true;

    // str
    a = quat.fromValues(1, 1, 1, 1);
    expect(quat.str(a)).to.equal('quat(1, 1, 1, 1)');

    // toEuler
    a = quat.create();
    quat.fromEuler(a, 0, 60, 0);
    let euler = vec3.create();
    quat.toEuler(euler, a);
    expect(vec3.equals(euler, [0, 60, 0])).to.be.true;

  });

});
