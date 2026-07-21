/** River shader creation and material binding. */
import { Engine, Material, Shader, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import type { RiverMaterialConfig } from "../../authoring/river/RiverAuthoringTypes";
import {
  RIVER_FLOW_TRAVEL_MIN_SPEED,
  RIVER_FLOW_UV_SCALE,
  RIVER_SURFACE_DERIVATIVE_STEP,
  RIVER_SURFACE_DOMAIN_WARP_SCALE,
  RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
  RIVER_SURFACE_FLOW_EPSILON,
  RIVER_SURFACE_HASH_MULTIPLIER,
  RIVER_SURFACE_HASH_SEED_SCALE,
  RIVER_SURFACE_MACRO_NOISE,
  RIVER_SURFACE_NOISE_PERIOD,
  RIVER_SURFACE_REFERENCE_FLOW_SPEED
} from "../../compiler/river/constants";
import type { RiverCompiledSurfaceMotionData } from "../../compiler/river/types";
import { RiverSurfaceDebugMode } from "./RiverRuntimeEnums";
import {
  RIVER_LOW_OPTICAL_SHADER_TUNING,
  RIVER_MEDIUM_OPTICAL_SHADER_TUNING,
  RIVER_SHADER_PROPERTY,
  RIVER_SHORE_FOAM_SHADER_TUNING,
  RIVER_SURFACE_NORMAL_TEXTURE,
  RIVER_SURFACE_NORMAL_TEXTURE_RANDOM,
  RIVER_SURFACE_SHADER_TUNING
} from "./constants";

function glsl(value: number, digits = 8): string {
  return value.toFixed(digits);
}

const RIVER_FLOW_UV_SCALE_GLSL = glsl(RIVER_FLOW_UV_SCALE);
const RIVER_MEDIUM_MAX_OPTICAL_DEPTH_GLSL = glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.maxOpticalDepth, 1);
const RIVER_SURFACE_NOISE_PERIOD_GLSL = glsl(RIVER_SURFACE_NOISE_PERIOD, 1);

export const lowRiverShaderSource = `
Shader "AIWorld/RiverLow" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      vec4 scene_ElapsedTime;
      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;
      float material_Clarity;
      float material_OpacityScale;
      float material_TintWeight;
      sampler2D material_NoiseTexture;

      struct Attributes { vec4 POSITION; vec4 COLOR_0; vec2 TEXCOORD_0; vec2 TEXCOORD_1; };
      struct Varyings { vec2 uv; float localFlowSpeed; vec4 color; };
      VertexShader = vert;
      FragmentShader = frag;
      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        output.color = attr.COLOR_0;
        return output;
      }
      void frag(Varyings input) {
        float junctionData = step(1.5, input.color.a);
        float junctionInterior = clamp(input.color.b, 0.0, 1.0) * junctionData;
        float across = abs(input.uv.x - 0.5) * 2.0;
        across = mix(across, 1.0 - junctionInterior, junctionData);
        float water = 1.0 - smoothstep(0.48, 0.54, across);
        float feather = 1.0 - smoothstep(0.54, 1.0, across);
        float edge = smoothstep(0.38, 0.58, across) * feather;
        float flowEnabled = step(0.0001, input.localFlowSpeed);
        float flowTime = scene_ElapsedTime.x * max(material_FlowSpeed, 0.0) * ${RIVER_FLOW_UV_SCALE_GLSL} * flowEnabled;
        float downstream = input.uv.y - flowTime;
        float noise = texture2D(material_NoiseTexture, vec2(input.uv.x * 2.0, downstream * 0.28)).r;
        float foam = edge * smoothstep(0.38, 0.86, noise + material_FoamIntensity * 0.24) * 0.32;
        float center = 1.0 - across;
        vec3 waterColor = material_BaseColor.rgb * (0.72 + center * (0.18 + material_Clarity * 0.12));
        vec3 softFoamColor = mix(material_BaseColor.rgb * 1.2, material_FoamColor.rgb, 0.58);
        vec3 color = mix(waterColor, softFoamColor, foam);
        color = mix(color, material_BaseColor.rgb, clamp(material_TintWeight, 0.0, 1.0));
        float waterAlpha = mix(
          ${RIVER_LOW_OPTICAL_SHADER_TUNING.opaqueWaterAlpha},
          ${RIVER_LOW_OPTICAL_SHADER_TUNING.clearWaterAlpha},
          clamp(material_Clarity, 0.0, 1.0)
        );
        float alpha = (water * waterAlpha + foam * ${RIVER_LOW_OPTICAL_SHADER_TUNING.foamAlphaWeight})
          * feather
          * material_OpacityScale;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, ${RIVER_LOW_OPTICAL_SHADER_TUNING.maxAlpha}));
      }
    }
  }
}`;

const lowNoiseTextures = new WeakMap<Engine, Texture2D>();
const surfaceNormalTextures = new WeakMap<Engine, Texture2D>();

function getLowNoiseTexture(engine: Engine): Texture2D {
  const existing = lowNoiseTextures.get(engine);
  if (existing) return existing;
  const size = 8;
  const pixels = new Uint8Array(size * size * 4);
  let seed = RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.initialState;
  for (let index = 0; index < size * size; index++) {
    seed =
      (seed * RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.multiplier + RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.increment) >>> 0;
    const value = seed >>> 24;
    const offset = index * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const texture = new Texture2D(engine, size, size, undefined, true, false);
  texture.name = "RiverLowSharedNoise";
  // The WeakMap cache outlives individual material sets. Keep the shared texture
  // alive across deferred ResourceManager.gc() calls until the engine is destroyed.
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  lowNoiseTextures.set(engine, texture);
  return texture;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function smoothCurve(value: number): number {
  return value * value * (3 - value * 2);
}

function gridHash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed * 17, 0x45d9f3b) ^ Math.imul(y + seed * 31, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function periodicValueNoise(pixelX: number, pixelY: number, cellCount: number, seed: number): number {
  const size = RIVER_SURFACE_NORMAL_TEXTURE.size;
  const x = (pixelX / size) * cellCount;
  const y = (pixelY / size) * cellCount;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = smoothCurve(x - cellX);
  const localY = smoothCurve(y - cellY);
  const x0 = positiveModulo(cellX, cellCount);
  const y0 = positiveModulo(cellY, cellCount);
  const x1 = positiveModulo(cellX + 1, cellCount);
  const y1 = positiveModulo(cellY + 1, cellCount);
  const bottom = gridHash(x0, y0, seed) * (1 - localX) + gridHash(x1, y0, seed) * localX;
  const top = gridHash(x0, y1, seed) * (1 - localX) + gridHash(x1, y1, seed) * localX;
  return bottom * (1 - localY) + top * localY;
}

function surfaceTextureHeight(pixelX: number, pixelY: number, seedOffset: number): number {
  const tuning = RIVER_SURFACE_NORMAL_TEXTURE;
  return (
    periodicValueNoise(
      pixelX,
      pixelY,
      tuning.firstCellCount,
      RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.firstSeed + seedOffset
    ) *
      tuning.firstWeight +
    periodicValueNoise(
      pixelX,
      pixelY,
      tuning.secondCellCount,
      RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.secondSeed + seedOffset
    ) *
      tuning.secondWeight +
    periodicValueNoise(
      pixelX,
      pixelY,
      tuning.thirdCellCount,
      RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.thirdSeed + seedOffset
    ) *
      tuning.thirdWeight
  );
}

function getSurfaceNormalTexture(engine: Engine): Texture2D {
  const existing = surfaceNormalTextures.get(engine);
  if (existing) return existing;
  const size = RIVER_SURFACE_NORMAL_TEXTURE.size;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const heightLeft = surfaceTextureHeight(x - 1, y, 0);
      const heightRight = surfaceTextureHeight(x + 1, y, 0);
      const heightDown = surfaceTextureHeight(x, y - 1, 0);
      const heightUp = surfaceTextureHeight(x, y + 1, 0);
      const slopeX = (heightLeft - heightRight) * RIVER_SURFACE_NORMAL_TEXTURE.gradientStrength;
      const slopeY = (heightDown - heightUp) * RIVER_SURFACE_NORMAL_TEXTURE.gradientStrength;
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(Math.min(1, Math.max(0, slopeX * 0.5 + 0.5)) * 255);
      pixels[offset + 1] = Math.round(Math.min(1, Math.max(0, slopeY * 0.5 + 0.5)) * 255);
      pixels[offset + 2] = Math.round(surfaceTextureHeight(x, y, 0) * 255);
      pixels[offset + 3] = Math.round(
        surfaceTextureHeight(x, y, RIVER_SURFACE_NORMAL_TEXTURE_RANDOM.auxiliarySeedOffset) * 255
      );
    }
  }
  const texture = new Texture2D(engine, size, size, undefined, true, false);
  texture.name = "RiverSharedSurfaceNormal";
  // Inactive quality variants do not retain their shader textures. The cache must
  // therefore own this shared texture independently of renderer reference counts.
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  surfaceNormalTextures.set(engine, texture);
  return texture;
}

function createSurfaceShaderSource(shaderName: string, useLocalMap: boolean): string {
  const localUniforms = useLocalMap
    ? `sampler2D material_LocalMapTexture;\n      vec4 renderer_LocalMapWorldToUv;\n      vec4 renderer_LocalMapUvRect;\n      float renderer_LocalMapConfluence;`
    : "";
  const localSampling = useLocalMap
    ? `
        vec2 rawLocalMapUv = input.worldXZ * renderer_LocalMapWorldToUv.xy + renderer_LocalMapWorldToUv.zw;
        vec2 localMapUv = clamp(rawLocalMapUv, renderer_LocalMapUvRect.xy, renderer_LocalMapUvRect.zw);
        vec4 localMapSample = texture2D(material_LocalMapTexture, localMapUv);
        vec2 localFlow = localMapSample.rg * 2.0 - 1.0;
        float atlasRectMask = step(renderer_LocalMapUvRect.x, rawLocalMapUv.x)
          * step(renderer_LocalMapUvRect.y, rawLocalMapUv.y)
          * step(rawLocalMapUv.x, renderer_LocalMapUvRect.z)
          * step(rawLocalMapUv.y, renderer_LocalMapUvRect.w);
        float localSignedDistance = mix(1.0, localMapSample.a * 2.0 - 1.0, atlasRectMask);
        float confluenceInteriorWeight = smoothstep(
          0.0,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.confluenceInteriorBlendWidth)},
          max(localSignedDistance, 0.0)
        );
        float localEffectWeight = atlasRectMask * mix(1.0, confluenceInteriorWeight, renderer_LocalMapConfluence);
        float confluenceFlowWeight = mix(
          1.0,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.confluenceFlowBlendWeight)},
          renderer_LocalMapConfluence
        );
        float confluenceFoamWeight = mix(
          1.0,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.confluenceFoamWeight)},
          renderer_LocalMapConfluence
        );
        float localFlowWeight = step(0.05, dot(localFlow, localFlow)) * localEffectWeight * confluenceFlowWeight;
        float localFoamSource = localMapSample.b * localEffectWeight * confluenceFoamWeight;
        float obstacleRegionWeight = (1.0 - renderer_LocalMapConfluence) * localEffectWeight;`
    : `
        vec2 localFlow = input.worldFlow;
        float localFlowWeight = 0.0;
        float localFoamSource = 0.0;
        float localSignedDistance = 1.0;
        float localEffectWeight = 0.0;
        float atlasRectMask = 0.0;
        float obstacleRegionWeight = 0.0;`;
  return `
Shader "${shaderName}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ViewMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec4 camera_DepthBufferParams;
      vec4 camera_ProjectionParams;
      sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      sampler2D material_SurfaceNormalTexture;
      ${localUniforms}

      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;
      float material_Clarity;
      float material_OpacityScale;
      float material_TintWeight;
      float material_SurfaceSeed;
      float material_SurfaceMaxDisplacement;
      float material_SurfaceLengthScale;
      float material_ShoreDampingWidth;
      float material_SurfaceTurbulence;
      float material_CrestIntensity;
      float material_MicroNormalStrength;
      float material_SurfaceDebugMode;
      float material_MacroDisplacementEnabled;
      float material_MicroSurfaceEnabled;
      float material_SurfaceTimeOverride;

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec4 COLOR_0;
        vec2 TEXCOORD_0;
        vec2 TEXCOORD_1;
        vec2 TEXCOORD_2;
        vec2 TEXCOORD_3;
      };
      struct Varyings {
        vec2 worldXZ;
        vec2 worldFlow;
        vec4 motionData;
        vec4 surfaceData;
        vec3 worldPosition;
        vec3 macroNormalWS;
        vec4 clipPosition;
      };

      float saturate(float value) { return clamp(value, 0.0, 1.0); }
      vec2 safeNormalize2(vec2 value, vec2 fallback) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
      }
      vec3 safeNormalize3(vec3 value, vec3 fallback) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
      }
      float surfaceTime() {
        float selectedTime = material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x;
        return mod(max(selectedTime, 0.0), ${glsl(RIVER_SURFACE_SHADER_TUNING.timePeriodSeconds, 1)});
      }
      float riverHash21(vec2 point) {
        point = mod(point, ${RIVER_SURFACE_NOISE_PERIOD_GLSL});
        return fract(sin(dot(point, vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.hashDirection[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.hashDirection[1])})) + material_SurfaceSeed * ${glsl(RIVER_SURFACE_HASH_SEED_SCALE)}) * ${glsl(RIVER_SURFACE_HASH_MULTIPLIER)});
      }
      float riverValueNoise(vec2 point) {
        point = mod(point, ${RIVER_SURFACE_NOISE_PERIOD_GLSL});
        vec2 cell = floor(point);
        vec2 local = fract(point);
        vec2 curve = local * local * (3.0 - 2.0 * local);
        float bottom = mix(riverHash21(cell), riverHash21(cell + vec2(1.0, 0.0)), curve.x);
        float top = mix(riverHash21(cell + vec2(0.0, 1.0)), riverHash21(cell + vec2(1.0, 1.0)), curve.x);
        return mix(bottom, top, curve.y);
      }
      float riverFbm(vec2 point) {
        float value = riverValueNoise(point) * ${glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[0])};
        value += riverValueNoise(
          point * ${glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveScale)}
            + vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveOffset[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveOffset[1])})
        ) * ${glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[1])};
        value += riverValueNoise(
          point * ${glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveScale)}
            + vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveOffset[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveOffset[1])})
        ) * ${glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[2])};
        return value;
      }
      float riverShoreDamping(float signedAcrossDistance, float halfWidth) {
        float shoreDistance = halfWidth - abs(signedAcrossDistance);
        return smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
      }
      vec2 riverWarpedDomain(vec2 motionCoord, float localFlowSpeed, float elapsedTime) {
        float activeTime = elapsedTime * step(${glsl(RIVER_SURFACE_FLOW_EPSILON)}, localFlowSpeed);
        float lengthScale = max(material_SurfaceLengthScale, 0.001);
        vec2 baseDomain = vec2(
          motionCoord.x,
          (motionCoord.y - activeTime) * ${glsl(RIVER_SURFACE_REFERENCE_FLOW_SPEED)}
        ) / lengthScale;
        vec2 warp = vec2(
          riverValueNoise(baseDomain * ${glsl(RIVER_SURFACE_DOMAIN_WARP_SCALE)} + vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetX[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetX[1])})),
          riverValueNoise(baseDomain * ${glsl(RIVER_SURFACE_DOMAIN_WARP_SCALE)} + vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetY[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetY[1])}))
        ) * 2.0 - 1.0;
        return baseDomain + warp * (${glsl(RIVER_SURFACE_DOMAIN_WARP_STRENGTH)} * material_SurfaceTurbulence);
      }
      float riverMacroHeight(vec2 motionCoord, float halfWidth, float localFlowSpeed, float elapsedTime) {
        float shoreDamping = riverShoreDamping(motionCoord.x, halfWidth);
        vec2 warped = riverWarpedDomain(motionCoord, localFlowSpeed, elapsedTime);
        float broad = riverFbm(warped);
        float ridgeNoise = riverValueNoise(
          warped * ${glsl(RIVER_SURFACE_MACRO_NOISE.ridgeScale)}
            + vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.ridgeOffset[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.ridgeOffset[1])})
        );
        float ridge = 1.0 - abs(ridgeNoise * 2.0 - 1.0);
        float shape = (broad - 0.5) * ${glsl(RIVER_SURFACE_MACRO_NOISE.broadWeight)}
          + (ridge - 0.5) * ${glsl(RIVER_SURFACE_MACRO_NOISE.ridgeWeight)} * material_SurfaceTurbulence;
        return material_SurfaceMaxDisplacement * shoreDamping * shape;
      }
      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }
      vec4 sampleFlowSurface(
        vec2 worldXZ,
        vec2 flowDirection,
        float flowSpeed,
        float elapsedTime,
        float scale,
        float rate,
        vec2 layerOffset,
        vec2 cycleJump,
        vec2 spatialPhaseDirection
      ) {
        float normalizedSpeed = saturate(flowSpeed / ${glsl(RIVER_SURFACE_SHADER_TUNING.maximumFlowSpeed)});
        float cycleRate = ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseRate)} * rate * (
          ${glsl(RIVER_SURFACE_SHADER_TUNING.flowingCycleRateBase)}
            + normalizedSpeed * ${glsl(RIVER_SURFACE_SHADER_TUNING.flowingCycleRateSpeedScale)}
        );
        float spatialPhase = dot(worldXZ, spatialPhaseDirection);
        float cycle = elapsedTime * cycleRate + spatialPhase;
        float progressA = fract(cycle);
        float progressB = fract(cycle + 0.5);
        float weightA = 1.0 - abs(progressA * 2.0 - 1.0);
        float weightB = 1.0 - abs(progressB * 2.0 - 1.0);
        float travel = ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseTravel)} * (
          ${glsl(RIVER_SURFACE_SHADER_TUNING.flowingPhaseTravelBase)}
            + normalizedSpeed * ${glsl(RIVER_SURFACE_SHADER_TUNING.flowingPhaseTravelSpeedScale)}
        );
        vec2 baseUv = worldXZ * scale + layerOffset;
        vec4 sampleA = texture2D(
          material_SurfaceNormalTexture,
          baseUv - flowDirection * ((progressA - 0.5) * travel) + (cycle - progressA) * cycleJump
        );
        vec4 sampleB = texture2D(
          material_SurfaceNormalTexture,
          baseUv - flowDirection * ((progressB - 0.5) * travel)
            + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.phaseBOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseBOffset[1])})
            + (cycle - progressB) * cycleJump
        );
        vec4 decodedA = vec4(sampleA.rg * 2.0 - 1.0, sampleA.ba);
        vec4 decodedB = vec4(sampleB.rg * 2.0 - 1.0, sampleB.ba);
        return (decodedA * weightA + decodedB * weightB) / max(weightA + weightB, 0.001);
      }

      VertexShader = vert;
      FragmentShader = frag;
      Varyings vert(Attributes attr) {
        Varyings output;
        float elapsedTime = surfaceTime();
        float derivativeStep = ${glsl(RIVER_SURFACE_DERIVATIVE_STEP)};
        float flowTimeStep = derivativeStep / max(attr.TEXCOORD_1.x, ${glsl(RIVER_FLOW_TRAVEL_MIN_SPEED)});
        float computedMacroHeight = riverMacroHeight(attr.TEXCOORD_2, attr.TEXCOORD_3.x, attr.TEXCOORD_1.x, elapsedTime)
          * material_MacroDisplacementEnabled;
        float acrossPositive = riverMacroHeight(
          attr.TEXCOORD_2 + vec2(derivativeStep, 0.0), attr.TEXCOORD_3.x, attr.TEXCOORD_1.x, elapsedTime
        );
        float acrossNegative = riverMacroHeight(
          attr.TEXCOORD_2 - vec2(derivativeStep, 0.0), attr.TEXCOORD_3.x, attr.TEXCOORD_1.x, elapsedTime
        );
        float downstreamPositive = riverMacroHeight(
          attr.TEXCOORD_2 + vec2(0.0, flowTimeStep), attr.TEXCOORD_3.x, attr.TEXCOORD_1.x, elapsedTime
        );
        float downstreamNegative = riverMacroHeight(
          attr.TEXCOORD_2 - vec2(0.0, flowTimeStep), attr.TEXCOORD_3.x, attr.TEXCOORD_1.x, elapsedTime
        );
        float acrossDerivative = (acrossPositive - acrossNegative) / (derivativeStep * 2.0)
          * material_MacroDisplacementEnabled;
        float downstreamDerivative = (downstreamPositive - downstreamNegative) / (derivativeStep * 2.0)
          * material_MacroDisplacementEnabled;
        vec4 localPosition = attr.POSITION;
        localPosition.y += computedMacroHeight;
        vec4 computedWorldPosition = renderer_ModelMat * localPosition;
        vec3 worldTangent = safeNormalize3(mat3(renderer_ModelMat) * attr.TANGENT.xyz, vec3(0.0, 0.0, 1.0));
        vec2 computedWorldFlow = safeNormalize2(worldTangent.xz, vec2(0.0, 1.0));
        vec3 acrossWS = vec3(-computedWorldFlow.y, 0.0, computedWorldFlow.x);
        vec3 flowWS = vec3(computedWorldFlow.x, 0.0, computedWorldFlow.y);
        vec3 baseNormalWS = normalize(mat3(renderer_NormalMat) * attr.NORMAL);
        vec3 computedMacroNormalWS = normalize(
          baseNormalWS - acrossWS * acrossDerivative - flowWS * downstreamDerivative
        );
        vec4 computedClipPosition = renderer_MVPMat * localPosition;
        gl_Position = computedClipPosition;
        output.worldXZ = computedWorldPosition.xz;
        output.worldFlow = computedWorldFlow;
        output.motionData = vec4(attr.TEXCOORD_2, attr.TEXCOORD_3.x, attr.TEXCOORD_1.x);
        output.surfaceData = vec4(
          computedMacroHeight,
          riverShoreDamping(attr.TEXCOORD_2.x, attr.TEXCOORD_3.x),
          -(camera_ViewMat * computedWorldPosition).z,
          attr.TEXCOORD_3.y
        );
        output.worldPosition = computedWorldPosition.xyz;
        output.macroNormalWS = computedMacroNormalWS;
        output.clipPosition = computedClipPosition;
        return output;
      }

      void frag(Varyings input) {
        float elapsedTime = surfaceTime();
        float clarity = saturate(material_Clarity);
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
        float sceneEyeDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, screenUv).r);
        float sampledOpticalDepth = max(sceneEyeDepth - input.surfaceData.z, 0.0);
        float authoredOpticalDepth = max(input.surfaceData.w * input.surfaceData.y, 0.0);
        float authoredDepthAvailable = step(
          ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.authoredDepthEpsilon)},
          input.surfaceData.w
        );
        float opticalDepth = clamp(
          mix(
            sampledOpticalDepth,
            min(sampledOpticalDepth, authoredOpticalDepth),
            authoredDepthAvailable
          ),
          0.0,
          ${RIVER_MEDIUM_MAX_OPTICAL_DEPTH_GLSL}
        );
        vec3 absorption = mix(
          vec3(
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.opaqueAbsorption[0])},
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.opaqueAbsorption[1])},
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.opaqueAbsorption[2])}
          ),
          vec3(
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.clearAbsorption[0])},
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.clearAbsorption[1])},
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.clearAbsorption[2])}
          ),
          clarity
        );
        vec3 transmittance = exp(-absorption * opticalDepth);
        float absorptionAlpha = 1.0 - exp(-mix(
          ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.opaqueAlphaAbsorption)},
          ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.clearAlphaAbsorption)},
          clarity
        ) * opticalDepth);
        float waterAlpha = clamp(
          mix(
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.shallowAlpha)},
            ${glsl(RIVER_MEDIUM_OPTICAL_SHADER_TUNING.deepAlpha)},
            absorptionAlpha
          ),
          ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.minimumAlpha},
          ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.maximumAlpha}
        );
        vec2 warped = riverWarpedDomain(input.motionData.xy, input.motionData.w, elapsedTime);
        float ridgeCenter = 1.0 - abs(
          riverValueNoise(
            warped * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestRidgeScale)}
              + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[1])})
          ) * 2.0 - 1.0
        );
        float ridgeAhead = 1.0 - abs(
          riverValueNoise(
            (warped + vec2(0.0, ${glsl(RIVER_SURFACE_SHADER_TUNING.crestCurvatureStep)}))
              * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestRidgeScale)}
              + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[1])})
          ) * 2.0 - 1.0
        );
        float ridgeBehind = 1.0 - abs(
          riverValueNoise(
            (warped - vec2(0.0, ${glsl(RIVER_SURFACE_SHADER_TUNING.crestCurvatureStep)}))
              * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestRidgeScale)}
              + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.crestNoiseOffset[1])})
          ) * 2.0 - 1.0
        );
        float erosion = riverValueNoise(
          warped * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestErosionScale)}
            + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.erosionNoiseOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.erosionNoiseOffset[1])})
        );
        float ridgeMask = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.crestStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.crestEnd)},
          ridgeCenter
        );
        float erosionMask = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.erosionStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.erosionEnd)},
          erosion
        );
        float crestCurvature = saturate(
          (ridgeCenter - (ridgeAhead + ridgeBehind) * 0.5) * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestCurvatureGain)}
        );
        float crestMask = ridgeMask * erosionMask * material_CrestIntensity * input.surfaceData.y;
        ${localSampling}
        vec2 baseFlow = safeNormalize2(input.worldFlow, vec2(0.0, 1.0));
        vec2 localFlowDirection = safeNormalize2(localFlow, baseFlow);
        vec2 flowDirection = safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight), baseFlow);
        float flowSpeed = max(input.motionData.w * material_FlowSpeed, 0.0);
        float microDetailScale = clamp(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microDetailLengthReference)}
            / max(material_SurfaceLengthScale, 0.001),
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microDetailScaleMinimum)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microDetailScaleMaximum)}
        );
        vec4 flowSurfaceA = sampleFlowSurface(
          input.worldXZ,
          flowDirection,
          flowSpeed,
          elapsedTime,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerScales[0])} * microDetailScale,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerRates[0])},
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[0][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[0][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[0][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[0][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[0][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[0][1])})
        );
        vec4 flowSurfaceB = sampleFlowSurface(
          input.worldXZ,
          flowDirection,
          flowSpeed,
          elapsedTime,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerScales[1])} * microDetailScale,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerRates[1])},
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[1][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[1][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[1][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[1][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[1][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[1][1])})
        );
        vec4 flowSurfaceC = sampleFlowSurface(
          input.worldXZ,
          flowDirection,
          flowSpeed,
          elapsedTime,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerScales[2])} * microDetailScale,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.layerRates[2])},
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[2][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerOffsets[2][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[2][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerCycleJumps[2][1])}),
          vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[2][0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.layerSpatialPhaseVectors[2][1])})
        );
        vec4 flowSurface = (
          flowSurfaceA * ${glsl(RIVER_SURFACE_SHADER_TUNING.layerWeights[0])}
          + flowSurfaceB * ${glsl(RIVER_SURFACE_SHADER_TUNING.layerWeights[1])}
          + flowSurfaceC * ${glsl(RIVER_SURFACE_SHADER_TUNING.layerWeights[2])}
        );
        float localWakeSignal = localFoamSource * obstacleRegionWeight;
        vec2 wakeLateralDirection = vec2(-baseFlow.y, baseFlow.x);
        float wakeFlowTurn = dot(localFlowDirection - baseFlow, wakeLateralDirection);
        float wakeTravelPhase = dot(input.worldXZ, baseFlow)
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeTravelSpatialRate)}
          - elapsedTime * (
            ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeTravelTimeRate)}
            + flowSpeed * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFlowSpeedTimeWeight)}
          );
        float wakeSheddingNoise = riverValueNoise(
          input.worldXZ * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeNoiseScale)}
            - baseFlow * elapsedTime * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeNoiseTimeRate)}
        );
        float wakeAlternation = 0.5 + 0.5 * sin(
          wakeTravelPhase
            + wakeFlowTurn * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeAlternatingSidePhase)}
        );
        float wakeShedding = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeSheddingStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeSheddingEnd)},
          wakeAlternation
            + (wakeSheddingNoise - 0.5) * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeSheddingNoiseWeight)}
        );
        float dynamicWakeSignal = localWakeSignal * wakeShedding;
        float detailStrength = max(
          material_MicroNormalStrength,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.minimumNormalStrength)}
        ) * material_MicroSurfaceEnabled * (
          1.0 + dynamicWakeSignal * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeNormalStrength)}
        );
        vec2 localFlowBend = (localFlowDirection - baseFlow)
          * obstacleRegionWeight
          * mix(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFlowBendMinimum)},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFlowBendMaximum)},
            wakeShedding
          )
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFlowBendStrength)};
        float wakeRippleSignal =
          (flowSurface.w * 2.0 - 1.0) * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeRippleNoiseWeight)}
          + (wakeAlternation * 2.0 - 1.0)
            * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeRippleOscillationWeight)};
        vec2 localWakeRipple = wakeLateralDirection
          * wakeRippleSignal
          * dynamicWakeSignal
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeLateralRippleStrength)};
        vec2 detailedSurfaceSlope = flowSurface.xy + localFlowBend + localWakeRipple;
        vec3 worldDetailSlope = vec3(detailedSurfaceSlope.x, 0.0, detailedSurfaceSlope.y);
        vec3 tangentDetailSlope = worldDetailSlope
          - input.macroNormalWS * dot(worldDetailSlope, input.macroNormalWS);
        vec3 surfaceNormalWS = safeNormalize3(
          input.macroNormalWS + tangentDetailSlope * detailStrength,
          input.macroNormalWS
        );
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        float normalFacing = step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= normalFacing;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
        float fresnel = ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelF0)}
          + (1.0 - ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelF0)})
            * pow(1.0 - normalDotView, ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelPower)});
        vec3 lightDirection = normalize(vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[2])}
        ));
        vec3 halfDirection = safeNormalize3(viewDirection + lightDirection, lightDirection);
        float normalDotLight = saturate(dot(surfaceNormalWS, lightDirection));
        float normalDotHalf = saturate(dot(surfaceNormalWS, halfDirection));
        float broadSpecular = pow(
          normalDotHalf,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.broadSpecularPower)}
        ) * normalDotLight;
        float tightSpecular = pow(
          normalDotHalf,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.tightSpecularPower)}
        ) * normalDotLight;
        float distanceToBank = max(0.0, input.motionData.z - abs(input.motionData.x));
        float shoreEnvelope = 1.0 - smoothstep(
          0.0,
          material_ShoreDampingWidth * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamWidthScale)},
          distanceToBank
        );
        float crestFoam = crestMask * (
          ${glsl(RIVER_SURFACE_SHADER_TUNING.foamBaseWeight)}
          + crestCurvature * ${glsl(RIVER_SURFACE_SHADER_TUNING.foamCurvatureWeight)}
        )
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.crestFoamWeight)};
        float foamNoise = saturate(flowSurface.z * 0.62 + flowSurface.w * 0.38);
        float foamBreakup = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.foamNoiseStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.foamNoiseEnd)},
          foamNoise + (1.0 - abs(flowSurface.z - flowSurface.w)) * 0.08
        );
        float shorePatchNoise = riverFbm(
          input.worldXZ * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPatchScale)}
            - baseFlow * elapsedTime * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamDriftRate)}
        );
        float shorePulse = 0.5 + 0.5 * sin(
          elapsedTime * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPulseRate)}
            + dot(
              input.worldXZ,
              vec2(
                ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPulseWorldDirection[0])},
                ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPulseWorldDirection[1])}
              )
            )
            + sign(input.motionData.x) * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamOppositeBankPhase)}
            + shorePatchNoise * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamNoisePhase)}
        );
        float shorePatchGate = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPatchStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamPatchEnd)},
          shorePulse
        );
        float shoreLifePulse = 0.5 + 0.5 * sin(
          elapsedTime * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamLifeRate)}
            + shorePatchNoise * 6.28318531
            + foamNoise * 2.1
        );
        float shoreLifeGate = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamLifeStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamLifeEnd)},
          shoreLifePulse
        );
        float shoreBreakup = shorePatchGate
          * mix(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamLifeMinimum)},
            1.0,
            shoreLifeGate
          )
          * mix(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamDetailMinimum)},
            1.0,
            foamBreakup
          );
        float shoreFoam = shoreEnvelope
          * shoreBreakup
          * mix(0.42, 1.0, erosionMask)
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamWeight)};
        float currentFoam = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.currentFoamSpeedStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.currentFoamSpeedEnd)},
          flowSpeed
        ) * smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.currentFoamNoiseStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.currentFoamNoiseEnd)},
          flowSurface.w
        ) * input.surfaceData.y * 0.32;
        float wakeBreakup = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFoamNoiseStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFoamNoiseEnd)},
          foamNoise * 0.72 + wakeSheddingNoise * 0.28 + abs(flowSurface.x) * 0.08
        );
        float localConfluenceFoam = localFoamSource
          * (1.0 - obstacleRegionWeight)
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.localFoamWeight)};
        float wakeLiftedSignal = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeSignalStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeSignalEnd)},
          dynamicWakeSignal
        );
        float localWakeFoam = wakeLiftedSignal
          * mix(${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFoamBase)}, 1.0, wakeBreakup)
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.localFoamWeight)};
        float obstacleEdge = 1.0 - smoothstep(
          0.0,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.obstacleEdgeWidth)},
          abs(localSignedDistance)
        );
        float obstacleEdgeFoam = obstacleEdge
          * obstacleRegionWeight
          * mix(0.58, 1.0, foamBreakup)
          * mix(0.7, 1.0, wakeShedding)
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.obstacleEdgeFoamWeight)};
        float foam = saturate(max(
          max(max(crestFoam, shoreFoam), currentFoam),
          max(max(localConfluenceFoam, localWakeFoam), obstacleEdgeFoam)
        ))
          * material_FoamIntensity;
        float depthColorMix = 1.0 - exp(
          -opticalDepth * ${glsl(RIVER_SURFACE_SHADER_TUNING.depthColorRate)}
        );
        vec3 deepWaterColor = mix(
          material_BaseColor.rgb * ${glsl(RIVER_SURFACE_SHADER_TUNING.deepColorScale)},
          vec3(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.deepColorTint[0])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.deepColorTint[1])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.deepColorTint[2])}
          ),
          ${glsl(RIVER_SURFACE_SHADER_TUNING.deepColorTintWeight)}
        );
        vec3 volumeColor = mix(material_BaseColor.rgb, deepWaterColor, depthColorMix);
        vec3 color = volumeColor * mix(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.transmittedBrightnessDark)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.transmittedBrightnessLight)},
          transmittance.g
        );
        color += material_BaseColor.rgb
          * input.surfaceData.x
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.macroHeightBrightness)};
        vec3 softFoamColor = mix(
          volumeColor * ${RIVER_SHORE_FOAM_SHADER_TUNING.waterColorBrightness},
          material_FoamColor.rgb,
          ${RIVER_SHORE_FOAM_SHADER_TUNING.foamColorMix}
        );
        float foamTint = saturate(
          foam * (
            ${RIVER_SHORE_FOAM_SHADER_TUNING.tintBase}
            + clarity * ${RIVER_SHORE_FOAM_SHADER_TUNING.tintClarityWeight}
          )
          + shoreFoam * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamTintBoost)}
          + localWakeFoam * ${glsl(RIVER_SURFACE_SHADER_TUNING.wakeFoamTintBoost)}
          + obstacleEdgeFoam * ${glsl(RIVER_SURFACE_SHADER_TUNING.obstacleEdgeTintBoost)}
        );
        vec3 macroNormalVS = normalize(mat3(camera_ViewMat) * input.macroNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec2 refractionNormalDelta = surfaceNormalVS.xy - macroNormalVS.xy;
        float refractionDepthWeight = smoothstep(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionDepthStart)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionDepthEnd)},
          opticalDepth
        );
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta * ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionUvScale)} * refractionDepthWeight;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceData.z, 0.0);
        float refractionDepthTolerance = max(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionDepthToleranceMinimum)},
          opticalDepth * ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionDepthToleranceScale)}
        );
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth);
        float refractionSampleValidity = refractionScreenInterior
          * refractionDepthContinuity
          * refractedGeometryBehindSurface;
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedSceneColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        vec3 refractedSceneColor = mix(centeredSceneColor, displacedSceneColor, refractionSampleValidity);
        float depthRatio = saturate(opticalDepth / ${RIVER_MEDIUM_MAX_OPTICAL_DEPTH_GLSL});
        vec3 refractionTint = mix(vec3(0.82, 0.95, 0.97), vec3(0.63, 0.84, 0.88), depthRatio);
        float refractionAmount = ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionMix)}
          * clarity
          * transmittance.g
          * refractionDepthWeight
          * input.surfaceData.y
          * (1.0 - foamTint * ${glsl(RIVER_SURFACE_SHADER_TUNING.refractionFoamSuppression)});
        color = mix(color, refractedSceneColor * refractionTint, refractionAmount);
        vec3 skyReflection = mix(
          vec3(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionDark[0])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionDark[1])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionDark[2])}
          ),
          vec3(
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionLight[0])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionLight[1])},
            ${glsl(RIVER_SURFACE_SHADER_TUNING.skyReflectionLight[2])}
          ),
          saturate(surfaceNormalWS.y * 0.5 + 0.5)
        );
        color = mix(color, skyReflection, fresnel * ${glsl(RIVER_SURFACE_SHADER_TUNING.reflectionWeight)});
        float sparkleMask = mix(0.72, 1.28, flowSurface.w);
        color += vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.broadSpecularColor[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.broadSpecularColor[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.broadSpecularColor[2])}
        ) * broadSpecular * ${glsl(RIVER_SURFACE_SHADER_TUNING.broadSpecularWeight)};
        color += vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.tightSpecularColor[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.tightSpecularColor[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.tightSpecularColor[2])}
        ) * tightSpecular * sparkleMask * ${glsl(RIVER_SURFACE_SHADER_TUNING.tightSpecularWeight)};
        color = mix(color, softFoamColor, foamTint);
        color = mix(color, material_BaseColor.rgb, saturate(material_TintWeight));
        if (material_SurfaceDebugMode > ${RiverSurfaceDebugMode.Off + 0.5}) {
          if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.MacroHeight - 0.5}) {
            color = vec3(fract(input.motionData.x * 0.1), fract((input.motionData.y - elapsedTime) * 0.1), 0.2);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.CrestMask - 0.5}) {
            color = vec3(saturate(input.surfaceData.x / max(material_SurfaceMaxDisplacement, 0.001) * 0.5 + 0.5));
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.MicroNormal - 0.5}) {
            color = vec3(crestMask);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.ShoreDamping - 0.5}) {
            color = vec3(flowSurface.xy * 0.5 + 0.5, 1.0);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.LocalFlow - 0.5}) {
            color = vec3(input.surfaceData.y);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.LocalFoam - 0.5}) {
            color = vec3(localFlow * 0.5 + 0.5, 0.5);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.LocalSignedDistance - 0.5}) {
            color = vec3(localFoamSource);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.AtlasRect - 0.5}) {
            color = vec3(localSignedDistance * 0.5 + 0.5);
          } else {
            color = vec3(atlasRectMask, 1.0 - atlasRectMask, 0.0);
          }
          foamTint = 0.0;
          waterAlpha = 0.9;
        }
        float alpha = waterAlpha
          + foamTint * ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.foamAlphaWeight}
          + (fresnel + broadSpecular + tightSpecular) * ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.scatterAlphaWeight};
        gl_FragColor = vec4(
          color,
          clamp(alpha * material_OpacityScale, 0.0, ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.maximumAlpha})
        );
      }
    }
  }
}`;
}

export const riverSurfaceShaderSource = createSurfaceShaderSource("AIWorld/RiverSurface", false);
export const riverSurfaceLocalMapShaderSource = createSurfaceShaderSource("AIWorld/RiverSurfaceLocalMap", true);

const riverBankFoamShaderSource = `
Shader "AIWorld/RiverBankFoam" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState { WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;
      mat4 renderer_MVPMat;
      vec4 material_FoamColor;
      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 uv; };
      VertexShader = vert;
      FragmentShader = frag;
      Varyings vert(Attributes attr) { Varyings output; gl_Position = renderer_MVPMat * attr.POSITION; output.uv = attr.TEXCOORD_0; return output; }
      void frag(Varyings input) {
        float edge = 1.0 - smoothstep(0.0, 0.5, abs(input.uv.x - 0.5));
        gl_FragColor = vec4(material_FoamColor.rgb, edge * 0.45);
      }
    }
  }
}`;

export function hexToColor(hex: string, alpha: number): Color {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  return new Color(red, green, blue, alpha);
}

function configureSurfaceMaterial(
  engine: Engine,
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData
): Material {
  material.shaderData.setTexture(RIVER_SHADER_PROPERTY.surfaceNormalTexture, getSurfaceNormalTexture(engine));
  updateRiverMaterial(material, config, flowSpeedMultiplier);
  setRiverSurfaceOpacityScale(material, 1);
  setRiverSurfaceTintWeight(material, 0);
  updateRiverSurfaceMotion(material, motion);
  setRiverSurfaceDebugMode(material, RiverSurfaceDebugMode.Off);
  setRiverSurfaceFeatureFlags(material, true, true);
  setRiverSurfaceTimeOverride(material);
  return material;
}

export function createRiverMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData
): Material {
  const shader = Shader.find("AIWorld/RiverSurface") ?? Shader.create(riverSurfaceShaderSource);
  return configureSurfaceMaterial(engine, new Material(engine, shader), config, flowSpeedMultiplier, motion);
}

export function createRiverLocalMapMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData,
  localMapTexture: Texture2D
): Material {
  const shader = Shader.find("AIWorld/RiverSurfaceLocalMap") ?? Shader.create(riverSurfaceLocalMapShaderSource);
  const material = configureSurfaceMaterial(engine, new Material(engine, shader), config, flowSpeedMultiplier, motion);
  material.shaderData.setTexture(RIVER_SHADER_PROPERTY.localMapTexture, localMapTexture);
  return material;
}

export function createRiverFoamMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): Material {
  const shader = Shader.find("AIWorld/RiverBankFoam") ?? Shader.create(riverBankFoamShaderSource);
  const material = new Material(engine, shader);
  updateRiverFoamMaterial(material, config, flowSpeedMultiplier);
  return material;
}

export function createLowRiverMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): Material {
  const shader = Shader.find("AIWorld/RiverLow") ?? Shader.create(lowRiverShaderSource);
  const material = new Material(engine, shader);
  material.shaderData.setTexture(RIVER_SHADER_PROPERTY.noiseTexture, getLowNoiseTexture(engine));
  updateRiverMaterial(material, config, flowSpeedMultiplier);
  setRiverSurfaceOpacityScale(material, 1);
  setRiverSurfaceTintWeight(material, 0);
  return material;
}

export function updateRiverMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): void {
  material.shaderData.setColor(
    RIVER_SHADER_PROPERTY.baseColor,
    hexToColor(config.baseColor, 0.88 + (1 - config.clarity) * 0.08)
  );
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeedMultiplier, flowSpeedMultiplier);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.clarity, config.clarity);
}

export function updateRiverSurfaceMotion(material: Material, motion: RiverCompiledSurfaceMotionData): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceSeed, motion.seed);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceMaxDisplacement, motion.maxDisplacement);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceLengthScale, motion.displacementLengthScale);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.shoreDampingWidth, motion.shoreDampingWidth);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceTurbulence, motion.turbulence);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.crestIntensity, motion.crestIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.microNormalStrength, motion.microNormalStrength);
}

export function setRiverSurfaceOpacityScale(material: Material, opacityScale: number): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.opacityScale, Math.max(0, opacityScale));
}

export function setRiverSurfaceTintWeight(material: Material, tintWeight: number): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.tintWeight, Math.min(1, Math.max(0, tintWeight)));
}

export function setRiverSurfaceDebugMode(material: Material, mode: RiverSurfaceDebugMode): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceDebugMode, mode);
}

export function setRiverSurfaceFeatureFlags(
  material: Material,
  macroDisplacementEnabled: boolean,
  microSurfaceEnabled: boolean
): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.macroDisplacementEnabled, macroDisplacementEnabled ? 1 : 0);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.microSurfaceEnabled, microSurfaceEnabled ? 1 : 0);
}

export function setRiverSurfaceTimeOverride(material: Material, elapsedTime?: number): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceTimeOverride, elapsedTime ?? -1);
}

export function updateRiverFoamMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): void {
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeedMultiplier, flowSpeedMultiplier);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
}
