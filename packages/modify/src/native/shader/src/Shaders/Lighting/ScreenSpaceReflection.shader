Shader "Lighting/ScreenSpaceReflection" {
  SubShader "Default" {
    Pass "DownsampleDepth" {
      DepthState = {
        Enabled = true;
        WriteEnabled = true;
        CompareFunction = CompareFunction.Always;
      }

      BlendState = {
        Enabled = false;
        ColorWriteMask = ColorWriteMask.None;
      }

      VertexShader = vert;
      FragmentShader = downsampleDepthFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      highp sampler2D material_SSRFullDepthTexture;
      vec4 material_SSRSourceTexelSize;
      vec4 material_SSRDestTexelSize;

      void downsampleDepthFragment(Varyings v) {
        vec2 invSrc = material_SSRSourceTexelSize.xy;
        ivec2 srcSize = max(ivec2(material_SSRSourceTexelSize.zw + vec2(0.5)), ivec2(1));
        ivec2 dstSize = max(ivec2(material_SSRDestTexelSize.zw + vec2(0.5)), ivec2(1));
        ivec2 dstCoord = ivec2(floor(gl_FragCoord.xy));
        int x0 = clamp((dstCoord.x * srcSize.x) / dstSize.x, 0, srcSize.x - 1);
        int x1 = clamp(((dstCoord.x + 1) * srcSize.x + dstSize.x - 1) / dstSize.x - 1, x0, srcSize.x - 1);
        int y0 = clamp((dstCoord.y * srcSize.y) / dstSize.y, 0, srcSize.y - 1);
        int y1 = clamp(((dstCoord.y + 1) * srcSize.y + dstSize.y - 1) / dstSize.y - 1, y0, srcSize.y - 1);
        float maxD = 0.0;
        for (int dy = 0; dy < 6; ++dy) {
          int sy = y0 + dy;
          if (sy > y1) {
            break;
          }
          for (int dx = 0; dx < 6; ++dx) {
            int sx = x0 + dx;
            if (sx > x1) {
              break;
            }
            vec2 sampleUV = (vec2(float(sx), float(sy)) + vec2(0.5)) * invSrc;
            maxD = max(maxD, texture2D(material_SSRFullDepthTexture, sampleUV).r);
          }
        }
        gl_FragDepthEXT = maxD;
      }
    }

    Pass "BuildHiZMip0" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = buildHiZMip0Fragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      highp sampler2D material_SSROpaqueDepthTexture;
      vec4 material_SSRSourceTexelSize;
      vec4 material_SSRDestTexelSize;

      #ifdef SSR_HAS_CONTRIB_DEPTH
        highp sampler2D material_SSRContribDepthTexture;
      #endif

      void buildHiZMip0Fragment(Varyings v) {
        #ifdef SSR_DOWNSAMPLE_FROM_FULL_DEPTH
          vec2 invSrc = material_SSRSourceTexelSize.xy;
          ivec2 srcSize = max(ivec2(material_SSRSourceTexelSize.zw + vec2(0.5)), ivec2(1));
          ivec2 dstSize = max(ivec2(material_SSRDestTexelSize.zw + vec2(0.5)), ivec2(1));
          ivec2 dstCoord = ivec2(floor(gl_FragCoord.xy));
          int x0 = clamp((dstCoord.x * srcSize.x) / dstSize.x, 0, srcSize.x - 1);
          int x1 = clamp(((dstCoord.x + 1) * srcSize.x + dstSize.x - 1) / dstSize.x - 1, x0, srcSize.x - 1);
          int y0 = clamp((dstCoord.y * srcSize.y) / dstSize.y, 0, srcSize.y - 1);
          int y1 = clamp(((dstCoord.y + 1) * srcSize.y + dstSize.y - 1) / dstSize.y - 1, y0, srcSize.y - 1);
          float rawDepth = 1.0;
          for (int dy = 0; dy < 6; ++dy) {
            int sy = y0 + dy;
            if (sy > y1) {
              break;
            }
            for (int dx = 0; dx < 6; ++dx) {
              int sx = x0 + dx;
              if (sx > x1) {
                break;
              }
              vec2 sampleUV = (vec2(float(sx), float(sy)) + vec2(0.5)) * invSrc;
              rawDepth = min(rawDepth, texture2D(material_SSROpaqueDepthTexture, sampleUV).r);
            }
          }
        #else
          float rawDepth = texture2D(material_SSROpaqueDepthTexture, v.v_uv).r;
        #endif

        #ifdef SSR_HAS_CONTRIB_DEPTH
          float contribRawDepth = texture2D(material_SSRContribDepthTexture, v.v_uv).r;
          rawDepth = min(rawDepth, contribRawDepth);
        #endif

        float farClip = camera_ProjectionParams.z;
        float eyeDepth = rawDepth >= 0.999999 ? farClip : remapDepthBufferEyeDepth(rawDepth);
        gl_FragColor = encodeSSRDepth(eyeDepth, farClip);
      }
    }

    Pass "BuildHiZMipN" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = buildHiZMipNFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      highp sampler2D material_SSRHiZInputTexture;
      vec4 material_SSRSourceTexelSize;
      vec4 material_SSRDestTexelSize;
      float renderer_BlitMipLevel;

      void buildHiZMipNFragment(Varyings v) {
        float farClip = camera_ProjectionParams.z;
        vec2 invSrc = material_SSRSourceTexelSize.xy;
        ivec2 srcSize = max(ivec2(material_SSRSourceTexelSize.zw + vec2(0.5)), ivec2(1));
        ivec2 dstSize = max(ivec2(material_SSRDestTexelSize.zw + vec2(0.5)), ivec2(1));
        ivec2 dstCoord = ivec2(floor(gl_FragCoord.xy));
        int x0 = clamp((dstCoord.x * srcSize.x) / dstSize.x, 0, srcSize.x - 1);
        int x1 = clamp(((dstCoord.x + 1) * srcSize.x + dstSize.x - 1) / dstSize.x - 1, x0, srcSize.x - 1);
        int y0 = clamp((dstCoord.y * srcSize.y) / dstSize.y, 0, srcSize.y - 1);
        int y1 = clamp(((dstCoord.y + 1) * srcSize.y + dstSize.y - 1) / dstSize.y - 1, y0, srcSize.y - 1);

        float minD = farClip;
        for (int dy = 0; dy < 3; ++dy) {
          int sy = y0 + dy;
          if (sy > y1) {
            break;
          }
          for (int dx = 0; dx < 3; ++dx) {
            int sx = x0 + dx;
            if (sx > x1) {
              break;
            }
            vec2 sampleUV = (vec2(float(sx), float(sy)) + vec2(0.5)) * invSrc;
            minD = min(minD, decodeSSRDepth(textureLod(material_SSRHiZInputTexture, sampleUV, renderer_BlitMipLevel), farClip));
          }
        }

        gl_FragColor = encodeSSRDepth(minD, farClip);
      }
    }

    Pass "CopyTexture" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = copyTextureFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      highp sampler2D material_SSRCopyTexture;
      vec4 renderer_SourceScaleOffset;
      float renderer_BlitMipLevel;

      void copyTextureFragment(Varyings v) {
        vec2 uv = v.v_uv * renderer_SourceScaleOffset.xy + renderer_SourceScaleOffset.zw;
        gl_FragColor = textureLod(material_SSRCopyTexture, uv, renderer_BlitMipLevel);
      }
    }

    Pass "HiZTrace" {
      Bool material_SSRUseHardwareStencil;

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      StencilState = {
        Enabled = material_SSRUseHardwareStencil;
        ReferenceValue = 1;
        Mask = 255;
        WriteMask = 0;
        CompareFunctionFront = CompareFunction.Equal;
        CompareFunctionBack = CompareFunction.Equal;
        PassOperationFront = StencilOperation.Keep;
        PassOperationBack = StencilOperation.Keep;
        FailOperationFront = StencilOperation.Keep;
        FailOperationBack = StencilOperation.Keep;
        ZFailOperationFront = StencilOperation.Keep;
        ZFailOperationBack = StencilOperation.Keep;
      }

      VertexShader = vert;
      FragmentShader = hiZTraceFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      highp sampler2D material_SSRHiZTexture;
      highp sampler2D material_SSRNormalRoughnessTexture;
      highp sampler2D material_SSRReceiverDepthTexture;
      highp sampler2D material_SSRPrevColorPyramidTexture;
      highp sampler2D material_SSRPrevTraceDepthTexture;

      mat4 camera_SSRInvProjMat;
      mat4 camera_SSRInvViewMat;
      mat4 camera_SSRPrevVPMat;
      vec4 camera_SSRPrevViewZRow;

      vec4 material_SSRTraceTexelSize;     // 1/w, 1/h, w, h
      vec4 material_SSRColorPyramidInfo;  // x: maxColorMip, y: colorW, z: colorH, w: frameJitter
      vec4 material_SSRTraceSettings;     // x: maxDistance, y: thickness, z: maxRoughness, w: edgeFade
      float material_SSRMaxSteps;
      float material_SSRHiZMaxMip;

      struct SSRTraceOutput {
        layout(location = 0) vec4 reflection;
        #ifdef SSR_OUTPUT_HIT_DIST
          layout(location = 1) vec4 hitDist;
        #endif
      };

      float computeBorderFade(vec2 uv, float edgeFade) {
        if (edgeFade <= 0.0) {
          return (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) ? 1.0 : 0.0;
        }
        vec2 edge = min(uv, vec2(1.0) - uv);
        return saturate(min(edge.x, edge.y) / edgeFade);
      }

      SSRTraceOutput hiZTraceFragment(Varyings v) {
        SSRTraceOutput output;
        output.reflection = vec4(0.0);
        #ifdef SSR_OUTPUT_HIT_DIST
          output.hitDist = vec4(0.0);
        #endif

        float farClip = camera_ProjectionParams.z;
        float farSentinel = getSSRFarSentinel(farClip);
        float nearClip = camera_ProjectionParams.y;

        float startEyeDepth = decodeSSRDepth(texture2D(material_SSRReceiverDepthTexture, v.v_uv), farClip);
        if (startEyeDepth <= 0.0 || startEyeDepth >= farSentinel) {
          return output;
        }

        vec3 worldNormal;
        float roughness;
        if (!unpackSSRNormalRoughness(texture2D(material_SSRNormalRoughnessTexture, v.v_uv), worldNormal, roughness)) {
          return output;
        }

        float maxRoughness = material_SSRTraceSettings.z;
        if (roughness >= maxRoughness) {
          return output;
        }

        vec3 startPosVS = reconstructSSRViewPosition(v.v_uv, startEyeDepth, camera_SSRInvProjMat);
        vec3 normalVS = normalize(mat3(camera_ViewMat) * worldNormal);
        #ifdef CAMERA_ORTHOGRAPHIC
          vec3 viewRayVS = vec3(0.0, 0.0, -1.0);
        #else
          vec3 viewRayVS = normalize(startPosVS);
        #endif

        if (dot(-viewRayVS, normalVS) <= 0.0) {
          return output;
        }

        vec3 reflDirVS = normalize(reflect(viewRayVS, normalVS));
        float normalBias = max(0.008, startEyeDepth * 0.004);
        vec3 rayStartVS = startPosVS + normalVS * normalBias;

        float maxDistance = min(material_SSRTraceSettings.x, farClip);
        if (reflDirVS.z > 1e-5) {
          float tNear = (-nearClip - 0.01 - rayStartVS.z) / reflDirVS.z;
          if (tNear <= 0.0) {
            return output;
          }
          maxDistance = min(maxDistance, tNear);
        }

        vec3 rayEndVS = rayStartVS + reflDirVS * maxDistance;
        vec4 startCS = camera_ProjMat * vec4(rayStartVS, 1.0);
        vec4 endCS = camera_ProjMat * vec4(rayEndVS, 1.0);
        if (startCS.w <= EPSILON || endCS.w <= EPSILON) {
          return output;
        }

        vec2 startUV = startCS.xy / startCS.w * 0.5 + 0.5;
        vec2 endUV = endCS.xy / endCS.w * 0.5 + 0.5;
        vec2 fullDeltaUV = endUV - startUV;

        vec2 traceMin = material_SSRTraceTexelSize.xy * 0.5;
        vec2 traceMax = vec2(1.0) - traceMin;
        float clipFrac = 1.0;
        if (fullDeltaUV.x > EPSILON) {
          clipFrac = min(clipFrac, (traceMax.x - startUV.x) / fullDeltaUV.x);
        } else if (fullDeltaUV.x < -EPSILON) {
          clipFrac = min(clipFrac, (traceMin.x - startUV.x) / fullDeltaUV.x);
        }
        if (fullDeltaUV.y > EPSILON) {
          clipFrac = min(clipFrac, (traceMax.y - startUV.y) / fullDeltaUV.y);
        } else if (fullDeltaUV.y < -EPSILON) {
          clipFrac = min(clipFrac, (traceMin.y - startUV.y) / fullDeltaUV.y);
        }
        clipFrac = clamp(clipFrac, 0.0, 1.0);
        if (clipFrac <= 0.0) {
          return output;
        }

        vec2 clippedEndUV = mix(startUV, endUV, clipFrac);
        vec2 dirUV = clippedEndUV - startUV;
        vec2 traceSize = material_SSRTraceTexelSize.zw;
        float totalPx = length(dirUV * traceSize);
        if (totalPx < 1.0) {
          return output;
        }

        float invW0 = 1.0 / startCS.w;
        float invW1 = mix(invW0, 1.0 / endCS.w, clipFrac);
        float zOverW0 = rayStartVS.z * invW0;
        float zOverW1 = mix(zOverW0, rayEndVS.z / endCS.w, clipFrac);
        float q0 = -zOverW0;
        float q1 = -zOverW1;

        float dfPerPx = 1.0 / max(totalPx, 1.0);
        float jitter = interleavedGradientNoise(gl_FragCoord.xy + vec2(material_SSRColorPyramidInfo.w));
        float f = min(dfPerPx * (1.0 + jitter * 0.25), 0.999);

        vec2 dirSign = step(vec2(0.0), dirUV);

        int maxSteps = int(material_SSRMaxSteps);
        int maxMip = int(material_SSRHiZMaxMip);
        int mip = 0;
        float thicknessFloor = material_SSRTraceSettings.y;

        bool hit = false;
        float hitF = 0.0;
        float hitSceneDepth = farClip;
        float hitEffThickness = thicknessFloor;

        int fgBlockCount = 0;
        int stepsUsed = 0;
        bool escapeToLinear = false;
        float prevLinearF = f;
        float prevLinearDiff = -1.0;

        // Stage 1: Conservative Hi-Z traversal. If the ray is repeatedly trapped behind a
        // foreground occluder (e.g. thin foreground tree branches dilating coarse min-depth tiles),
        // break out and finish with remaining budget in Stage 2 without branch divergence here.
        for (int i = 0; i < 64; ++i) {
          if (i >= maxSteps || f >= 1.0) {
            break;
          }
          stepsUsed = i + 1;

          vec2 uv = startUV + dirUV * f;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
          }

          vec2 mipCount = max(vec2(1.0), floor(traceSize * exp2(-float(mip))));
          vec2 cellIdx = floor(uv * mipCount);
          float tEdgeX = abs(dirUV.x) > 1e-6 ? ((cellIdx.x + dirSign.x) / mipCount.x - uv.x) / dirUV.x : 1e6;
          float tEdgeY = abs(dirUV.y) > 1e-6 ? ((cellIdx.y + dirSign.y) / mipCount.y - uv.y) / dirUV.y : 1e6;
          float fExit = min(1.0, f + max(min(tEdgeX, tEdgeY), 0.0));
          float fNext = min(1.0, fExit + dfPerPx * 0.15);

          float rayZ0 = mix(q0, q1, f) / max(mix(invW0, invW1, f), EPSILON);
          float rayZ1 = mix(q0, q1, fExit) / max(mix(invW0, invW1, fExit), EPSILON);
          float rayMinZ = min(rayZ0, rayZ1);
          float rayMaxZ = max(rayZ0, rayZ1);

          float cellMinDepth = decodeSSRDepth(textureLod(material_SSRHiZTexture, uv, float(mip)), farClip);

          if (rayMaxZ < cellMinDepth) {
            f = fNext;
            prevLinearF = f;
            prevLinearDiff = rayMaxZ - cellMinDepth;
            if (mip < maxMip) {
              vec2 parentMipCount = max(vec2(1.0), floor(traceSize * exp2(-float(mip + 1))));
              vec2 nextUV = startUV + dirUV * f;
              vec2 oldParent = floor(uv * parentMipCount);
              vec2 newParent = floor(nextUV * parentMipCount);
              if (oldParent.x != newParent.x || oldParent.y != newParent.y) {
                mip++;
              }
            }
          } else if (mip > 0) {
            float fgTol = max(thicknessFloor, cellMinDepth * 0.02);
            if (rayMinZ > cellMinDepth + fgTol) {
              fgBlockCount++;
              if (fgBlockCount >= 3) {
                escapeToLinear = true;
                break;
              }
            } else if (rayZ0 < cellMinDepth && rayZ1 >= cellMinDepth) {
              float denom = (q1 - q0) - cellMinDepth * (invW1 - invW0);
              if (abs(denom) > 1e-7) {
                float fPlane = (cellMinDepth * invW0 - q0) / denom;
                if (fPlane > f && fPlane < fExit) {
                  f = max(f, fPlane - dfPerPx * 0.05);
                }
              }
            }
            mip--;
          } else {
            float spanZ = abs(rayZ1 - rayZ0);
            float effThickness = max(thicknessFloor, cellMinDepth * 0.015 + spanZ * 1.5);
            if (cellMinDepth < farSentinel && rayMinZ <= cellMinDepth + effThickness) {
              // Analytic intersection within the Point-filtered mip 0 cell [f, fExit]
              float denom = (q1 - q0) - cellMinDepth * (invW1 - invW0);
              if (abs(denom) > 1e-7) {
                hitF = clamp((cellMinDepth * invW0 - q0) / denom, f, fExit);
              } else {
                hitF = 0.5 * (f + fExit);
              }
              hitSceneDepth = cellMinDepth;
              hitEffThickness = effThickness;
              hit = true;
              break;
            }
            fgBlockCount++;
            if (fgBlockCount >= 3) {
              escapeToLinear = true;
              prevLinearF = f;
              prevLinearDiff = rayZ0 - cellMinDepth;
              f = fNext;
              break;
            }
            f = fNext;
          }
        }

        // Stage 2: Foreground-occluder escape using remaining step budget on Hi-Z mip 0.
        // Unobstructed warps skip this loop completely.
        if (escapeToLinear && !hit && stepsUsed < maxSteps && f < 1.0) {
          int remainingSteps = maxSteps - stepsUsed;
          float strideF = max((1.0 - f) / float(max(remainingSteps, 1)), dfPerPx * 2.0);
          float prevRayZ = mix(q0, q1, prevLinearF) / max(mix(invW0, invW1, prevLinearF), EPSILON);
          int binaryRefines = 0;

          for (int j = 0; j < 64; ++j) {
            if (stepsUsed >= maxSteps || f >= 1.0) {
              break;
            }
            stepsUsed++;

            float fNext = min(1.0, f + strideF);
            vec2 uvNext = startUV + dirUV * fNext;
            if (uvNext.x < 0.0 || uvNext.x > 1.0 || uvNext.y < 0.0 || uvNext.y > 1.0) {
              break;
            }

            float rayZ = mix(q0, q1, fNext) / max(mix(invW0, invW1, fNext), EPSILON);
            float sceneZ = decodeSSRDepth(textureLod(material_SSRHiZTexture, uvNext, 0.0), farClip);
            float diff = rayZ - sceneZ;

            if (diff >= 0.0 && prevLinearDiff < 0.0 && binaryRefines < 3) {
              binaryRefines++;
              float lo = prevLinearF;
              float hi = fNext;
              float hiSceneZ = sceneZ;
              for (int b = 0; b < 3; ++b) {
                float mid = 0.5 * (lo + hi);
                float mZ = mix(q0, q1, mid) / max(mix(invW0, invW1, mid), EPSILON);
                float mS = decodeSSRDepth(textureLod(material_SSRHiZTexture, startUV + dirUV * mid, 0.0), farClip);
                if (mZ - mS >= 0.0) {
                  hi = mid;
                  hiSceneZ = mS;
                } else {
                  lo = mid;
                }
              }
              float zLo = mix(q0, q1, lo) / max(mix(invW0, invW1, lo), EPSILON);
              float zHi = mix(q0, q1, hi) / max(mix(invW0, invW1, hi), EPSILON);
              float effT = max(thicknessFloor, hiSceneZ * 0.015 + abs(zHi - zLo) * 1.5);
              if (hiSceneZ < farSentinel && zHi <= hiSceneZ + effT) {
                float denom = (q1 - q0) - hiSceneZ * (invW1 - invW0);
                if (abs(denom) > 1e-7) {
                  hitF = clamp((hiSceneZ * invW0 - q0) / denom, lo, hi);
                } else {
                  hitF = 0.5 * (lo + hi);
                }
                hitSceneDepth = hiSceneZ;
                hitEffThickness = effT;
                hit = true;
                break;
              }
            } else if (diff >= 0.0 && prevLinearDiff >= 0.0 && sceneZ < farSentinel) {
              float directTol = max(thicknessFloor, sceneZ * 0.015 + abs(rayZ - prevRayZ) * 0.5);
              if (diff <= directTol) {
                hitF = fNext;
                hitSceneDepth = sceneZ;
                hitEffThickness = directTol;
                hit = true;
                break;
              }
            }

            prevLinearF = fNext;
            prevLinearDiff = diff;
            prevRayZ = rayZ;
            f = fNext;
          }
        }

        if (!hit) {
          return output;
        }

        vec2 hitUV = startUV + dirUV * hitF;
        vec3 hitPosVS = reconstructSSRViewPosition(hitUV, hitSceneDepth, camera_SSRInvProjMat);
        float hitDist = length(hitPosVS - startPosVS);
        if (hitDist > maxDistance) {
          return output;
        }

        vec3 hitPosWS = (camera_SSRInvViewMat * vec4(hitPosVS, 1.0)).xyz;
        vec4 prevClip = camera_SSRPrevVPMat * vec4(hitPosWS, 1.0);
        if (prevClip.w <= EPSILON) {
          return output;
        }

        vec2 prevColorUV = prevClip.xy / prevClip.w * 0.5 + 0.5;
        float edgeFade = material_SSRTraceSettings.w;
        float screenFade = computeBorderFade(hitUV, edgeFade) * computeBorderFade(prevColorUV, edgeFade);
        if (screenFade <= 0.0) {
          return output;
        }

        // Disocclusion check against Frame N-1 Hi-Z mip0 depth
        float prevHitEyeDepth = -dot(camera_SSRPrevViewZRow, vec4(hitPosWS, 1.0));
        float prevSceneEyeDepth = decodeSSRDepth(texture2D(material_SSRPrevTraceDepthTexture, prevColorUV), farClip);
        float disoccTolerance = max(0.15, prevSceneEyeDepth * 0.05 + hitDist * 0.02);
        float disoccDiff = abs(prevHitEyeDepth - prevSceneEyeDepth);
        float historyConfidence = (prevSceneEyeDepth <= 0.0 || prevSceneEyeDepth >= farSentinel)
          ? 0.0
          : (1.0 - smoothstep(disoccTolerance * 0.5, disoccTolerance * 1.5, disoccDiff));
        if (historyConfidence <= 0.001) {
          return output;
        }

        float distFade = 1.0 - smoothstep(maxDistance * 0.75, maxDistance, hitDist);
        float hitRayZ = mix(q0, q1, hitF) / max(mix(invW0, invW1, hitF), EPSILON);
        float hitDepthDelta = max(hitRayZ - hitSceneDepth, 0.0);
        float thicknessFade = 1.0 - smoothstep(hitEffThickness * 0.7, hitEffThickness, hitDepthDelta);
        float confidence = screenFade * historyConfidence * distFade * thicknessFade;
        if (confidence <= 0.001) {
          return output;
        }

        // Distance-aware cone mip lookup into previous linear color pyramid
        float projScale = abs(camera_ProjMat[1][1]) * material_SSRColorPyramidInfo.z * 0.5;
        #ifdef CAMERA_ORTHOGRAPHIC
          float coneRadiusPx = hitDist * roughness * roughness * projScale;
        #else
          float coneRadiusPx = (hitDist * roughness * roughness * projScale) / max(hitSceneDepth, 0.1);
        #endif
        float maxColorMip = material_SSRColorPyramidInfo.x;
        float coneMip = clamp(log2(max(coneRadiusPx, 1.0)), 0.0, maxColorMip);

        vec3 radiance = textureLod(material_SSRPrevColorPyramidTexture, prevColorUV, coneMip).rgb;
        radiance = max(radiance, vec3(0.0));

        output.reflection = vec4(radiance * confidence, confidence);
        #ifdef SSR_OUTPUT_HIT_DIST
          output.hitDist = encodeSSRDepth(hitDist, farClip);
        #endif
        return output;
      }
    }

    Pass "TemporalResolve" {
      Bool material_SSRUseHardwareStencil;

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      StencilState = {
        Enabled = material_SSRUseHardwareStencil;
        ReferenceValue = 1;
        Mask = 255;
        WriteMask = 0;
        CompareFunctionFront = CompareFunction.Equal;
        CompareFunctionBack = CompareFunction.Equal;
        PassOperationFront = StencilOperation.Keep;
        PassOperationBack = StencilOperation.Keep;
        FailOperationFront = StencilOperation.Keep;
        FailOperationBack = StencilOperation.Keep;
        ZFailOperationFront = StencilOperation.Keep;
        ZFailOperationBack = StencilOperation.Keep;
      }

      VertexShader = vert;
      FragmentShader = temporalResolveFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      highp sampler2D material_SSRTraceRawTexture;
      highp sampler2D material_SSRPrevSSRTexture;
      highp sampler2D material_SSRReceiverDepthTexture;
      highp sampler2D material_SSRPrevReceiverDepthTexture;

      vec4 material_SSRTraceTexelSize;
      mat4 camera_SSRInvProjMat;
      mat4 camera_SSRInvViewMat;
      mat4 camera_SSRPrevVPMat;
      mat4 camera_SSRPrevInvProjMat;
      mat4 camera_SSRPrevInvViewMat;
      vec4 camera_SSRPrevViewZRow;
      float material_SSRTemporalBlend;

      #ifdef SSR_HIGH_VIRTUAL_REPROJECTION
        highp sampler2D material_SSRHitDistTexture;
        highp sampler2D material_SSRNormalRoughnessTexture;
        highp sampler2D material_SSRPrevNormalRoughnessTexture;
      #endif

      void temporalResolveFragment(Varyings v) {
        float farClip = camera_ProjectionParams.z;
        float farSentinel = getSSRFarSentinel(farClip);
        vec2 uv = v.v_uv;

        float currRecvEyeDepth = decodeSSRDepth(texture2D(material_SSRReceiverDepthTexture, uv), farClip);
        if (currRecvEyeDepth <= 0.0 || currRecvEyeDepth >= farSentinel) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec4 currCenter = texture2D(material_SSRTraceRawTexture, uv);

        // 3x3 neighborhood variance clamp on current raw trace
        vec2 texel = material_SSRTraceTexelSize.xy;
        vec4 m1 = vec4(0.0);
        vec4 m2 = vec4(0.0);
        for (int y = -1; y <= 1; ++y) {
          for (int x = -1; x <= 1; ++x) {
            vec4 sampleColor = texture2D(material_SSRTraceRawTexture, clamp(uv + vec2(float(x), float(y)) * texel, vec2(0.0), vec2(1.0)));
            m1 += sampleColor;
            m2 += sampleColor * sampleColor;
          }
        }
        vec4 mean = m1 * (1.0 / 9.0);
        vec4 variance = max(m2 * (1.0 / 9.0) - mean * mean, vec4(0.0));
        vec4 stddev = sqrt(variance);
        vec4 clampMin = max(vec4(0.0), mean - stddev * 1.25);
        vec4 clampMax = mean + stddev * 1.25;

        vec3 surfacePosVS = reconstructSSRViewPosition(uv, currRecvEyeDepth, camera_SSRInvProjMat);
        vec3 surfacePosWS = (camera_SSRInvViewMat * vec4(surfacePosVS, 1.0)).xyz;

        vec2 prevUV = vec2(0.0);
        float historyWeight = material_SSRTemporalBlend;

        #ifdef SSR_HIGH_VIRTUAL_REPROJECTION
          vec3 currNormal;
          float roughness;
          vec4 currNRTexel = texture2D(material_SSRNormalRoughnessTexture, uv);
          bool hasCurrNR = unpackSSRNormalRoughness(currNRTexel, currNormal, roughness);
          float hitDist = decodeSSRDepth(texture2D(material_SSRHitDistTexture, uv), farClip);
          bool virtValid = false;
          vec2 virtPrevUV = vec2(0.0);
          float virtNormalDot = 0.0;

          if (hasCurrNR && hitDist > 0.0 && hitDist < farSentinel) {
            #ifdef CAMERA_ORTHOGRAPHIC
              vec3 rayDirWS = normalize(camera_Forward);
            #else
              vec3 rayDirWS = normalize(surfacePosWS - camera_Position);
            #endif
            vec3 virtualPosWS = surfacePosWS + rayDirWS * hitDist;
            float surfFactor = smoothstep(0.05, 0.35, roughness);
            vec3 reprojWS = mix(virtualPosWS, surfacePosWS, surfFactor);

            vec4 virtPrevClip = camera_SSRPrevVPMat * vec4(reprojWS, 1.0);
            if (virtPrevClip.w > EPSILON) {
              virtPrevUV = virtPrevClip.xy / virtPrevClip.w * 0.5 + 0.5;
              if (virtPrevUV.x >= 0.0 && virtPrevUV.x <= 1.0 && virtPrevUV.y >= 0.0 && virtPrevUV.y <= 1.0) {
                float virtPrevDepth = decodeSSRDepth(texture2D(material_SSRPrevReceiverDepthTexture, virtPrevUV), farClip);
                if (virtPrevDepth > 0.0 && virtPrevDepth < farSentinel) {
                  vec3 virtPrevSurfVS = reconstructSSRViewPosition(virtPrevUV, virtPrevDepth, camera_SSRPrevInvProjMat);
                  vec3 virtPrevSurfWS = (camera_SSRPrevInvViewMat * vec4(virtPrevSurfVS, 1.0)).xyz;
                  float planeDist = abs(dot(virtPrevSurfWS - surfacePosWS, currNormal));
                  float planeTol = max(0.05, currRecvEyeDepth * 0.03);
                  if (planeDist <= planeTol) {
                    vec3 prevNormal;
                    float prevRoughness;
                    if (unpackSSRNormalRoughness(texture2D(material_SSRPrevNormalRoughnessTexture, virtPrevUV), prevNormal, prevRoughness)) {
                      virtNormalDot = dot(currNormal, prevNormal);
                      if (virtNormalDot > 0.5) {
                        virtValid = true;
                      }
                    }
                  }
                }
              }
            }
          }

          if (virtValid) {
            prevUV = virtPrevUV;
            historyWeight *= pow(saturate(virtNormalDot), 4.0);
          } else {
            // Fall back to surface reprojection only when virtual reprojection fails.
            vec4 surfPrevClip = camera_SSRPrevVPMat * vec4(surfacePosWS, 1.0);
            if (surfPrevClip.w <= EPSILON) {
              gl_FragColor = currCenter;
              return;
            }
            vec2 surfPrevUV = surfPrevClip.xy / surfPrevClip.w * 0.5 + 0.5;
            if (surfPrevUV.x < 0.0 || surfPrevUV.x > 1.0 || surfPrevUV.y < 0.0 || surfPrevUV.y > 1.0) {
              gl_FragColor = currCenter;
              return;
            }
            float surfPrevRecvDepth = decodeSSRDepth(texture2D(material_SSRPrevReceiverDepthTexture, surfPrevUV), farClip);
            float expectedPrevEyeDepth = -dot(camera_SSRPrevViewZRow, vec4(surfacePosWS, 1.0));
            float recvTol = max(0.05, expectedPrevEyeDepth * 0.03);
            if (surfPrevRecvDepth <= 0.0 || surfPrevRecvDepth >= farSentinel || abs(expectedPrevEyeDepth - surfPrevRecvDepth) > recvTol) {
              gl_FragColor = currCenter;
              return;
            }
            vec3 prevNormal;
            float prevRoughness;
            if (hasCurrNR && unpackSSRNormalRoughness(texture2D(material_SSRPrevNormalRoughnessTexture, surfPrevUV), prevNormal, prevRoughness)) {
              float surfNormalDot = dot(currNormal, prevNormal);
              if (surfNormalDot <= 0.5) {
                gl_FragColor = currCenter;
                return;
              }
              prevUV = surfPrevUV;
              historyWeight *= pow(saturate(surfNormalDot), 4.0);
            } else {
              gl_FragColor = currCenter;
              return;
            }
          }
        #else
          vec4 surfPrevClip = camera_SSRPrevVPMat * vec4(surfacePosWS, 1.0);
          if (surfPrevClip.w <= EPSILON) {
            gl_FragColor = currCenter;
            return;
          }
          prevUV = surfPrevClip.xy / surfPrevClip.w * 0.5 + 0.5;
          if (prevUV.x < 0.0 || prevUV.x > 1.0 || prevUV.y < 0.0 || prevUV.y > 1.0) {
            gl_FragColor = currCenter;
            return;
          }
          float surfPrevRecvDepth = decodeSSRDepth(texture2D(material_SSRPrevReceiverDepthTexture, prevUV), farClip);
          float expectedPrevEyeDepth = -dot(camera_SSRPrevViewZRow, vec4(surfacePosWS, 1.0));
          float recvTol = max(0.05, expectedPrevEyeDepth * 0.03);
          if (surfPrevRecvDepth <= 0.0 || surfPrevRecvDepth >= farSentinel || abs(expectedPrevEyeDepth - surfPrevRecvDepth) > recvTol) {
            gl_FragColor = currCenter;
            return;
          }
        #endif

        vec4 prevColor = clamp(texture2D(material_SSRPrevSSRTexture, prevUV), clampMin, clampMax);
        gl_FragColor = mix(currCenter, prevColor, historyWeight);
      }
    }

    Pass "ColorPyramidPrefilter" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = colorPyramidPrefilterFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      highp sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;
      vec4 renderer_SourceScaleOffset;
      vec4 material_SSRDestTexelSize;

      vec3 sanitizeHDR(vec3 c) {
        vec3 nonNeg = vec3(
          c.r >= 0.0 ? c.r : 0.0,
          c.g >= 0.0 ? c.g : 0.0,
          c.b >= 0.0 ? c.b : 0.0
        );
        return min(nonNeg, vec3(65504.0));
      }

      float karisWeight(vec3 c) {
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return 1.0 / (1.0 + lum);
      }

      void colorPyramidPrefilterFragment(Varyings v) {
        vec2 scale = renderer_SourceScaleOffset.xy;
        vec2 offset = renderer_SourceScaleOffset.zw;
        vec2 baseUV = v.v_uv * scale + offset;
        vec2 hs = max(renderer_texelSize.xy * 0.5, material_SSRDestTexelSize.xy * scale * 0.25);
        vec2 inset = min(hs, scale * 0.5);
        vec2 uvMin = offset + inset;
        vec2 uvMax = offset + scale - inset;
        #ifdef SSR_COLOR_PYRAMID_FULL_RES
          vec3 avg = sanitizeHDR(texture2D(renderer_BlitTexture, clamp(baseUV, uvMin, uvMax)).rgb);
          gl_FragColor = vec4(avg, 1.0);
        #else
          vec3 c0 = sanitizeHDR(texture2D(renderer_BlitTexture, clamp(baseUV + vec2(-hs.x, -hs.y), uvMin, uvMax)).rgb);
          vec3 c1 = sanitizeHDR(texture2D(renderer_BlitTexture, clamp(baseUV + vec2( hs.x, -hs.y), uvMin, uvMax)).rgb);
          vec3 c2 = sanitizeHDR(texture2D(renderer_BlitTexture, clamp(baseUV + vec2(-hs.x,  hs.y), uvMin, uvMax)).rgb);
          vec3 c3 = sanitizeHDR(texture2D(renderer_BlitTexture, clamp(baseUV + vec2( hs.x,  hs.y), uvMin, uvMax)).rgb);

          float w0 = karisWeight(c0);
          float w1 = karisWeight(c1);
          float w2 = karisWeight(c2);
          float w3 = karisWeight(c3);
          vec3 avg = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 1e-4);
          gl_FragColor = vec4(avg, 1.0);
        #endif
      }
    }

    Pass "ColorPyramidDownsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = colorPyramidDownsampleFragment;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      highp sampler2D renderer_BlitTexture;
      float renderer_BlitMipLevel;
      vec4 material_SSRSourceTexelSize;

      #ifdef SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE
        float karisWeight(vec3 c) {
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          return 1.0 / (1.0 + lum);
        }
      #endif

      void colorPyramidDownsampleFragment(Varyings v) {
        // 5-tap Dual Kawase downsample using bilinear taps at half-texel corners + center
        vec2 offset = material_SSRSourceTexelSize.xy;
        vec2 uvMin = offset * 0.5;
        vec2 uvMax = vec2(1.0) - uvMin;
        vec3 cCenter = textureLod(renderer_BlitTexture, clamp(v.v_uv, uvMin, uvMax), renderer_BlitMipLevel).rgb;
        vec3 c0 = textureLod(renderer_BlitTexture, clamp(v.v_uv + vec2(-offset.x, -offset.y), uvMin, uvMax), renderer_BlitMipLevel).rgb;
        vec3 c1 = textureLod(renderer_BlitTexture, clamp(v.v_uv + vec2( offset.x, -offset.y), uvMin, uvMax), renderer_BlitMipLevel).rgb;
        vec3 c2 = textureLod(renderer_BlitTexture, clamp(v.v_uv + vec2(-offset.x,  offset.y), uvMin, uvMax), renderer_BlitMipLevel).rgb;
        vec3 c3 = textureLod(renderer_BlitTexture, clamp(v.v_uv + vec2( offset.x,  offset.y), uvMin, uvMax), renderer_BlitMipLevel).rgb;
        #ifdef SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE
          float wCenter = 4.0 * karisWeight(cCenter);
          float w0 = karisWeight(c0);
          float w1 = karisWeight(c1);
          float w2 = karisWeight(c2);
          float w3 = karisWeight(c3);
          vec3 sum = (cCenter * wCenter + c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(wCenter + w0 + w1 + w2 + w3, 1e-4);
          gl_FragColor = vec4(max(sum, vec3(0.0)), 1.0);
        #else
          vec3 sum = cCenter * 4.0 + c0 + c1 + c2 + c3;
          gl_FragColor = vec4(max(sum * 0.125, vec3(0.0)), 1.0);
        #endif
      }
    }
  }
}
