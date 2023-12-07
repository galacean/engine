import { expect } from "chai";
import { ParticleGradient, GradientColorKey, GradientAlphaKey } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";

describe("ParticleGradient tests", () => {
  it("Constructor initializes empty keys when no arguments are provided", () => {
    const gradient = new ParticleGradient();
    expect(gradient.colorKeys).to.be.an("array").that.is.empty;
    expect(gradient.alphaKeys).to.be.an("array").that.is.empty;
  });

  it("Constructor initializes with provided color and alpha keys", () => {
    const colorKeys = [new GradientColorKey(0, new Color(1, 0, 0, 1)), new GradientColorKey(1, new Color(0, 1, 0, 1))];
    const alphaKeys = [new GradientAlphaKey(0, 0.5), new GradientAlphaKey(1, 1)];

    const gradient = new ParticleGradient(colorKeys, alphaKeys);
    expect(gradient.colorKeys).to.deep.equal(colorKeys);
    expect(gradient.alphaKeys).to.deep.equal(alphaKeys);
  });

  it("Adding color keys increases keys array size", () => {
    const gradient = new ParticleGradient();
    gradient.addColorKey(0.5, new Color(1, 0, 0, 1));
    expect(gradient.colorKeys).to.have.lengthOf(1);
  });

  it("Adding alpha keys increases keys array size", () => {
    const gradient = new ParticleGradient();
    gradient.addAlphaKey(0.5, 1);
    expect(gradient.alphaKeys).to.have.lengthOf(1);
  });

  it("Removing color keys decreases keys array size", () => {
    const gradient = new ParticleGradient();
    gradient.addColorKey(0.5, new Color(1, 0, 0, 1));
    gradient.removeColorKey(0);
    expect(gradient.colorKeys).to.be.empty;
  });

  it("Removing alpha keys decreases keys array size", () => {
    const gradient = new ParticleGradient();
    gradient.addAlphaKey(0.5, 1);
    gradient.removeAlphaKey(0);
    expect(gradient.alphaKeys).to.be.empty;
  });

  it("Setting keys replaces existing keys", () => {
    const initialColorKeys = [new GradientColorKey(0, new Color(1, 0, 0, 1))];
    const initialAlphaKeys = [new GradientAlphaKey(0, 0.5)];
    const newColorKeys = [
      new GradientColorKey(0.5, new Color(0, 1, 0, 1)),
      new GradientColorKey(1, new Color(0, 0, 1, 1))
    ];
    const newAlphaKeys = [new GradientAlphaKey(0.5, 1), new GradientAlphaKey(1, 0.5)];

    const gradient = new ParticleGradient(initialColorKeys, initialAlphaKeys);
    gradient.setKeys(newColorKeys, newAlphaKeys);
    expect(gradient.colorKeys).to.deep.equal(newColorKeys);
    expect(gradient.alphaKeys).to.deep.equal(newAlphaKeys);
  });

  it("Throws error when adding more than the maximum allowed color keys", () => {
    const gradient = new ParticleGradient();
    const maxColorKeys = 4;

    for (let i = 0; i < maxColorKeys; i++) {
      gradient.addColorKey(i / maxColorKeys, new Color(1, 0, 0, 1));
    }
    expect(() => gradient.addColorKey(1, new Color(0, 1, 0, 1))).to.throw("Gradient can only have 4 color keys");
  });

  it("Throws error when adding more than the maximum allowed alpha keys", () => {
    const gradient = new ParticleGradient();
    const maxAlphaKeys = 4;

    for (let i = 0; i < maxAlphaKeys; i++) {
      gradient.addAlphaKey(i / maxAlphaKeys, 1);
    }

    expect(() => gradient.addAlphaKey(1, 0.5)).to.throw("Gradient can only have 4 alpha keys");
  });
});
