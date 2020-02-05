import { MathUtil } from '../src';

describe('index', () => {

  it(`should work with MathUtil`, () => {

    // ARRAY_TYPE
    let out = new MathUtil.ARRAY_TYPE(4);
    if (typeof Float32Array !== 'undefined') {
      expect(out).to.be.an('Float32Array');
    } else {
      expect(out).to.be.an('Array');
    }

    // EPSILON

    // RANDOM

    // equals
    let a = 1;
    let b = 1 + MathUtil.EPSILON/2;
    expect(MathUtil.equals(a, b)).to.be.true;

    // toRadian
    expect(MathUtil.toRadian(60)).to.equal(Math.PI/3);

    });
});
