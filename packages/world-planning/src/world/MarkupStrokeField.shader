Shader "SeedWorld/MarkupStrokeFieldV1" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.One;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.One;
        ColorBlendOperation = BlendOperation.Max;
        AlphaBlendOperation = BlendOperation.Max;
      }
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;

      struct Attributes {
        vec3 POSITION;
        // Local capsule coordinates normalized by start radius: (u / r0, v / r0)
        vec2 TEXCOORD_0;
        // (segLen / r0, r1 / r0)
        vec2 TEXCOORD_1;
        // (tipStart, tipEnd, 0, arcProgress) all in [0, 1]
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_local;
        vec2 v_seg;
        vec4 v_meta;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_local = attr.TEXCOORD_0;
        v.v_seg = attr.TEXCOORD_1;
        v.v_meta = attr.COLOR_0;
        return v;
      }

      void frag(Varyings v) {
        float segLen = max(v.v_seg.x, 0.0);
        float rRatio = max(v.v_seg.y, 0.05);
        float t = segLen > 1e-4 ? clamp(v.v_local.x / segLen, 0.0, 1.0) : 0.0;
        vec2 delta = v.v_local - vec2(t * segLen, 0.0);
        float dInR0 = length(delta);
        float localRadiusInR0 = mix(1.0, rRatio, t);
        float dNorm = dInR0 / localRadiusInR0;

        // Glow envelope extends to 6.8x core radius; discard outside to save fillrate.
        float glowField = clamp(1.0 - dNorm / 6.8, 0.0, 1.0);
        if (glowField <= 0.001) {
          discard;
        }

        // High-precision near field [0..2.6x core radius] keeps ribbon core crisp and alias-free.
        float nearField = clamp(1.0 - dNorm / 2.6, 0.0, 1.0);
        // Active pen-tip liquid glow energy (0 when idle, smooth 0..1 near moving fingertip).
        float tipWeight = mix(v.v_meta.x, v.v_meta.y, t);
        float tipField = tipWeight * clamp(1.0 - dNorm / 4.4, 0.0, 1.0);

        // Written linearly under BlendOperation.Max -> exact multi-stroke union SDF (zero self-overlap knots).
        gl_FragColor = vec4(nearField, glowField, tipField, 1.0);
      }
    }
  }
}
