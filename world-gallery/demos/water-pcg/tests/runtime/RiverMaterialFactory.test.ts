import { describe, expect, it } from "vitest";
import { lowRiverShaderSource, riverSurfaceShaderSource } from "../../runtime/river/RiverMaterialFactory";

describe("RiverMaterialFactory Low shader", () => {
  it("uses one pass, one texture sample, and no FBM loop", () => {
    expect(lowRiverShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource.match(/texture2D\(/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource).not.toMatch(/fbm|for\s*\(/i);
    expect(lowRiverShaderSource).toContain("scene_ElapsedTime.x");
    expect(lowRiverShaderSource).toContain("TEXCOORD_1");
    expect(lowRiverShaderSource).toContain("input.uv.y - flowTime");
    expect(lowRiverShaderSource).not.toContain("input.localFlowSpeed * material_FlowSpeed");
    expect(lowRiverShaderSource).not.toContain("max(material_FlowSpeed, 0.08)");
  });

  it("uses one downstream phase for every procedural surface layer", () => {
    expect(riverSurfaceShaderSource).toContain("float downstream = input.uv.y - flowTime");
    expect(riverSurfaceShaderSource).not.toContain("input.uv.y * 1.35 + time");
    expect(riverSurfaceShaderSource).not.toContain("dualPhaseFbm");
    expect(riverSurfaceShaderSource).not.toContain("flowUVW");
  });
});
