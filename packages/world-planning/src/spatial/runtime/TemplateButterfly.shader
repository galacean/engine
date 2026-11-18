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

      #include "ShaderLibrary/Particle/ParticleVert.glsl"

      float material_FlapSpeed;
      float material_FlapAngleMin;
      float material_FlapAngleMax;
      float material_HdrIntensity;

      VertexShader = butterflyVertex;
      FragmentShader = butterflyFragment;

      vec3 butterflySpeciesHdrTint(float idx) {
        if (idx < 0.5) {
          return vec3(1.28, 0.36, 0.92); // Luminous sakura rose-magenta
        } else if (idx < 1.5) {
          return vec3(0.24, 0.96, 1.38); // Bioluminescent morpho cyan-blue
        } else if (idx < 2.5) {
          return vec3(1.36, 0.94, 0.22); // Solar amber-gold
        }
        return vec3(0.92, 0.38, 1.38);   // Celestial orchid-violet
      }

      Varyings butterflyVertex(Attributes attr) {
        Varyings v;
        float age = renderer_CurrentTime - attr.a_DirectionTime.w;
        float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
        if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
          float seedHash = fract(
            sin(dot(vec4(attr.a_ShapePositionStartLifeTime.xyz, attr.a_DirectionTime.w), vec4(12.9898, 78.233, 45.164, 37.719))) *
            43758.5453
          );
          float lifeScale = smoothstep(0.0, 0.12, normalizedAge) * (1.0 - smoothstep(0.86, 1.0, normalizedAge));
          float speciesIndex = floor(fract(seedHash * 7.13) * 4.0);
          #ifdef RENDERER_MODE_MESH
            Attributes flapped = attr;
            float phaseHash = fract(seedHash * 17.31);
            float speedScale = 0.86 + 0.28 * fract(seedHash * 53.17);
            float phase = renderer_CurrentTime * material_FlapSpeed * speedScale + phaseHash * 6.2831853;
            float wave = sin(phase) + 0.22 * sin(2.0 * phase);
            float flapT = clamp(0.5 + 0.45 * wave, 0.0, 1.0);
            float angle = mix(material_FlapAngleMin, material_FlapAngleMax, flapT);
            float span = abs(flapped.POSITION.x);
            float tipAngle = angle - 0.18 * cos(phase) * span * 2.0;
            float side = flapped.POSITION.x < 0.0 ? -1.0 : 1.0;
            float bob = -0.08 * sin(phase);
            flapped.POSITION = vec3(
              side * span * cos(tipAngle),
              bob + span * sin(tipAngle),
              flapped.POSITION.z
            ) * lifeScale;
            vec3 position = computeParticleCenter(flapped, age, normalizedAge, v);
          #else
            vec3 position = computeParticleCenter(attr, age, normalizedAge, v);
          #endif
          gl_Position = camera_ProjMat * camera_ViewMat * vec4(position, 1.0);
          vec4 lifeColor = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
          float pulse = 0.86 + 0.28 * sin(renderer_CurrentTime * 3.4 + seedHash * 31.4159);
          vec3 hdrTint = butterflySpeciesHdrTint(speciesIndex) * material_HdrIntensity * pulse;
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
        #ifdef MATERIAL_HAS_BASETEXTURE
          texColor = texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
        #endif
        if (texColor.a * v.v_Color.a < 0.008) {
          discard;
        }
        float wingMask = smoothstep(0.42, 0.84, texColor.a);
        float haloMask = texColor.a * (1.0 - wingMask * 0.45);
        float lifeAlpha = v.v_Color.a * material_BaseColor.a;
        // Premultiplied HDR core + pure additive outer optical aura (`One, OneMinusSrcAlpha`).
        vec3 wingHdr = (0.45 + 0.75 * texColor.rgb) * v.v_Color.rgb * material_BaseColor.rgb * wingMask;
        vec3 auraHdr = texColor.rgb * v.v_Color.rgb * haloMask * 0.65;
        float bgOcclusion = wingMask * 0.78 * lifeAlpha;
        gl_FragColor = vec4((wingHdr + auraHdr) * lifeAlpha, bgOcclusion);
      }
    }
  }
}
