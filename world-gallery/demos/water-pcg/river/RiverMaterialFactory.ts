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

      float stripe(float value, float width) {
        return smoothstep(1.0 - width, 1.0, value);
      }

      void frag(Varyings input) {
        float t = material_Time + renderer_Time;
        float flow = input.uv.y - t * material_FlowSpeed;
        float smallRipple = sin(flow * 18.0 + input.uv.x * 7.0) * 0.5 + 0.5;
        float longRipple = sin(flow * 5.0 - input.uv.x * 4.0) * 0.5 + 0.5;
        float center = 1.0 - abs(input.uv.x - 0.5) * 2.0;
        float bank = 1.0 - smoothstep(0.0, 0.28, center);
        float foamLine = stripe(smallRipple, 0.72) * bank * material_FoamIntensity;
        float highlight = stripe(longRipple, 0.86) * center * 0.24;
        vec3 base = mix(material_BaseColor.rgb * 0.62, material_BaseColor.rgb * 1.18, center * material_Clarity);
        vec3 color = mix(base + highlight, material_FoamColor.rgb, clamp(foamLine, 0.0, 1.0));
        float alpha = mix(0.34, material_BaseColor.a, center) + foamLine * 0.28;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
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

export function updateRiverMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeed: number,
  time: number
): void {
  material.shaderData.setColor(
    RIVER_SHADER_PROPERTY.baseColor,
    hexToColor(config.baseColor, 0.74 + config.clarity * 0.18)
  );
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeed, flowSpeed);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.clarity, config.clarity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.time, time);
}
