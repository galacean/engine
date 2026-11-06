Shader "Lighting/ScreenSpaceReflection" {
  SubShader "Default" {
    Pass "Trace" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = traceScreenSpaceReflection;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      highp sampler2D material_SSRSceneColorTexture;
      highp sampler2D material_SSRSceneDepthTexture;
      highp sampler2D material_SSROpaqueDepthTexture;
      highp sampler2D material_SSRSurfaceTexture;
      highp sampler2D material_SSRReceiverDepthTexture;
      vec4 material_SSRSurfaceTexelSize;
      vec4 material_SSRTraceTexelSize;
      float material_SSRMaxDistance;
      float material_SSRRayLengthFade;
      float material_SSRThickness;
      float material_SSRMaxRoughness;
      float material_SSREdgeFade;
      float material_SSRMaxSteps;
      float material_SSRBinarySteps;
      float material_SSRDebugMode;

      struct ScreenSpaceReflectionTraceOutput {
        layout(location = 0) vec4 reflection;
        #ifdef SSR_STORE_TRACE_ORIGIN
          layout(location = 1) vec4 origin;
        #endif
      };

      vec4 packScreenSpaceReflectionOrigin(vec2 uv) {
        vec2 encoded = floor(clamp(uv, vec2(0.0), vec2(1.0)) * 65535.0 + 0.5);
        vec2 highBytes = floor(encoded / 256.0);
        vec2 lowBytes = encoded - highBytes * 256.0;
        return vec4(highBytes.x, lowBytes.x, highBytes.y, lowBytes.y) / 255.0;
      }

      vec4 sampleScreenSpaceReflectionSceneColor(vec2 uv, float roughness) {
        #ifdef HAS_TEX_LOD
          return texture2DLodEXT(material_SSRSceneColorTexture, uv, roughness * 5.0);
        #else
          return texture2D(material_SSRSceneColorTexture, uv);
        #endif
      }

      bool projectScreenSpaceReflectionPoint(vec3 viewPosition, out vec2 uv, out float clipW) {
        vec4 clipPosition = camera_ProjMat * vec4(viewPosition, 1.0);
        clipW = clipPosition.w;
        if (clipW <= EPSILON) return false;
        uv = clipPosition.xy / clipPosition.w * 0.5 + 0.5;
        return true;
      }

      float screenSpaceReflectionRayFraction(float screenFraction, float startW, float endW) {
        float numerator = screenFraction * startW;
        float denominator = (1.0 - screenFraction) * endW + numerator;
        return numerator / max(denominator, EPSILON);
      }

      float clipScreenSpaceReflectionRay(vec2 startUV, vec2 deltaUV) {
        vec2 screenMin = material_SSRTraceTexelSize.xy * 0.5;
        vec2 screenMax = vec2(1.0) - screenMin;
        float clippedFraction = 1.0;
        if (deltaUV.x > EPSILON) {
          clippedFraction = min(clippedFraction, (screenMax.x - startUV.x) / deltaUV.x);
        } else if (deltaUV.x < -EPSILON) {
          clippedFraction = min(clippedFraction, (screenMin.x - startUV.x) / deltaUV.x);
        }
        if (deltaUV.y > EPSILON) {
          clippedFraction = min(clippedFraction, (screenMax.y - startUV.y) / deltaUV.y);
        } else if (deltaUV.y < -EPSILON) {
          clippedFraction = min(clippedFraction, (screenMin.y - startUV.y) / deltaUV.y);
        }
        return clamp(clippedFraction, 0.0, 1.0);
      }

      vec2 sampleScreenSpaceReflectionDepthDifference(vec3 rayPosition, vec2 uv) {
        float rawSceneDepth = texture2D(material_SSRSceneDepthTexture, uv).r;
        if (rawSceneDepth >= 0.999999) return vec2(-1.0, 0.0);
        float sceneEyeDepth = remapDepthBufferEyeDepth(rawSceneDepth);
        return vec2(-rayPosition.z - sceneEyeDepth, sceneEyeDepth);
      }

      float resolveScreenSpaceReflectionThickness(
        float sceneEyeDepth,
        float refinementDepthUncertainty
      ) {
        // One percent of linear depth keeps the accepted object thickness
        // approximately stable in projected size while the metre value remains
        // the near-field floor
        float depthRelativeThickness = sceneEyeDepth * 0.01;
        return max(
          material_SSRThickness,
          max(depthRelativeThickness, refinementDepthUncertainty)
        );
      }

      bool selectScreenSpaceReflectionReceiver(
        vec2 traceUV,
        out vec2 receiverUV,
        out vec4 receiverSurface,
        out float receiverDepth
      ) {
        vec2 tracePixel = clamp(
          floor(traceUV * material_SSRTraceTexelSize.zw),
          vec2(0.0),
          material_SSRTraceTexelSize.zw - vec2(1.0)
        );
        // Partition authoritative pixel centers between trace cells. Applying
        // floor/ceil directly to texel edges overlaps adjacent cells whenever
        // the full-resolution extent is odd, so two traces can claim the same
        // receiver and leave the full-resolution identity resolve phase-shifted.
        vec2 firstSurfacePixel = max(
          ceil(
            tracePixel * material_SSRSurfaceTexelSize.zw / material_SSRTraceTexelSize.zw
              - vec2(0.5)
          ),
          vec2(0.0)
        );
        vec2 surfacePixelEnd = min(
          ceil(
            (tracePixel + vec2(1.0)) * material_SSRSurfaceTexelSize.zw
              / material_SSRTraceTexelSize.zw
              - vec2(0.5)
          ),
          material_SSRSurfaceTexelSize.zw
        );
        vec2 preferredSurfacePixel = clamp(
          floor(traceUV * material_SSRSurfaceTexelSize.zw),
          firstSurfacePixel,
          max(surfacePixelEnd - vec2(1.0), firstSurfacePixel)
        );
        float closestPixelDistance = 100000000.0;
        bool found = false;
        receiverUV = vec2(0.0);
        receiverSurface = vec4(0.0);
        receiverDepth = 1.0;

        // resolutionScale is clamped to at least 0.25, so one trace cell covers
        // no more than 4x4 authoritative receiver pixels. Trace the stable pixel
        // represented by this low-resolution texel and only search spatially
        // nearby when that pixel has no receiver coverage.
        for (int y = 0; y < 4; ++y) {
          for (int x = 0; x < 4; ++x) {
            vec2 surfacePixel = firstSurfacePixel + vec2(float(x), float(y));
            if (
              surfacePixel.x >= surfacePixelEnd.x ||
              surfacePixel.y >= surfacePixelEnd.y ||
              surfacePixel.x >= material_SSRSurfaceTexelSize.z ||
              surfacePixel.y >= material_SSRSurfaceTexelSize.w
            ) {
              continue;
            }
            vec2 candidateUV = (surfacePixel + vec2(0.5)) * material_SSRSurfaceTexelSize.xy;
            vec4 candidateSurface = texture2D(material_SSRSurfaceTexture, candidateUV);
            if (candidateSurface.a <= 0.0 || candidateSurface.b >= material_SSRMaxRoughness) continue;

            float candidateDepth = texture2D(material_SSRReceiverDepthTexture, candidateUV).r;
            if (candidateDepth >= 0.999999) continue;
            float candidateEyeDepth = remapDepthBufferEyeDepth(candidateDepth);
            float rawSceneDepth = texture2D(material_SSROpaqueDepthTexture, candidateUV).r;
            if (rawSceneDepth < 0.999999) {
              float sceneEyeDepth = remapDepthBufferEyeDepth(rawSceneDepth);
              // Occlusion must not reuse the hit thickness: near a contact edge the hidden receiver
              // lies only a few centimetres behind the occluder, and a thickness-sized tolerance
              // would treat it as visible and composite its reflection onto the occluder pixel.
              float occlusionTolerance = sceneEyeDepth * 0.001;
              if (candidateEyeDepth > sceneEyeDepth + occlusionTolerance) continue;
            }
            vec2 pixelOffset = surfacePixel - preferredSurfacePixel;
            float pixelDistance = dot(pixelOffset, pixelOffset);
            if (pixelDistance < closestPixelDistance) {
              closestPixelDistance = pixelDistance;
              receiverUV = candidateUV;
              receiverSurface = candidateSurface;
              receiverDepth = candidateDepth;
              found = true;
            }
          }
        }
        return found;
      }

      vec4 evaluateScreenSpaceReflectionTrace(Varyings varyings, out vec4 packedOrigin) {
        vec2 uv;
        vec4 surface;
        float receiverDepth;
        packedOrigin = vec4(0.0);
        if (!selectScreenSpaceReflectionReceiver(varyings.v_uv, uv, surface, receiverDepth)) {
          return vec4(0.0);
        }
        #ifdef SSR_STORE_TRACE_ORIGIN
          packedOrigin = packScreenSpaceReflectionOrigin(uv);
        #endif

        vec3 viewPosition = reconstructScreenSpaceReflectionViewPosition(uv, receiverDepth);
        vec3 viewNormal = decodeScreenSpaceReflectionNormal(surface.rg);
        vec3 viewToSurface = normalize(viewPosition);
        vec3 rayDirection = normalize(reflect(viewToSurface, viewNormal));
        float receiverThickness = resolveScreenSpaceReflectionThickness(-viewPosition.z, 0.0);
        vec3 rayOrigin = viewPosition + viewNormal * min(receiverThickness * 0.25, 0.05);
        float rayLength = material_SSRMaxDistance;
        if (rayDirection.z > EPSILON) {
          rayLength = min(rayLength, max((-rayOrigin.z / rayDirection.z) * 0.999, 0.0));
        }
        if (rayLength <= EPSILON) return vec4(0.0);

        vec3 rayEnd = rayOrigin + rayDirection * rayLength;
        vec2 startUV;
        vec2 endUV;
        float startW;
        float endW;
        if (
          !projectScreenSpaceReflectionPoint(rayOrigin, startUV, startW) ||
          !projectScreenSpaceReflectionPoint(rayEnd, endUV, endW)
        ) {
          return vec4(0.0);
        }
        vec2 screenDelta = endUV - startUV;
        float clippedScreenFraction = clipScreenSpaceReflectionRay(startUV, screenDelta);
        vec2 clippedScreenDelta = screenDelta * clippedScreenFraction;
        float projectedPixelLength = max(
          abs(clippedScreenDelta.x) * material_SSRTraceTexelSize.z,
          abs(clippedScreenDelta.y) * material_SSRTraceTexelSize.w
        );
        float traceStepCount = min(max(ceil(projectedPixelLength), 1.0), max(material_SSRMaxSteps, 1.0));
        float screenStep = clippedScreenFraction / traceStepCount;

        // March uniformly along the projected major axis as URP Linear does
        // Perspective-correct conversion keeps the samples on the physical view-space ray
        float previousScreenFraction = 0.0;
        float previousDifference = -receiverThickness;
        float hitT = 0.0;
        float hitDifference = receiverThickness;
        float hitThickness = receiverThickness;
        vec2 hitUV = vec2(0.0);
        bool hit = false;
        float executedStepFraction = 0.0;

        for (int stepIndex = 0; stepIndex < 64; ++stepIndex) {
          if (float(stepIndex) >= traceStepCount) break;
          float currentScreenFraction = screenStep * (float(stepIndex) + 1.0);
          float currentRayFraction = screenSpaceReflectionRayFraction(
            currentScreenFraction,
            startW,
            endW
          );
          float currentT = rayLength * currentRayFraction;
          vec3 rayPosition = rayOrigin + rayDirection * currentT;
          vec2 projectedUV = startUV + screenDelta * currentScreenFraction;
          executedStepFraction = (float(stepIndex) + 1.0) / traceStepCount;

          float difference = sampleScreenSpaceReflectionDepthDifference(rayPosition, projectedUV).x;
          if (difference >= 0.0 && previousDifference < 0.0) {
            float lowScreenFraction = previousScreenFraction;
            float highScreenFraction = currentScreenFraction;
            vec2 refinedUV = projectedUV;
            for (int binaryIndex = 0; binaryIndex < 5; ++binaryIndex) {
              if (float(binaryIndex) >= material_SSRBinarySteps) break;
              float middleScreenFraction = (lowScreenFraction + highScreenFraction) * 0.5;
              float middleRayFraction = screenSpaceReflectionRayFraction(
                middleScreenFraction,
                startW,
                endW
              );
              float middleT = rayLength * middleRayFraction;
              vec3 middlePosition = rayOrigin + rayDirection * middleT;
              refinedUV = startUV + screenDelta * middleScreenFraction;
              float refinedDifference = sampleScreenSpaceReflectionDepthDifference(middlePosition, refinedUV).x;
              if (refinedDifference >= 0.0) highScreenFraction = middleScreenFraction;
              else lowScreenFraction = middleScreenFraction;
            }
            float lowRayFraction = screenSpaceReflectionRayFraction(lowScreenFraction, startW, endW);
            float highRayFraction = screenSpaceReflectionRayFraction(highScreenFraction, startW, endW);
            float hitRayFraction = (lowRayFraction + highRayFraction) * 0.5;
            hitT = rayLength * hitRayFraction;
            vec3 hitPosition = rayOrigin + rayDirection * hitT;
            float hitScreenFraction = (lowScreenFraction + highScreenFraction) * 0.5;
            hitUV = startUV + screenDelta * hitScreenFraction;
            if (all(greaterThanEqual(hitUV, vec2(0.0))) && all(lessThanEqual(hitUV, vec2(1.0)))) {
              vec2 hitDepthSample = sampleScreenSpaceReflectionDepthDifference(hitPosition, hitUV);
              hitDifference = abs(hitDepthSample.x);
              float refinementDepthUncertainty = abs(rayDirection.z) * rayLength *
                (highRayFraction - lowRayFraction) * 0.5;
              hitThickness = resolveScreenSpaceReflectionThickness(
                hitDepthSample.y,
                refinementDepthUncertainty
              );
              hit = hitDepthSample.y > 0.0 && hitDifference <= hitThickness;
            }
            if (hit) break;
            // A depth discontinuity can belong to a thin foreground object that the ray misses.
            // Keep the measured sign after rejecting it. A new bracket requires a real
            // front-to-back crossing, not another sample behind the same foreground surface.
            previousScreenFraction = currentScreenFraction;
            previousDifference = difference;
            continue;
          }

          previousScreenFraction = currentScreenFraction;
          previousDifference = difference;
        }

        if (!hit) {
          if (material_SSRDebugMode > 5.5) {
            return vec4(vec3(executedStepFraction), 1.0);
          }
          return vec4(0.0);
        }

        float edgeDistance = min(min(hitUV.x, hitUV.y), min(1.0 - hitUV.x, 1.0 - hitUV.y));
        float edgeConfidence = material_SSREdgeFade > EPSILON
          ? smoothstep(0.0, material_SSREdgeFade, edgeDistance)
          : 1.0;
        // Fade only near the physical ray limit; projected step count controls precision, not coverage
        float distanceFadeStart = max(rayLength - material_SSRRayLengthFade, 0.0);
        float distanceConfidence = material_SSRRayLengthFade > EPSILON
          ? 1.0 - smoothstep(distanceFadeStart, rayLength, hitT)
          : 1.0;
        float thicknessConfidence = 1.0 - smoothstep(
          hitThickness * 0.5,
          hitThickness,
          hitDifference
        );
        float roughnessConfidence = saturate(1.0 - surface.b / max(material_SSRMaxRoughness, EPSILON));
        float frontFaceConfidence = step(0.0, dot(viewNormal, -viewToSurface));
        // Reject only the unstable cone whose reflected ray points almost directly
        // back toward the camera. A linear NdotV term would suppress the grazing
        // angles where receiver BRDFs, especially dielectric Fresnel, are strongest.
        float viewRayAlignment = dot(viewToSurface, rayDirection);
        float stabilityConfidence = smoothstep(-1.0, -0.9, viewRayAlignment);
        float confidence = edgeConfidence * distanceConfidence * thicknessConfidence * roughnessConfidence
          * frontFaceConfidence * stabilityConfidence;
        if (material_SSRDebugMode > 5.5) {
          return vec4(vec3(executedStepFraction), confidence);
        }
        vec3 reflectionSample = sampleScreenSpaceReflectionSceneColor(hitUV, surface.b).rgb;
        // Premultiplication is required before half-resolution filtering. A
        // straight-alpha hit next to a cleared miss would otherwise interpolate
        // RGB toward black and then apply confidence a second time downstream.
        return vec4(reflectionSample * confidence, confidence);
      }

      ScreenSpaceReflectionTraceOutput traceScreenSpaceReflection(Varyings varyings) {
        ScreenSpaceReflectionTraceOutput output;
        vec4 origin;
        output.reflection = evaluateScreenSpaceReflectionTrace(varyings, origin);
        #ifdef SSR_STORE_TRACE_ORIGIN
          output.origin = origin;
        #endif
        return output;
      }
    }

    Pass "GaussianFilter" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = filterScreenSpaceReflection;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      highp sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;
      vec2 material_SSRFilterDirection;

      vec4 filterScreenSpaceReflection(Varyings varyings) {
        vec2 pixelOffset = renderer_texelSize.xy * material_SSRFilterDirection;
        vec4 filtered = vec4(0.0);
        filtered += (
          texture2D(renderer_BlitTexture, varyings.v_uv + pixelOffset * 0.53805) +
          texture2D(renderer_BlitTexture, varyings.v_uv - pixelOffset * 0.53805)
        ) * 0.44908;
        filtered += (
          texture2D(renderer_BlitTexture, varyings.v_uv + pixelOffset * 2.06278) +
          texture2D(renderer_BlitTexture, varyings.v_uv - pixelOffset * 2.06278)
        ) * 0.05092;
        return filtered;
      }
    }

    Pass "Upsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = upsampleScreenSpaceReflection;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      highp sampler2D material_SSRSurfaceTexture;
      highp sampler2D material_SSRReceiverDepthTexture;
      highp sampler2D material_SSRTraceTexture;
      highp sampler2D material_SSRTraceOriginTexture;
      vec4 material_SSRTraceTexelSize;
      float material_SSRThickness;
      float material_SSRMaxRoughness;

      vec2 unpackScreenSpaceReflectionOrigin(vec4 packedOrigin) {
        vec4 bytes = floor(packedOrigin * 255.0 + 0.5);
        return vec2(bytes.x * 256.0 + bytes.y, bytes.z * 256.0 + bytes.w) / 65535.0;
      }

      float evaluateScreenSpaceReflectionBilateralWeight(
        vec3 currentViewPosition,
        vec3 currentNormal,
        float currentEyeDepth,
        float currentRoughness,
        vec4 packedOrigin
      ) {
        if (dot(packedOrigin, packedOrigin) <= 0.0) return 0.0;
        vec2 originUV = unpackScreenSpaceReflectionOrigin(packedOrigin);
        vec4 originSurface = texture2D(material_SSRSurfaceTexture, originUV);
        float originDepth = texture2D(material_SSRReceiverDepthTexture, originUV).r;
        if (originSurface.a <= 0.0 || originDepth >= 0.999999) return 0.0;

        float originEyeDepth = remapDepthBufferEyeDepth(originDepth);
        vec3 originViewPosition = reconstructScreenSpaceReflectionViewPositionFromEyeDepth(originUV, originEyeDepth);
        vec3 originNormal = decodeScreenSpaceReflectionNormal(originSurface.rg);
        vec3 originOffset = originViewPosition - currentViewPosition;
        // Eye depth is not a surface-distance metric: on a grazing plane, two
        // adjacent screen rows can be metres apart along the plane while still
        // representing the same receiver. Measure the symmetric distance to
        // both local tangent planes so slope does not become a 2x2 row mask,
        // while parallel layers and real depth discontinuities remain rejected.
        float planeDistance = max(
          abs(dot(originOffset, currentNormal)),
          abs(dot(originOffset, originNormal))
        );
        float planeTolerance = max(
          material_SSRThickness,
          max(currentEyeDepth, originEyeDepth) * 0.01
        );
        // Keep the compatibility kernel bounded. Its absolute magnitude is
        // also reconstruction confidence: an unrelated low-resolution origin
        // must fade to the Environment/IBL fallback instead of becoming valid
        // merely because the neighborhood weights were normalized.
        float planeRatio = planeDistance / max(planeTolerance, EPSILON);
        float planeWeight = (1.0 / (1.0 + planeRatio * planeRatio)) *
          (1.0 - smoothstep(1.0, 2.0, planeRatio));
        float normalAgreement = saturate(dot(currentNormal, originNormal));
        float normalWeight = pow(normalAgreement, 8.0);
        float roughnessRatio = abs(currentRoughness - originSurface.b) / 0.1;
        float roughnessWeight = 1.0 / (1.0 + roughnessRatio * roughnessRatio);
        return planeWeight * normalWeight * roughnessWeight;
      }

      vec4 evaluateScreenSpaceReflectionUpsample(Varyings varyings) {
        vec2 uv = varyings.v_uv;
        vec4 currentSurface = texture2D(material_SSRSurfaceTexture, uv);
        float currentDepth = texture2D(material_SSRReceiverDepthTexture, uv).r;
        if (
          currentSurface.a <= 0.0 ||
          currentSurface.b >= material_SSRMaxRoughness ||
          currentDepth >= 0.999999
        ) {
          return vec4(0.0);
        }

        float currentEyeDepth = remapDepthBufferEyeDepth(currentDepth);
        vec3 currentViewPosition = reconstructScreenSpaceReflectionViewPositionFromEyeDepth(uv, currentEyeDepth);
        vec3 currentNormal = decodeScreenSpaceReflectionNormal(currentSurface.rg);
        vec2 tracePosition = uv * material_SSRTraceTexelSize.zw - vec2(0.5);
        vec2 baseTracePixel = floor(tracePosition);
        vec2 fraction = fract(tracePosition);
        vec4 accumulatedTrace = vec4(0.0);
        float accumulatedWeight = 0.0;

        for (int y = 0; y < 2; ++y) {
          for (int x = 0; x < 2; ++x) {
            vec2 offset = vec2(float(x), float(y));
            vec2 tracePixel = clamp(
              baseTracePixel + offset,
              vec2(0.0),
              material_SSRTraceTexelSize.zw - vec2(1.0)
            );
            vec2 traceUV = (tracePixel + vec2(0.5)) * material_SSRTraceTexelSize.xy;
            vec2 axisWeight = mix(vec2(1.0) - fraction, fraction, offset);
            float spatialWeight = axisWeight.x * axisWeight.y;
            vec4 packedOrigin = texture2D(material_SSRTraceOriginTexture, traceUV);
            float bilateralWeight = evaluateScreenSpaceReflectionBilateralWeight(
              currentViewPosition,
              currentNormal,
              currentEyeDepth,
              currentSurface.b,
              packedOrigin
            );
            float weight = spatialWeight * bilateralWeight;
            accumulatedTrace += texture2D(material_SSRTraceTexture, traceUV) * weight;
            accumulatedWeight += weight;
          }
        }

        // Normalize related neighbors so receiver phase does not become
        // visible brightness modulation. Preserve fail-closed behavior with a
        // support gate: a weak or isolated incompatible tap still resolves to
        // transparent and lets the receiver keep Environment/IBL.
        float reconstructionSupport = smoothstep(0.05, 0.2, accumulatedWeight);
        return accumulatedTrace / max(accumulatedWeight, EPSILON) * reconstructionSupport;
      }

      void upsampleScreenSpaceReflection(Varyings varyings) {
        gl_FragColor = evaluateScreenSpaceReflectionUpsample(varyings);
      }
    }

    Pass "Composite" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = false;
      }

      VertexShader = vert;
      FragmentShader = compositeScreenSpaceReflection;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/Light.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      highp sampler2D material_SSRSceneColorTexture;
      highp sampler2D material_SSRSurfaceTexture;
      highp sampler2D material_SSRResponseTexture;
      highp sampler2D material_SSRReceiverDepthTexture;
      highp sampler2D material_SSRTraceTexture;
      mat4 camera_ViewInvMat;
      float camera_ScreenSpaceReflectionIntensity;
      float material_SSRMaxRoughness;
      float material_SSRDebugMode;

      vec3 sampleScreenSpaceReflectionEnvironment(vec3 viewPosition, vec3 viewNormal, float roughness) {
        #ifdef SCENE_USE_SPECULAR_ENV
          vec3 reflectedView = reflect(normalize(viewPosition), viewNormal);
          vec3 reflectedWorld = normalize(mat3(camera_ViewInvMat) * reflectedView);
          float mipLevel = roughness * scene_EnvMapLight.mipMapLevel;
          #ifdef HAS_TEX_LOD
            vec4 environment = textureCubeLodEXT(scene_EnvSpecularSampler, reflectedWorld, mipLevel);
          #else
            vec4 environment = textureCube(scene_EnvSpecularSampler, reflectedWorld, mipLevel);
          #endif
          #ifdef ENGINE_NO_SRGB
            environment = sRGBToLinear(environment);
          #endif
          #ifdef SCENE_USE_SPECULAR_ENV_BLEND
            float mipLevel2 = roughness * scene_EnvMapLight.mipMapLevel2;
            #ifdef HAS_TEX_LOD
              vec4 environment2 = textureCubeLodEXT(scene_EnvSpecularSampler2, reflectedWorld, mipLevel2);
            #else
              vec4 environment2 = textureCube(scene_EnvSpecularSampler2, reflectedWorld, mipLevel2);
            #endif
            #ifdef ENGINE_NO_SRGB
              environment2 = sRGBToLinear(environment2);
            #endif
            environment = mix(environment, environment2, scene_EnvMapLight.specularTextureBlend);
          #endif
          return environment.rgb * scene_EnvMapLight.specularIntensity;
        #else
          return vec3(0.0);
        #endif
      }

      vec4 evaluateScreenSpaceReflectionComposite(Varyings varyings) {
        vec2 uv = varyings.v_uv;
        vec4 baseColor = texture2D(material_SSRSceneColorTexture, uv);
        vec4 surface = texture2D(material_SSRSurfaceTexture, uv);
        vec4 response = texture2D(material_SSRResponseTexture, uv);
        vec4 trace = texture2D(material_SSRTraceTexture, uv);
        float receiverDepth = texture2D(material_SSRReceiverDepthTexture, uv).r;
        // A low-resolution trace can originate from a smoother neighboring pixel.
        // Enforce the current receiver's cutoff even when reconstruction is skipped.
        if (surface.b >= material_SSRMaxRoughness) trace = vec4(0.0);

        if (material_SSRDebugMode > 0.5) {
          if (material_SSRDebugMode < 1.5) {
            return baseColor;
          } else if (material_SSRDebugMode < 2.5) {
            return vec4(decodeScreenSpaceReflectionNormal(surface.rg) * 0.5 + 0.5, 1.0);
          } else if (material_SSRDebugMode < 3.5) {
            float eyeDepth = receiverDepth < 0.999999 ? remapDepthBufferLinear01(receiverDepth) : 1.0;
            return vec4(vec3(eyeDepth), 1.0);
          } else if (material_SSRDebugMode < 4.5) {
            return vec4(vec3(trace.a > 0.0 ? 1.0 : 0.0), 1.0);
          } else if (material_SSRDebugMode < 5.5) {
            return vec4(vec3(trace.a), 1.0);
          } else {
            return vec4(vec3(trace.r), 1.0);
          }
        }

        if (surface.a <= 0.0 || trace.a <= 0.0 || receiverDepth >= 0.999999) {
          return baseColor;
        }

        vec3 viewPosition = reconstructScreenSpaceReflectionViewPosition(uv, receiverDepth);
        vec3 viewNormal = decodeScreenSpaceReflectionNormal(surface.rg);
        vec3 environmentRadiance = sampleScreenSpaceReflectionEnvironment(viewPosition, viewNormal, surface.b);
        float ssrScale = saturate(camera_ScreenSpaceReflectionIntensity) * saturate(response.a);
        float ssrBlend = saturate(trace.a * ssrScale);
        // Trace RGB is confidence-premultiplied before spatial filtering. This
        // form preserves energy when bilinear filtering
        // crosses hit/miss or edge-fade boundaries.
        vec3 reflectionRadiance = environmentRadiance * (1.0 - ssrBlend) + trace.rgb * ssrScale;
        baseColor.rgb += (reflectionRadiance - environmentRadiance) * surface.a * response.rgb;
        return baseColor;
      }

      void compositeScreenSpaceReflection(Varyings varyings) {
        gl_FragColor = evaluateScreenSpaceReflectionComposite(varyings);
      }
    }
  }
}
