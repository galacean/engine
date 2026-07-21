import { Material, Shader, type Engine } from "@galacean/engine";

const INTERACTIVE_POOL_RIPPLE_SHADER_NAME = "AIWorld/InteractivePoolRippleAccent";

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
      struct Attributes {
        vec4 POSITION;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec4 rippleColor;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.rippleColor = attr.COLOR_0;
        return output;
      }

      void frag(Varyings input) {
        float visibility = clamp(input.rippleColor.a, 0.0, 1.0);
        float accentAlpha = smoothstep(0.04, 0.55, visibility) * 0.68;
        gl_FragColor = vec4(input.rippleColor.rgb, accentAlpha);
      }
    }
  }
}`;

export function createInteractivePoolRippleMaterial(engine: Engine): Material {
  const shader = Shader.find(INTERACTIVE_POOL_RIPPLE_SHADER_NAME) ?? Shader.create(interactivePoolRippleShaderSource);
  const material = new Material(engine, shader);
  material.name = "InteractivePoolRippleAccentMaterial";
  material.isGCIgnored = true;
  return material;
}

export { interactivePoolRippleShaderSource };
