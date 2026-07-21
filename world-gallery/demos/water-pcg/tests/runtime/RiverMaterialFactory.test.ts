import { describe, expect, it } from "vitest";
import {
  lowRiverShaderSource,
  riverSurfaceLocalMapShaderSource,
  riverSurfaceShaderSource
} from "../../runtime/river/RiverMaterialFactory";
import { RIVER_SURFACE_TEXTURE_SAMPLE_COUNT } from "../../runtime/river/constants";

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

  it("displaces vertices from continuous network flow coordinates", () => {
    expect(riverSurfaceShaderSource).toContain("float riverMacroHeight(");
    expect(riverSurfaceShaderSource).toContain(
      "riverWarpedDomain(input.motionData.xy, input.motionData.w, elapsedTime)"
    );
    expect(riverSurfaceShaderSource).toContain("localPosition.y += computedMacroHeight");
    expect(riverSurfaceShaderSource).toContain("output.motionData = vec4(attr.TEXCOORD_2");
    expect(riverSurfaceShaderSource).toContain("output.surfaceData = vec4(");
    expect(riverSurfaceShaderSource).toContain("baseNormalWS - acrossWS * acrossDerivative");
    expect(riverSurfaceShaderSource).not.toContain("float streak = sin(detailPhase");
    expect(riverSurfaceShaderSource).not.toContain("branchDownstream");
    expect(riverSurfaceShaderSource).toContain("point = mod(point,");
    expect(riverSurfaceShaderSource).not.toContain("mod(motionCoord.y, timePeriod)");
    expect(riverSurfaceShaderSource).toContain("safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight)");
  });

  it("uses eroded ridged crests and two-scale dual-phase micro normals", () => {
    expect(riverSurfaceShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(riverSurfaceShaderSource).toContain("float ridgeMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float erosionMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float crestCurvature");
    expect(riverSurfaceShaderSource).toContain("vec2 flowUVWNormal(");
    expect(riverSurfaceShaderSource).toContain("float phaseA = fract(cycle)");
    expect(riverSurfaceShaderSource).toContain("float phaseB = fract(cycle + 0.5)");
    expect(riverSurfaceShaderSource).toContain("vec2 microA = flowUVWNormal(");
    expect(riverSurfaceShaderSource).toContain("vec2 microB = flowUVWNormal(");
    expect(riverSurfaceShaderSource).toContain("float shoreEnvelope");
    expect(riverSurfaceShaderSource).toContain("float crestFoam");
    expect(riverSurfaceShaderSource).toContain("float shoreFoam");
    expect(riverSurfaceShaderSource).toContain("float foamTint");
    expect(riverSurfaceShaderSource).toContain("vec3 softFoamColor");
    expect(RIVER_SURFACE_TEXTURE_SAMPLE_COUNT).toEqual({ low: 1, regular: 5, localMap: 6 });
  });

  it("keeps the regular path atlas-free and adds one guarded sample only to complex chunks", () => {
    expect(riverSurfaceShaderSource).not.toContain("material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("sampler2D material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec4 localMapSample = texture2D(material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("float atlasRectMask");
    expect(riverSurfaceLocalMapShaderSource).toContain("float confluenceInteriorWeight = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("renderer_LocalMapConfluence");
    expect(riverSurfaceLocalMapShaderSource).toContain("* localEffectWeight");
    expect(riverSurfaceLocalMapShaderSource).toContain("renderer_LocalMapWorldToUv");
  });

  it("caps Medium scene-depth thickness with the authored water column", () => {
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_DepthTexture");
    expect(riverSurfaceShaderSource).toContain("remapDepthBufferEyeDepth");
    expect(riverSurfaceShaderSource).toContain("sceneEyeDepth - input.surfaceData.z");
    expect(riverSurfaceShaderSource).toContain("input.surfaceData.w * input.surfaceData.y");
    expect(riverSurfaceShaderSource).toContain("float authoredDepthAvailable = step(");
    expect(riverSurfaceShaderSource).toContain("min(sampledOpticalDepth, authoredOpticalDepth)");
    expect(riverSurfaceShaderSource).toContain("float transmittance = exp(-absorption * opticalDepth)");
    expect(riverSurfaceShaderSource).toContain("float waterAlpha = clamp(");
    expect(riverSurfaceShaderSource).toContain("alpha * material_OpacityScale");
    expect(riverSurfaceShaderSource).toContain("saturate(material_TintWeight)");
    expect(riverSurfaceShaderSource).not.toContain("camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).not.toContain("material_BaseColor.a *");
  });

  it("packs Medium varyings within the WebGL1 minimum varying-vector budget", () => {
    const varyingBlock = riverSurfaceShaderSource.match(/struct Varyings \{([\s\S]*?)\};/)?.[1] ?? "";
    const declarations = varyingBlock.match(/\b(?:vec[234]|float)\s+\w+;/g) ?? [];
    expect(declarations).toHaveLength(7);
    expect(varyingBlock).toContain("vec4 motionData");
    expect(varyingBlock).toContain("vec4 surfaceData");
  });
});
