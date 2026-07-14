import { CurveKey, GradientAlphaKey, GradientColorKey, ParticleCurve, ParticleGradient } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("particle serializable collection properties", () => {
  it("replaces and sorts ParticleCurve keys", () => {
    const original = new CurveKey(0.5, 1);
    const curve = new ParticleCurve(original);
    const early = new CurveKey(0.25, 2);
    const late = new CurveKey(0.75, 3);
    let changes = 0;
    curve._registerOnValueChanged(() => changes++);

    curve.keys = [late, early];

    expect(curve.keys).to.deep.equal([early, late]);
    changes = 0;
    original.value = 4;
    expect(changes).to.equal(0);
    early.value = 5;
    expect(changes).to.equal(1);

    const currentKeys = curve.keys;
    curve.setKeys(currentKeys);
    expect(curve.keys).to.deep.equal([early, late]);

    const tooManyKeys = Array.from({ length: 5 }, (_, index) => new CurveKey(index, index));
    expect(() => curve.setKeys(tooManyKeys)).to.throw("Curve can only have 4 keys");
    expect(curve.keys).to.deep.equal([early, late]);
  });

  it("replaces ParticleGradient color and alpha keys independently", () => {
    const gradient = new ParticleGradient();
    const colorKey = new GradientColorKey(0.5, new Color(1, 0.5, 0.25, 1));
    const alphaKey = new GradientAlphaKey(0.5, 0.75);

    gradient.colorKeys = [colorKey];
    gradient.alphaKeys = [alphaKey];
    gradient.setKeys(gradient.colorKeys, gradient.alphaKeys);

    expect(gradient.colorKeys).to.deep.equal([colorKey]);
    expect(gradient.alphaKeys).to.deep.equal([alphaKey]);
  });
});
