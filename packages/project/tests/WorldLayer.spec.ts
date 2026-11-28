import { Layer } from "@galacean/engine-core";
import { expect, it } from "vitest";
import { WorldLayer } from "../src/rendering/WorldLayer";

it("assigns one distinct layer bit to each World system", () => {
  const layers = Object.values(WorldLayer);
  expect(layers).not.toContain(Layer.Layer0);
  expect(new Set(layers).size).toBe(layers.length);
  for (const layer of layers) {
    expect(layer).not.toBe(0);
    expect(layer & (layer - 1)).toBe(0);
  }
});
