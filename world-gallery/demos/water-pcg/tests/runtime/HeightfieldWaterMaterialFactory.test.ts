import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import {
  HEIGHTFIELD_WATER_SURFACE_TEXTURE,
  HEIGHTFIELD_WATER_SURFACE_TUNING
} from "../../runtime/heightfield/constants";
import {
  heightfieldWaterHighShaderSource,
  heightfieldWaterLowShaderSource,
  heightfieldWaterMediumShaderSource
} from "../../runtime/heightfield/HeightfieldWaterMaterialFactory";
import { buildHeightfieldWaterSurfaceTexturePixels } from "../../runtime/heightfield/HeightfieldWaterSurfaceTextureFactory";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

describe("HeightfieldWaterMaterialFactory", () => {
  it.each([
    ["Low", heightfieldWaterLowShaderSource],
    ["Medium", heightfieldWaterMediumShaderSource],
    ["High", heightfieldWaterHighShaderSource]
  ])("precompiles the %s variant to GLES100", (_label, source) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it("uses the mesh base normal/tangent and damps normal-directed waves with shoreline SDF", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec3 computedBaseNormalWS = normalize");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseTangentWS");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseBitangentWS");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseNormalWS * waveOffset");
    expect(heightfieldWaterMediumShaderSource).toContain("float shoreDamping = smoothstep(");
    expect(heightfieldWaterMediumShaderSource).toContain("displacement += amplitude * sine * shoreDamping");
    expect(heightfieldWaterMediumShaderSource).not.toContain("localPosition.y +=");
    expect(heightfieldWaterMediumShaderSource).toContain("output.atlasUv = computedAtlasUv");
    expect(heightfieldWaterMediumShaderSource).not.toMatch(/\b(atlasUv|baseNormalWS|macroNormalWS)\s*=\s*\1\s*;/);
  });

  it("samples RG flow, B depth, and A signed distance from the global mesh UV in the fragment path", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec2 computedAtlasUv = attr.TEXCOORD_0");
    expect(heightfieldWaterMediumShaderSource).not.toContain("mix(renderer_AtlasUvRect");
    expect(heightfieldWaterLowShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(2);
    expect(heightfieldWaterMediumShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(5);
    expect(heightfieldWaterHighShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(8);
    expect(heightfieldWaterMediumShaderSource).toContain("vec2 flowXZ = (localMap.rg * 2.0 - 1.0)");
    expect(heightfieldWaterMediumShaderSource).toContain("localMap.b * material_LocalMapDecode.y");
    expect(heightfieldWaterMediumShaderSource).toContain("(localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z");
  });

  it("keeps Low authored-depth-only and enables defined scene-depth remapping for Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).not.toContain("camera_DepthTexture");
    expect(heightfieldWaterLowShaderSource).not.toContain("camera_OpaqueTexture");
    expect(heightfieldWaterLowShaderSource).toContain("float opticalDepth = authoredDepth;");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("sampler2D camera_DepthTexture");
      expect(source).toContain("sampler2D camera_OpaqueTexture");
      expect(source).toContain("float remapDepthBufferEyeDepth(float depth)");
      expect(source).toContain("float sampledOpticalDepth = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0)");
      expect(source).toContain("float opticalDepth = min(sampledOpticalDepth, authoredDepth)");
    }
  });

  it("uses depth-guarded scene-color refraction only for Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).not.toContain("refractedScreenUv");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("vec2 refractedScreenUv = clamp(");
      expect(source).toContain("float refractionDepthContinuity = 1.0 - smoothstep(");
      expect(source).toContain("abs(refractedSceneEyeDepth - sceneEyeDepth)");
      expect(source).toContain("float refractedGeometryBehindSurface = smoothstep(");
      expect(source).toContain("vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb");
      expect(source).toContain("vec3 displacedSceneColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb");
      expect(source).toContain("smoothstep(0.12, 0.72, input.shoreDamping)");
      expect(source).toContain("(1.0 - foamTint * 0.94)");
    }
    expect(heightfieldWaterHighShaderSource).toContain("refractionNormalDelta * 0.012");
    expect(heightfieldWaterMediumShaderSource).toContain("refractionNormalDelta * 0.008");
  });

  it("uses fixed 2/6/12 unrolled wave variants and bounded surface time", () => {
    expect(heightfieldWaterLowShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(3);
    expect(heightfieldWaterMediumShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(7);
    expect(heightfieldWaterHighShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(13);
    expect(heightfieldWaterMediumShaderSource).toContain("mod(max(selected, 0.0), 4096.0)");
    expect(heightfieldWaterMediumShaderSource).not.toMatch(/for\s*\(/);
  });

  it("advects a tileable surface texture with reset-free dual flow phases", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).toContain("sampler2D material_SurfaceTexture");
      expect(source).toContain("vec4 sampleFlowSurface(");
      expect(source).toContain("float progressA = fract(cycle)");
      expect(source).toContain("float progressB = fract(cycle + 0.5)");
      expect(source).toContain("float weightA = 1.0 - abs(progressA * 2.0 - 1.0)");
      expect(source).toContain("decodedA * weightA + decodedB * weightB");
      expect(source).toContain("float spatialPhase = dot(worldXZ, spatialPhaseDirection)");
      expect(source).toContain("float cycle = elapsedTime * cycleRate + spatialPhase");
      expect(source).toContain("+ (cycle - progressA) * cycleJump");
      expect(source).toContain("+ (cycle - progressB) * cycleJump");
      expect(source).not.toContain("float microA = sin");
      expect(source).not.toContain("float foamNoise = sin");
    }
  });

  it("uses per-layer cycle jumps and expands the authored flow-speed contrast", () => {
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.24, 0.2083333)");
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.2, 0.25)");
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.22, 0.27)");
    expect(heightfieldWaterHighShaderSource).toContain("0.54\n              + normalizedSpeed * 1.08");
    expect(heightfieldWaterHighShaderSource).toContain("0.48\n              + normalizedSpeed * 1.02");
    const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
    const movingScale = (speed: number, base: number, speedScale: number): number =>
      base + (speed / tuning.maximumFlowSpeed) * speedScale;
    const cycleRateRatio =
      movingScale(1.65, tuning.flowingCycleRateBase, tuning.flowingCycleRateSpeedScale) /
      movingScale(0.9, tuning.flowingCycleRateBase, tuning.flowingCycleRateSpeedScale);
    const travelRatio =
      movingScale(1.65, tuning.flowingPhaseTravelBase, tuning.flowingPhaseTravelSpeedScale) /
      movingScale(0.9, tuning.flowingPhaseTravelBase, tuning.flowingPhaseTravelSpeedScale);
    expect(cycleRateRatio).toBeGreaterThan(1.35);
    expect(cycleRateRatio).toBeLessThan(1.5);
    expect(travelRatio).toBeGreaterThan(1.35);
    expect(travelRatio).toBeLessThan(1.5);
  });

  it("attenuates still-pond macro motion, micro normals, and foam", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).toContain(
        "float macroAmplitudeScale = mix(\n          0.3,\n          1.0,\n          flowWeight"
      );
      expect(source).toContain(
        "material_MicroNormalsEnabled * mix(\n          0.35,\n          1.0,\n          flowWeight"
      );
      expect(source).toContain("float foamMotionScale = mix(\n          0.1,\n          1.0,\n          flowWeight");
      expect(source).toContain("* material_WavesEnabled\n          * macroAmplitudeScale");
    }
  });

  it("adds unrolled upstream-SDF wake taps only to Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).toContain("float wakeFoam = 0.0");
    expect(heightfieldWaterLowShaderSource).not.toContain("upstreamAtlasUvRaw0");
    expect(heightfieldWaterMediumShaderSource.match(/vec2 upstreamAtlasUvRaw\d =/g) ?? []).toHaveLength(1);
    expect(heightfieldWaterMediumShaderSource).not.toContain("upstreamAtlasUvRaw1");
    expect(heightfieldWaterHighShaderSource.match(/vec2 upstreamAtlasUvRaw\d =/g) ?? []).toHaveLength(2);
    expect(heightfieldWaterHighShaderSource).toContain("upstreamAtlasUvRaw1");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("- flowDirection * material_LocalMapWorldToUv.xy");
      expect(source).toContain("vec2 wakeLateralDirection = vec2(-flowDirection.y, flowDirection.x)");
      expect(source).toContain("float upstreamObstacleGate0 = min(");
      expect(source).toContain("* upstreamAtlasInterior0 * upstreamObstacleGate0");
      expect(source).toContain("float wakeInterior = smoothstep(");
      expect(source).toContain("float wakeDetail = smoothstep(");
      expect(source).toContain("foamNoise + abs(flowSurface.x) * 0.12");
      expect(source).toContain("* flowWeight\n          * wakeDetail");
    }
  });

  it("scales flow detail cost from one to three unrolled layers", () => {
    expect(heightfieldWaterLowShaderSource).toContain("vec4 flowSurface0");
    expect(heightfieldWaterLowShaderSource).not.toContain("vec4 flowSurface1");
    expect(heightfieldWaterMediumShaderSource).toContain("vec4 flowSurface1");
    expect(heightfieldWaterMediumShaderSource).not.toContain("vec4 flowSurface2");
    expect(heightfieldWaterHighShaderSource).toContain("vec4 flowSurface2");
    expect(heightfieldWaterHighShaderSource).toContain("mix(authoredDirection, localFlowDirection, flowAlignment)");
  });

  it("combines physical-looking absorption, Schlick Fresnel, sun glints, and three foam sources", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec3 transmittance = exp(-absorption * opticalDepth)");
    expect(heightfieldWaterMediumShaderSource).toContain("pow(1.0 - normalDotView, 5.0)");
    expect(heightfieldWaterMediumShaderSource).toContain("float broadSpecular = pow(");
    expect(heightfieldWaterMediumShaderSource).toContain("float tightSpecular = pow(");
    expect(heightfieldWaterMediumShaderSource).toContain("float shoreFoam = shoreEnvelope * foamBreakup");
    expect(heightfieldWaterMediumShaderSource).toContain("float crestFoam = smoothstep(");
    expect(heightfieldWaterMediumShaderSource).toContain("float currentFoam = smoothstep(");
  });

  it("uses semantic varyings without compatibility packing", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      const varyingBlock = source.match(/struct Varyings \{([\s\S]*?)\};/)?.[1] ?? "";
      expect(varyingBlock).toContain("float baseSurfaceHeight");
      expect(varyingBlock).toContain("float waveOffset");
      expect(varyingBlock).toContain("float surfaceEyeDepth");
      expect(varyingBlock).toContain("float shoreDamping");
      expect(varyingBlock).not.toContain("surfaceData");
    }
  });

  it("builds deterministic non-flat repeatable texture data", () => {
    const first = buildHeightfieldWaterSurfaceTexturePixels();
    const second = buildHeightfieldWaterSurfaceTexturePixels();
    const size = HEIGHTFIELD_WATER_SURFACE_TEXTURE.size;
    expect(first).toEqual(second);
    expect(first).toHaveLength(size * size * 4);
    const redValues = new Set<number>();
    const blueValues = new Set<number>();
    let decorrelatedChannelCount = 0;
    for (let offset = 0; offset < first.length; offset += 4) {
      redValues.add(first[offset]);
      blueValues.add(first[offset + 2]);
      if (first[offset + 2] !== first[offset + 3]) decorrelatedChannelCount++;
    }
    expect(redValues.size).toBeGreaterThan(64);
    expect(blueValues.size).toBeGreaterThan(64);
    expect(decorrelatedChannelCount).toBeGreaterThan(size * size * 0.8);
  });

  it("maps compiled wet surface vertices to positive atlas SDF texels without a V flip", () => {
    const data = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture(WaterQualityTier.Medium).descriptor
    ).data!;
    const atlas = data.localMapAtlas;
    const pixels = atlas.pixels.toTypedArray();
    let positive = 0;
    let negative = 0;
    for (const chunk of data.chunks) {
      const positions = chunk.geometry.positions.toTypedArray();
      for (let index = 0; index < chunk.geometry.vertexCount; index++) {
        const worldX = positions[index * 3] + chunk.localOrigin[0];
        const worldZ = positions[index * 3 + 2] + chunk.localOrigin[2];
        const u = worldX * atlas.worldToUv[0] + atlas.worldToUv[2];
        const v = worldZ * atlas.worldToUv[1] + atlas.worldToUv[3];
        const pixelX = Math.max(0, Math.min(atlas.width - 1, Math.floor(u * atlas.width)));
        const pixelY = Math.max(0, Math.min(atlas.height - 1, Math.floor(v * atlas.height)));
        if (pixels[(pixelY * atlas.width + pixelX) * 4 + 3] > 127) positive++;
        else negative++;
      }
    }
    expect(positive).toBeGreaterThan(negative);
  });
});
