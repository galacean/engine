Shader "SeedWorld/VoiceOrbDisplayV1" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorBlendOperation = BlendOperation.Add;
        AlphaBlendOperation = BlendOperation.Add;
      }
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;
      mediump sampler2D renderer_UITexture;
      // Per-axis quad expansion in canvas pixels (basePixelSize * (scale - 1.0)) so idle breathing
      // and press expansion animate strictly on the GPU without mutating UITransform / chunkUI VBO.
      float material_OrbScaleExpandPixels;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_uv;
        vec4 v_color;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        vec3 pos = attr.POSITION;
        pos.xy += vec2(attr.TEXCOORD_0.x - 0.5, 0.5 - attr.TEXCOORD_0.y) * material_OrbScaleExpandPixels;
        gl_Position = renderer_MVPMat * vec4(pos, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      void frag(Varyings v) {
        mediump vec4 premul = texture2D(renderer_UITexture, v.v_uv);
        if (premul.a <= 0.002) discard;

        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          mediump vec4 finalColor = vec4(premul.rgb * v.v_color.rgb * v.v_color.a, premul.a * v.v_color.a);
        #else
          mediump vec3 straightSrgb = clamp(premul.rgb / max(premul.a, 0.0001), 0.0, 1.0);
          mediump vec3 linearRgb = sRGBToLinear(vec4(straightSrgb, 1.0)).rgb * v.v_color.rgb;
          mediump float outAlpha = premul.a * v.v_color.a;
          mediump vec4 finalColor = vec4(linearRgb * outAlpha, outAlpha);
        #endif
        gl_FragColor = finalColor;
      }
    }
  }
}
