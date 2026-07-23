/** Fixed-variant Gerstner material creation and binding for the Ocean preview. */
import { Engine, Material, Shader } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import {
  WATER_WAVE_EPSILON,
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_TWO_PI
} from "../../authoring/wave/constants/WaterWaveLimits";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { WATER_WAVE_SHADER_PROPERTY, WATER_WAVE_SHADER_TUNING } from "./constants/WaterWaveShaderConstants";
import { WaterWaveShaderVariant } from "./enums/WaterWaveShaderVariant";
import type { WaterWaveMaterialConfig, WaterWaveMaterialState } from "./WaterWaveRuntimeTypes";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../optics/WaterOpticalProfile";
import {
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import {
  WaterOpticsDebugView,
  type ResolvedWaterOpticsTier,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";

const WATER_WAVE_SHADER_NAME: Readonly<Record<WaterWaveShaderVariant, string>> = {
  [WaterWaveShaderVariant.None]: "AIWorld/WaterGerstnerNone",
  [WaterWaveShaderVariant.Low]: "AIWorld/WaterGerstner2",
  [WaterWaveShaderVariant.Medium]: "AIWorld/WaterGerstner6",
  [WaterWaveShaderVariant.High]: "AIWorld/WaterGerstner12"
};

const ZERO_WAVE_UNIFORM = new Vector4(0, 0, 0, 0);

function glsl(value: number, digits = 8): string {
  return value.toFixed(digits);
}

function resolveVariant(activeWaveCount: number): WaterWaveShaderVariant {
  if (activeWaveCount === WaterWaveShaderVariant.None) return WaterWaveShaderVariant.None;
  if (activeWaveCount === WaterWaveShaderVariant.Low) return WaterWaveShaderVariant.Low;
  if (activeWaveCount === WaterWaveShaderVariant.Medium) return WaterWaveShaderVariant.Medium;
  if (activeWaveCount === WaterWaveShaderVariant.High) return WaterWaveShaderVariant.High;
  throw new Error(`Unsupported fixed water-wave shader count: ${activeWaveCount}.`);
}

function waveUniformDeclarations(waveCount: number): string {
  let declarations = "";
  for (let index = 0; index < waveCount; index++) {
    declarations += `      vec4 ${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index};\n`;
    declarations += `      vec4 ${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index};\n`;
  }
  return declarations;
}

function waveApplyStatements(waveCount: number): string {
  let statements = "";
  for (let index = 0; index < waveCount; index++) {
    statements += `        applyGerstnerWave(
      ${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index},
      ${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index},
      restXZ, elapsedTime, displacedPosition.xyz, derivativeX, derivativeZ, crestAccumulation);\n`;
  }
  return statements;
}

function defaultOpticsTierForVariant(variant: WaterWaveShaderVariant): ResolvedWaterOpticsTier | undefined {
  if (variant === WaterWaveShaderVariant.Medium) return "medium";
  if (variant === WaterWaveShaderVariant.High) return "high";
  return undefined;
}

function resolveOpticsTier(
  variant: WaterWaveShaderVariant,
  requestedTier?: WaterOpticsTier
): ResolvedWaterOpticsTier | undefined {
  if (requestedTier) return requestedTier === "medium" ? "medium" : "high";
  return defaultOpticsTierForVariant(variant);
}

function shaderNameForVariant(
  variant: WaterWaveShaderVariant,
  opticsTier: ResolvedWaterOpticsTier | undefined
): string {
  const baseName = WATER_WAVE_SHADER_NAME[variant];
  return opticsTier === defaultOpticsTierForVariant(variant)
    ? baseName
    : `${baseName}Optics${opticsTier === "high" ? "High" : opticsTier === "medium" ? "Medium" : "Legacy"}`;
}

function sceneOpticsDeclarations(enabled: boolean): string {
  if (!enabled) return "";
  return `      mat4 camera_ViewMat;
      vec4 camera_ProjectionParams;
      vec4 camera_DepthBufferParams;
      sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_RefractionStrength;
      float material_RefractionEnabled;`;
}

function sceneDepthFunction(enabled: boolean): string {
  if (!enabled) return "";
  return `      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }`;
}

function fresnelCalculation(enabled: boolean): string {
  if (!enabled) {
    return `        float fresnel = pow(1.0 - facing, ${glsl(WATER_WAVE_SHADER_TUNING.fresnelPower, 1)});`;
  }
  return `        float indexOfRefraction = clamp(material_IndexOfRefraction, 1.0, 4.0);
        float fresnelRatio = (1.0 - indexOfRefraction) / (1.0 + indexOfRefraction);
        float fresnelF0 = fresnelRatio * fresnelRatio;
        float fresnel = fresnelF0
          + (1.0 - fresnelF0) * pow(1.0 - facing, ${glsl(WATER_WAVE_SHADER_TUNING.fresnelPower, 1)});`;
}

function sceneColorRefraction(opticsTier: ResolvedWaterOpticsTier | undefined): string {
  if (!opticsTier) return "";
  const tuning = WATER_WAVE_SHADER_TUNING;
  const uvScale = opticsTier === "high" ? tuning.highRefractionUvScale : tuning.mediumRefractionUvScale;
  const refractionMix = opticsTier === "high" ? tuning.highRefractionMix : tuning.mediumRefractionMix;
  return `        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;
        float sceneEyeDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, screenUv).r);
        float maximumOpticalDistance = max(material_MaximumSurfaceOpticalDistance, 0.000001);
        float opticalDistance = min(max(sceneEyeDepth - input.surfaceEyeDepth, 0.0), maximumOpticalDistance);
        float opticalDepthWeight = smoothstep(
          ${glsl(tuning.refractionDepthStart)},
          ${glsl(tuning.refractionDepthEnd)},
          opticalDistance
        );
        vec3 restNormalVS = normalize(mat3(camera_ViewMat) * vec3(0.0, 1.0, 0.0));
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * normal);
        vec2 displacedScreenUv = screenUv
          + (surfaceNormalVS.xy - restNormalVS.xy)
            * ${glsl(uvScale)}
            * max(material_RefractionStrength, 0.0)
            * opticalDepthWeight;
        float refractionScreenInterior = step(${glsl(tuning.refractionEdgeInset)}, displacedScreenUv.x)
          * step(displacedScreenUv.x, ${glsl(1 - tuning.refractionEdgeInset)})
          * step(${glsl(tuning.refractionEdgeInset)}, displacedScreenUv.y)
          * step(displacedScreenUv.y, ${glsl(1 - tuning.refractionEdgeInset)});
        vec2 refractedScreenUv = clamp(
          displacedScreenUv,
          vec2(${glsl(tuning.refractionEdgeInset)}),
          vec2(${glsl(1 - tuning.refractionEdgeInset)})
        );
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDistance = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float refractionDepthTolerance = max(
          ${glsl(tuning.refractionDepthToleranceMinimum)},
          opticalDistance * ${glsl(tuning.refractionDepthToleranceScale)}
        );
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDistance);
        float refractionSampleValidity = refractionScreenInterior
          * refractionDepthContinuity
          * refractedGeometryBehindSurface;
        vec3 centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        vec3 refractedSceneColor = mix(centeredOpaqueColor, displacedOpaqueColor, refractionSampleValidity);
        vec3 absorption = max(material_AbsorptionCoefficient, vec3(0.0));
        vec3 transmittance = exp(-absorption * opticalDistance);
        float scatteringWeight = 1.0 - exp(-max(material_ScatteringCoefficient, 0.0) * opticalDistance);
        vec3 transmittedColor = refractedSceneColor * transmittance
          + max(material_ScatteringColor, vec3(0.0)) * scatteringWeight;
        float refractionAmount = ${glsl(refractionMix)}
          * step(0.5, material_RefractionEnabled)
          * opticalDepthWeight
          * (1.0 - fresnel);
        waterColor = mix(waterColor, transmittedColor, clamp(refractionAmount, 0.0, 1.0));`;
}

export function createWaterWaveShaderSource(
  variant: WaterWaveShaderVariant,
  requestedOpticsTier?: WaterOpticsTier
): string {
  const waveCount = Number(variant);
  const tuning = WATER_WAVE_SHADER_TUNING;
  const opticsTier = resolveOpticsTier(variant, requestedOpticsTier);
  const shaderName = shaderNameForVariant(variant, opticsTier);
  const sceneRefractionEnabled = opticsTier !== undefined;
  return `
Shader "${shaderName}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = ${sceneRefractionEnabled ? "false" : "true"};
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

      mat4 renderer_ModelMat;
      mat4 camera_VPMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec4 material_BaseColor;
      vec4 material_DeepColor;
      float material_Alpha;
      float material_WaterLevel;
      float material_TimeScale;
      float material_CrestIntensity;
      float material_ReflectionIntensity;
      float material_ReflectionIntensityMultiplier;
      float material_Roughness;
      float material_ReflectionSource;
      float material_SurfaceTimeOverride;
      float material_MaxVerticalDisplacement;
      float renderer_OceanLod;
      float renderer_OceanLodDebug;
      samplerCube material_ReflectionCubeTexture;
      sampler2D material_PlanarReflectionTexture;
      mat4 material_PlanarReflectionVP;
      vec4 material_PlanarReflectionTextureSize;
      vec4 material_PlanarReflectionSampling;
      vec4 material_PlanarReflectionFade;
      float material_PlanarReflectionRoughnessFootprint;
${sceneOpticsDeclarations(sceneRefractionEnabled)}
${waveUniformDeclarations(waveCount)}
      struct Attributes { vec4 POSITION; };
      struct Varyings {
        vec3 worldPosition;
        vec3 worldNormal;
        float crest;
${sceneRefractionEnabled ? "        vec4 clipPosition;\n        float surfaceEyeDepth;" : ""}
      };

      void applyGerstnerWave(
        vec4 waveA,
        vec4 waveB,
        vec2 restXZ,
        float elapsedTime,
        inout vec3 displaced,
        inout vec3 derivativeX,
        inout vec3 derivativeZ,
        inout float crest
      ) {
        float angularRate = waveB.x * material_TimeScale;
        float wavePeriod = ${glsl(WATER_WAVE_TWO_PI)} / max(abs(angularRate), ${glsl(WATER_WAVE_EPSILON)});
        float wrappedTime = mod(elapsedTime, wavePeriod);
        float theta = waveA.w * dot(waveA.xy, restXZ) - angularRate * wrappedTime + waveB.z;
        float sine = sin(theta);
        float cosine = cos(theta);
        float horizontalDerivative = waveB.y * waveA.w * sine;
        float verticalDerivative = waveA.z * waveA.w * cosine;
        displaced.xz += waveA.xy * waveB.y * cosine;
        displaced.y += waveA.z * sine;
        derivativeX -= vec3(
          horizontalDerivative * waveA.x * waveA.x,
          -verticalDerivative * waveA.x,
          horizontalDerivative * waveA.x * waveA.y
        );
        derivativeZ -= vec3(
          horizontalDerivative * waveA.y * waveA.x,
          -verticalDerivative * waveA.y,
          horizontalDerivative * waveA.y * waveA.y
        );
        crest += max(sine, 0.0) * waveA.z;
      }

${sceneDepthFunction(sceneRefractionEnabled)}

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        vec4 displacedPosition = renderer_ModelMat * attr.POSITION;
        vec2 restXZ = displacedPosition.xz;
        displacedPosition.y += material_WaterLevel;
        float elapsedTime = material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x;
        vec3 derivativeX = vec3(1.0, 0.0, 0.0);
        vec3 derivativeZ = vec3(0.0, 0.0, 1.0);
        float crestAccumulation = 0.0;
${waveApplyStatements(waveCount)}
        vec3 surfaceNormal = normalize(cross(derivativeZ, derivativeX));
        output.worldPosition = displacedPosition.xyz;
        output.worldNormal = surfaceNormal;
        output.crest = clamp(
          crestAccumulation / max(material_MaxVerticalDisplacement, 0.000001),
          0.0,
          1.0
        );
        gl_Position = camera_VPMat * displacedPosition;
${
  sceneRefractionEnabled
    ? "        output.clipPosition = gl_Position;\n        output.surfaceEyeDepth = -(camera_ViewMat * displacedPosition).z;"
    : ""
}
        return output;
      }

      void frag(Varyings input) {
        vec3 normal = normalize(input.worldNormal);
        vec3 viewDirection = normalize(camera_Position - input.worldPosition);
        vec3 lightDirection = normalize(vec3(
          ${glsl(tuning.lightDirection[0])},
          ${glsl(tuning.lightDirection[1])},
          ${glsl(tuning.lightDirection[2])}
        ));
        vec3 halfDirection = normalize(viewDirection + lightDirection);
        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
${fresnelCalculation(sceneRefractionEnabled)}
        float diffuse = ${glsl(tuning.diffuseFloor)} + max(normal.y, 0.0) * ${glsl(tuning.diffuseNormalWeight)};
        float specular = pow(max(dot(normal, halfDirection), 0.0), ${glsl(tuning.specularPower, 1)});
        float slope = clamp((1.0 - normal.y) * ${glsl(tuning.slopeContrast, 1)}, 0.0, 1.0);
        float slopeDirection = dot(normal.xz, normalize(lightDirection.xz));
        vec3 waterColor = mix(material_DeepColor.rgb, material_BaseColor.rgb, diffuse);
        waterColor *= 1.0 + slopeDirection * slope * ${glsl(tuning.slopeDirectionalStrength)};
${sceneColorRefraction(opticsTier)}
        vec3 analyticSky = mix(
          material_DeepColor.rgb * 0.72,
          material_BaseColor.rgb * ${glsl(tuning.horizonColorScale)},
          clamp(reflect(-viewDirection, normal).y * 0.5 + 0.5, 0.0, 1.0)
        );
        vec3 reflectionColor = analyticSky;
        if (material_ReflectionSource > 1.5) {
          vec4 reflectionClip = material_PlanarReflectionVP * vec4(input.worldPosition, 1.0);
          float minimumClipW = max(material_PlanarReflectionSampling.z, 0.000001);
          vec2 reflectionUv = reflectionClip.xy / max(abs(reflectionClip.w), minimumClipW) * 0.5 + 0.5;
          reflectionUv += normal.xz * material_PlanarReflectionSampling.x;
          vec2 clampedReflectionUv = clamp(reflectionUv, vec2(0.0), vec2(1.0));
          vec2 edgeDistanceTexels = min(clampedReflectionUv, vec2(1.0) - clampedReflectionUv)
            * max(material_PlanarReflectionTextureSize.xy, vec2(1.0));
          float edgeFade = smoothstep(
            0.0,
            max(material_PlanarReflectionSampling.y, 1.0),
            min(edgeDistanceTexels.x, edgeDistanceTexels.y)
          );
          float planeDistance = abs(camera_Position.y - material_WaterLevel);
          float planeDistanceFade = smoothstep(
            material_PlanarReflectionFade.x,
            max(material_PlanarReflectionFade.y, material_PlanarReflectionFade.x + 0.0001),
            planeDistance
          );
          float viewAngleFade = smoothstep(
            material_PlanarReflectionFade.z,
            max(material_PlanarReflectionFade.w, material_PlanarReflectionFade.z + 0.0001),
            facing
          );
          float uvInside = step(0.0, reflectionUv.x) * step(reflectionUv.x, 1.0)
            * step(0.0, reflectionUv.y) * step(reflectionUv.y, 1.0);
          float planarValidity = step(minimumClipW, reflectionClip.w)
            * uvInside
            * edgeFade
            * planeDistanceFade
            * viewAngleFade;
          vec3 planarColor = texture2D(material_PlanarReflectionTexture, clampedReflectionUv).rgb;
          if (material_PlanarReflectionSampling.w > 3.0) {
            vec2 filterOffset = material_PlanarReflectionTextureSize.zw
              * material_PlanarReflectionRoughnessFootprint
              * clamp(material_Roughness, 0.0, 1.0);
            planarColor = (
              planarColor
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv + vec2(filterOffset.x, 0.0), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv - vec2(filterOffset.x, 0.0), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv + vec2(0.0, filterOffset.y), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv - vec2(0.0, filterOffset.y), vec2(0.0), vec2(1.0))).rgb
            ) * 0.2;
          }
          reflectionColor = mix(analyticSky, planarColor, planarValidity);
        } else if (material_ReflectionSource > 0.5) {
          reflectionColor = textureCube(material_ReflectionCubeTexture, reflect(-viewDirection, normal)).rgb;
        }
        waterColor = mix(
          waterColor,
          reflectionColor,
          clamp(fresnel * material_ReflectionIntensity * material_ReflectionIntensityMultiplier, 0.0, 1.0)
        );
        waterColor += vec3(specular * ${glsl(tuning.specularStrength)});
        waterColor = mix(
          waterColor,
          vec3(0.84, 0.95, 1.0),
          input.crest * material_CrestIntensity * ${glsl(tuning.crestTintStrength)}
        );
${
  sceneRefractionEnabled
    ? `        vec3 centeredSurfaceBackground = texture2D(camera_OpaqueTexture, screenUv).rgb;
        waterColor = mix(
          centeredSurfaceBackground,
          waterColor,
          clamp(material_Alpha, ${glsl(tuning.minimumAlpha)}, ${glsl(tuning.maximumAlpha)})
        );`
    : ""
}
        if (renderer_OceanLodDebug > 0.5) {
          vec3 lodColor = renderer_OceanLod < 0.5
            ? vec3(0.18, 0.92, 0.72)
            : (renderer_OceanLod < 1.5
              ? vec3(0.98, 0.74, 0.2)
              : (renderer_OceanLod < 2.5 ? vec3(0.96, 0.36, 0.24) : vec3(0.62, 0.36, 0.96)));
          waterColor = mix(waterColor, lodColor, 0.58);
        }
        gl_FragColor = vec4(
          waterColor,
          ${
            sceneRefractionEnabled
              ? "1.0"
              : `clamp(material_Alpha, ${glsl(tuning.minimumAlpha)}, ${glsl(tuning.maximumAlpha)})`
          }
        );
      }
    }
  }
}`;
}

function parseHexColor(hex: string, alpha: number): Color {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value) || normalized.length !== 6) return new Color(0.08, 0.5, 0.72, alpha);
  return new Color(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha);
}

function bindWaterWaveMaterial(
  material: Material,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): void {
  const tuning = WATER_WAVE_SHADER_TUNING;
  const baseColor = parseHexColor(config.baseColor, config.alpha);
  const deepColor = new Color(
    baseColor.r * tuning.deepColorScale,
    baseColor.g * tuning.deepColorScale,
    Math.min(1, baseColor.b * tuning.deepColorScale + tuning.deepColorBlueLift),
    config.alpha
  );
  material.shaderData.setColor(WATER_WAVE_SHADER_PROPERTY.baseColor, baseColor);
  material.shaderData.setColor(WATER_WAVE_SHADER_PROPERTY.deepColor, deepColor);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.alpha, config.alpha);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.waterLevel, config.waterLevel);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.timeScale, config.timeScale);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.crestIntensity, config.crestIntensity);
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.reflectionIntensityMultiplier,
    config.reflectionIntensity ?? tuning.fresnelStrength
  );
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.reflectionSource, 0);
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceTimeOverride,
    config.surfaceTimeOverride === undefined ? -1 : Math.max(0, config.surfaceTimeOverride)
  );
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.maxVerticalDisplacement, waveSet.maxVerticalDisplacement);
  const packed = waveSet.packedShaderData.toTypedArray();
  for (let index = 0; index < waveSet.shaderWaveCount; index++) {
    const offset = index * WATER_WAVE_PACKED_FLOATS_PER_WAVE;
    if (index >= waveSet.activeWaveCount) {
      material.shaderData.setVector4(`${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index}`, ZERO_WAVE_UNIFORM);
      material.shaderData.setVector4(`${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index}`, ZERO_WAVE_UNIFORM);
      continue;
    }
    material.shaderData.setVector4(
      `${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index}`,
      new Vector4(packed[offset], packed[offset + 1], packed[offset + 2], packed[offset + 3])
    );
    material.shaderData.setVector4(
      `${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index}`,
      new Vector4(packed[offset + 4], packed[offset + 5], packed[offset + 6], packed[offset + 7])
    );
  }
}

export function createWaterWaveMaterial(
  engine: Engine,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): WaterWaveMaterialState {
  const variant = resolveVariant(waveSet.shaderWaveCount);
  const opticsTier = resolveOpticsTier(variant, config.opticsTier);
  const shaderName = shaderNameForVariant(variant, opticsTier);
  const shader = Shader.find(shaderName) ?? Shader.create(createWaterWaveShaderSource(variant, opticsTier));
  const material = new Material(engine, shader);
  bindWaterWaveMaterial(material, waveSet, config);
  const state = Object.freeze({
    material,
    variant,
    opticsTier,
    waveSet,
    opticsBindingState: createWaterSurfaceOpticsBindingState()
  });
  setWaterWaveSurfaceOpticsBinding(state, {
    tier: opticsTier ?? "medium",
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: false,
    reflection: undefined,
    debugView: WaterOpticsDebugView.Final
  });
  return state;
}

export function updateWaterWaveMaterial(
  state: WaterWaveMaterialState,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): WaterWaveMaterialState {
  const nextVariant = resolveVariant(waveSet.shaderWaveCount);
  const nextOpticsTier = resolveOpticsTier(nextVariant, config.opticsTier);
  if (nextVariant !== state.variant || nextOpticsTier !== state.opticsTier) {
    throw new Error("Water-wave or surface-optics shader variants require material replacement.");
  }
  bindWaterWaveMaterial(state.material, waveSet, config);
  return Object.freeze({
    material: state.material,
    variant: state.variant,
    opticsTier: state.opticsTier,
    waveSet,
    opticsBindingState: state.opticsBindingState
  });
}

export function setWaterWaveSurfaceTimeOverride(state: WaterWaveMaterialState, elapsedTime?: number): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceTimeOverride,
    elapsedTime === undefined ? -1 : Math.max(0, elapsedTime)
  );
}

export function setWaterWaveReflectionBinding(
  state: WaterWaveMaterialState,
  binding?: Readonly<WaterReflectionBinding>
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  return applyWaterSurfaceReflectionBinding(
    state.material.shaderData,
    state.opticsBindingState,
    state.opticsTier ?? "medium",
    binding
  );
}

/** Applies the complete P1 profile/refraction/reflection contract to one Ocean material. */
export function setWaterWaveSurfaceOpticsBinding(
  state: WaterWaveMaterialState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const requestedResolvedTier = binding.tier === "medium" ? "medium" : "high";
  if (binding.refractionEnabled && state.opticsTier !== requestedResolvedTier) {
    throw new Error(
      `Water-wave refraction requested ${binding.tier}, but the material compiled ${state.opticsTier ?? "legacy"}; replace the material first.`
    );
  }
  return applyWaterSurfaceOpticsBinding(state.material.shaderData, state.opticsBindingState, binding);
}
