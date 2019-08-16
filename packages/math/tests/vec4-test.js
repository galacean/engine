import { quat, MathUtil, vec4, mat4 } from '../src';

describe('index', () => {

  it(`should work with vec4`, () => {

    // add
    let a = vec4.fromValues(1, 1, 1, 0.5);
    let b = vec4.fromValues(0.5, 0.5, 0.5, 0.5);
    let out = vec4.create();
    vec4.add(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(1.5, 1.5, 1.5, 1)');

    // ceil
    a = vec4.fromValues(1.5, 2.8, 2.3, 1.8);
    vec4.ceil(out, a);
    expect(vec4.str(out)).to.equal('vec4(2, 3, 3, 2)');

    // clone
    a = vec4.fromValues(0, 1, 2, 0);
    out = vec4.clone(a);
    expect(vec4.str(out)).to.equal('vec4(0, 1, 2, 0)');

    // copy
    out = vec4.create();
    vec4.copy(out, a);
    expect(vec4.str(out)).to.equal('vec4(0, 1, 2, 0)');

    // create
    out = vec4.create();
    expect(vec4.str(out)).to.equal('vec4(0, 0, 0, 0)');

    // dist
    // distance
    a = vec4.fromValues(1, 2, 3, 4);
    b = vec4.fromValues(2, 3, 4, 5);
    let dist = vec4.dist(a, b);
    let distance = vec4.distance(a, b);
    expect(dist).to.equal(2);
    expect(dist).to.equal(distance);

    // div
    // divide
    a = vec4.fromValues(1, 2, 3, 4);
    b = vec4.fromValues(5, 5, 5, 5);
    out = vec4.create();
    vec4.div(out, a, b);
    expect(vec4.equals(out, vec4.fromValues(0.2, 0.4, 0.6, 0.8))).to.be.true;
    vec4.divide(out, a, b);
    expect(vec4.equals(out, vec4.fromValues(0.2, 0.4, 0.6, 0.8))).to.be.true;

    // dot
    a = vec4.fromValues(1, 1, 1, 0.5);
    b = vec4.fromValues(0.5, 0.5, 0.5, 0.5);
    expect(vec4.dot(a, b) === 1.75).to.be.true;

    // equals
    // exactEquals
    a = vec4.fromValues(1, 1, 1, 0.5);
    b = vec4.fromValues(1 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2, 1 + MathUtil.EPSILON/2, 0.5 + MathUtil.EPSILON/2);
    expect(vec4.equals(a, b)).to.be.true;
    expect(vec4.exactEquals(a, b)).to.be.false;

    // floor
    a = vec4.fromValues(1.111, 2.222, 3.333, 4.444);
    out = vec4.create();
    vec4.floor(out, a);
    expect(vec4.str(out)).to.equal('vec4(1, 2, 3, 4)');

    // forEach
    a = [];
    for (let i = 0; i < 10; i++) {
      a.push(vec4.fromValues(i, i));
    }
    // vec4.forEach(a, 3, 3, 3, (v, v, s)=>{ v[0] += s; }, 3);

    // fromValues
    a = vec4.fromValues(1, 1, 1, 0.5);
    expect(vec4.str(a)).to.equal('vec4(1, 1, 1, 0.5)');

    // inverse
    a = vec4.fromValues(1, 2, 4, 5);
    out = vec4.create();
    vec4.inverse(out, a)
    expect(vec4.equals(out, vec4.fromValues(1, 0.5, 0.25, 0.2))).to.be.true;

    // len
    // length
    a = vec4.fromValues(1, 1, 1, 1);
    expect(vec4.len(a) === vec4.length(a)).to.be.true;
    expect(vec4.len(a) === 2).to.be.true;

    // lerp
    a = vec4.fromValues(1, 1, 1, 0.5);
    b = vec4.fromValues(0.5, 0.5, 0.5, 0.5);

    out = vec4.create();
    vec4.lerp(out, a, b, 0.5);
    expect(vec4.str(out)).to.equal('vec4(0.75, 0.75, 0.75, 0.5)');
    
    // max
    // min
    a = vec4.fromValues(3, 4, 2, 6);
    b = vec4.fromValues(1, 5, 3, 4);
    out = vec4.create();
    vec4.max(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(3, 5, 3, 6)');
    vec4.min(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(1, 4, 2, 4)');

    // mul
    // multiply
    a = vec4.fromValues(1, 1, 1, 0.5);
    b = vec4.fromValues(0.5, 0.5, 0.5, 0.5);

    out = vec4.create();
    vec4.mul(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(0.5, 0.5, 0.5, 0.25)');
    vec4.multiply(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(0.5, 0.5, 0.5, 0.25)');

    // negate
    a = vec4.fromValues(1, 1, 1, 0.5);

    vec4.negate(out, a);
    expect(vec4.str(out)).to.equal('vec4(-1, -1, -1, -0.5)');

    // normalize
    a = vec4.fromValues(1, 1, 1, 1);

    out = vec4.create();
    vec4.normalize(out, a);
    expect(vec4.str(out)).to.equal('vec4(0.5, 0.5, 0.5, 0.5)');

    // random
    out = vec4.create();
    vec4.random(out, 2);
    expect(MathUtil.equals(vec4.length(out), 2)).to.be.true;

    // round
    a = vec4.fromValues(2.8, 4.3, 2.4, 1.6);
    out = vec4.create();
    vec4.round(out, a);
    expect(vec4.str(out)).to.equal('vec4(3, 4, 2, 2)');

    // scale
    a = vec4.fromValues(1, 1, 1, 1);

    out = vec4.create();
    vec4.scale(out, a, 2);
    expect(vec4.str(out)).to.equal('vec4(2, 2, 2, 2)');

    // scaleAndAdd
    a = vec4.fromValues(1, 1, 1, 1);
    b = vec4.fromValues(1, 1, 1, 0.5);

    out = vec4.create();
    vec4.scaleAndAdd(out, a, b, 2);
    expect(vec4.str(out)).to.equal('vec4(3, 3, 3, 2)');

    // set
    out = vec4.create();
    vec4.set(out, 1, 2, 3, 4);
    expect(vec4.str(out)).to.equal('vec4(1, 2, 3, 4)');
    
    // sqrDist
    // squaredDistance
    a = vec4.fromValues(4, 5, 2, 3);
    b = vec4.fromValues(1, 1, 1, 1);
    expect(vec4.sqrDist(a, b)).to.equal(30);
    expect(vec4.squaredDistance(a, b)).to.equal(30);

    // sqrLen
    // squaredLength
    a = vec4.fromValues(1, 1, 1, 1);
    expect(vec4.sqrLen(a) === 4).to.be.true;
    expect(vec4.squaredLength(a) === 4).to.be.true;

    // str
    a = vec4.fromValues(1, 1, 1, 1);
    expect(vec4.str(a)).to.equal('vec4(1, 1, 1, 1)');

    // sub
    // subtract
    a = vec4.fromValues(3, 4, 1, 5);
    b = vec4.fromValues(1, 5, 2, 3);
    out = vec4.create();
    vec4.sub(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(2, -1, -1, 2)');
    vec4.subtract(out, a, b);
    expect(vec4.str(out)).to.equal('vec4(2, -1, -1, 2)');

    // transformMat4
    let m4 = mat4.fromValues(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4);
    a = vec4.fromValues(4, 3, 2, 1);
    out = vec4.create();
    vec4.transformMat4(out, a, m4);
    expect(vec4.str(out)).to.equal('vec4(4, 6, 6, 4)');

    // transformQuat
    a = vec4.fromValues(0, 1, 0, 0);
    let q = quat.create();
    quat.fromEuler(q, 180, 0, 0);

    out = vec4.create();
    vec4.transformQuat(out, a, q);
    expect(vec4.equals(out, vec4.fromValues(0, -1, 0, 0))).to.be.true;

  });

});
