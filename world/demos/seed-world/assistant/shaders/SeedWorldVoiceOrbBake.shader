Shader "SeedWorld/VoiceOrbBakeV1" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = false;
      }
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Opaque;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      float material_Listening;

      // CPU-precomputed frame-constant 3x3 rotation matrices (packed in upper-left of mat4).
      mat4 material_OrbRotBase;
      mat4 material_OrbRotInner;
      mat4 material_OrbRotMid;
      mat4 material_OrbRotOuter;

      // CPU-precomputed frame-constant trig & phase terms:
      // FramePhase: x = t*0.85, y = -t*0.75, z = t*0.68, w = 0
      // FrameTrig0: xy = (sin(0.7*tIn), cos(0.7*tIn)), zw = (sin(0.7*tMid), cos(0.7*tMid))
      // FrameTrig1: xy = (sin(0.7*tOut), cos(0.7*tOut)), zw = (cos(auroraPhase), -sin(auroraPhase))
      vec4 material_OrbFramePhase;
      vec4 material_OrbFrameTrig0;
      vec4 material_OrbFrameTrig1;

      // 64x1 seamless repeating sRGB LUT of the 6-stop pastel aurora palette.
      mediump sampler2D material_OrbSpectrumLut;

      // Palette stops still used by inner shell & fallback fill
      vec4 material_OrbCyan;
      vec4 material_OrbAzure;
      vec4 material_OrbViolet;

      // Motion & geometry: x = flowSpeed, y = swayAmp, z = domeWarp, w = ribbonWidthScale
      vec4 material_OrbMotion;
      // Shell shading: x = washStrength, y = overlapGlow, z = crestStrength, w = waveFreq
      vec4 material_OrbRibbon;
      // Dispersion: x = baseDisp, y = radialDisp, z = tangTwist
      vec4 material_OrbDisp;
      // Tone & alpha: x = intensity, y = saturation, z = opacity, w = centerClear
      vec4 material_OrbTone;
      // Rim & highlight: z = topGlint
      vec4 material_OrbRim;
      // Outer frosted pearl glass wall thickness (fraction of sphere radius)
      float material_OrbShellThickness;

      struct Attributes {
        vec4 POSITION_UV;
      };

      struct Varyings {
        vec2 v_uv;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.v_uv = attr.POSITION_UV.zw;
        return v;
      }

      // Evaluates one 3D curved silk ribbon shell with bounding skip & merged Gaussian exp2:
      // e^(-a) * e^(-b) = exp2(-1.442695 * (a + b)) eliminates 1 exp/shell with exact identity.
      mediump float evalSilkFast(
        vec3 qR,
        float radius,
        float maxWaveBand,
        float maxZBand,
        float invRadialThick,
        float invSoftThick,
        float invBeltWidth,
        float waveAmp,
        float waveFreq24,
        float waveFreq18,
        float phaseTime,
        vec2 zShiftSinCos,
        vec2 arcCosSin,
        out vec2 outDirXY,
        out float outPhi,
        out mediump float outCrest
      ) {
        outCrest = 0.0;
        if (abs(qR.z) > maxZBand) return 0.0;
        float rXY2 = dot(qR.xy, qR.xy);
        if (rXY2 <= 0.0144) return 0.0;
        float rXY = sqrt(rXY2);
        if (abs(rXY - radius) > maxWaveBand) return 0.0;

        outDirXY = qR.xy / rXY;
        outPhi = atan(qR.y, qR.x);

        float rWave = waveAmp * (
          0.65 * sin(2.0 * outPhi + phaseTime + qR.z * waveFreq24)
          + 0.35 * cos(3.0 * outPhi - phaseTime * 0.8 - qR.z * waveFreq18)
        );
        float dr = rXY - (radius + rWave);
        float zShift = 0.16 * dot(outDirXY, zShiftSinCos);
        float uZ = (qR.z - zShift) * invBeltWidth;
        float uZ2 = uZ * uZ;
        float uCore = dr * invRadialThick;
        float uSoft = dr * invSoftThick;

        mediump float coreZ = exp2(-1.442695 * (uCore * uCore + uZ2));
        mediump float softZ = exp2(-1.442695 * (uSoft * uSoft + uZ2)) * 0.36;

        mediump float arcEnv = 0.56 + 0.44 * dot(outDirXY, arcCosSin);
        mediump float poleGuard = smoothstep(0.12, 0.26, rXY);
        mediump float env = arcEnv * poleGuard;
        outCrest = coreZ * env;
        return (coreZ * 1.15 + softZ) * env;
      }

      mediump vec3 sampleSpectrum(mediump float phase) {
        return texture2D(material_OrbSpectrumLut, vec2(phase, 0.5)).rgb;
      }

      void frag(Varyings v) {
        vec2 p = v.v_uv * 2.0 - 1.0;
        float r2 = dot(p, p);
        // Both glassBevelClearance and topGlint are identically 0 for r >= 0.94 (r2 >= 0.8836).
        // Writing vec4(0.0) skips 11.6% of the circle and removes any need for RT clear calls.
        if (r2 >= 0.8836) {
          gl_FragColor = vec4(0.0);
          return;
        }
        float r = sqrt(r2);

        float zOuter = sqrt(max(0.0001, 1.0 - r2));
        vec3 N = vec3(p, zOuter);
        vec3 V = vec3(0.0, 0.0, -1.0);

        float sway = material_OrbMotion.y;
        float widthScale = clamp(material_OrbMotion.w, 0.35, 2.2);
        mediump float washStrength = max(material_OrbRibbon.x, 0.0);
        mediump float coreLift = clamp(material_OrbRibbon.y, 0.0, 1.0);
        mediump float crestStrength = max(material_OrbRibbon.z, 0.0);
        float wf = max(material_OrbRibbon.w, 0.25);
        float wf24 = 2.4 * wf;
        float wf18 = 1.8 * wf;

        float shellThick = material_OrbShellThickness > 0.001
          ? clamp(material_OrbShellThickness, 0.015, 0.30)
          : 0.025;
        float glassIor = 1.04 + clamp(material_OrbMotion.z, 0.0, 1.2) * 0.22;
        vec3 D = refract(V, N, 1.0 / glassIor);
        float chordLen = max(0.02, -2.0 * dot(N, D));

        float dispAmount = material_OrbDisp.x + material_OrbDisp.y * r2;
        float dispTwist = material_OrbDisp.z;

        mat3 rotBase = mat3(material_OrbRotBase);
        mat3 rotInner = mat3(material_OrbRotInner);
        mat3 rotMid = mat3(material_OrbRotMid);
        mat3 rotOuter = mat3(material_OrbRotOuter);

        const int STEPS = 16;
        const float INV_STEPS = 1.0 / 16.0;
        const float INV_TAU = 0.159154943;
        float ds = chordLen * INV_STEPS;
        vec3 qStep = D * ds;
        vec3 q = N + qStep * 0.5;

        // Pre-transform ray origin & step into each shell's rotated frame: 0 mat3*vec3 inside loop!
        vec3 q0Step = rotBase * qStep;
        vec3 q0 = rotBase * q;
        vec3 qInStep = rotInner * qStep;
        vec3 qIn = rotInner * q;
        vec3 qMidStep = rotMid * qStep;
        vec3 qMid = rotMid * q;
        vec3 qOutStep = rotOuter * qStep;
        vec3 qOut = rotOuter * q;

        mediump vec3 cCyan = material_OrbCyan.rgb;
        mediump vec3 cAzure = material_OrbAzure.rgb;
        mediump vec3 cViolet = material_OrbViolet.rgb;
        mediump vec3 cAuroraMint = vec3(0.04, 1.00, 0.72);

        float cavityR = 1.0 - shellThick;
        float invBaseThick = 1.0 / (0.28 * widthScale);
        float inSoftT = max(0.042 * widthScale * 2.8, 0.038);
        float midSoftT = max(0.048 * widthScale * 2.8, 0.038);
        float outSoftT = max(0.046 * widthScale * 2.8, 0.038);
        float invInThick = 1.0 / max(0.042 * widthScale, 0.012);
        float invInSoft = 1.0 / inSoftT;
        float invMidThick = 1.0 / max(0.048 * widthScale, 0.012);
        float invMidSoft = 1.0 / midSoftT;
        float invOutThick = 1.0 / max(0.046 * widthScale, 0.012);
        float invOutSoft = 1.0 / outSoftT;

        float inBand = 0.056 * sway + inSoftT * 2.6;
        float midBand = 0.060 * sway + midSoftT * 2.6;
        float outBand = 0.054 * sway + outSoftT * 2.6;

        float tIn = material_OrbFramePhase.x;
        float tMid = material_OrbFramePhase.y;
        float tOut = material_OrbFramePhase.z;
        vec2 zShiftIn = material_OrbFrameTrig0.xy;
        vec2 zShiftMid = material_OrbFrameTrig0.zw;
        vec2 zShiftOut = material_OrbFrameTrig1.xy;
        vec2 auroraCS = material_OrbFrameTrig1.zw;

        mediump vec3 accumRgb = vec3(0.0);
        mediump float accumA = 0.0;
        mediump float accumCrest = 0.0;
        mediump float transmittance = 1.0;

        mediump float baseScale = washStrength * 0.52;
        mediump float inScale = crestStrength * 0.86;
        mediump float midScale = crestStrength * 0.92;
        mediump float outScale = crestStrength * 0.90;
        float dispBaseCoef = dispAmount * 1.2;
        float dispInBias = dispAmount * 2.5;
        float dispMidBias = 0.14 + dispAmount * 1.8;
        float dispOutBias = 0.52 - dispAmount * 1.6;
        float twistZCoef = 0.12 * (1.0 + dispTwist);

        for (int i = 0; i < STEPS; i++) {
          float r3 = length(q);
          mediump float outerMask = 1.0 - smoothstep(cavityR - 0.07, cavityR + 0.055, r3);
          if (outerMask > 0.001) {
            float u = (float(i) + 0.5) * INV_STEPS;

            // --- Base Layer: 3D Toroidal Aurora Bed + Shimmer Lobe ---
            float r0xy = length(q0.xy);
            mediump float dBase = 0.0;
            mediump vec3 colBase = vec3(0.0);
            mediump float auroraLobe = 0.0;
            if (r0xy > 0.26) {
              vec2 dir0 = q0.xy / r0xy;
              mediump float lobeCos = max(0.0, dot(dir0, auroraCS));
              auroraLobe = smoothstep(0.48, 0.88, r3) * (lobeCos * lobeCos);
              float dTorus = length(vec2(r0xy - 0.68 * cavityR, q0.z * 1.28));
              float uBase = dTorus * invBaseThick;
              if (uBase < 2.6) {
                dBase = exp2(-1.442695 * (uBase * uBase)) * smoothstep(0.26, 0.54, r0xy) * baseScale;
                float phi0 = atan(q0.y, q0.x);
                mediump float basePhase = phi0 * INV_TAU + twistZCoef * q0.z + dispBaseCoef * (r3 - 0.55);
                colBase = mix(sampleSpectrum(basePhase), cAuroraMint, auroraLobe * 0.56);
              }
            }

            // --- Concentric Silk Shell 1 (Inner, R ~ 0.44, 0 deg) ---
            vec2 dirIn;
            float phiIn;
            mediump float crestIn;
            mediump float dIn = evalSilkFast(
              qIn, 0.44 * cavityR, inBand, 0.16 + 0.42 * 2.6, invInThick, invInSoft, 1.0 / 0.42, 0.056 * sway,
              wf24, wf18, tIn, zShiftIn, vec2(1.0, 0.0), dirIn, phiIn, crestIn
            ) * inScale;
            mediump vec3 colIn = vec3(0.0);
            if (dIn > 0.001) {
              mediump float sinIn = dot(dirIn, vec2(0.47942554, 0.87758256));
              mediump float cosIn = dot(dirIn, vec2(0.45359612, 0.89120736));
              colIn = mix(
                cCyan,
                mix(cAzure, cViolet, smoothstep(-0.1, 0.85, sinIn)),
                smoothstep(-0.2, 0.75, cosIn + dispInBias) * 0.34
              );
            }

            // --- Concentric Silk Shell 2 (Mid, R ~ 0.64, 120 deg) ---
            vec2 dirMid;
            float phiMid;
            mediump float crestMid;
            mediump float dMid = evalSilkFast(
              qMid, 0.64 * cavityR, midBand, 0.16 + 0.48 * 2.6, invMidThick, invMidSoft, 1.0 / 0.48, 0.060 * sway,
              wf24, wf18, tMid, zShiftMid, vec2(-0.5, 0.8660254), dirMid, phiMid, crestMid
            ) * midScale;
            mediump vec3 colMid = dMid > 0.001
              ? sampleSpectrum(phiMid * INV_TAU + 0.14 * qMid.z + dispMidBias)
              : vec3(0.0);

            // --- Concentric Silk Shell 3 (Outer, R ~ 0.79, 240 deg) ---
            vec2 dirOut;
            float phiOut;
            mediump float crestOut;
            mediump float dOut = evalSilkFast(
              qOut, 0.79 * cavityR, outBand, 0.16 + 0.46 * 2.6, invOutThick, invOutSoft, 1.0 / 0.46, 0.054 * sway,
              wf24, wf18, tOut, zShiftOut, vec2(-0.5, -0.8660254), dirOut, phiOut, crestOut
            ) * outScale;
            mediump vec3 colOut = vec3(0.0);
            if (dOut > 0.001) {
              colOut = mix(
                sampleSpectrum(phiOut * INV_TAU - 0.12 * qOut.z + dispOutBias),
                cAuroraMint,
                auroraLobe * 0.76
              );
            }

            mediump float totalD = dBase + dIn + dMid + dOut;
            if (totalD > 0.002) {
              mediump vec3 stepCol = clamp((colBase * dBase + colIn * dIn + colMid * dMid + colOut * dOut) / totalD, 0.0, 1.0);
              mediump float localCrest = clamp((crestIn + crestMid + crestOut) * crestStrength, 0.0, 1.0);
              // 3-FMA minimax fit for pow(stepCol, vec3(1.18)) on [0, 1] (error < 0.006, zero SFU pow).
              mediump vec3 deepVeil = stepCol * (0.685 + stepCol * (0.455 - 0.140 * stepCol));
              mediump vec3 brightCrest = clamp(stepCol * 1.26 + vec3(0.04), 0.0, 1.0);
              stepCol = mix(deepVeil, brightCrest, clamp(0.28 + localCrest * 0.72, 0.0, 1.0));
              stepCol = clamp(stepCol * mix(1.06, 0.92, u), 0.0, 1.0);

              mediump float stepAlpha = clamp(totalD * outerMask * ds * 1.85, 0.0, 0.56);
              accumRgb += transmittance * stepAlpha * stepCol;
              accumA += transmittance * stepAlpha;
              accumCrest += transmittance * localCrest * outerMask * ds * 1.75;
              transmittance *= (1.0 - stepAlpha * 0.72);
              if (transmittance < 0.025) break;
            }
          }
          q += qStep;
          q0 += q0Step;
          qIn += qInStep;
          qMid += qMidStep;
          qOut += qOutStep;
        }

        mediump float listen = clamp(material_Listening, 0.0, 1.0);
        mediump vec3 silkCol = accumA > 0.0005 ? (accumRgb / accumA) : cCyan;
        mediump float silkCoverage = clamp((accumA * 1.18 + accumCrest * 0.28) * (1.0 + listen * 0.10), 0.0, 0.95);

        mediump vec3 orbRgb = mix(
          silkCol,
          clamp(silkCol * 1.32 + vec3(0.06, 0.08, 0.10), 0.0, 1.0),
          clamp(accumCrest * coreLift * (0.55 + listen * 0.14), 0.0, 0.56)
        );

        mediump float luma = dot(orbRgb, vec3(0.299, 0.587, 0.114));
        mediump float activeSat = mix(material_OrbTone.y, max(material_OrbTone.y, 1.95), listen);
        mediump float activeIntensity = material_OrbTone.x * (1.0 + listen * 0.16);
        orbRgb = clamp(mix(vec3(luma), orbRgb, activeSat) * activeIntensity, 0.0, 1.0);

        mediump float centerClear = clamp(material_OrbTone.w, 0.0, 1.0);
        float uHollow = r * (1.0 / 0.34);
        mediump float centerHollow = exp2(-1.442695 * (uHollow * uHollow));
        mediump float hollowAtten = 1.0 - centerHollow * centerClear * 0.36;
        mediump float glassBevelClearance = 1.0 - smoothstep(0.79, 0.94, r);
        mediump float bodyAlpha = clamp(
          silkCoverage * hollowAtten * material_OrbTone.z * glassBevelClearance,
          0.0,
          0.92
        );

        vec2 dirP = p / max(r, 1e-4);
        mediump float topCos = dot(dirP, vec2(-0.6046033, -0.7965267));
        mediump float topGlint = smoothstep(0.35, 0.96, topCos)
          * smoothstep(0.54, 0.78, r)
          * (1.0 - smoothstep(0.80, 0.94, r));
        mediump float glintAlpha = clamp(topGlint * material_OrbRim.z * (1.0 + listen * 0.35), 0.0, 0.32);

        mediump vec3 outSrgb = orbRgb;
        mediump float outAlpha = bodyAlpha;
        if (glintAlpha > 0.0005) {
          mediump float nextA = glintAlpha + outAlpha * (1.0 - glintAlpha);
          outSrgb = (vec3(1.0, 0.998, 1.0) * glintAlpha + outSrgb * outAlpha * (1.0 - glintAlpha)) / max(nextA, 0.0001);
          outAlpha = nextA;
        }

        if (outAlpha <= 0.002) {
          gl_FragColor = vec4(0.0);
          return;
        }

        // Store premultiplied sRGB in RGBA8 RT so bilinear upsampling onto the UI quad is 100% halo-free.
        gl_FragColor = vec4(clamp(outSrgb, 0.0, 1.0) * outAlpha, outAlpha);
      }
    }
  }
}
