import { describe, expect, it } from "vitest";
import { lowRiverShaderSource } from "../river/RiverMaterialFactory";

describe("RiverMaterialFactory Low shader", () => {
  it("uses one pass, one texture sample, and no FBM loop", () => {
    expect(lowRiverShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource.match(/texture2D\(/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource).not.toMatch(/fbm|for\s*\(/i);
    expect(lowRiverShaderSource).toContain("scene_ElapsedTime.x");
  });
});
