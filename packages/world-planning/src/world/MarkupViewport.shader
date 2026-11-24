Shader "SeedWorld/MarkupViewportV1" {
  SubShader "Default" {
    Pass "Forward" {
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
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;
      sampler2D material_BaseTexture;
      // xy = viewport rect size in CSS pixels, z = corner radius in CSS pixels, w = rim inset in CSS pixels
      vec4 material_ViewportRect;
      // x = overall opacity, y = hairline rim opacity, z = hint circle progress (0..1), w = hint alpha (0..1)
      vec4 material_MarkupParams;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 v_uv;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        return v;
      }

      float sdRoundedBox(vec2 p, vec2 halfSize, float radius) {
        float r = clamp(radius, 0.0, min(halfSize.x, halfSize.y));
        vec2 q = abs(p) - (halfSize - vec2(r));
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      void frag(Varyings v) {
        vec2 rectSize = max(material_ViewportRect.xy, vec2(2.0));
        float cornerRadius = material_ViewportRect.z;
        float rimInset = material_ViewportRect.w;

        float opacity = clamp(material_MarkupParams.x, 0.0, 1.0);
        float rimOpacity = clamp(material_MarkupParams.y, 0.0, 1.0);
        float hintProgress = clamp(material_MarkupParams.z, 0.0, 1.0);
        float hintAlpha = clamp(material_MarkupParams.w, 0.0, 1.0);

        // Exact pixel coordinates centered at (0, 0), +Y up.
        vec2 p = vec2(v.v_uv.x - 0.5, 0.5 - v.v_uv.y) * rectSize;
        vec2 halfSize = rectSize * 0.5;

        // 1. Sub-pixel anti-aliased rounded viewport clip mask (sharp 0px -> smooth 20px+).
        float outerRadius = rimInset > 0.5 ? 0.0 : cornerRadius;
        float dOuter = sdRoundedBox(p, halfSize, outerRadius);
        float aa = 0.85;
        float fillMask = 1.0 - smoothstep(-aa, aa, dOuter);
        if (fillMask <= 0.001 || opacity <= 0.001) {
          discard;
        }

        // Sample the frozen screenshot texture (hardware sRGB -> linear when sRGB texture).
        vec3 color = texture2D(material_BaseTexture, v.v_uv).rgb;

        // 2. Ultra-fine frosted-white hairline right along the rounded border (zero dark shadow bar).
        if (rimOpacity > 0.002) {
          vec2 rimHalf = max(halfSize - vec2(rimInset), vec2(2.0));
          float dRim = sdRoundedBox(p, rimHalf, cornerRadius);
          float rimHalfWidth = rimInset > 0.5 ? 0.85 : 0.68;
          float rimMask = 1.0 - smoothstep(rimHalfWidth - aa, rimHalfWidth + aa, abs(dRim + rimHalfWidth));
          color = mix(color, vec3(1.0), rimMask * 0.46 * rimOpacity);
        }

        // 3. Analytical pixel-perfect glowing highlight circle for first-time onboarding (zero jaggies).
        if (hintAlpha > 0.002 && hintProgress > 0.005) {
          vec2 center = vec2(0.0, rectSize.y * 0.02);
          vec2 rel = p - center;
          // Gentle organic tilt (-8 deg)
          float cosT = 0.990268;
          float sinT = 0.139173;
          vec2 q = vec2(rel.x * cosT - rel.y * sinT, rel.x * sinT + rel.y * cosT);

          float rx = max(rectSize.x * 0.148, 24.0);
          float ry = max(rectSize.y * 0.215, 24.0);
          vec2 u = vec2(q.x / rx, q.y / ry);
          float uLen = max(length(u), 1e-4);
          float theta = atan(u.y, u.x);

          // Subtle organic hand-drawn wobble so it feels like a graceful human circle
          float wobble = 1.0 + 0.036 * sin(theta * 2.0 + 0.65) + 0.018 * cos(theta * 3.0 - 0.3);
          vec2 grad = vec2(u.x / rx, u.y / ry) / uLen;
          float dist = abs(uLen - wobble) / max(length(grad), 1e-4);

          // Clockwise arc sweep from upper-left (-2.15 rad) with smooth leading tip
          float startAngle = 2.15;
          float twoPi = 6.2831853;
          float totalArc = twoPi * 1.02;
          float drawnArc = hintProgress * totalArc;
          float ang = mod(startAngle - theta, twoPi);
          float arcMask = 1.0 - smoothstep(drawnArc - 0.16, drawnArc + 0.05, ang);
          // Handle slight closure overlap past 2*pi seamlessly
          if (drawnArc > twoPi && ang < drawnArc - twoPi) {
            arcMask = 1.0;
          }
          // Soft taper at start so tail doesn't look bluntly chopped
          float tailFade = smoothstep(0.0, 0.10, ang + (drawnArc > twoPi ? 1.0 : 0.0));
          float strokeVis = arcMask * tailFade;

          // Multi-layer silky optical glow (wide soft coral aura + tight vivid red halo + crisp luminous core)
          float wideAura = exp(-dist * 0.075) * 0.34;
          float midHalo = exp(-dist * 0.24) * 0.72;
          float crispCore = 1.0 - smoothstep(1.15, 2.35, dist);

          vec3 glowColor = vec3(1.0, 0.055, 0.04) * wideAura + vec3(1.0, 0.10, 0.07) * midHalo;
          vec3 coreColor = vec3(1.0, 0.78, 0.74);

          // Leading luminous pen-tip spark while actively tracing
          float tipVis = (1.0 - smoothstep(0.92, 1.0, hintProgress)) * smoothstep(0.0, 0.06, hintProgress);
          float tipGlow = 0.0;
          if (tipVis > 0.002) {
            float tipTheta = startAngle - drawnArc;
            float tipWobble = 1.0 + 0.036 * sin(tipTheta * 2.0 + 0.65) + 0.018 * cos(tipTheta * 3.0 - 0.3);
            vec2 tipQ = vec2(cos(tipTheta) * rx, sin(tipTheta) * ry) * tipWobble;
            float tipDist = length(q - tipQ);
            tipGlow = (exp(-tipDist * 0.13) * 0.9 + (1.0 - smoothstep(1.8, 4.2, tipDist)) * 0.85) * tipVis;
          }

          float h = hintAlpha;
          // Screen-like luminous blend so the glow stays vibrant over both bright sky and dark grass
          vec3 addedLight = (glowColor * strokeVis + vec3(1.0, 0.38, 0.30) * tipGlow) * h;
          color = 1.0 - (1.0 - clamp(color, 0.0, 1.0)) * (1.0 - clamp(addedLight, 0.0, 1.0));
          color = mix(color, coreColor, clamp((crispCore * strokeVis * 0.92 + tipGlow * 0.45) * h, 0.0, 1.0));
        }

        vec4 finalColor = vec4(color, fillMask * opacity);
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          finalColor = outputSRGBCorrection(finalColor);
        #endif
        gl_FragColor = finalColor;
      }
    }
  }
}
