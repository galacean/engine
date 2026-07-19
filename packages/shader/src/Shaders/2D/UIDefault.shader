Shader "2D/UIDefault" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorBlendOperation = BlendOperation.Add;
        AlphaBlendOperation = BlendOperation.Add;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;
      sampler2D renderer_UITexture;
      vec4 renderer_UIRectClipRect;
      float renderer_UIRectClipEnabled;
      vec4 renderer_UIRectClipSoftness;
      float renderer_UIRectClipHardClip;

      struct Attributes {
          vec3 POSITION;
          vec2 TEXCOORD_0;
          vec4 COLOR_0;
      };

      struct Varyings {
          vec2 v_uv;
          vec4 v_color;
          vec2 v_worldPosition;
      };

      Varyings vert(Attributes attr) {
          Varyings v;

          gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
          v.v_uv = attr.TEXCOORD_0;
          v.v_color = attr.COLOR_0;
          v.v_worldPosition = attr.POSITION.xy;

          return v;
      }

      float getUIRectClipAlpha(Varyings v) {
          vec4 edgeDistance = vec4(
              v.v_worldPosition.x - renderer_UIRectClipRect.x,
              v.v_worldPosition.y - renderer_UIRectClipRect.y,
              renderer_UIRectClipRect.z - v.v_worldPosition.x,
              renderer_UIRectClipRect.w - v.v_worldPosition.y
          );
          vec4 hardClipFactor = step(vec4(0.0), edgeDistance);
          vec4 softness = max(renderer_UIRectClipSoftness, vec4(1e-5));
          vec4 softClipFactor = clamp(edgeDistance / softness, 0.0, 1.0);
          vec4 useSoftness = step(vec4(1e-5), renderer_UIRectClipSoftness);
          vec4 clipFactor = mix(hardClipFactor, softClipFactor, useSoftness);
          return clipFactor.x * clipFactor.y * clipFactor.z * clipFactor.w;
      }

      void frag(Varyings v) {
          vec4 baseColor = texture2DSRGB(renderer_UITexture, v.v_uv);
          vec4 finalColor = baseColor * v.v_color;
          if (renderer_UIRectClipEnabled > 0.5) {
              finalColor.a *= getUIRectClipAlpha(v);
              if (renderer_UIRectClipHardClip > 0.5 && finalColor.a < 0.001) {
                  discard;
              }
          }

          #ifdef ENGINE_SHOULD_SRGB_CORRECT
              finalColor = outputSRGBCorrection(finalColor);
          #endif

          gl_FragColor = finalColor;
      }
    }
  }
}
