
Shader "SeedWorld/VoiceOrbV5" {
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
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;
      sampler2D renderer_UITexture;
      float material_Time;
      float material_Listening;

      // Tunable pastel iridescent palette stops (sRGB)
      vec4 material_OrbCyan;
      vec4 material_OrbAzure;
      vec4 material_OrbViolet;
      vec4 material_OrbOrchid;
      vec4 material_OrbRose;
      vec4 material_OrbCore;

      // Motion & geometry: x = flowSpeed, y = swayAmp, z = domeWarp (optical magnification), w = ribbonWidthScale
      vec4 material_OrbMotion;
      // Shell shading: x = washStrength (frosted scatter), y = overlapGlow (pearl core), z = crestStrength (fold sharpness), w = waveFreq
      vec4 material_OrbRibbon;
      // Dispersion: x = baseDisp, y = radialDisp, z = tangTwist
      vec4 material_OrbDisp;
      // Tone & alpha: x = intensity, y = saturation, z = opacity, w = centerClear
      vec4 material_OrbTone;
      // Rim & highlight: x = rimStrength, y = rimWidth, z = topGlint, w = rimIridescence
      vec4 material_OrbRim;
      // Outer frosted pearl glass wall thickness (fraction of sphere radius)
      float material_OrbShellThickness;

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
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      mat3 orbRotX(float a) {
        float c = cos(a);
        float s = sin(a);
        return mat3(
          1.0, 0.0, 0.0,
          0.0,   c,  -s,
          0.0,   s,   c
        );
      }

      mat3 orbRotY(float a) {
        float c = cos(a);
        float s = sin(a);
        return mat3(
            c, 0.0,   s,
          0.0, 1.0, 0.0,
           -s, 0.0,   c
        );
      }

      mat3 orbRotZ(float a) {
        float c = cos(a);
        float s = sin(a);
        return mat3(
            c,  -s, 0.0,
            s,   c, 0.0,
          0.0, 0.0, 1.0
        );
      }

      void blendOver(inout vec3 dstRgb, inout float dstA, vec3 srcRgb, float srcA) {
        if (srcA <= 0.0005) return;
        float outA = srcA + dstA * (1.0 - srcA);
        dstRgb = (srcRgb * srcA + dstRgb * dstA * (1.0 - srcA)) / max(outA, 0.0001);
        dstA = outA;
      }

      // Seamless, pinch-free cyclic pastel aurora palette weighted to Dribbble's exact visual balance:
      // Broad luminous Cyan-Aqua -> Periwinkle/Cobalt -> Electric Violet -> Orchid/Rose -> Airy Aqua -> Cyan.
      vec3 evalAuroraSpectrum(
        float phase,
        vec3 cCyan,
        vec3 cAzure,
        vec3 cViolet,
        vec3 cOrchid,
        vec3 cRose,
        vec3 cCore
      ) {
        float u = fract(phase);
        vec3 cAqua = mix(cCyan, cCore, 0.18);
        if (u < 0.38) {
          float k = smoothstep(0.0, 0.38, u);
          return mix(cCyan, cAzure, k * 0.55);
        } else if (u < 0.54) {
          float k = smoothstep(0.38, 0.54, u);
          return mix(mix(cCyan, cAzure, 0.55), cViolet, k);
        } else if (u < 0.68) {
          float k = smoothstep(0.54, 0.68, u);
          return mix(cViolet, cOrchid, k);
        } else if (u < 0.82) {
          float k = smoothstep(0.68, 0.82, u);
          return mix(cOrchid, cRose, k);
        } else if (u < 0.91) {
          float k = smoothstep(0.82, 0.91, u);
          return mix(cRose, cAqua, k);
        } else {
          float k = smoothstep(0.91, 1.0, u);
          return mix(cAqua, cCyan, k);
        }
      }

      // Evaluates one 3D curved concentric silk ribbon shell inside the sphere.
      // Tight glossy core ridge + broad airbrushed scatter creates Dribbble's layered curved silk folds!
      float evalCurvedSilkRibbon(
        vec3 qR,
        float radius,
        float radialThick,
        float beltWidth,
        float waveAmp,
        float waveFreq,
        float phaseTime,
        float arcBias,
        out float outPhi,
        out float outCrest
      ) {
        float rXY = length(qR.xy);
        outPhi = atan(qR.y, qR.x);

        // Smooth helical radius modulation so the silk ribbon undulates organically in 3D
        float rWave = waveAmp * (
          0.65 * sin(2.0 * outPhi + phaseTime + qR.z * 2.4 * waveFreq)
          + 0.35 * cos(3.0 * outPhi - phaseTime * 0.8 - qR.z * 1.8 * waveFreq)
        );
        float dr = rXY - (radius + rWave);

        // Crisp glossy silk crest + silky airbrushed body
        float coreSheet = exp(-pow(dr / max(radialThick, 0.012), 2.0));
        float softTail = exp(-pow(dr / max(radialThick * 2.8, 0.038), 2.0)) * 0.36;

        // Finite ribbon width along local Z (tilted gently as it wraps around phi for a twisted Mobius feel)
        float zShift = 0.16 * sin(outPhi + phaseTime * 0.7);
        float zEnv = exp(-pow((qR.z - zShift) / max(beltWidth, 0.08), 2.0));

        // Smooth 360-degree aurora brightness undulation (never creates an off-center lopsided gap)
        float arcEnv = 0.56 + 0.44 * cos(outPhi - arcBias);

        // Keep pole strictly zero so atan() can never pinch
        float poleGuard = smoothstep(0.12, 0.26, rXY);

        float env = zEnv * arcEnv * poleGuard;
        outCrest = coreSheet * env;
        return (coreSheet * 1.15 + softTail) * env;
      }

      void frag(Varyings v) {
        vec2 p = v.v_uv * 2.0 - 1.0;
        float r = length(p);
        float circleMask = 1.0 - smoothstep(0.980, 1.0, r);
        if (circleMask <= 0.001) discard;

        float t = material_Time * material_OrbMotion.x;
        float zOuter = sqrt(max(0.0001, 1.0 - min(r * r, 0.9999)));
        vec3 N = vec3(p, zOuter);
        vec3 V = vec3(0.0, 0.0, -1.0);

        float sway = material_OrbMotion.y;
        float widthScale = clamp(material_OrbMotion.w, 0.35, 2.2);
        float washStrength = max(material_OrbRibbon.x, 0.0);
        float coreLift = clamp(material_OrbRibbon.y, 0.0, 1.0);
        float crestStrength = max(material_OrbRibbon.z, 0.0);
        float wf = max(material_OrbRibbon.w, 0.25);

        float shellThick = material_OrbShellThickness > 0.001
          ? clamp(material_OrbShellThickness, 0.015, 0.30)
          : 0.025;
        float glassIor = 1.04 + clamp(material_OrbMotion.z, 0.0, 1.2) * 0.22;
        vec3 D = refract(V, N, 1.0 / glassIor);

        // Exact chord length through the unit sphere along refracted ray D starting at O = N
        float chordLen = max(0.02, -2.0 * dot(N, D));

        float dispAmount = material_OrbDisp.x + material_OrbDisp.y * r * r;
        float dispTwist = material_OrbDisp.z;

        // Global slow vortex swirl + 3 nested counter-precessing, slightly eccentric 3D curved silk shells
        mat3 rotBase = orbRotZ(-t * 0.48)
          * orbRotX(0.22 + 0.14 * sway * sin(t * 0.38))
          * orbRotY(0.18 * sway * cos(t * 0.33));

        // Inner Silk Shell (R ~ 0.44): centered strictly at (0, 0, 0) so aurora stays concentric with the LiquidGlass orb
        mat3 rotInner = orbRotZ(t * 0.45 + 0.5)
          * orbRotX(0.58 + 0.24 * sway * sin(t * 0.52 + 0.7))
          * orbRotY(-0.38 * sway * cos(t * 0.44));

        // Mid Silk Shell (R ~ 0.64): centered strictly at (0, 0, 0)
        mat3 rotMid = orbRotZ(-t * 0.56 + 1.8)
          * orbRotX(-0.42 + 0.22 * sway * cos(t * 0.46 + 1.5))
          * orbRotY(0.32 * sway * sin(t * 0.39 + 0.4));

        // Outer Silk Shell (R ~ 0.79): centered strictly at (0, 0, 0)
        mat3 rotOuter = orbRotZ(-t * 0.38 - 0.9)
          * orbRotX(0.34 + 0.20 * sway * sin(t * 0.41 + 2.4))
          * orbRotY(-0.26 * sway * cos(t * 0.35 + 1.1));

        vec3 cCyan = material_OrbCyan.rgb;
        vec3 cAzure = material_OrbAzure.rgb;
        vec3 cViolet = material_OrbViolet.rgb;
        vec3 cOrchid = material_OrbOrchid.rgb;
        vec3 cRose = material_OrbRose.rgb;
        vec3 cCore = material_OrbCore.rgb;
        // Classic northern-lights emerald-aqua shimmer instead of yellow-lemon so aurora stays vivid over grass/sand.
        vec3 cAuroraMint = vec3(0.04, 1.00, 0.72);

        // 18-step analytic 3D volumetric integration for razor-smooth curved silk crests
        vec3 accumRgb = vec3(0.0);
        float accumA = 0.0;
        float accumCrest = 0.0;
        float transmittance = 1.0;

        float cavityR = 1.0 - shellThick;
        const int STEPS = 20;
        float invSteps = 1.0 / float(STEPS);
        float ds = chordLen * invSteps;

        for (int i = 0; i < STEPS; i++) {
          float u = (float(i) + 0.5) * invSteps;
          vec3 q = N + D * (u * chordLen);
          float r3 = length(q);

          // Softly feather inside the luminous white pearl outer cushion
          float outerMask = 1.0 - smoothstep(cavityR - 0.07, cavityR + 0.055, r3);
          if (outerMask <= 0.001) continue;

          // --- Base Layer: Lush 3D Toroidal Aurora Bed ---
          vec3 q0 = rotBase * q;
          float r0xy = length(q0.xy);
          float phi0 = atan(q0.y, q0.x);
          float dTorus = length(vec2(r0xy - 0.68 * cavityR, q0.z * 1.28));
          float dBase = exp(-pow(dTorus / (0.28 * widthScale), 2.0))
            * smoothstep(0.26, 0.54, r0xy)
            * washStrength * 0.52;
          float basePhase = (phi0 / 6.2831853) + 0.12 * q0.z * (1.0 + dispTwist) + dispAmount * 1.2 * (r3 - 0.55);
          vec3 colBase = evalAuroraSpectrum(basePhase, cCyan, cAzure, cViolet, cOrchid, cRose, cCore);

          // --- Concentric Silk Shell 1 (Inner Cyan-Aqua Curved Fold, R ~ 0.44, 0 deg phase) ---
          float phiIn, crestIn;
          vec3 qIn = rotInner * q;
          float dIn = evalCurvedSilkRibbon(
            qIn, 0.44 * cavityR, 0.042 * widthScale, 0.42, 0.056 * sway, wf, t * 0.85, 0.0, phiIn, crestIn
          ) * crestStrength * 0.86;
          vec3 colIn = mix(
            cCyan,
            mix(cAzure, cViolet, smoothstep(-0.1, 0.85, sin(phiIn + 0.5))),
            smoothstep(-0.2, 0.75, cos(phiIn - 1.1) + dispAmount * 2.5) * 0.34
          );

          // --- Concentric Silk Shell 2 (Mid Periwinkle-Violet-Cyan Layered Ribbon, R ~ 0.64, 120 deg phase) ---
          float phiMid, crestMid;
          vec3 qMid = rotMid * q;
          float dMid = evalCurvedSilkRibbon(
            qMid, 0.64 * cavityR, 0.048 * widthScale, 0.48, 0.060 * sway, wf, -t * 0.75, 2.094395, phiMid, crestMid
          ) * crestStrength * 0.92;
          float midPhase = (phiMid / 6.2831853) + 0.14 + 0.14 * qMid.z + dispAmount * 1.8;
          vec3 colMid = evalAuroraSpectrum(midPhase, cCyan, cAzure, cViolet, cOrchid, cRose, cCore);

          // --- Concentric Silk Shell 3 (Outer Orchid-Rose-Cyan-Mint Sweeping Veil, R ~ 0.79, 240 deg phase) ---
          float phiOut, crestOut;
          vec3 qOut = rotOuter * q;
          float dOut = evalCurvedSilkRibbon(
            qOut, 0.79 * cavityR, 0.046 * widthScale, 0.46, 0.054 * sway, wf, t * 0.68, 4.188790, phiOut, crestOut
          ) * crestStrength * 0.90;
          float outPhase = (phiOut / 6.2831853) + 0.52 - 0.12 * qOut.z - dispAmount * 1.6;
          vec3 colOut = evalAuroraSpectrum(outPhase, cCyan, cAzure, cViolet, cOrchid, cRose, cCore);

          // Luminous emerald-aqua northern-lights shimmer along the outer cyan-to-magenta tangent
          float auroraLobe = smoothstep(0.48, 0.88, r3)
            * pow(max(0.0, cos(phi0 + 1.85 + 0.45 * sin(t * 0.35))), 2.0);
          colOut = mix(colOut, cAuroraMint, auroraLobe * 0.76);
          colBase = mix(colBase, cAuroraMint, auroraLobe * 0.56);

          float totalD = dBase + dIn + dMid + dOut;
          if (totalD <= 0.002) continue;

          vec3 stepCol = (colBase * dBase + colIn * dIn + colMid * dMid + colOut * dOut) / totalD;
          float localCrest = clamp((crestIn + crestMid + crestOut) * crestStrength, 0.0, 1.0);
          // Keep aurora veils rich & deeply chromatic (no milky white washout); lift glowing silk ridges cleanly.
          vec3 deepVeil = pow(clamp(stepCol, 0.0, 1.0), vec3(1.18));
          vec3 brightCrest = clamp(stepCol * 1.26 + vec3(0.04), 0.0, 1.0);
          stepCol = mix(deepVeil, brightCrest, clamp(0.28 + localCrest * 0.72, 0.0, 1.0));
          float depthLift = mix(1.06, 0.92, u);
          stepCol = clamp(stepCol * depthLift, 0.0, 1.0);

          float stepAlpha = clamp(totalD * outerMask * ds * 1.85, 0.0, 0.56);
          accumRgb += transmittance * stepAlpha * stepCol;
          accumA += transmittance * stepAlpha;
          accumCrest += transmittance * localCrest * outerMask * ds * 1.75;
          transmittance *= (1.0 - stepAlpha * 0.72);
        }

        // Pure translucent 3D aurora silk ribbons suspended inside the authentic Liquid Glass lens shell:
        // Outer rim (r > 0.79) feathers cleanly to zero so the underlying LiquidGlass shader's
        // signature thick curved refraction band, chromatic edge dispersion, and specular reflection ring shine unobstructed.
        float listen = clamp(material_Listening, 0.0, 1.0);
        const float listenBright = 0.16;

        vec3 silkCol = accumA > 0.0005 ? (accumRgb / accumA) : cCyan;
        float silkCoverage = clamp((accumA * 1.18 + accumCrest * 0.28) * (1.0 + listen * 0.10), 0.0, 0.95);

        // Luminous colored aurora ridge boost (glows vibrantly without washing out to pastel white)
        vec3 orbRgb = mix(
          silkCol,
          clamp(silkCol * 1.32 + vec3(0.06, 0.08, 0.10), 0.0, 1.0),
          clamp(accumCrest * coreLift * (0.55 + listen * 0.14), 0.0, 0.56)
        );

        // Rich jewel-aurora saturation & intensity tone adjustment
        float luma = dot(orbRgb, vec3(0.299, 0.587, 0.114));
        float activeSat = mix(material_OrbTone.y, max(material_OrbTone.y, 1.95), listen);
        float activeIntensity = material_OrbTone.x * (1.0 + listen * listenBright);
        orbRgb = clamp(mix(vec3(luma), orbRgb, activeSat) * activeIntensity, 0.0, 1.0);

        // Preserve transparent breathing gaps while keeping aurora curtains bold and vibrant inside the liquid glass
        float centerClear = clamp(material_OrbTone.w, 0.0, 1.0);
        float centerHollow = exp(-pow(r / 0.34, 2.0));
        float hollowAtten = 1.0 - centerHollow * centerClear * 0.36;
        float glassBevelClearance = 1.0 - smoothstep(0.79, 0.94, r);
        float bodyAlpha = clamp(
          silkCoverage * hollowAtten * material_OrbTone.z * glassBevelClearance,
          0.0,
          0.92
        );

        // Ultra-subtle upper-left interior specular breath only (never covers the outer LiquidGlass refraction ring).
        float angle = atan(p.y, p.x);
        float topGlint = smoothstep(0.35, 0.96, cos(angle + 2.22))
          * smoothstep(0.54, 0.78, r)
          * (1.0 - smoothstep(0.80, 0.94, r));
        vec3 outSrgb = orbRgb;
        float outAlpha = bodyAlpha;
        float glintAlpha = clamp(topGlint * material_OrbRim.z * (1.0 + listen * 0.35), 0.0, 0.32);
        blendOver(outSrgb, outAlpha, vec3(1.0, 0.998, 1.0), glintAlpha);

        outAlpha *= circleMask;
        if (outAlpha <= 0.002) discard;

        vec3 linearRgb = sRGBToLinear(vec4(clamp(outSrgb, 0.0, 1.0), 1.0)).rgb;
        vec4 finalColor = vec4(linearRgb, outAlpha) * v.v_color;
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          finalColor = outputSRGBCorrection(finalColor);
        #endif
        gl_FragColor = finalColor;
      }
    }
  }
}
