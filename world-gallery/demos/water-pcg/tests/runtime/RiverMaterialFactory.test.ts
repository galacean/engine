import { describe, expect, it } from "vitest";
import { lowRiverShaderSource, riverSurfaceShaderSource } from "../../runtime/river/RiverMaterialFactory";

describe("RiverMaterialFactory shaders", () => {
  it("uses one pass, one texture sample, and no FBM loop", () => {
    expect(lowRiverShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource.match(/texture2D\(/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource).not.toMatch(/fbm|for\s*\(/i);
    expect(lowRiverShaderSource).toContain("scene_ElapsedTime.x");
    expect(lowRiverShaderSource).toContain("TEXCOORD_1");
    expect(lowRiverShaderSource).toContain("COLOR_0");
    expect(lowRiverShaderSource).toContain("input.color.b");
    expect(lowRiverShaderSource).toContain("input.uv.y - flowTime");
    expect(lowRiverShaderSource).not.toContain("input.localFlowSpeed * material_FlowSpeed");
    expect(lowRiverShaderSource).not.toContain("max(material_FlowSpeed, 0.08)");
  });

  it("keeps Low transparency clarity-driven without scene textures", () => {
    expect(lowRiverShaderSource).toContain("float waterAlpha = mix(");
    expect(lowRiverShaderSource).toContain("clamp(material_Clarity, 0.0, 1.0)");
    expect(lowRiverShaderSource).not.toContain("water * material_BaseColor.a");
    expect(lowRiverShaderSource).not.toContain("camera_DepthTexture");
    expect(lowRiverShaderSource).not.toContain("camera_OpaqueTexture");
  });

  it("uses one downstream phase for every procedural surface layer", () => {
    expect(riverSurfaceShaderSource).toContain("float branchDownstream = input.uv.y - flowTime");
    expect(riverSurfaceShaderSource).toContain("float junctionDownstream = input.color.g - flowTime");
    expect(riverSurfaceShaderSource).toContain("mix(branchDownstream, junctionDownstream, junctionInterior)");
    expect(riverSurfaceShaderSource).toContain("vec2 worldUv = input.worldXZ");
    expect(riverSurfaceShaderSource).toContain("renderer_ModelMat * attr.POSITION");
    expect(riverSurfaceShaderSource).not.toContain("input.uv.y * 1.35 + time");
    expect(riverSurfaceShaderSource).not.toContain("dualPhaseFbm");
    expect(riverSurfaceShaderSource).not.toContain("flowUVW");
    expect(riverSurfaceShaderSource).toContain("input.color.b");
  });

  it("renders soft broken shoreline foam inside the surface pass", () => {
    expect(riverSurfaceShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(riverSurfaceShaderSource.match(/fbm\(/g) ?? []).toHaveLength(6);
    expect(riverSurfaceShaderSource.match(/texture2D\(/g) ?? []).toHaveLength(1);
    expect(riverSurfaceShaderSource).toContain("float streak = sin(detailPhase");
    expect(riverSurfaceShaderSource).toContain("float shoreEnvelope");
    expect(riverSurfaceShaderSource).toContain("float shoreNoiseMask");
    expect(riverSurfaceShaderSource).toContain("float shoreDetail");
    expect(riverSurfaceShaderSource).toContain("float shoreSmooth");
    expect(riverSurfaceShaderSource).toContain("float shoreSharp");
    expect(riverSurfaceShaderSource).toMatch(/mix\(\s+shoreSharp,\s+shoreSmooth/);
    expect(riverSurfaceShaderSource).toContain("float shoreFoam");
    expect(riverSurfaceShaderSource).toContain("float foamTint");
    expect(riverSurfaceShaderSource).toContain("vec3 softFoamColor");
    expect(riverSurfaceShaderSource).toContain("1.0 - smoothstep(0.96, 1.0, bankDistance)");
    expect(riverSurfaceShaderSource).not.toContain("broadWater * 0.66 + foamNoise * 0.34");
    expect(riverSurfaceShaderSource).not.toContain("0.18 + shorePattern * 0.82");
    expect(riverSurfaceShaderSource).not.toMatch(/mix\(color, softFoamColor[^;]+, foam\)/);
  });

  it("uses scene depth for Medium optical thickness without opaque-color sampling", () => {
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_DepthTexture");
    expect(riverSurfaceShaderSource).toContain("remapDepthBufferEyeDepth");
    expect(riverSurfaceShaderSource).toContain("sceneEyeDepth - input.surfaceEyeDepth");
    expect(riverSurfaceShaderSource).toContain("float transmittance = exp(-absorption * opticalDepth)");
    expect(riverSurfaceShaderSource).toContain("float waterAlpha = clamp(");
    expect(riverSurfaceShaderSource).not.toContain("camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).not.toContain("material_BaseColor.a *");
  });
});
