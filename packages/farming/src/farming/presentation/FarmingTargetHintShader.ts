/** A single native UI quad; progress changes only a uniform, never a texture or mesh. */
export const FARM_TARGET_HINT_SHADER = `Shader "Farming/TargetHint" {
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
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      mat4 renderer_MVPMat;
      float material_Progress;
      vec4 material_ProgressColor;
      struct Attributes { vec3 POSITION; vec2 TEXCOORD_0; vec4 COLOR_0; };
      struct Varyings { vec2 v_uv; vec4 v_color; };
      Varyings vert(Attributes a) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(a.POSITION, 1.0);
        v.v_uv = a.TEXCOORD_0;
        v.v_color = a.COLOR_0;
        return v;
      }
      void frag(Varyings v) {
        vec2 p = (v.v_uv - 0.5) * 24.0;
        float radius = length(p);
        // Sprite UVs have their origin at the top left: clockwise from twelve o'clock.
        float angle = mod(atan(p.x, -p.y) + 6.2831853, 6.2831853) / 6.2831853;
        float sector = material_Progress > 0.0 && angle < material_Progress ? 1.0 : 0.0;
        float dot = 1.0 - smoothstep(1.4, 2.1, radius);
        float edge = 1.0 - smoothstep(2.2, 3.0, radius);
        float ring = (1.0 - smoothstep(0.45, 1.1, abs(radius - 9.0))) * sector;
        float shadow = (1.0 - smoothstep(1.2, 2.0, abs(radius - 9.0))) * sector;
        float alpha = max(edge, shadow);
        vec3 ink = vec3(0.025, 0.038, 0.025);
        vec3 color = mix(ink, v.v_color.rgb, dot);
        color = mix(color, material_ProgressColor.rgb, ring);
        vec4 result = vec4(color, alpha * v.v_color.a);
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          result = outputSRGBCorrection(result);
        #endif
        gl_FragColor = result;
      }
    }
  }
}`;
