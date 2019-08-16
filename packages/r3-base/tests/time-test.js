import {Time} from '../src/Time';

function equal(a, b) {
  if (Math.abs(a - b) < 10) {
    return true;
  }
  return false;
}

describe('Time', function() {
  it('construct', function() {
    var t = new Time();

    expect(t.timeScale).to.equal(1);
    expect(t.deltaTime).to.equal(0.0001);
    expect(t.timeSinceStartup > 0).to.be.true;
    console.log(t);
  });

  it('timeSinceStartup & tick', function(done) {
    var t = new Time();
    setTimeout(function() {
      t.tick();
      expect(equal(t.timeSinceStartup, t.deltaTime)).to.be.true;
      done();
    }, 33);
  });

  it('timeScale', function(done) {
    var t = new Time();
    t.timeScale = 0.5;

    setTimeout(function() {
      t.tick();
      expect(equal(t.deltaTime, t.unscaledDeltaTime * 0.5)).to.be.true;
      done();
    }, 44);
  });
});