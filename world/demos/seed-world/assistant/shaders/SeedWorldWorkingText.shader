
Shader "SeedWorld/WorkingTextV1" {
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
      DepthState = { WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      mat4 renderer_MVPMat;
      mat4 material_SeedWorldTextClipMatrix;
      vec4 material_SeedWorldTextClipBounds;
      sampler2D renderElement_TextTexture;
      float material_SeedWorldWorking;
      float material_SeedWorldWorkingTime;
      float material_SeedWorldPanelLeftUv;
      float material_SeedWorldPanelWidthUv;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_clipPosition;
        vec2 v_uv;
        vec4 v_color;
        float v_screenX;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        vec4 clipPosition = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        gl_Position = clipPosition;
        v.v_clipPosition = (material_SeedWorldTextClipMatrix * vec4(attr.POSITION, 1.0)).xy;
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        v.v_screenX = clipPosition.x / max(clipPosition.w, 0.0001) * 0.5 + 0.5;
        return v;
      }

      void frag(Varyings v) {
        if (v.v_clipPosition.x < material_SeedWorldTextClipBounds.x || v.v_clipPosition.y < material_SeedWorldTextClipBounds.y ||
            v.v_clipPosition.x > material_SeedWorldTextClipBounds.z || v.v_clipPosition.y > material_SeedWorldTextClipBounds.w) discard;
        vec4 texColor = texture2D(renderElement_TextTexture, v.v_uv);
        #ifdef GRAPHICS_API_WEBGL2
          float coverage = texColor.r;
        #else
          float coverage = texColor.a;
        #endif

        float sweepOpacity = 1.0;
        if (material_SeedWorldWorking > 0.5) {
          float panelX = (v.v_screenX - material_SeedWorldPanelLeftUv) / max(material_SeedWorldPanelWidthUv, 0.0001);
          float sweepCenter = mod(material_SeedWorldWorkingTime * 0.48, 1.6) - 0.3;
          float distanceToSweep = abs(panelX - sweepCenter);
          float transparentBand = 1.0 - smoothstep(0.0, 0.15, distanceToSweep);
          sweepOpacity = 1.0 - transparentBand;
        }

        gl_FragColor = vec4(v.v_color.rgb, v.v_color.a * coverage * sweepOpacity);
      }
    }
  }
}
