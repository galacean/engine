import {
  parseConstructionDecorations,
  type ConstructionDecorationSpec
} from "../src/building/runtime/ConstructionDecorations";
import { describe, expect, it } from "vitest";
import { validateBuildingDraft } from "../src/building/parts/architecture/BuildingDraft";
import { generatedDecorationSeed } from "../src/building/runtime/ConstructionDecorationConfig";
const wallSpec: ConstructionDecorationSpec = {
  id: "window-0-0",
  kind: "window",
  type: "window-gothic",
  u: 10 / 28,
  bottom: 1,
  width: 1.2,
  height: 1.5
};

describe("Scene attachment identity and procedural variation", () => {
  it("retains the original uint32 generator including overflow", () => {
    expect(generatedDecorationSeed(17, "window-0-0")).toBe(3137222521);
  });
  it("validates seeds before geometry generation and preserves all uint32 values", () => {
    for (const seed of [0, 0xffffffff]) {
      expect(parseConstructionDecorations([{ ...wallSpec, seed }])[0].seed).toBe(seed);
      expect(() =>
        validateBuildingDraft({ groups: [{ id: "house", seed, wallColor: 0, woodColor: 0 }], parts: [], relations: [] })
      ).not.toThrow();
    }
    for (const seed of [-1, 1.5, 0x100000000, NaN, Infinity, null, "1"]) {
      expect(() => parseConstructionDecorations([{ ...wallSpec, seed }])).toThrow("uint32");
      expect(() =>
        validateBuildingDraft({
          groups: [{ id: "house", seed: seed as number, wallColor: 0, woodColor: 0 }],
          parts: [],
          relations: []
        })
      ).toThrow("uint32");
    }
  });
  it("does not accept a wall-only variation field on the separate roof contract", () => {
    expect(() =>
      parseConstructionDecorations([{ ...wallSpec, type: "dormer-gothic", host: "roof", uv: [0.5, 0.5], seed: 0 }])
    ).toThrow("requires a wall host");
  });
});
