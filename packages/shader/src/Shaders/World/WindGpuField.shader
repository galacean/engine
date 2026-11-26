
Shader "Lighting/WindGpuFieldRaster" {
  SubShader "Default" {
    Pass "Raster" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      mediump sampler2D renderer_BlitTexture;
      vec4 material_FieldBounds;
      vec4 material_GustProfile0;
      vec4 material_GustProfile1;
      float material_FieldCenterY;
      float material_VelocityRange;
      float material_ElapsedTime;
      float material_GustStrength;
      int material_EmitterCount;
      int material_GustCount;
      vec4 material_EmitterPositionRadius[16];
      vec4 material_EmitterDirectionStrength[16];
      vec4 material_EmitterParameters[16];
      vec4 material_GustOriginDirection[4];
      vec4 material_GustTiming[4];

      float windSquare(float value) { return value * value; }

      float windSmoothMinimum(float left, float right, float softness) {
        float blend = max(softness - abs(left - right), 0.0) / softness;
        return min(left, right) - blend * blend * softness * 0.25;
      }

      float windGustEnvelope(float localTime, float attack, float hold, float decay, float feather) {
        float effectiveAttack = attack + feather;
        if (localTime <= 0.0 || localTime >= effectiveAttack + hold + decay) return 0.0;
        if (localTime < effectiveAttack) {
          return smoothstep(0.0, 1.0, localTime / effectiveAttack);
        }
        if (localTime < effectiveAttack + hold) return 1.0;
        return 1.0 - smoothstep(0.0, 1.0, (localTime - effectiveAttack - hold) / decay);
      }

      void frag(Varyings input) {
        float exposure = texture2D(renderer_BlitTexture, input.v_uv).r;
        vec2 worldXZ = mix(material_FieldBounds.xy, material_FieldBounds.zw, input.v_uv);
        vec3 positionWS = vec3(worldXZ.x, material_FieldCenterY, worldXZ.y);
        vec2 velocityDelta = vec2(0.0);
        float turbulence = 0.0;

        for (int index = 0; index < 16; index++) {
          if (index >= material_EmitterCount) break;
          vec4 positionRadius = material_EmitterPositionRadius[index];
          vec4 directionStrength = material_EmitterDirectionStrength[index];
          vec4 parameters = material_EmitterParameters[index];
          vec3 offset = positionWS - positionRadius.xyz;
          float distanceToEmitter = length(offset);
          if (distanceToEmitter >= positionRadius.w) continue;
          float attenuation = windSquare(1.0 - smoothstep(0.0, 1.0, distanceToEmitter / positionRadius.w));
          float horizontalLength = length(offset.xz);
          vec3 source = vec3(0.0);
          if (parameters.x < 0.5) {
            source = normalize(directionStrength.xyz);
          } else if (parameters.x < 1.5 && horizontalLength > 1e-6) {
            source.xz = offset.xz / horizontalLength;
          } else if (parameters.x < 2.5 && horizontalLength > 1e-6) {
            source.xz = vec2(-offset.z, offset.x) / horizontalLength;
          } else if (parameters.x >= 2.5) {
            source.y = 1.0;
          }
          velocityDelta += source.xz * directionStrength.w * attenuation;
          turbulence = max(turbulence, parameters.y * attenuation);
        }

        float gust = 0.0;
        float feather = material_GustProfile1.x / material_GustProfile0.w;
        for (int index = 0; index < 4; index++) {
          if (index >= material_GustCount) break;
          vec4 originDirection = material_GustOriginDirection[index];
          vec4 timing = material_GustTiming[index];
          vec2 offset = worldXZ - originDirection.xy;
          float distanceAlong = dot(offset, originDirection.zw);
          float distanceAcross = dot(offset, vec2(-originDirection.w, originDirection.z));
          float localTime = material_ElapsedTime - (timing.x + distanceAlong / material_GustProfile0.w);
          float durationScale = timing.y / material_GustProfile1.y;
          float envelope = windGustEnvelope(
            localTime,
            material_GustProfile0.x * durationScale,
            material_GustProfile0.y * durationScale,
            material_GustProfile0.z * durationScale,
            feather
          );
          if (timing.w >= 0.0) {
            float releaseLocalTime = timing.w - (timing.x + distanceAlong / material_GustProfile0.w);
            float releaseBaseline = windGustEnvelope(
              releaseLocalTime,
              material_GustProfile0.x * durationScale,
              material_GustProfile0.y * durationScale,
              material_GustProfile0.z * durationScale,
              feather
            );
            float releaseElapsed = material_ElapsedTime - timing.w;
            float releaseDuration = material_GustProfile0.z * durationScale;
            float releaseEnvelope = releaseBaseline * (
              1.0 - smoothstep(0.0, 1.0, releaseElapsed / releaseDuration)
            );
            envelope = min(envelope, releaseEnvelope);
          }
          float normalizedAcross = distanceAcross / (material_GustProfile1.x * 1.35);
          gust += envelope * timing.z * exp(-0.5 * normalizedAcross * normalizedAcross);
        }
        float shelteredGust = windSmoothMinimum(gust, 1.25, 0.5) * material_GustStrength * exposure;
        // RGBA16F keeps emitters and the travelling packet orthogonal. In particular, the gust
        // is no longer folded into a +/- velocity-range UNorm value whose 0.1569 m/s bins erased
        // weak recovery. A is the physical sheltered multiplier consumed by both woody and
        // ground mechanical adapters; RG contains emitter velocity only.
        gl_FragColor = vec4(
          clamp(velocityDelta, vec2(-material_VelocityRange), vec2(material_VelocityRange)),
          clamp(turbulence, 0.0, 1.0),
          shelteredGust
        );
      }
    }
  }
}
