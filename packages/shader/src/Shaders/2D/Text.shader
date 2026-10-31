Shader "2D/Text" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      VertexShader = TextVertex;
      FragmentShader = TextFragment;

      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct v2f {
        vec2 v_uv;
        vec4 v_color;
        vec2 v_worldPosition;
      };

      vec4 renderer_UIRectClipRect;
      float renderer_UIRectClipEnabled;
      vec4 renderer_UIRectClipSoftness;
      float renderer_UIRectClipHardClip;

      float getUIRectClipAlpha(vec2 worldPosition)
      {
        vec4 edgeDistance = vec4(
          worldPosition.x - renderer_UIRectClipRect.x,
          worldPosition.y - renderer_UIRectClipRect.y,
          renderer_UIRectClipRect.z - worldPosition.x,
          renderer_UIRectClipRect.w - worldPosition.y
        );
        vec4 hardClipFactor = step(vec4(0.0), edgeDistance);
        vec4 softness = max(renderer_UIRectClipSoftness, vec4(1e-5));
        vec4 softClipFactor = clamp(edgeDistance / softness, 0.0, 1.0);
        vec4 useSoftness = step(vec4(1e-5), renderer_UIRectClipSoftness);
        vec4 clipFactor = mix(hardClipFactor, softClipFactor, useSoftness);
        return clipFactor.x * clipFactor.y * clipFactor.z * clipFactor.w;
      }

      mat4 renderer_MVPMat;
      sampler2D renderElement_TextTexture;

      v2f TextVertex(a2v attr) {
        v2f v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        v.v_worldPosition = attr.POSITION.xy;
        return v;
      }

      void TextFragment(v2f v) {
        vec4 texColor = texture2D(renderElement_TextTexture, v.v_uv);
        #ifdef GRAPHICS_API_WEBGL2
          float coverage = texColor.r;
        #else
          float coverage = texColor.a;
        #endif
        vec4 finalColor = vec4(v.v_color.rgb, v.v_color.a * coverage);
        if (renderer_UIRectClipEnabled > 0.5) {
          finalColor.a *= getUIRectClipAlpha(v.v_worldPosition);
          if (renderer_UIRectClipHardClip > 0.5 && finalColor.a < 0.001) {
            discard;
          }
        }

        gl_FragColor = finalColor;
      }
    }
  }
}
