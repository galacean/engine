import { vec2, vec3, MathUtil, mat2, mat2d, mat3, mat4 } from '../src';

describe('index', () => {

  it(`should work with vec2`, () => {

    // add
    let a = vec2.fromValues(1, 2);
    let b = vec2.fromValues(3, 4);
    let out = vec2.create();
    vec2.add(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(4, 6)');

    // ceil
    a = vec2.fromValues(1.5, 2.8);
    vec2.ceil(out, a);
    expect(vec2.str(out)).to.equal('vec2(2, 3)');

    // clone
    out = null;
    a = vec2.fromValues(1.5, 3);
    out = vec2.clone(a);
    expect(vec2.str(out)).to.equal('vec2(1.5, 3)');

    // copy
    out = vec2.create();
    vec2.copy(out, a);
    expect(vec2.str(out)).to.equal('vec2(1.5, 3)');

    // create
    out = vec2.create();
    expect(vec2.str(out)).to.equal('vec2(0, 0)');

    // cross
    a = vec2.fromValues(1, 2);
    b = vec2.fromValues(3, 4);
    out = vec3.create();
    vec2.cross(out, a, b);
    expect(vec3.str(out)).to.equal('vec3(0, 0, -2)');

    // dist
    // distance
    a = vec2.fromValues(1, 2);
    b = vec2.fromValues(4, 6);
    let dist = vec2.dist(a, b);
    let distance = vec2.distance(a, b);
    expect(dist).to.equal(5);
    expect(dist).to.equal(distance);

    // div
    // divide
    a = vec2.fromValues(1, 2);
    b = vec2.fromValues(5, 5);
    out = vec2.create();
    vec2.div(out, a, b);
    expect(vec2.equals(out, vec2.fromValues(0.2, 0.4))).to.be.true;
    vec2.divide(out, a, b);
    expect(vec2.equals(out, vec2.fromValues(0.2, 0.4))).to.be.true;

    // dot
    a = vec2.fromValues(1, 2);
    b = vec2.fromValues(5, 5);
    expect(vec2.dot(a, b)).to.equal(15);

    // equals
    // exactEquals
    a = vec2.fromValues(1, 2);
    b = vec2.fromValues(1 + MathUtil.EPSILON/10, 2 + MathUtil.EPSILON/10);
    expect(vec2.equals(a, b)).to.be.true;
    expect(vec2.exactEquals(a, b)).to.be.false;

    // floor
    a = vec2.fromValues(1.111, 2.222);
    out = vec2.create();
    vec2.floor(out, a);
    expect(vec2.str(out)).to.equal('vec2(1, 2)');
    
    // forEach
    a = [];
    for (let i = 0; i < 10; i++) {
      a.push(vec2.fromValues(i, i));
    }
    // vec2.forEach(a, 3, 3, 3, (v, v, s)=>{ v[0] += s; }, 3);

    // fromValues
    a = vec2.fromValues(1, 2);
    expect(a[0]).to.equal(1);
    expect(a[1]).to.equal(2);

    // inverse
    a = vec2.fromValues(1, 2);
    out = vec2.create();
    vec2.inverse(out, a)
    expect(vec2.str(out)).to.equal('vec2(1, 0.5)');

    // len
    // length
    a = vec2.fromValues(3, 4);
    let len = vec2.len(a);
    let length = vec2.length(a);
    expect(len).to.equal(length);
    expect(len).to.equal(5);

    // lerp
    a = vec2.fromValues(0, 1);
    b = vec2.fromValues(2, 2);
    out = vec2.create();
    vec2.lerp(out, a, b, 0.5);
    expect(vec2.str(out)).to.equal('vec2(1, 1.5)');

    // max
    // min
    a = vec2.fromValues(3, 4);
    b = vec2.fromValues(1, 5);
    out = vec2.create();
    vec2.max(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(3, 5)');
    vec2.min(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(1, 4)');

    // mul
    // multiply
    vec2.mul(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(3, 20)');
    vec2.multiply(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(3, 20)');

    // negate
    vec2.negate(out, a);
    expect(vec2.str(out)).to.equal('vec2(-3, -4)');

    // normalize
    vec2.normalize(out, a);
    expect(vec2.equals(out, vec2.fromValues(0.6, 0.8))).to.be.true;

    // random
    vec2.random(out, 2);
    expect(MathUtil.equals(vec2.length(out), 2)).to.be.true;

    // round
    a = vec2.fromValues(2.8, 4.3);
    out = vec2.create();
    vec2.round(out, a);
    expect(vec2.str(out)).to.equal('vec2(3, 4)');

    // scale
    // scaleAndAdd
    a = vec2.fromValues(3, 4);
    out = vec2.create();
    vec2.scale(out, a, 0.2);
    expect(vec2.equals(out, vec2.fromValues(0.6, 0.8))).to.be.true;
    vec2.scaleAndAdd(out, a, a, 0.2);
    expect(vec2.equals(out, vec2.fromValues(3.6, 4.8))).to.be.true;

    // set
    out = vec2.create();
    vec2.set(out, 3, 4);
    expect(vec2.str(out)).to.equal('vec2(3, 4)');

    // sqrDist
    // squaredDistance
    a = vec2.fromValues(4, 5);
    b = vec2.fromValues(1, 1);
    expect(vec2.sqrDist(a, b)).to.equal(25);
    expect(vec2.squaredDistance(a, b)).to.equal(25);

    // sqrLen
    // squaredLength
    a = vec2.fromValues(3, 4);
    expect(vec2.sqrLen(a)).to.equal(25);
    expect(vec2.squaredLength(a)).to.equal(25);

    // str
    expect(vec2.str(a)).to.equal('vec2(3, 4)');

    // sub
    // subtract
    a = vec2.fromValues(3, 4);
    b = vec2.fromValues(1, 5);
    out = vec2.create();
    vec2.sub(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(2, -1)');
    vec2.subtract(out, a, b);
    expect(vec2.str(out)).to.equal('vec2(2, -1)');

    // transformMat2
    let m2 = mat2.fromValues(1, 0, 0, 1);
    a = vec2.fromValues(3, 4);
    out = vec2.create();
    vec2.transformMat2(out, a, m2);
    expect(vec2.str(out)).to.equal('vec2(3, 4)');

    // transformMat2d
    let m2d = mat2d.fromValues(1, 0, 0, 1, 2, 3);
    a = vec2.fromValues(3, 4);
    out = vec2.create();
    vec2.transformMat2d(out, a, m2d);
    expect(vec2.str(out)).to.equal('vec2(5, 7)');

    // transformMat3
    let m3 = mat3.create();
    a = vec2.fromValues(3, 4);
    out = vec2.create();
    vec2.transformMat3(out, a, m3);
    expect(vec2.str(out)).to.equal('vec2(3, 4)');

    // transformMat4
    let m4 = mat4.create();
    a = vec2.fromValues(3, 4);
    out = vec2.create();
    vec2.transformMat4(out, a, m4);
    expect(vec2.str(out)).to.equal('vec2(3, 4)');
    });

});
