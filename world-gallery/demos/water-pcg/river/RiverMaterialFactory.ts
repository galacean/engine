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
import { Color, Engine, Material, Shader } from "@galacean/engine";
import { RIVER_SHADER_PROPERTY } from "./constants";
import { RiverMaterialConfig } from "./types";

const riverSurfaceShaderSource = `
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
      float renderer_Time;

      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;
      float material_Clarity;
      float material_Time;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
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

      vec3 flowUVW(vec2 uv, vec2 flowVector, vec2 jump, vec2 tiling, float time, float phaseOffset) {
        float progress = fract(time + phaseOffset);
        vec3 uvw;
        uvw.xy = uv - flowVector * (progress - 0.5);
        uvw.xy *= tiling;
        uvw.xy += phaseOffset;
        uvw.xy += (time - progress) * jump;
        uvw.z = 1.0 - abs(1.0 - 2.0 * progress);
        return uvw;
      }

      float dualPhaseFbm(vec2 uv, vec2 flowVector, vec2 jump, vec2 tiling, float time) {
        vec3 flowA = flowUVW(uv, flowVector, jump, tiling, time, 0.0);
        vec3 flowB = flowUVW(uv, flowVector, jump, tiling, time, 0.5);
        return fbm(flowA.xy) * flowA.z + fbm(flowB.xy) * flowB.z;
      }

      void frag(Varyings input) {
        float clarity = saturate(material_Clarity);
        float time = (material_Time + renderer_Time) * max(material_FlowSpeed, 0.08);
        float center = saturate(1.0 - abs(input.uv.x - 0.5) * 2.0);
        float innerWater = smoothstep(0.12, 0.92, center);
        float bank = 1.0 - smoothstep(0.06, 0.42, center);
        float depth = pow(smoothstep(0.05, 1.0, center), mix(0.58, 1.18, clarity));

        float meander = sin(input.uv.y * 1.35 + time * 0.12) * 0.11 + (input.uv.x - 0.5) * 0.16;
        vec2 flowVector = normalize(vec2(meander, 1.0)) * (0.24 + innerWater * 0.56 + material_FlowSpeed * 0.035);
        float broadWater = dualPhaseFbm(input.uv, flowVector, vec2(0.24, 0.2083333), vec2(2.4, 8.0), time * 0.31);
        float fineWater = dualPhaseFbm(
          input.uv + vec2(4.6, 1.7),
          flowVector * 1.7,
          vec2(0.20, 0.25),
          vec2(6.6, 19.0),
          time * 0.43
        );
        float foamNoise = dualPhaseFbm(
          input.uv + vec2(11.3, 6.1),
          flowVector * 0.82,
          vec2(0.22, 0.27),
          vec2(7.5, 15.0),
          time * 0.58
        );
        float waveField = broadWater * 0.62 + fineWater * 0.38;

        float downstream = input.uv.y - time * 0.38 + broadWater * 0.09;
        float streak = sin(downstream * 42.0 + input.uv.x * 7.4) * 0.5 + 0.5;
        float streakCrest = smoothstep(0.72, 1.0, streak) * innerWater;
        float shoreFoam = smoothstep(0.28, 0.92, bank * (0.72 + foamNoise * 0.72));
        float brokenFoam = smoothstep(0.72, 1.06, waveField + streakCrest * 0.34 + bank * 0.12);
        float foamSmooth = saturate((shoreFoam * 0.64 + brokenFoam * 0.28) * material_FoamIntensity);
        float foamSharp = smoothstep(0.48, 0.92, foamSmooth + foamNoise * 0.14);
        float foam = mix(foamSharp, foamSmooth, 0.32);

        float heightCenter = waveField * 0.72 + streakCrest * 0.28;
        float heightRight = dualPhaseFbm(input.uv + vec2(0.018, 0.0), flowVector, vec2(0.24, 0.2083333), vec2(2.4, 8.0), time * 0.31);
        float heightForward = dualPhaseFbm(input.uv + vec2(0.0, 0.018), flowVector, vec2(0.24, 0.2083333), vec2(2.4, 8.0), time * 0.31);
        vec2 normalSlope = vec2(heightCenter - heightRight, heightCenter - heightForward);
        float glint = smoothstep(0.018, 0.125, length(normalSlope)) * innerWater * (0.08 + clarity * 0.14);
        float caustic = smoothstep(0.68, 1.0, sin(downstream * 31.0 - input.uv.x * 11.0 + fineWater * 5.2) * 0.5 + 0.5);
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
      float renderer_Time;

      vec4 material_FoamColor;
      float material_FlowSpeed;
      float material_FoamIntensity;
      float material_Time;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.uv = attr.TEXCOORD_0;
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

      vec3 flowUVW(vec2 uv, vec2 flowVector, vec2 jump, vec2 tiling, float time, float phaseOffset) {
        float progress = fract(time + phaseOffset);
        vec3 uvw;
        uvw.xy = uv - flowVector * (progress - 0.5);
        uvw.xy *= tiling;
        uvw.xy += phaseOffset;
        uvw.xy += (time - progress) * jump;
        uvw.z = 1.0 - abs(1.0 - 2.0 * progress);
        return uvw;
      }

      float dualPhaseFbm(vec2 uv, vec2 flowVector, vec2 jump, vec2 tiling, float time) {
        vec3 flowA = flowUVW(uv, flowVector, jump, tiling, time, 0.0);
        vec3 flowB = flowUVW(uv, flowVector, jump, tiling, time, 0.5);
        return fbm(flowA.xy) * flowA.z + fbm(flowB.xy) * flowB.z;
      }

      void frag(Varyings input) {
        float time = (material_Time + renderer_Time) * max(material_FlowSpeed, 0.08);
        float center = saturate(1.0 - abs(input.uv.x - 0.5) * 2.0);
        float outerBank = 1.0 - smoothstep(0.26, 0.74, center);
        float feather = 1.0 - smoothstep(0.64, 0.98, center);
        vec2 flowVector = normalize(vec2((input.uv.x - 0.5) * 0.55, 1.0)) * (0.32 + material_FlowSpeed * 0.045);
        float broadFoam = dualPhaseFbm(input.uv + vec2(3.2, 1.7), flowVector, vec2(0.24, 0.2083333), vec2(3.2, 8.4), time * 0.42);
        float fineFoam = dualPhaseFbm(input.uv + vec2(12.8, 6.9), flowVector * 1.45, vec2(0.20, 0.25), vec2(9.5, 21.0), time * 0.56);
        float downstream = input.uv.y - time * 0.36 + broadFoam * 0.12;
        float streak = sin(downstream * 34.0 + input.uv.x * 12.0) * 0.5 + 0.5;
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

export function createRiverMaterial(engine: Engine, config: RiverMaterialConfig, flowSpeed: number): Material {
  const shader = Shader.find("AIWorld/RiverSurface") ?? Shader.create(riverSurfaceShaderSource);
  const material = new Material(engine, shader);
  updateRiverMaterial(material, config, flowSpeed, 0);
  return material;
}

export function createRiverFoamMaterial(engine: Engine, config: RiverMaterialConfig, flowSpeed: number): Material {
  const shader = Shader.find("AIWorld/RiverBankFoam") ?? Shader.create(riverBankFoamShaderSource);
  const material = new Material(engine, shader);
  updateRiverFoamMaterial(material, config, flowSpeed, 0);
  return material;
}

export function updateRiverMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeed: number,
  time: number
): void {
  material.shaderData.setColor(
    RIVER_SHADER_PROPERTY.baseColor,
    hexToColor(config.baseColor, 0.88 + (1 - config.clarity) * 0.08)
  );
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeed, flowSpeed);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.clarity, config.clarity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.time, time);
}

export function updateRiverFoamMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeed: number,
  time: number
): void {
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeed, flowSpeed);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.time, time);
}
