import { CurveKey, ParticleCompositeCurve, ParticleCurve, ParticleCurveMode } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

describe("ParticleCurve tests", () => {
  it("Constructor with const params", () => {
    const gradient = new ParticleCompositeCurve(0.5);
    expect(gradient.mode).to.equal(ParticleCurveMode.Constant);
    expect(gradient.evaluate(undefined, undefined)).to.equal(0.5);
  });

  it("Constructor with two const params", () => {
    const gradient = new ParticleCompositeCurve(0.5, 0.2);
    expect(gradient.mode).to.equal(ParticleCurveMode.TwoConstants);
    expect(gradient.evaluate(undefined, 0.5)).to.equal(0.35);
    expect(gradient.evaluate(undefined, 0.0)).to.equal(0.5);
    expect(gradient.evaluate(undefined, 1.0)).to.equal(0.2);
  });

  it("Constructor with curve params", () => {
    const gradient0 = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0.333)));
    expect(gradient0.mode).to.equal(ParticleCurveMode.Curve);
    expect(gradient0.evaluate(0.2, undefined)).to.equal(0.333);

    const gradient1 = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0.3), new CurveKey(0.6, 0.7)));
    expect(gradient1.evaluate(0.0, undefined)).to.equal(0.3);
    expect(gradient1.evaluate(0.5, undefined)).to.equal(0.6333333333333333);
    expect(gradient1.evaluate(0.6, undefined)).to.equal(0.7);
    expect(gradient1.evaluate(0.9, undefined)).to.equal(0.7);
    expect(gradient1.evaluate(1.0, undefined)).to.equal(0.7);
  });

  it("Constructor with two curve params", () => {
    const curveMin = new ParticleCurve(new CurveKey(0, 0.3), new CurveKey(0.6, 0.7));
    const curveMax = new ParticleCurve(new CurveKey(0.4, 0.5), new CurveKey(1.0, 0.8));

    const compositeCurve = new ParticleCompositeCurve(curveMin, curveMax);

    expect(compositeCurve.evaluate(0.0, 0.0)).to.equal(0.3);
    expect(compositeCurve.evaluate(0.5, 0.0)).to.equal(0.6333333333333333);
    expect(compositeCurve.evaluate(0.6, 0.0)).to.equal(0.7);
    expect(compositeCurve.evaluate(0.9, 0.0)).to.equal(0.7);
    expect(compositeCurve.evaluate(1.0, 0.0)).to.equal(0.7);

    expect(compositeCurve.evaluate(0.0, 1.0)).to.equal(0.5);
    expect(compositeCurve.evaluate(0.5, 1.0)).to.equal(0.55);
    expect(compositeCurve.evaluate(0.6, 1.0)).to.equal(0.6);
    expect(compositeCurve.evaluate(0.9, 1.0)).to.equal(0.75);
    expect(compositeCurve.evaluate(1.0, 1.0)).to.equal(0.8);

    expect(compositeCurve.evaluate(0.6, 0.5)).to.equal(0.6499999999999999);
  });

  it("Add and remove", () => {
    const curve = new ParticleCurve(new CurveKey(0, 0.3), new CurveKey(0.6, 0.7));
 +  expect(curve.keys.length).to.equal(2);
 +  
    curve.addKey(new CurveKey(0, 0.4));
 +  expect(curve.keys.length).to.equal(3);
 +  expect(curve.keys[0].value).to.equal(0.4);
 +  
    curve.removeKey(2);
 +  expect(curve.keys.length).to.equal(2);
 +  
    curve.removeKey(0);
 +  expect(curve.keys.length).to.equal(1);
 +  expect(curve.keys[0].time).to.equal(0.6);
 +  
    curve.removeKey(0);
 +  expect(curve.keys.length).to.equal(0);
  });
});
