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
      // Offscreen BlendOperation.Max SDF field: R = nearField, G = glowField, B = tipField
      sampler2D material_StrokeMaskTexture;
      // xy = viewport rect size in CSS pixels, z = corner radius in CSS pixels, w = rim inset in CSS pixels
      vec4 material_ViewportRect;
      // x = overall opacity, y = hairline rim opacity, z = hint circle progress (0..1), w = hint alpha (0..1)
      vec4 material_MarkupParams;
      // x = elapsed seconds, y = hasStrokes (0 or 1), zw = reserved
      vec4 material_BrushParams;

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

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      // Apple Clean Up airy iridescent aura (linear space): vivid-yet-airy glacier cyan -> iris violet -> blossom pink -> opal aqua -> sky blue.
      // Pure white stays dominant in the brush body; these hues breathe along the outer feathered halo & subtle inner sheen.
      vec3 sampleApplePastelPalette(float t) {
        float phase = fract(t) * 5.0;
        vec3 c0 = vec3(0.05, 0.62, 1.00); // Glacier Cyan-Blue
        vec3 c1 = vec3(0.46, 0.22, 1.00); // Iris Violet
        vec3 c2 = vec3(0.98, 0.24, 0.66); // Airy Blossom Pink
        vec3 c3 = vec3(0.06, 0.88, 0.82); // Opal Mint Aqua
        vec3 c4 = vec3(0.18, 0.42, 1.00); // Luminous Periwinkle

        float f = fract(phase);
        float s = f * f * (3.0 - 2.0 * f);
        if (phase < 1.0) return mix(c0, c1, s);
        if (phase < 2.0) return mix(c1, c2, s);
        if (phase < 3.0) return mix(c2, c3, s);
        if (phase < 4.0) return mix(c3, c4, s);
        return mix(c4, c0, s);
      }

      vec3 appleIridescentSheen(vec2 p, vec2 rectSize, float time, float phaseShift, out float warpField) {
        float shortSide = max(min(rectSize.x, rectSize.y), 1.0);
        vec2 q = p / shortSide;
        float n1 = valueNoise(q * 2.3 + vec2(time * 0.22, -time * 0.16));
        float n2 = valueNoise(q * 4.5 - vec2(time * 0.17, time * 0.24) + vec2(n1 * 1.35, -n1 * 1.1));
        warpField = n1 * 0.65 + n2 * 0.35;
        float t = q.x * 0.62 - q.y * 0.48 + n1 * 0.45 + n2 * 0.25 - time * 0.15 + phaseShift;
        return sampleApplePastelPalette(t);
      }

      // Fine drifting pure-white micro-sparkles confined inside the frosted white brush trail.
      float sparkleLayer(vec2 p, float cellSize, float time, float seedOffset) {
        vec2 drifted = p + vec2(sin(time * 0.42 + seedOffset) * 2.0, time * 4.2);
        vec2 cell = floor(drifted / cellSize);
        vec2 local = fract(drifted / cellSize) - 0.5;
        vec2 rnd = hash22(cell + seedOffset);
        float present = step(0.45, rnd.x);
        vec2 starPos = (rnd - 0.5) * 0.56;
        vec2 diff = local - starPos;
        float r2 = dot(diff, diff);
        float dotGlow = exp(-r2 * 56.0);
        float twinklePhase = time * (2.5 + rnd.y * 3.0) + (rnd.x + rnd.y) * 19.7;
        float twinkle = pow(0.5 + 0.5 * sin(twinklePhase), 4.8);
        return present * dotGlow * twinkle;
      }

      vec3 screenBlend(vec3 base, vec3 light) {
        vec3 b = clamp(base, 0.0, 1.0);
        vec3 l = clamp(light, 0.0, 1.0);
        return 1.0 - (1.0 - b) * (1.0 - l);
      }

      // Shared Apple Clean Up luminous white brush shading with flowing pastel iridescent edge aura,
      // sky-contrast cradle, active fingertip pearl orb, and drifting micro-stardust.
      // Used identically by both freehand strokes (Pass 1 SDF RT) and the analytical onboarding hint circle.
      vec3 applyAppleBrushShading(
        vec3 color,
        vec2 p,
        vec2 rectSize,
        float time,
        float nearField,
        float glowField,
        float tipField
      ) {
        if (glowField <= 0.002) {
          return color;
        }
        float dNorm = (1.0 - nearField) * 2.6;
        float dGlow = (1.0 - glowField) * 6.8;

        float warp = 0.0;
        vec3 iridOuter = appleIridescentSheen(p, rectSize, time, 0.0, warp);
        vec3 iridInner = appleIridescentSheen(p, rectSize, time, 0.22, warp);

        float breath = 0.95 + 0.05 * sin(time * 2.1 + warp * 4.2);

        // Soft feathered profile:
        // - outerAura / edgeRing carry the shifting Apple Intelligence rainbow halo
        // - bodyMask / coreMask form the clean translucent frosted-white brush base
        float outerAura = exp(-max(0.0, dGlow - 0.82) * 0.62) * smoothstep(0.0, 0.12, glowField) * 0.46 * breath;
        float edgeRing = exp(-pow((dNorm - 1.16) * 1.25, 2.0)) * smoothstep(0.02, 0.16, glowField) * 0.70 * breath;
        float bodyMask = smoothstep(1.34, 0.42, dNorm) * smoothstep(0.02, 0.14, nearField);
        float coreMask = smoothstep(0.84, 0.08, dNorm) * smoothstep(0.02, 0.14, nearField);

        // Sky-contrast iridescent cradle: on bright sky/clouds, tint the feathered edge gently with the flowing
        // cyan/violet/pink aura so the white brush ribbon floats crisply even across sunlit white clouds.
        float bgLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        float brightBg = smoothstep(0.24, 0.84, bgLuma);
        float haloTintMask = clamp(edgeRing * 0.88 + outerAura * 0.95, 0.0, 1.0) * brightBg;
        vec3 brightHaloTint = mix(color * 0.78, iridOuter * 0.92, 0.56);
        color = mix(color, brightHaloTint, haloTintMask * 0.62);

        // Translucent luminous white base body with just a delicate opalescent sheen (true Apple Clean Up white base).
        vec3 whiteBase = mix(vec3(0.990, 0.993, 1.000), iridInner, 0.14);
        float bodyAlpha = bodyMask * mix(0.58, 0.48, brightBg);
        color = mix(color, whiteBase, bodyAlpha);

        // Iridescent outer glow + luminous white-pearl fingertip orb via Screen blend.
        vec3 tipLight = mix(vec3(1.0, 0.996, 1.0), iridInner, 0.30) * (tipField * tipField * 0.72);
        vec3 glowLight = iridOuter * outerAura + mix(iridInner, vec3(1.0), 0.22) * (edgeRing * 0.58) + tipLight;
        color = screenBlend(color, glowLight);

        // Silky pure-white luminous core along the center of the stroke.
        vec3 coreWhite = mix(vec3(1.0, 0.998, 1.0), iridInner, 0.06);
        float coreMix = clamp(coreMask * 0.62 + tipField * coreMask * 0.22, 0.0, 0.86);
        color = mix(color, coreWhite, coreMix);

        // Fine drifting pure-white stardust sparkles inside the brush trail.
        float sparkleRegion = clamp(bodyMask * 0.95 + edgeRing * 0.68, 0.0, 1.0);
        float s1 = sparkleLayer(p, 13.0, time, 1.7);
        float s2 = sparkleLayer(p * 1.15 + vec2(37.0, -19.0), 21.0, time * 0.82, 9.3);
        float sparkleIntensity = (s1 * 0.95 + s2 * 0.75) * sparkleRegion * (1.0 + tipField * 0.85);
        vec3 sparkleColor = mix(vec3(1.0), iridOuter, 0.22);
        color = screenBlend(color, sparkleColor * (sparkleIntensity * 0.98));

        return color;
      }

      void frag(Varyings v) {
        vec2 rectSize = max(material_ViewportRect.xy, vec2(2.0));
        float cornerRadius = material_ViewportRect.z;
        float rimInset = material_ViewportRect.w;

        float opacity = clamp(material_MarkupParams.x, 0.0, 1.0);
        float rimOpacity = clamp(material_MarkupParams.y, 0.0, 1.0);
        float hintProgress = clamp(material_MarkupParams.z, 0.0, 1.0);
        float hintAlpha = clamp(material_MarkupParams.w, 0.0, 1.0);

        float time = material_BrushParams.x;
        float hasStrokes = material_BrushParams.y;

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

        // 2. Apple Clean Up luminous white brush with delicate iridescent edge aura & stardust (zero self-overlap knots).
        if (hasStrokes > 0.5) {
          vec4 field = texture2D(material_StrokeMaskTexture, v.v_uv);
          color = applyAppleBrushShading(color, p, rectSize, time, field.r, field.g, field.b);
        }

        // 3. Ultra-fine frosted-white hairline right along the rounded border (zero dark shadow bar).
        if (rimOpacity > 0.002) {
          vec2 rimHalf = max(halfSize - vec2(rimInset), vec2(2.0));
          float dRim = sdRoundedBox(p, rimHalf, cornerRadius);
          float rimHalfWidth = rimInset > 0.5 ? 0.85 : 0.68;
          float rimMask = 1.0 - smoothstep(rimHalfWidth - aa, rimHalfWidth + aa, abs(dRim + rimHalfWidth));
          color = mix(color, vec3(1.0), rimMask * 0.46 * rimOpacity);
        }

        // 4. Onboarding circle rendered through the exact same SDF field encoding and applyAppleBrushShading()
        //    as freehand strokes, so width, rounded caps, frosted white core, rainbow aura, tip orb, and stardust match 1:1.
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

          // Clockwise arc sweep from upper-left (2.15 rad) with true rounded capsule start/tip end-caps.
          float startAngle = 2.15;
          float twoPi = 6.2831853;
          float totalArc = twoPi * 1.02;
          float drawnArc = hintProgress * totalArc;
          float ang = mod(startAngle - theta, twoPi);

          float startWobble = 1.0 + 0.036 * sin(startAngle * 2.0 + 0.65) + 0.018 * cos(startAngle * 3.0 - 0.3);
          vec2 startQ = vec2(cos(startAngle) * rx, sin(startAngle) * ry) * startWobble;
          float dStart = length(q - startQ);

          float tipTheta = startAngle - drawnArc;
          float tipWobble = 1.0 + 0.036 * sin(tipTheta * 2.0 + 0.65) + 0.018 * cos(tipTheta * 3.0 - 0.3);
          vec2 tipQ = vec2(cos(tipTheta) * rx, sin(tipTheta) * ry) * tipWobble;
          float dTip = length(q - tipQ);

          bool insideDrawnArc = (drawnArc >= twoPi) || (ang <= drawnArc);
          float curveDist = insideDrawnArc ? dist : min(dTip, dStart);

          // Match buildStrokeCapsuleSegments() visual core radius in CSS pixels (3.0px logical width * 2.15 = 6.45px).
          float shortSide = max(min(rectSize.x, rectSize.y), 1.0);
          float baseRadius = clamp(6.45, shortSide * 0.0085, shortSide * 0.024);

          // Match SeedWorldStrokeSmoothing start/end tapering & active tip liquid swell.
          float tipActive = (1.0 - smoothstep(0.90, 1.0, hintProgress)) * smoothstep(0.0, 0.05, hintProgress);
          float effectiveAng = insideDrawnArc ? ang : (dTip <= dStart ? drawnArc : 0.0);
          float angFromTip = max(0.0, drawnArc - effectiveAng);
          float startFactor = (drawnArc >= twoPi) ? 1.0 : (0.78 + 0.22 * smoothstep(0.0, 0.32, effectiveAng));
          float endFactor = mix(
            0.84 + 0.16 * smoothstep(0.0, 0.32, angFromTip),
            1.0 + 0.10 * (1.0 - smoothstep(0.0, 0.32, angFromTip)),
            tipActive
          );
          float localRadius = baseRadius * startFactor * endFactor;

          // Synthesize the exact same (nearField, glowField, tipField) channels as MarkupStrokeField.shader.
          float dNorm = curveDist / max(localRadius, 0.5);
          float hintNearField = clamp(1.0 - dNorm / 2.6, 0.0, 1.0);
          float hintGlowField = clamp(1.0 - dNorm / 6.8, 0.0, 1.0);
          float tipWeight = tipActive * smoothstep(0.85, 0.0, angFromTip);
          float hintTipField = tipWeight * clamp(1.0 - dNorm / 4.4, 0.0, 1.0);

          if (hintGlowField > 0.002) {
            vec3 hintShaded = applyAppleBrushShading(
              color,
              p,
              rectSize,
              time,
              hintNearField,
              hintGlowField,
              hintTipField
            );
            color = mix(color, hintShaded, hintAlpha);
          }
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
