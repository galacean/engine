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
      "riverWarpedDomain(input.motionCoordinates, input.localFlowSpeed, elapsedTime)"
    );
    expect(riverSurfaceShaderSource).toContain("localPosition.y += computedMacroHeight");
    expect(riverSurfaceShaderSource).toContain("output.motionCoordinates = attr.TEXCOORD_2");
    expect(riverSurfaceShaderSource).toContain("output.authoredDepth = attr.TEXCOORD_3.y");
    expect(riverSurfaceShaderSource).toContain("baseNormalWS - acrossWS * acrossDerivative");
    expect(riverSurfaceShaderSource).not.toContain("float streak = sin(detailPhase");
    expect(riverSurfaceShaderSource).not.toContain("branchDownstream");
    expect(riverSurfaceShaderSource).toContain("point = mod(point,");
    expect(riverSurfaceShaderSource).not.toContain("mod(motionCoord.y, timePeriod)");
    expect(riverSurfaceShaderSource).toContain("safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight)");
  });

  it("uses eroded ridged crests and three-scale continuous flow normals", () => {
    expect(riverSurfaceShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(riverSurfaceShaderSource).toContain("float ridgeMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float erosionMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float crestCurvature");
    expect(riverSurfaceShaderSource).toContain("vec4 sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("float progressA = fract(cycle)");
    expect(riverSurfaceShaderSource).toContain("float progressB = fract(cycle + 0.5)");
    expect(riverSurfaceShaderSource).toContain("(cycle - progressA) * cycleJump");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceA = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceB = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceC = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("float microDetailScale = clamp(");
    expect(riverSurfaceShaderSource).toContain("0.07500000 * microDetailScale");
    expect(riverSurfaceShaderSource).toContain("float shoreEnvelope");
    expect(riverSurfaceShaderSource).toContain("float crestFoam");
    expect(riverSurfaceShaderSource).toContain("float shoreFoam");
    expect(riverSurfaceShaderSource).toContain("float shorePatchNoise = riverFbm(");
    expect(riverSurfaceShaderSource).toContain("float shorePulse = 0.5 + 0.5 * sin(");
    expect(riverSurfaceShaderSource).toContain("float shorePatchGate = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float shoreLifePulse = 0.5 + 0.5 * sin(");
    expect(riverSurfaceShaderSource).toContain("float shoreLifeGate = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float shoreBreakup = shorePatchGate");
    expect(riverSurfaceShaderSource).toContain("float shoreFoam = shoreEnvelope");
    expect(riverSurfaceShaderSource).not.toContain("shoreFoamMinimum");
    expect(riverSurfaceShaderSource).toContain("float foamTint");
    expect(riverSurfaceShaderSource).toContain("float foamTint = saturate(");
    expect(riverSurfaceShaderSource).toContain("+ shoreFoam *");
    expect(riverSurfaceShaderSource).toContain("+ localWakeFoam *");
    expect(riverSurfaceShaderSource).toContain("+ obstacleEdgeFoam *");
    expect(riverSurfaceShaderSource).toContain("vec3 softFoamColor");
    expect(RIVER_SURFACE_TEXTURE_SAMPLE_COUNT).toEqual({ low: 1, regular: 10, localMap: 11 });
  });

  it("uses heightfield-style Schlick reflection and two-scale sunlight on the river surface", () => {
    expect(riverSurfaceShaderSource).toContain("float fresnel = 0.02200000");
    expect(riverSurfaceShaderSource).toContain("float broadSpecular = pow(");
    expect(riverSurfaceShaderSource).toContain("float tightSpecular = pow(");
    expect(riverSurfaceShaderSource).toContain("vec3 skyReflection = mix(");
    expect(riverSurfaceShaderSource).toContain("float sparkleMask = mix(");
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).toContain("vec2 displacedScreenUv = screenUv");
    expect(riverSurfaceShaderSource).toContain("float refractionDepthContinuity = 1.0 - smoothstep(");
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
    expect(riverSurfaceLocalMapShaderSource).toContain("float obstacleRegionWeight =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localWakeSignal =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeTravelPhase = dot(input.worldXZ, baseFlow)");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeAlternation = 0.5 + 0.5 * sin(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeShedding = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float dynamicWakeSignal = localWakeSignal * wakeShedding");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeLiftedSignal = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localConfluenceFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localWakeFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float obstacleEdgeFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec2 localFlowBend = (localFlowDirection - baseFlow)");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec2 localWakeRipple = wakeLateralDirection");
  });

  it("caps Medium scene-depth thickness with the authored water column", () => {
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_DepthTexture");
    expect(riverSurfaceShaderSource).toContain("remapDepthBufferEyeDepth");
    expect(riverSurfaceShaderSource).toContain("sceneEyeDepth - input.surfaceEyeDepth");
    expect(riverSurfaceShaderSource).toContain("input.authoredDepth * input.shoreDamping");
    expect(riverSurfaceShaderSource).toContain("float authoredDepthAvailable = step(");
    expect(riverSurfaceShaderSource).toContain("min(sampledOpticalDepth, authoredOpticalDepth)");
    expect(riverSurfaceShaderSource).toContain("vec3 transmittance = exp(-absorption * opticalDepth)");
    expect(riverSurfaceShaderSource).toContain("float absorptionAlpha = 1.0 - exp(-mix(");
    expect(riverSurfaceShaderSource).toContain("float waterAlpha = clamp(");
    expect(riverSurfaceShaderSource).toContain("alpha * material_OpacityScale");
    expect(riverSurfaceShaderSource).toContain("saturate(material_TintWeight)");
    expect(riverSurfaceShaderSource).toContain("vec3 deepWaterColor = mix(");
    expect(riverSurfaceShaderSource).toContain(
      "vec3 volumeColor = mix(material_BaseColor.rgb, deepWaterColor, depthColorMix)"
    );
    expect(riverSurfaceShaderSource).toContain("camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).not.toContain("material_BaseColor.a *");
  });

  it("uses semantic varyings without compatibility packing", () => {
    const varyingBlock = riverSurfaceShaderSource.match(/struct Varyings \{([\s\S]*?)\};/)?.[1] ?? "";
    expect(varyingBlock).toContain("vec2 motionCoordinates");
    expect(varyingBlock).toContain("float riverHalfWidth");
    expect(varyingBlock).toContain("float localFlowSpeed");
    expect(varyingBlock).toContain("float macroHeight");
    expect(varyingBlock).toContain("float shoreDamping");
    expect(varyingBlock).toContain("float surfaceEyeDepth");
    expect(varyingBlock).toContain("float authoredDepth");
    expect(varyingBlock).not.toContain("motionData");
    expect(varyingBlock).not.toContain("surfaceData");
  });
});
