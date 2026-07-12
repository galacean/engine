import {
  CurveKey,
  GradientAlphaKey,
  GradientColorKey,
  ParticleCurve,
  ParticleGradient
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("particle serializable collection properties", () => {
  it("replaces and sorts ParticleCurve keys", () => {
    const curve = new ParticleCurve(new CurveKey(0.5, 1));
    const early = new CurveKey(0.25, 2);
    const late = new CurveKey(0.75, 3);

    curve.keys = [late, early];

    expect(curve.keys).to.deep.equal([early, late]);
  });

  it("replaces ParticleGradient color and alpha keys independently", () => {
    const gradient = new ParticleGradient();
    const colorKey = new GradientColorKey(0.5, new Color(1, 0.5, 0.25, 1));
    const alphaKey = new GradientAlphaKey(0.5, 0.75);

    gradient.colorKeys = [colorKey];
    gradient.alphaKeys = [alphaKey];

    expect(gradient.colorKeys).to.deep.equal([colorKey]);
    expect(gradient.alphaKeys).to.deep.equal([alphaKey]);
  });
});
