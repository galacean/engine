import { mat4, mat3, MathUtil, quat, vec3, vec4 } from '../src';

describe('index', () => {

  it(`should work with vec3`, () => {
    // add
    let a = vec3.fromValues(1, 2, 3);
    let b = vec3.fromValues(3, 4, 5);
    let out = vec3.create();
    vec3.add(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(4, 6, 8)');

    // angle
    a = vec3.fromValues(1, 0, 0);
    b = vec3.fromValues(1, 1, 0);
    expect(MathUtil.equals(vec3.angle(a, b), Math.PI / 4)).to.be.true;

    // bezier
    a = vec3.fromValues(0, 0, 0);
    b = vec3.fromValues(1, 1, 0);
    let c = vec3.fromValues(3, -1, 0);
    let d = vec3.fromValues(4, 0, 0);
    out = vec3.create();
    vec3.bezier(out, a, b, c, d, 0.5);
    expect(vec3.str(out)).to.equal('vec3(2, 0, 0)');

    // ceil
    a = vec3.fromValues(1.5, 2.8, 5.2);
    vec3.ceil(out, a);
    expect(vec3.str(out)).to.equal('vec3(2, 3, 6)');

    // clone
    out = null;
    a = vec3.fromValues(1.5, 3, 2);
    out = vec3.clone(a);
    expect(vec3.str(out)).to.equal('vec3(1.5, 3, 2)');

    // copy
    out = vec3.create();
    vec3.copy(out, a);
    expect(vec3.str(out)).to.equal('vec3(1.5, 3, 2)');

    // create
    out = vec3.create();
    expect(vec3.str(out)).to.equal('vec3(0, 0, 0)');

    // cross
    a = vec3.fromValues(1, 2, 3);
    b = vec3.fromValues(4, 5, 6);
    out = vec3.create();
    vec3.cross(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(-3, 6, -3)');

    // dist
    // distance
    a = vec3.fromValues(1, 2, 3);
    b = vec3.fromValues(4, 6, 3);
    let dist = vec3.dist(a, b);
    let distance = vec3.distance(a, b);
    expect(dist).to.equal(5);
    expect(dist).to.equal(distance);

    // div
    // divide
    a = vec3.fromValues(1, 2, 3);
    b = vec3.fromValues(5, 5, 5);
    out = vec3.create();
    vec3.div(out, a, b);
    expect(vec3.equals(out, vec3.fromValues(0.2, 0.4, 0.6))).to.be.true;
    vec3.divide(out, a, b);
    expect(vec3.equals(out, vec3.fromValues(0.2, 0.4, 0.6))).to.be.true;

    // dot
    a = vec3.fromValues(1, 2, 3);
    b = vec3.fromValues(5, 5, 5);
    expect(vec3.dot(a, b)).to.equal(30);

    // equals
    // exactEquals
    a = vec3.fromValues(1, 2, 3);
    b = vec3.fromValues(1 + MathUtil.EPSILON/10, 2 + MathUtil.EPSILON/10, 3 + MathUtil.EPSILON/10);
    expect(vec3.equals(a, b)).to.be.true;
    expect(vec3.exactEquals(a, b)).to.be.false;

    // floor
    a = vec3.fromValues(1.111, 2.222, 3.333);
    out = vec3.create();
    vec3.floor(out, a);
    expect(vec3.str(out)).to.equal('vec3(1, 2, 3)');

    // forEach
    a = [];
    for (let i = 0; i < 10; i++) {
      a.push(vec3.fromValues(i, i, i));
    }
    // vec3.forEach(a, 3, 3, 3, (v, v, s)=>{ v[0] += s; }, 3);

    // fromValues
    a = vec3.fromValues(1, 2, 3);
    expect(a[0]).to.equal(1);
    expect(a[1]).to.equal(2);
    expect(a[2]).to.equal(3);

    // inverse
    a = vec3.fromValues(1, 2, 4);
    out = vec3.create();
    vec3.inverse(out, a)
    expect(vec3.str(out)).to.equal('vec3(1, 0.5, 0.25)');

    // len
    // length
    a = vec3.fromValues(3, 4, 0);
    let len = vec3.len(a);
    let length = vec3.length(a);
    expect(len).to.equal(length);
    expect(len).to.equal(5);

    // lerp
    a = vec3.fromValues(0, 1, 2);
    b = vec3.fromValues(2, 2, 0);
    out = vec3.create();
    vec3.lerp(out, a, b, 0.5);
    expect(vec3.str(out)).to.equal('vec3(1, 1.5, 1)');

    // max
    // min
    a = vec3.fromValues(3, 4, 3);
    b = vec3.fromValues(1, 5, 2);
    out = vec3.create();
    vec3.max(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(3, 5, 3)');
    vec3.min(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(1, 4, 2)');

    // mul
    // multiply
    a = vec3.fromValues(3, 4, 3);
    b = vec3.fromValues(1, 5, 2);
    out = vec3.create();
    vec3.mul(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(3, 20, 6)');
    vec3.multiply(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(3, 20, 6)');

    // negate
    vec3.negate(out, a);
    expect(vec3.str(out)).to.equal('vec3(-3, -4, -3)');

    // normalize
    a = vec3.fromValues(3, 4, 0);
    vec3.normalize(out, a);
    expect(vec3.equals(out, vec3.fromValues(0.6, 0.8, 0))).to.be.true;

    // random
    vec3.random(out, 2);
    expect(MathUtil.equals(vec3.length(out), 2)).to.be.true;

    // round
    a = vec3.fromValues(2.8, 4.3, 5.6);
    out = vec3.create();
    vec3.round(out, a);
    expect(vec3.str(out)).to.equal('vec3(3, 4, 6)');

    // scale
    // scaleAndAdd
    a = vec3.fromValues(3, 4, 5);
    out = vec3.create();
    vec3.scale(out, a, 0.2);
    expect(vec3.equals(out, vec3.fromValues(0.6, 0.8, 1))).to.be.true;
    vec3.scaleAndAdd(out, a, a, 0.2);
    expect(vec3.equals(out, vec3.fromValues(3.6, 4.8, 6))).to.be.true;

    // set
    out = vec3.create();
    vec3.set(out, 3, 4, 5);
    expect(vec3.str(out)).to.equal('vec3(3, 4, 5)');

    // sqrDist
    // squaredDistance
    a = vec3.fromValues(4, 5, 6);
    b = vec3.fromValues(1, 1, 1);
    expect(vec3.sqrDist(a, b)).to.equal(50);
    expect(vec3.squaredDistance(a, b)).to.equal(50);

    // sqrLen
    // squaredLength
    a = vec3.fromValues(3, 4, 5);
    expect(vec3.sqrLen(a)).to.equal(50);
    expect(vec3.squaredLength(a)).to.equal(50);

    // str
    expect(vec3.str(a)).to.equal('vec3(3, 4, 5)');

    // sub
    // subtract
    a = vec3.fromValues(3, 4, 5);
    b = vec3.fromValues(1, 5, 2);
    out = vec3.create();
    vec3.sub(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(2, -1, 3)');
    vec3.subtract(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(2, -1, 3)');

    // transformMat3
    let m3 = mat3.fromValues(1, 0, 0, 0, 1, 0, 0, 0, 0.5);
    a = vec3.fromValues(3, 4, 5);
    out = vec3.create();
    vec3.transformMat3(out, a, m3);
    expect(vec3.str(out)).to.equal('vec3(3, 4, 2.5)');

    // transformMat4
    let m4 = mat4.fromValues(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1);
    a = vec3.fromValues(3, 4, 5);
    out = vec3.create();
    vec3.transformMat4(out, a, m4);
    expect(vec3.str(out)).to.equal('vec3(3, 4, 2.5)');

    // transformQuat
    a = vec3.fromValues(0, 1, 0);
    let q = quat.create();
    quat.fromEuler(q, 180, 0, 0);

    out = vec3.create();
    vec4.transformQuat(out, a, q);
    expect(vec3.equals(out, vec4.fromValues(0, -1, 0))).to.be.true;

  });

});
