Shader "Planning/ButterflyParticle" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      RenderQueueType renderQueueType;
      BlendFactor sourceColorBlendFactor;
      BlendFactor destinationColorBlendFactor;
      BlendFactor sourceAlphaBlendFactor;
      BlendFactor destinationAlphaBlendFactor;
      CullMode rasterStateCullMode;
      Bool blendEnabled;
      Bool depthTestEnabled;
      Bool depthWriteEnabled;
      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      DepthState = {
        Enabled = depthTestEnabled;
        WriteEnabled = depthWriteEnabled;
      }
      RasterState = { CullMode = rasterStateCullMode; }
      RenderQueueType = renderQueueType;

      #define PARTICLE_NEED_FEEDBACK_VELOCITY
      #include "ShaderLibrary/Particle/ParticleVert.glsl"

      float material_FlapSpeed;
      float material_FlapAngleMin;
      float material_FlapAngleMax;
      float material_HdrIntensity;

      VertexShader = butterflyVertex;
      FragmentShader = butterflyFragment;

      Varyings butterflyVertex(Attributes attr) {
        Varyings v;
        float age = renderer_CurrentTime - attr.a_DirectionTime.w;
        float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
        if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
          float seedHash = fract(
            sin(dot(vec4(attr.a_ShapePositionStartLifeTime.xyz, attr.a_DirectionTime.w), vec4(12.9898, 78.233, 45.164, 37.719))) *
            43758.5453
          );
          float lifeScale = smoothstep(0.0, 0.10, normalizedAge) * (1.0 - 0.30 * smoothstep(0.76, 1.0, normalizedAge));
          float speciesIndex = floor(fract(seedHash * 7.13) * 4.0);
          #ifdef RENDERER_MODE_MESH
            float phaseHash = fract(seedHash * 17.31);
            float speedScale = 0.86 + 0.28 * fract(seedHash * 53.17);
            float phase = renderer_CurrentTime * material_FlapSpeed * speedScale + phaseHash * 6.2831853;
            float wave = sin(phase) + 0.24 * sin(2.0 * phase);
            float flapT = pow(clamp(0.5 + 0.45 * wave, 0.0, 1.0), 0.78);
            float angle = mix(material_FlapAngleMin, material_FlapAngleMax, flapT);
            float span = abs(attr.POSITION.x);
            float tipAngle = angle - 0.16 * cos(phase) * span * 2.0;
            float side = attr.POSITION.x < 0.0 ? -1.0 : 1.0;
            float bob = -0.07 * sin(phase);
            vec3 flappedLocal = vec3(
              side * span * cos(tipAngle),
              bob + span * sin(tipAngle),
              attr.POSITION.z
            ) * lifeScale;

            #ifdef RENDERER_TRANSFORM_FEEDBACK
              vec4 worldRotation = renderer_SimulationSpace == 0
                ? renderer_WorldRotation
                : attr.a_SimulationWorldRotation;
              vec3 center = renderer_SimulationSpace == 0
                ? rotationByQuaternions(attr.a_FeedbackPosition, worldRotation) + renderer_WorldPosition
                : attr.a_FeedbackPosition;

              vec3 velLocal = attr.a_FeedbackVelocity;
              vec3 velWorld = vec3(0.0);
              #ifdef _VOL_LINEAR_MODULE_ENABLED
                vec3 instantVol = evaluateVOLVelocity(attr, normalizedAge);
                if (renderer_VOLSpace == 0) {
                  velLocal += instantVol;
                } else {
                  velWorld += instantVol;
                }
              #endif
              #ifdef _VOL_ORBITAL_RADIAL_MODULE_ENABLED
                vec4 invWorldRotation = quaternionConjugate(worldRotation);
                vec3 rel = renderer_SimulationSpace == 0
                  ? attr.a_FeedbackPosition - renderer_VOLOffset
                  : rotationByQuaternions(attr.a_FeedbackPosition - attr.a_WorldPositionGravity.xyz, invWorldRotation) - renderer_VOLOffset;
                vec3 orbRad = vec3(0.0);
                #if defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
                  float relLen = length(rel);
                  if (relLen > 1e-5) {
                    orbRad += (rel / relLen) * evaluateVOLRadial(attr, normalizedAge);
                  }
                #endif
                #if defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE)
                  orbRad += cross(evaluateVOLOrbital(attr, normalizedAge), rel);
                #endif
                velLocal += orbRad;
              #endif

              vec3 flightVelWS = rotationByQuaternions(velLocal, worldRotation) + velWorld;
              float speed = length(flightVelWS);
              vec3 forward = speed > 1e-4 ? flightVelWS / speed : vec3(0.0, 0.0, 1.0);
              vec3 worldUp = abs(forward.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
              vec3 right = normalize(cross(worldUp, forward));
              vec3 up = cross(forward, right);

              // Subtle inward spiral bank so wings catch the camera cleanly from every azimuth.
              float bank = 0.22 + 0.10 * sin(phase * 0.5);
              float cb = cos(bank);
              float sb = sin(bank);
              vec3 bankedRight = right * cb + up * sb;
              vec3 bankedUp = -right * sb + up * cb;

              vec3 size = computeParticleSizeMesh(attr, attr.a_StartSizeSpeed.xyz, normalizedAge) * renderer_SizeScale;
              vec3 scaledWing = flappedLocal * size;
              vec3 position = center + bankedRight * scaledWing.x + bankedUp * scaledWing.y + forward * scaledWing.z;
              #ifdef RENDERER_ENABLE_VERTEXCOLOR
                v.v_MeshColor = attr.COLOR_0;
              #endif
            #else
              Attributes flapped = attr;
              flapped.POSITION = flappedLocal;
              vec3 position = computeParticleCenter(flapped, age, normalizedAge, v);
            #endif
          #else
            vec3 position = computeParticleCenter(attr, age, normalizedAge, v);
          #endif
          gl_Position = camera_ProjMat * camera_ViewMat * vec4(position, 1.0);
          vec4 lifeColor = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
          float pulse = 0.88 + 0.24 * sin(renderer_CurrentTime * 3.6 + seedHash * 31.4159);
          vec3 hdrTint = vec3(material_HdrIntensity * pulse);
          v.v_Color = vec4(lifeColor.rgb * hdrTint, lifeColor.a);
          #ifdef MATERIAL_HAS_BASETEXTURE
            vec2 tileOffset = vec2(mod(speciesIndex, 2.0), floor(speciesIndex * 0.5)) * 0.5;
            #ifdef RENDERER_MODE_MESH
              vec2 rawUV = clamp(attr.TEXCOORD_0, 0.01, 0.99);
            #else
              vec2 rawUV = clamp(computeParticleVaryingUV(attr, normalizedAge), 0.01, 0.99);
            #endif
            v.v_TextureCoordinate = tileOffset + rawUV * 0.5;
          #endif
        } else {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
        return v;
      }

      void butterflyFragment(Varyings v) {
        vec4 texColor = vec4(1.0);
        vec2 localUV = vec2(0.5);
        #ifdef MATERIAL_HAS_BASETEXTURE
          texColor = texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
          localUV = fract(v.v_TextureCoordinate * 2.0);
        #endif
        if (texColor.a * v.v_Color.a < 0.008) {
          discard;
        }
        float wingMask = smoothstep(0.36, 0.80, texColor.a);
        float haloMask = texColor.a * (1.0 - wingMask * 0.45);
        float lifeAlpha = v.v_Color.a * material_BaseColor.a;

        // Drive hue directly from native ColorOverLifetime while preserving a bright incandescent
        // core, saturated mid-wing, and deeper luminous outer rim/aura.
        vec2 centered = (localUV - vec2(0.5, 0.48)) * vec2(1.45, 1.25);
        float coreDist = length(centered);
        float coreFactor = exp(-coreDist * coreDist * 4.0);
        float tipFactor = smoothstep(0.32, 0.86, coreDist);
        float texLuma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

        vec3 baseTint = v.v_Color.rgb * material_BaseColor.rgb;
        float baseLuma = max(dot(baseTint, vec3(0.299, 0.587, 0.114)), 0.001);
        vec3 hotCore = mix(baseTint, vec3(baseLuma * 1.42), 0.52) * 1.32;
        vec3 midColor = baseTint * 1.15;
        vec3 rimColor = (baseTint * baseTint / max(baseLuma, 0.15)) * 0.82;

        vec3 wingColor = mix(midColor, rimColor, tipFactor);
        wingColor = mix(wingColor, hotCore, clamp(coreFactor + 0.22 * texLuma, 0.0, 1.0));

        vec3 wingHdr = wingColor * (0.72 + 0.34 * texLuma) * wingMask;
        vec3 auraHdr = mix(baseTint, rimColor, 0.42) * haloMask * 0.90;
        float bgOcclusion = wingMask * 0.72 * lifeAlpha;
        gl_FragColor = vec4((wingHdr + auraHdr) * lifeAlpha, bgOcclusion);
      }
    }
  }
}
