Shader "Planning/PetalParticle" {
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

      VertexShader = petalVertex;
      FragmentShader = petalFragment;
      Varyings petalVertex(Attributes attr) {
        Varyings v;
        float age = renderer_CurrentTime - attr.a_DirectionTime.w;
        float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
        if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
          vec3 position = computeParticleCenter(attr, age, normalizedAge, v);
          gl_Position = camera_ProjMat * camera_ViewMat * vec4(position, 1.0);
          v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
          #ifdef MATERIAL_HAS_BASETEXTURE
            v.v_TextureCoordinate = computeParticleVaryingUV(attr, normalizedAge);
          #endif
        } else {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
        return v;
      }
      void petalFragment(Varyings v) {
        vec4 color = material_BaseColor * v.v_Color;
        #ifdef MATERIAL_HAS_BASETEXTURE
          color *= texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
        #endif
        vec3 emission = material_EmissiveColor;
        #ifdef MATERIAL_HAS_EMISSIVETEXTURE
          emission *= texture2DSRGB(material_EmissiveTexture, v.v_TextureCoordinate).rgb;
        #endif
        color.rgb += emission;
        gl_FragColor = color;
      }
    }
  }
}
