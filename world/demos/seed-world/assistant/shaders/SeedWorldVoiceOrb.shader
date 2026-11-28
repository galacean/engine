
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
      // Per-axis quad expansion in canvas pixels (basePixelSize * (scale - 1.0)) so idle breathing
      // and press expansion animate strictly on the GPU without mutating UITransform / chunkUI VBO.
      float material_OrbScaleExpandPixels;

      // CPU-precomputed frame-constant 3x3 rotation matrices packed in upper-left of mat4.
      mat4 material_OrbRotBase;
      mat4 material_OrbRotInner;
      mat4 material_OrbRotMid;
      mat4 material_OrbRotOuter;

      // CPU-precomputed wrapped FP16-safe ribbon phases & trig vectors.
      vec4 material_OrbFramePhase2;
      vec4 material_OrbFramePhase3;
      vec4 material_OrbFrameTrig0;
      vec4 material_OrbFrameTrig1;

      // 64x1 cyclic bilinear sRGB LUT for aurora spectrum.
      mediump sampler2D material_OrbSpectrumLut;
      float material_OrbUseSpectrumLut;

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
        vec3 pos = attr.POSITION;
        pos.xy += vec2(attr.TEXCOORD_0.x - 0.5, 0.5 - attr.TEXCOORD_0.y) * material_OrbScaleExpandPixels;
        gl_Position = renderer_MVPMat * vec4(pos, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      // Fast polynomial atan2 on unit-length (x, y) vectors (max error < 0.0003 rad, 0 SFU atan calls).
      mediump float fastAtan2Unit(mediump float y, mediump float x) {
        mediump float ax = abs(x);
        mediump float ay = abs(y);
        mediump float a = min(ax, ay) / max(ax, ay);
        mediump float s = a * a;
        mediump float r = ((-0.04649647 * s + 0.15931422) * s - 0.32762276) * s * a + a;
        if (ay > ax) r = 1.5707963 - r;
        if (x < 0.0) r = 3.1415927 - r;
        return y < 0.0 ? -r : r;
      }

      // Fast parabolic sin(x) in ALU (max error < 0.001, 0 SFU sin/cos calls).
      mediump float fastSin(mediump float x) {
        mediump float t = fract(x * 0.15915494 + 0.5) * 2.0 - 1.0;
        mediump float y = 4.0 * t * (1.0 - abs(t));
        return y * (0.775 + 0.225 * abs(y));
      }

      mediump vec3 sampleSpectrum(mediump float phase, mediump vec3 fallbackCyan) {
        if (material_OrbUseSpectrumLut > 0.5) {
          return texture2DLodEXT(material_OrbSpectrumLut, vec2(phase, 0.5), 0.0).rgb;
        }
        return fallbackCyan;
      }

      // Single-exp2 Nyquist-filtered silk shell evaluator (0 SFU atan/sin/cos, 1 exp2/hit, squared-radius early out).
      mediump float evalSilkStep(
        mediump vec3 qR,
        mediump float radius,
        mediump float rMin2,
        mediump float rMax2,
        mediump float maxZ,
        mediump float invSheetW,
        mediump float invBeltW,
        mediump float waveAmp,
        mediump float wf24,
        mediump float wf18,
        mediump float ph2,
        mediump float ph3,
        mediump vec2 zShiftSC,
        mediump vec2 arcCS,
        mediump float coreEnergyRatio,
        out mediump vec2 outDirXY,
        out mediump float outPhi,
        out mediump float outCrest
      ) {
        outCrest = 0.0;
        if (abs(qR.z) > maxZ) return 0.0;
        mediump float rXY2 = dot(qR.xy, qR.xy);
        if (rXY2 < rMin2 || rXY2 > rMax2) return 0.0;

        mediump float invR = inversesqrt(rXY2);
        mediump float rXY = rXY2 * invR;
        outDirXY = qR.xy * invR;
        outPhi = fastAtan2Unit(outDirXY.y, outDirXY.x);

        mediump float rWave = waveAmp * (
          0.65 * fastSin(2.0 * outPhi + ph2 + qR.z * wf24)
          + 0.35 * fastSin(3.0 * outPhi + ph3 - qR.z * wf18 + 1.5707963)
        );
        mediump float dr = rXY - (radius + rWave);
        mediump float zShift = 0.16 * dot(outDirXY, zShiftSC);
        mediump float uZ = (qR.z - zShift) * invBeltW;
        mediump float uR = dr * invSheetW;

        mediump float gauss = exp2(-1.442695 * (uR * uR + uZ * uZ));
        mediump float arcEnv = 0.56 + 0.44 * dot(outDirXY, arcCS);
        mediump float env = arcEnv * smoothstep(0.12, 0.26, rXY);
        outCrest = gauss * env * coreEnergyRatio;
        return gauss * (1.15 * coreEnergyRatio + 0.36) * env;
      }

      void frag(Varyings v) {
        vec2 p = v.v_uv * 2.0 - 1.0;
        float r2 = dot(p, p);
        // Both glassBevelClearance and topGlint are identically 0 for r >= 0.94 (r2 >= 0.8836).
        if (r2 >= 0.8836) discard;

        float r = sqrt(r2);
        float zOuter = sqrt(max(0.0001, 1.0 - r2));
        vec3 N = vec3(p, zOuter);
        vec3 V = vec3(0.0, 0.0, -1.0);

        mediump float sway = material_OrbMotion.y;
        mediump float widthScale = clamp(material_OrbMotion.w, 0.35, 2.2);
        mediump float washStrength = max(material_OrbRibbon.x, 0.0);
        mediump float coreLift = clamp(material_OrbRibbon.y, 0.0, 1.0);
        mediump float crestStrength = max(material_OrbRibbon.z, 0.0);
        mediump float wf = max(material_OrbRibbon.w, 0.25);
        mediump float wf24 = 2.4 * wf;
        mediump float wf18 = 1.8 * wf;

        float shellThick = material_OrbShellThickness > 0.001
          ? clamp(material_OrbShellThickness, 0.015, 0.30)
          : 0.025;
        float glassIor = 1.04 + clamp(material_OrbMotion.z, 0.0, 1.2) * 0.22;
        vec3 D = refract(V, N, 1.0 / glassIor);
        mediump float chordLen = max(0.02, -2.0 * dot(N, D));

        mediump float dispAmount = material_OrbDisp.x + material_OrbDisp.y * r2;
        mediump float dispTwist = material_OrbDisp.z;

        bool hasPre = material_OrbRotBase[3][3] > 0.5;
        mediump mat3 rotBase = hasPre ? mat3(material_OrbRotBase) : mat3(1.0);
        mediump mat3 rotInner = hasPre ? mat3(material_OrbRotInner) : mat3(1.0);
        mediump mat3 rotMid = hasPre ? mat3(material_OrbRotMid) : mat3(1.0);
        mediump mat3 rotOuter = hasPre ? mat3(material_OrbRotOuter) : mat3(1.0);

        mediump vec3 cCyan = material_OrbCyan.rgb;
        mediump vec3 cAzure = material_OrbAzure.rgb;
        mediump vec3 cViolet = material_OrbViolet.rgb;
        mediump float cavR = 1.0 - shellThick;
        mediump float cavOuterR = min(1.0, cavR + 0.055);

        mediump vec3 accumRgb = vec3(0.0);
        mediump float accumA = 0.0;
        mediump float accumCrest = 0.0;
        mediump float transmittance = 1.0;

        float halfSpan2 = cavOuterR * cavOuterR - 1.0 + 0.25 * chordLen * chordLen;
        if (halfSpan2 > 0.0001) {
          const int STEPS = 6;
          const mediump float INV_STEPS = 1.0 / 6.0;
          const mediump float INV_TAU = 0.15915494;

          mediump float halfSpan = sqrt(halfSpan2);
          mediump float ds = (2.0 * halfSpan) * INV_STEPS;
          mediump float s = (0.5 * chordLen - halfSpan) + 0.5 * ds;
          mediump float invChord = 1.0 / chordLen;

          // Nyquist band-limiting merges core & soft tail into a single smooth Gaussian (0 slicing, 1 exp2/hit).
          mediump float nyqW = ds * 0.42;
          mediump float inOrigW = max(0.042 * widthScale, 0.012);
          mediump float midOrigW = max(0.048 * widthScale, 0.012);
          mediump float outOrigW = max(0.046 * widthScale, 0.012);
          mediump float inW = max(max(inOrigW * 2.4, 0.04), nyqW);
          mediump float midW = max(max(midOrigW * 2.4, 0.04), nyqW);
          mediump float outW = max(max(outOrigW * 2.4, 0.04), nyqW);

          mediump float invInW = 1.0 / inW;
          mediump float invMidW = 1.0 / midW;
          mediump float invOutW = 1.0 / outW;
          mediump float inRatio = inOrigW * invInW;
          mediump float midRatio = midOrigW * invMidW;
          mediump float outRatio = outOrigW * invOutW;

          mediump float rIn = 0.44 * cavR;
          mediump float rMid = 0.64 * cavR;
          mediump float rOut = 0.79 * cavR;
          mediump float inWaveAmp = 0.056 * sway;
          mediump float midWaveAmp = 0.060 * sway;
          mediump float outWaveAmp = 0.054 * sway;
          mediump float inBand = inWaveAmp + inW * 2.3;
          mediump float midBand = midWaveAmp + midW * 2.3;
          mediump float outBand = outWaveAmp + outW * 2.3;

          mediump float inMin = max(0.12, rIn - inBand);
          mediump float inMax = rIn + inBand;
          mediump float midMin = max(0.12, rMid - midBand);
          mediump float midMax = rMid + midBand;
          mediump float outMin = max(0.12, rOut - outBand);
          mediump float outMax = rOut + outBand;
          mediump float inMin2 = inMin * inMin;
          mediump float inMax2 = inMax * inMax;
          mediump float midMin2 = midMin * midMin;
          mediump float midMax2 = midMax * midMax;
          mediump float outMin2 = outMin * outMin;
          mediump float outMax2 = outMax * outMax;
          mediump float inScale = crestStrength * 0.86;
          mediump float midScale = crestStrength * 0.92;
          mediump float outScale = crestStrength * 0.90;

          mediump float baseR = 0.68 * cavR;
          mediump float invBaseW2 = 1.0 / ((0.28 * widthScale) * (0.28 * widthScale));
          mediump float baseScale = washStrength * 0.52;
          mediump float baseTwist = 0.12 * (1.0 + dispTwist);

          mediump vec2 zShiftIn = hasPre ? material_OrbFrameTrig0.xy : vec2(0.0, 1.0);
          mediump vec2 zShiftMid = hasPre ? material_OrbFrameTrig0.zw : vec2(0.0, 1.0);
          mediump vec2 zShiftOut = hasPre ? material_OrbFrameTrig1.xy : vec2(0.0, 1.0);
          mediump vec2 auroraCS = hasPre ? material_OrbFrameTrig1.zw : vec2(-0.275, -0.961);

          mediump vec3 q = N + D * s;
          mediump vec3 dq = D * ds;

          for (int i = 0; i < STEPS; i++) {
            mediump float r3 = sqrt(max(0.0001, 1.0 + s * (s - chordLen)));
            mediump float outerMask = 1.0 - smoothstep(cavR - 0.07, cavOuterR, r3);
            if (outerMask > 0.001) {
              mediump vec3 q0 = rotBase * q;
              mediump float dBase = 0.0;
              mediump vec3 colBase = cCyan;
              mediump vec2 dir0 = vec2(1.0, 0.0);
              bool hasDir0 = false;
              mediump float r0xy2 = dot(q0.xy, q0.xy);
              if (r0xy2 > 0.0676) {
                mediump float invR0 = inversesqrt(r0xy2);
                mediump float r0xy = r0xy2 * invR0;
                dir0 = q0.xy * invR0;
                hasDir0 = true;
                mediump float dtR = r0xy - baseR;
                mediump float dtZ = q0.z * 1.28;
                mediump float uBase2 = (dtR * dtR + dtZ * dtZ) * invBaseW2;
                if (uBase2 < 5.5) {
                  dBase = exp2(-1.442695 * uBase2) * smoothstep(0.26, 0.54, r0xy) * baseScale;
                  mediump float phi0 = fastAtan2Unit(dir0.y, dir0.x);
                  colBase = sampleSpectrum(phi0 * INV_TAU + baseTwist * q0.z + dispAmount * 1.2 * (r3 - 0.55), cCyan);
                }
              }

              mediump vec2 dirIn;
              mediump float phiIn, crestIn;
              mediump float dIn = evalSilkStep(
                rotInner * q, rIn, inMin2, inMax2, 1.12,
                invInW, 2.380952, inWaveAmp, wf24, wf18,
                material_OrbFramePhase2.x, material_OrbFramePhase3.x,
                zShiftIn, vec2(1.0, 0.0), inRatio, dirIn, phiIn, crestIn
              ) * inScale;
              mediump vec3 colIn = cCyan;
              if (dIn > 0.001) {
                mediump float sinIn = dot(dirIn, vec2(0.4794255, 0.8775826));
                mediump float cosIn = dot(dirIn, vec2(0.4535961, 0.8912074));
                colIn = mix(
                  cCyan,
                  mix(cAzure, cViolet, smoothstep(-0.1, 0.85, sinIn)),
                  smoothstep(-0.2, 0.75, cosIn + dispAmount * 2.5) * 0.34
                );
              }

              mediump vec2 dirMid;
              mediump float phiMid, crestMid;
              mediump vec3 qMid = rotMid * q;
              mediump float dMid = evalSilkStep(
                qMid, rMid, midMin2, midMax2, 1.26,
                invMidW, 2.083333, midWaveAmp, wf24, wf18,
                material_OrbFramePhase2.y, material_OrbFramePhase3.y,
                zShiftMid, vec2(-0.5, 0.8660254), midRatio, dirMid, phiMid, crestMid
              ) * midScale;
              mediump vec3 colMid = cCyan;
              if (dMid > 0.001) {
                colMid = sampleSpectrum(phiMid * INV_TAU + 0.14 + 0.14 * qMid.z + dispAmount * 1.8, cCyan);
              }

              mediump vec2 dirOut;
              mediump float phiOut, crestOut;
              mediump vec3 qOut = rotOuter * q;
              mediump float dOut = evalSilkStep(
                qOut, rOut, outMin2, outMax2, 1.22,
                invOutW, 2.173913, outWaveAmp, wf24, wf18,
                material_OrbFramePhase2.z, material_OrbFramePhase3.z,
                zShiftOut, vec2(-0.5, -0.8660254), outRatio, dirOut, phiOut, crestOut
              ) * outScale;
              mediump vec3 colOut = cCyan;
              if (dOut > 0.001) {
                colOut = sampleSpectrum(phiOut * INV_TAU + 0.52 - 0.12 * qOut.z - dispAmount * 1.6, cCyan);
              }

              mediump float totalD = dBase + dIn + dMid + dOut;
              if (totalD > 0.002) {
                if (r3 > 0.48 && (dOut > 0.001 || dBase > 0.001)) {
                  if (!hasDir0 && r0xy2 > 0.0001) dir0 = q0.xy * inversesqrt(r0xy2);
                  mediump float lCos = max(0.0, dot(dir0, auroraCS));
                  mediump float lobe = smoothstep(0.48, 0.88, r3) * (lCos * lCos);
                  colOut = mix(colOut, vec3(0.04, 1.00, 0.72), lobe * 0.76);
                  colBase = mix(colBase, vec3(0.04, 1.00, 0.72), lobe * 0.56);
                }

                mediump vec3 stepCol = (colBase * dBase + colIn * dIn + colMid * dMid + colOut * dOut) / totalD;
                mediump float localCrest = clamp((crestIn + crestMid + crestOut) * crestStrength, 0.0, 1.0);
                mediump vec3 cc = clamp(stepCol, 0.0, 1.0);
                stepCol = mix(cc * (0.79 + 0.21 * cc), clamp(stepCol * 1.26 + vec3(0.04), 0.0, 1.0), clamp(0.28 + localCrest * 0.72, 0.0, 1.0));
                stepCol = clamp(stepCol * mix(1.06, 0.92, s * invChord), 0.0, 1.0);

                mediump float stepAlpha = clamp(totalD * outerMask * ds * 1.85, 0.0, 0.64);
                mediump float w = transmittance * stepAlpha;
                accumRgb += w * stepCol;
                accumA += w;
                accumCrest += transmittance * localCrest * outerMask * ds * 1.75;
                transmittance *= (1.0 - stepAlpha * 0.72);
                if (transmittance < 0.04) break;
              }
            }
            s += ds;
            q += dq;
          }
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
        mediump float rHollow = r * 2.9411765;
        mediump float centerHollow = exp2(-1.442695 * rHollow * rHollow);
        mediump float hollowAtten = 1.0 - centerHollow * centerClear * 0.36;
        mediump float glassBevelClearance = 1.0 - smoothstep(0.79, 0.94, r);
        mediump float bodyAlpha = clamp(
          silkCoverage * hollowAtten * material_OrbTone.z * glassBevelClearance,
          0.0,
          0.92
        );

        mediump vec2 dirP = p / max(r, 0.0001);
        mediump float cosGlint = dot(dirP, vec2(-0.6044884, -0.7966140));
        mediump float topGlint = smoothstep(0.35, 0.96, cosGlint)
          * smoothstep(0.54, 0.78, r)
          * (1.0 - smoothstep(0.80, 0.94, r));
        mediump vec3 outSrgb = orbRgb;
        mediump float outAlpha = bodyAlpha;
        mediump float glintAlpha = clamp(topGlint * material_OrbRim.z * (1.0 + listen * 0.35), 0.0, 0.32);
        if (glintAlpha > 0.0005) {
          mediump float nextA = glintAlpha + outAlpha * (1.0 - glintAlpha);
          outSrgb = (vec3(1.0, 0.998, 1.0) * glintAlpha + outSrgb * outAlpha * (1.0 - glintAlpha)) / max(nextA, 0.0001);
          outAlpha = nextA;
        }

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
