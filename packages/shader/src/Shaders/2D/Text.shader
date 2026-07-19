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

      mat4 renderer_MVPMat;
      sampler2D renderElement_TextTexture;
      vec2 renderElement_TextTextureSize;
      vec4 renderer_OutlineColor;
      float renderer_OutlineWidth;
      vec4 renderer_UIRectClipRect;
      float renderer_UIRectClipEnabled;
      vec4 renderer_UIRectClipSoftness;
      float renderer_UIRectClipHardClip;

      v2f TextVertex(a2v attr) {
        v2f v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        v.v_worldPosition = attr.POSITION.xy;
        return v;
      }

      float getUIRectClipAlpha(v2f v) {
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

      float sampleCoverage(vec2 uv) {
        vec4 texColor = texture2D(renderElement_TextTexture, uv);
        #ifdef GRAPHICS_API_WEBGL2
          return texColor.r;
        #else
          return texColor.a;
        #endif
      }

      void TextFragment(v2f v) {
        float coverage = sampleCoverage(v.v_uv);
        vec4 finalColor;
        if (renderer_OutlineWidth > 0.0) {
          vec2 texelSize = 1.0 / renderElement_TextTextureSize;
          vec2 outlineStep = texelSize * renderer_OutlineWidth;
          float outlineCoverage = coverage;
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2( outlineStep.x,  0.0)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2(-outlineStep.x,  0.0)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2( 0.0,  outlineStep.y)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2( 0.0, -outlineStep.y)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2( outlineStep.x * 0.7071,  outlineStep.y * 0.7071)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2(-outlineStep.x * 0.7071,  outlineStep.y * 0.7071)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2( outlineStep.x * 0.7071, -outlineStep.y * 0.7071)));
          outlineCoverage = max(outlineCoverage, sampleCoverage(v.v_uv + vec2(-outlineStep.x * 0.7071, -outlineStep.y * 0.7071)));

          vec3 rgb = mix(renderer_OutlineColor.rgb, v.v_color.rgb, coverage);
          float alpha = max(coverage, outlineCoverage * renderer_OutlineColor.a) * v.v_color.a;
          finalColor = vec4(rgb, alpha);
        } else {
          finalColor = vec4(v.v_color.rgb, v.v_color.a * coverage);
        }
        if (renderer_UIRectClipEnabled > 0.5) {
          finalColor.a *= getUIRectClipAlpha(v);
          if (renderer_UIRectClipHardClip > 0.5 && finalColor.a < 0.001) {
            discard;
          }
        }
        gl_FragColor = finalColor;
      }
    }
  }
}
