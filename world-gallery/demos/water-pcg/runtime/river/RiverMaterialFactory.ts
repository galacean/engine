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
        float waterAlpha = mix(
          ${RIVER_LOW_OPTICAL_SHADER_TUNING.opaqueWaterAlpha},
          ${RIVER_LOW_OPTICAL_SHADER_TUNING.clearWaterAlpha},
          clamp(material_Clarity, 0.0, 1.0)
        );
        float alpha = (water * waterAlpha + foam * ${RIVER_LOW_OPTICAL_SHADER_TUNING.foamAlphaWeight}) * feather;
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
  const texture = new Texture2D(engine, size, size, undefined, false, false);
  texture.name = "RiverLowSharedNoise";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
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
  const texture = new Texture2D(engine, size, size, undefined, false, false);
  texture.name = "RiverSharedSurfaceNormal";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
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
        float localFoamSource = localMapSample.b * localEffectWeight * confluenceFoamWeight;`
    : `
        vec2 localFlow = input.worldFlow;
        float localFlowWeight = 0.0;
        float localFoamSource = 0.0;
        float localSignedDistance = 1.0;
        float localEffectWeight = 0.0;
        float atlasRectMask = 0.0;`;
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
      sampler2D material_SurfaceNormalTexture;
      ${localUniforms}

      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;
      float material_Clarity;
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
      float surfaceTime() {
        return material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x;
      }
      float riverHash21(vec2 point) {
        return fract(sin(dot(point, vec2(${glsl(RIVER_SURFACE_MACRO_NOISE.hashDirection[0])}, ${glsl(RIVER_SURFACE_MACRO_NOISE.hashDirection[1])})) + material_SurfaceSeed * ${glsl(RIVER_SURFACE_HASH_SEED_SCALE)}) * ${glsl(RIVER_SURFACE_HASH_MULTIPLIER)});
      }
      float riverValueNoise(vec2 point) {
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
        vec2 baseDomain = vec2(
          motionCoord.x,
          (motionCoord.y - activeTime) * ${glsl(RIVER_SURFACE_REFERENCE_FLOW_SPEED)}
        ) / max(material_SurfaceLengthScale, 0.001);
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
      vec2 flowUVWNormal(vec2 worldXZ, vec2 flowDirection, float elapsedTime, float scale, float offset) {
        float cycle = elapsedTime * ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseRate)} + offset;
        float phaseA = fract(cycle);
        float phaseB = fract(cycle + 0.5);
        float weightA = 1.0 - abs(phaseA * 2.0 - 1.0);
        float weightB = 1.0 - abs(phaseB * 2.0 - 1.0);
        vec2 normalA = texture2D(
          material_SurfaceNormalTexture,
          worldXZ * scale - flowDirection * phaseA * ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseTravel)}
        ).rg * 2.0 - 1.0;
        vec2 normalB = texture2D(
          material_SurfaceNormalTexture,
          worldXZ * scale - flowDirection * phaseB * ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseTravel)}
            + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.phaseUvOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.phaseUvOffset[1])})
        ).rg * 2.0 - 1.0;
        return (normalA * weightA + normalB * weightB) / max(weightA + weightB, 0.001);
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
        vec3 worldTangent = normalize(mat3(renderer_ModelMat) * attr.TANGENT.xyz);
        vec2 computedWorldFlow = normalize(worldTangent.xz);
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
          0.0
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
        float opticalDepth = clamp(sceneEyeDepth - input.surfaceData.z, 0.0, ${RIVER_MEDIUM_MAX_OPTICAL_DEPTH_GLSL});
        float absorption = mix(
          ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.opaqueAbsorption},
          ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.clearAbsorption},
          clarity
        );
        float transmittance = exp(-absorption * opticalDepth);
        float waterAlpha = clamp(
          1.0 - transmittance,
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
        vec2 baseFlow = normalize(input.worldFlow);
        vec2 localFlowDirection = localFlow / max(length(localFlow), 0.001);
        vec2 flowDirection = normalize(mix(baseFlow, localFlowDirection, localFlowWeight));
        vec2 microA = flowUVWNormal(
          input.worldXZ,
          flowDirection,
          elapsedTime * max(input.motionData.w, 0.0),
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microScaleA)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microOffsetA)}
        );
        vec2 microB = flowUVWNormal(
          input.worldXZ + vec2(${glsl(RIVER_SURFACE_SHADER_TUNING.microWorldOffset[0])}, ${glsl(RIVER_SURFACE_SHADER_TUNING.microWorldOffset[1])}),
          flowDirection,
          elapsedTime * max(input.motionData.w, 0.0),
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microScaleB)},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.microOffsetB)}
        );
        vec2 microSlope = (
          microA * ${glsl(RIVER_SURFACE_SHADER_TUNING.microBlendWeights[0])}
          + microB * ${glsl(RIVER_SURFACE_SHADER_TUNING.microBlendWeights[1])}
        )
          * material_MicroNormalStrength * material_MicroSurfaceEnabled;
        vec3 acrossWS = vec3(-flowDirection.y, 0.0, flowDirection.x);
        vec3 flowWS = vec3(flowDirection.x, 0.0, flowDirection.y);
        vec3 surfaceNormalWS = normalize(
          input.macroNormalWS + acrossWS * microSlope.x + flowWS * microSlope.y
        );
        vec3 viewDirection = normalize(camera_Position - input.worldPosition);
        float fresnel = pow(1.0 - saturate(dot(surfaceNormalWS, viewDirection)), ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelPower)});
        vec3 lightDirection = normalize(vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.lightDirection[2])}
        ));
        float glint = pow(
          saturate(dot(surfaceNormalWS, lightDirection)),
          ${glsl(RIVER_SURFACE_SHADER_TUNING.glintPower)}
        );
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
        float shoreFoam = shoreEnvelope * (
          ${glsl(RIVER_SURFACE_SHADER_TUNING.foamBaseWeight)}
          + erosionMask * ${glsl(RIVER_SURFACE_SHADER_TUNING.foamCurvatureWeight)}
        )
          * ${glsl(RIVER_SURFACE_SHADER_TUNING.shoreFoamWeight)};
        float localFoam = localFoamSource * ${glsl(RIVER_SURFACE_SHADER_TUNING.localFoamWeight)};
        float obstacleEdge = 1.0 - smoothstep(
          0.0,
          ${glsl(RIVER_SURFACE_SHADER_TUNING.obstacleEdgeWidth)},
          abs(localSignedDistance)
        );
        float foam = saturate(max(
          max(crestFoam, shoreFoam),
          localFoam + obstacleEdge * localFoamSource * ${glsl(RIVER_SURFACE_SHADER_TUNING.obstacleEdgeFoamWeight)}
        ))
          * material_FoamIntensity;
        vec3 color = material_BaseColor.rgb * (
          ${glsl(RIVER_SURFACE_SHADER_TUNING.waterBrightness)}
          + clarity * ${glsl(RIVER_SURFACE_SHADER_TUNING.clarityBrightness)}
          + input.surfaceData.x * ${glsl(RIVER_SURFACE_SHADER_TUNING.macroHeightBrightness)}
        );
        color += vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.clearWaterTint[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.clearWaterTint[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.clearWaterTint[2])}
        ) * clarity;
        color += vec3(
          ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelTint[0])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelTint[1])},
          ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelTint[2])}
        ) * fresnel * ${glsl(RIVER_SURFACE_SHADER_TUNING.fresnelWeight)};
        color += material_FoamColor.rgb * glint * ${glsl(RIVER_SURFACE_SHADER_TUNING.glintWeight)};
        vec3 softFoamColor = mix(
          material_BaseColor.rgb * ${RIVER_SHORE_FOAM_SHADER_TUNING.waterColorBrightness},
          material_FoamColor.rgb,
          ${RIVER_SHORE_FOAM_SHADER_TUNING.foamColorMix}
        );
        float foamTint = foam * (
          ${RIVER_SHORE_FOAM_SHADER_TUNING.tintBase}
          + clarity * ${RIVER_SHORE_FOAM_SHADER_TUNING.tintClarityWeight}
        );
        color = mix(color, softFoamColor, foamTint);
        if (material_SurfaceDebugMode > ${RiverSurfaceDebugMode.Off + 0.5}) {
          if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.MacroHeight - 0.5}) {
            color = vec3(fract(input.motionData.x * 0.1), fract((input.motionData.y - elapsedTime) * 0.1), 0.2);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.CrestMask - 0.5}) {
            color = vec3(saturate(input.surfaceData.x / max(material_SurfaceMaxDisplacement, 0.001) * 0.5 + 0.5));
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.MicroNormal - 0.5}) {
            color = vec3(crestMask);
          } else if (material_SurfaceDebugMode < ${RiverSurfaceDebugMode.ShoreDamping - 0.5}) {
            color = vec3(microSlope * 0.5 + 0.5, 1.0);
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
          + (fresnel + glint) * ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.scatterAlphaWeight};
        gl_FragColor = vec4(color, clamp(alpha, 0.0, ${RIVER_MEDIUM_OPTICAL_SHADER_TUNING.maximumAlpha}));
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
