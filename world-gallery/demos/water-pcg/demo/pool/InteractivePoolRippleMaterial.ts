import { Material, Shader, Vector4, type Engine, type Texture2D } from "@galacean/engine";
import type { PoolLocalEffectsDebugView } from "./PoolP1ShowcaseConfig";

const INTERACTIVE_POOL_RIPPLE_SHADER_NAME = "AIWorld/InteractivePoolRippleAccent";
const TEMPORAL_FOAM_TEXTURE = "material_TemporalFoamTexture";
const TEMPORAL_FOAM_REGION = "material_TemporalFoamRegion";
const TEMPORAL_FOAM_ENABLED = "material_TemporalFoamEnabled";
const TEMPORAL_FOAM_DEBUG_VIEW = "material_TemporalFoamDebugView";

export interface InteractivePoolTemporalFoamRegion {
  readonly minX: number;
  readonly minZ: number;
  readonly inverseSizeX: number;
  readonly inverseSizeZ: number;
}

const interactivePoolRippleShaderSource = `
Shader "${INTERACTIVE_POOL_RIPPLE_SHADER_NAME}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState rippleBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }

      DepthState rippleDepthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }

      RasterState rippleRasterState {
        CullMode = CullMode.Off;
      }

      BlendState = rippleBlendState;
      DepthState = rippleDepthState;
      RasterState = rippleRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      sampler2D material_TemporalFoamTexture;
      vec4 material_TemporalFoamRegion;
      float material_TemporalFoamEnabled;
      float material_TemporalFoamDebugView;

      struct Attributes {
        vec4 POSITION;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec4 rippleColor;
        vec2 temporalFoamUv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.rippleColor = attr.COLOR_0;
        output.temporalFoamUv =
          (attr.POSITION.xz - material_TemporalFoamRegion.xy) * material_TemporalFoamRegion.zw;
        return output;
      }

      void frag(Varyings input) {
        float visibility = clamp(input.rippleColor.a, 0.0, 1.0);
        vec2 uv = input.temporalFoamUv;
        float inside =
          step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float temporalFoam =
          texture2D(material_TemporalFoamTexture, clamp(uv, vec2(0.0), vec2(1.0))).r *
          inside * material_TemporalFoamEnabled;
        float accentAlpha = smoothstep(0.04, 0.55, visibility) * 0.68;
        vec3 accentColor = input.rippleColor.rgb;

        if (material_TemporalFoamDebugView > 1.5) {
          accentColor = mix(vec3(0.025, 0.07, 0.09), vec3(0.18, 0.9, 1.0), temporalFoam);
          accentAlpha = max(0.12, temporalFoam * 0.9);
        } else if (material_TemporalFoamDebugView > 0.5) {
          accentColor = mix(vec3(0.08, 0.035, 0.015), vec3(1.0, 0.48, 0.08), temporalFoam);
          accentAlpha = max(0.12, temporalFoam * 0.94);
        } else {
          accentColor = mix(accentColor, vec3(0.92, 1.0, 0.98), temporalFoam);
          accentAlpha = max(accentAlpha, smoothstep(0.04, 0.72, temporalFoam) * 0.82);
        }
        gl_FragColor = vec4(accentColor, accentAlpha);
      }
    }
  }
}`;

export function createInteractivePoolRippleMaterial(engine: Engine): Material {
  const shader = Shader.find(INTERACTIVE_POOL_RIPPLE_SHADER_NAME) ?? Shader.create(interactivePoolRippleShaderSource);
  const material = new Material(engine, shader);
  material.name = "InteractivePoolRippleAccentMaterial";
  material.isGCIgnored = true;
  material.shaderData.setVector4(TEMPORAL_FOAM_REGION, new Vector4(0, 0, 1, 1));
  material.shaderData.setFloat(TEMPORAL_FOAM_ENABLED, 0);
  material.shaderData.setFloat(TEMPORAL_FOAM_DEBUG_VIEW, 0);
  return material;
}

export function configureInteractivePoolTemporalFoamRegion(
  material: Material,
  region: InteractivePoolTemporalFoamRegion
): void {
  material.shaderData.setVector4(
    TEMPORAL_FOAM_REGION,
    new Vector4(region.minX, region.minZ, region.inverseSizeX, region.inverseSizeZ)
  );
}

export function setInteractivePoolTemporalFoamTexture(
  material: Material,
  texture: Texture2D | null,
  enabled: boolean,
  debugView: PoolLocalEffectsDebugView
): void {
  if (texture) material.shaderData.setTexture(TEMPORAL_FOAM_TEXTURE, texture);
  material.shaderData.setFloat(TEMPORAL_FOAM_ENABLED, enabled && texture ? 1 : 0);
  material.shaderData.setFloat(TEMPORAL_FOAM_DEBUG_VIEW, debugView === "source" ? 1 : debugView === "history" ? 2 : 0);
}

export { interactivePoolRippleShaderSource };
