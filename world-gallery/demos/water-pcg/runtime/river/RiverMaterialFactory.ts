/**
 * River material and shader factory.
 *
 * This file owns the visual water-surface material for the prototype. It registers
 * the custom RiverSurface ShaderLab source, converts config colors into Galacean
 * shader data, and updates flow, foam, clarity, and time uniforms. Geometry and
 * gameplay systems should not know shader property strings or animation formulas;
 * keeping them here makes the river's visual layer replaceable as the water system
 * moves from a demo shader toward production rendering.
 */
import { Engine, Material, Shader, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import type { RiverMaterialConfig } from "../../authoring/river/RiverAuthoringTypes";
import { RIVER_FLOW_UV_SCALE } from "../../compiler/river/constants";
import { RIVER_SHADER_PROPERTY } from "./constants";

const RIVER_FLOW_UV_SCALE_GLSL = RIVER_FLOW_UV_SCALE.toFixed(8);

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

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; vec2 TEXCOORD_1; };
      struct Varyings { vec2 uv; float localFlowSpeed; };
      VertexShader = vert;
      FragmentShader = frag;
      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        return output;
      }
      void frag(Varyings input) {
        float across = abs(input.uv.x - 0.5) * 2.0;
        float water = 1.0 - smoothstep(0.48, 0.54, across);
        float feather = 1.0 - smoothstep(0.54, 1.0, across);
        float edge = smoothstep(0.38, 0.58, across) * feather;
        float flowEnabled = step(0.0001, input.localFlowSpeed);
        float flowTime = scene_ElapsedTime.x * max(material_FlowSpeed, 0.0) * ${RIVER_FLOW_UV_SCALE_GLSL} * flowEnabled;
        float downstream = input.uv.y - flowTime;
        float noise = texture2D(material_NoiseTexture, vec2(input.uv.x * 2.0, downstream * 0.28)).r;
        float foam = edge * smoothstep(0.28, 0.82, noise + material_FoamIntensity * 0.34);
        float center = 1.0 - across;
        vec3 waterColor = material_BaseColor.rgb * (0.72 + center * (0.18 + material_Clarity * 0.12));
        vec3 color = mix(waterColor, material_FoamColor.rgb, foam);
        float alpha = (water * material_BaseColor.a + foam * 0.72) * feather;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.94));
      }
    }
  }
}`;

const lowNoiseTextures = new WeakMap<Engine, Texture2D>();

function getLowNoiseTexture(engine: Engine): Texture2D {
  const existing = lowNoiseTextures.get(engine);
  if (existing) return existing;
  const size = 8;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 0x12345678;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = seed >>> 24;
    const offset = i * 4;
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

export const riverSurfaceShaderSource = `
Shader "AIWorld/RiverSurface" {
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

      RasterState customRasterState {
        CullMode = CullMode.Off;
      }

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

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
        vec2 TEXCOORD_1;
      };

      struct Varyings {
        vec2 uv;
        float localFlowSpeed;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        return output;
      }

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      float hash21(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        vec2 curve = local * local * (3.0 - 2.0 * local);
        float bottom = mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), curve.x);
        float top = mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), curve.x);
        return mix(bottom, top, curve.y);
      }

      float fbm(vec2 uv) {
        float value = valueNoise(uv) * 0.52;
        value += valueNoise(uv * 2.03 + vec2(17.7, 9.2)) * 0.26;
        value += valueNoise(uv * 4.11 + vec2(8.3, 21.6)) * 0.14;
        value += valueNoise(uv * 8.23 + vec2(31.1, 5.8)) * 0.08;
        return value;
      }

      void frag(Varyings input) {
        float clarity = saturate(material_Clarity);
        float flowEnabled = step(0.0001, input.localFlowSpeed);
        float flowTime = scene_ElapsedTime.x * max(material_FlowSpeed, 0.0) * ${RIVER_FLOW_UV_SCALE_GLSL} * flowEnabled;
        float downstream = input.uv.y - flowTime;
        float center = saturate(1.0 - abs(input.uv.x - 0.5) * 2.0);
        float innerWater = smoothstep(0.12, 0.92, center);
        float bank = 1.0 - smoothstep(0.06, 0.42, center);
        float depth = pow(smoothstep(0.05, 1.0, center), mix(0.58, 1.18, clarity));

        float meander = sin(downstream * 1.35) * 0.11 + (input.uv.x - 0.5) * 0.16;
        vec2 flowUv = vec2(input.uv.x + meander * 0.18, downstream);
        float broadWater = fbm(flowUv * vec2(2.4, 8.0));
        float fineWater = fbm((flowUv + vec2(4.6, 1.7)) * vec2(6.6, 19.0));
        float foamNoise = fbm((flowUv + vec2(11.3, 6.1)) * vec2(7.5, 15.0));
        float waveField = broadWater * 0.62 + fineWater * 0.38;

        float detailPhase = downstream + broadWater * 0.09;
        float streak = sin(detailPhase * 42.0 + input.uv.x * 7.4) * 0.5 + 0.5;
        float streakCrest = smoothstep(0.72, 1.0, streak) * innerWater;
        float shoreFoam = smoothstep(0.28, 0.92, bank * (0.72 + foamNoise * 0.72));
        float brokenFoam = smoothstep(0.72, 1.06, waveField + streakCrest * 0.34 + bank * 0.12);
        float foamSmooth = saturate((shoreFoam * 0.64 + brokenFoam * 0.28) * material_FoamIntensity);
        float foamSharp = smoothstep(0.48, 0.92, foamSmooth + foamNoise * 0.14);
        float foam = mix(foamSharp, foamSmooth, 0.32);

        float heightCenter = waveField * 0.72 + streakCrest * 0.28;
        float heightRight = fbm((flowUv + vec2(0.018, 0.0)) * vec2(2.4, 8.0));
        float heightForward = fbm((flowUv + vec2(0.0, 0.018)) * vec2(2.4, 8.0));
        vec2 normalSlope = vec2(heightCenter - heightRight, heightCenter - heightForward);
        float glint = smoothstep(0.018, 0.125, length(normalSlope)) * innerWater * (0.08 + clarity * 0.14);
        float caustic = smoothstep(0.68, 1.0, sin(detailPhase * 31.0 - input.uv.x * 11.0 + fineWater * 5.2) * 0.5 + 0.5);
        float lightScatter = (caustic * 0.12 + glint) * clarity * innerWater;

        vec3 shallowColor = mix(material_BaseColor.rgb * 1.08, material_FoamColor.rgb * 0.22, 0.12);
        vec3 midColor = material_BaseColor.rgb * (0.92 + clarity * 0.12) + vec3(0.0, 0.04, 0.08) * clarity;
        vec3 deepColor = material_BaseColor.rgb * vec3(0.42, 0.50, 0.82);
        vec3 color = mix(shallowColor, midColor, depth);
        color = mix(color, deepColor, innerWater * (1.0 - clarity) * 0.42);
        color += material_FoamColor.rgb * lightScatter;
        color = mix(color, material_FoamColor.rgb * (0.86 + foamNoise * 0.18), foam);

        float alpha = mix(0.62 + clarity * 0.08, material_BaseColor.a, innerWater);
        alpha += foam * 0.18 + lightScatter * 0.08;
        alpha *= 0.86 + smoothstep(0.04, 0.28, center) * 0.14;
        gl_FragColor = vec4(color, clamp(alpha, 0.45, 0.97));
      }
    }
  }
}`;

const riverBankFoamShaderSource = `
Shader "AIWorld/RiverBankFoam" {
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

      RasterState customRasterState {
        CullMode = CullMode.Off;
      }

      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      vec4 scene_ElapsedTime;

      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
        vec2 TEXCOORD_1;
      };

      struct Varyings {
        vec2 uv;
        float localFlowSpeed;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        return output;
      }

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      float hash21(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        vec2 curve = local * local * (3.0 - 2.0 * local);
        float bottom = mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), curve.x);
        float top = mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), curve.x);
        return mix(bottom, top, curve.y);
      }

      float fbm(vec2 uv) {
        float value = valueNoise(uv) * 0.5;
        value += valueNoise(uv * 2.07 + vec2(19.3, 4.1)) * 0.27;
        value += valueNoise(uv * 4.19 + vec2(7.7, 28.2)) * 0.15;
        value += valueNoise(uv * 8.41 + vec2(33.4, 11.8)) * 0.08;
        return value;
      }

      void frag(Varyings input) {
        float flowEnabled = step(0.0001, input.localFlowSpeed);
        float flowTime = scene_ElapsedTime.x * max(material_FlowSpeed, 0.0) * ${RIVER_FLOW_UV_SCALE_GLSL} * flowEnabled;
        float downstream = input.uv.y - flowTime;
        float center = saturate(1.0 - abs(input.uv.x - 0.5) * 2.0);
        float outerBank = 1.0 - smoothstep(0.26, 0.74, center);
        float feather = 1.0 - smoothstep(0.64, 0.98, center);
        vec2 flowUv = vec2(input.uv.x + (input.uv.x - 0.5) * 0.08, downstream);
        float broadFoam = fbm((flowUv + vec2(3.2, 1.7)) * vec2(3.2, 8.4));
        float fineFoam = fbm((flowUv + vec2(12.8, 6.9)) * vec2(9.5, 21.0));
        float detailPhase = downstream + broadFoam * 0.12;
        float streak = sin(detailPhase * 34.0 + input.uv.x * 12.0) * 0.5 + 0.5;
        float foamField = broadFoam * 0.64 + fineFoam * 0.36 + streak * 0.16;
        float brokenMask = smoothstep(0.48, 0.88, foamField + outerBank * 0.28);
        float holes = smoothstep(0.22, 0.74, fineFoam);
        float alpha = brokenMask * outerBank * feather * (0.38 + material_FoamIntensity * 0.58);
        alpha *= 0.62 + holes * 0.38;
        vec3 color = material_FoamColor.rgb * (0.76 + broadFoam * 0.34);
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
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

export function createRiverMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): Material {
  const shader = Shader.find("AIWorld/RiverSurface") ?? Shader.create(riverSurfaceShaderSource);
  const material = new Material(engine, shader);
  updateRiverMaterial(material, config, flowSpeedMultiplier);
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

export function updateRiverFoamMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): void {
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeedMultiplier, flowSpeedMultiplier);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
}
