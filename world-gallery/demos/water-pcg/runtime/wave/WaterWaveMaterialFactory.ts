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
      restXZ, elapsedTime, localPosition.xyz, derivativeX, derivativeZ, crestAccumulation);\n`;
  }
  return statements;
}

export function createWaterWaveShaderSource(variant: WaterWaveShaderVariant): string {
  const waveCount = Number(variant);
  const tuning = WATER_WAVE_SHADER_TUNING;
  return `
Shader "${WATER_WAVE_SHADER_NAME[variant]}" {
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
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec4 material_BaseColor;
      vec4 material_DeepColor;
      float material_Alpha;
      float material_WaterLevel;
      float material_TimeScale;
      float material_CrestIntensity;
      float material_SurfaceTimeOverride;
      float material_MaxVerticalDisplacement;
${waveUniformDeclarations(waveCount)}
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec3 worldPosition; vec3 worldNormal; float crest; };

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

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        vec4 localPosition = attr.POSITION;
        vec2 restXZ = localPosition.xz;
        localPosition.y += material_WaterLevel;
        float elapsedTime = material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x;
        vec3 derivativeX = vec3(1.0, 0.0, 0.0);
        vec3 derivativeZ = vec3(0.0, 0.0, 1.0);
        float crestAccumulation = 0.0;
${waveApplyStatements(waveCount)}
        vec3 localNormal = normalize(cross(derivativeZ, derivativeX));
        vec4 computedWorldPosition = renderer_ModelMat * localPosition;
        output.worldPosition = computedWorldPosition.xyz;
        output.worldNormal = normalize(mat3(renderer_ModelMat) * localNormal);
        output.crest = clamp(
          crestAccumulation / max(material_MaxVerticalDisplacement, 0.000001),
          0.0,
          1.0
        );
        gl_Position = renderer_MVPMat * localPosition;
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
        float fresnel = pow(1.0 - facing, ${glsl(tuning.fresnelPower, 1)});
        float diffuse = ${glsl(tuning.diffuseFloor)} + max(normal.y, 0.0) * ${glsl(tuning.diffuseNormalWeight)};
        float specular = pow(max(dot(normal, halfDirection), 0.0), ${glsl(tuning.specularPower, 1)});
        float slope = clamp((1.0 - normal.y) * ${glsl(tuning.slopeContrast, 1)}, 0.0, 1.0);
        float slopeDirection = dot(normal.xz, normalize(lightDirection.xz));
        vec3 waterColor = mix(material_DeepColor.rgb, material_BaseColor.rgb, diffuse);
        waterColor *= 1.0 + slopeDirection * slope * ${glsl(tuning.slopeDirectionalStrength)};
        waterColor = mix(waterColor, material_BaseColor.rgb * ${glsl(tuning.horizonColorScale)}, fresnel * ${glsl(tuning.fresnelStrength)});
        waterColor += vec3(specular * ${glsl(tuning.specularStrength)});
        waterColor = mix(
          waterColor,
          vec3(0.84, 0.95, 1.0),
          input.crest * material_CrestIntensity * ${glsl(tuning.crestTintStrength)}
        );
        gl_FragColor = vec4(waterColor, clamp(material_Alpha, ${glsl(tuning.minimumAlpha)}, ${glsl(tuning.maximumAlpha)}));
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
  const shaderName = WATER_WAVE_SHADER_NAME[variant];
  const shader = Shader.find(shaderName) ?? Shader.create(createWaterWaveShaderSource(variant));
  const material = new Material(engine, shader);
  bindWaterWaveMaterial(material, waveSet, config);
  return Object.freeze({ material, variant, waveSet });
}

export function updateWaterWaveMaterial(
  state: WaterWaveMaterialState,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): WaterWaveMaterialState {
  const nextVariant = resolveVariant(waveSet.shaderWaveCount);
  if (nextVariant !== state.variant) {
    throw new Error("Water-wave shader variants require material replacement.");
  }
  bindWaterWaveMaterial(state.material, waveSet, config);
  return Object.freeze({ material: state.material, variant: state.variant, waveSet });
}

export function setWaterWaveSurfaceTimeOverride(state: WaterWaveMaterialState, elapsedTime?: number): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceTimeOverride,
    elapsedTime === undefined ? -1 : Math.max(0, elapsedTime)
  );
}
