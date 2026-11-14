Shader "Terrain/PrecipitationOverlay" {
  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      RenderQueueType renderQueueType;
      BlendFactor sourceColorBlendFactor;
      BlendFactor destinationColorBlendFactor;
      BlendFactor sourceAlphaBlendFactor;
      BlendFactor destinationAlphaBlendFactor;
      CullMode rasterStateCullMode;
      Bool blendEnabled;

      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = rasterStateCullMode;
      }
      RenderQueueType = renderQueueType;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Particle/ParticleVert.glsl"

      Varyings vert(Attributes attr) {
        Varyings v;
        float age = renderer_CurrentTime - attr.a_DirectionTime.w;
        float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
        if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
          vec3 center = computeParticleCenter(attr, age, normalizedAge, v);
          gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
          v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
          #ifdef MATERIAL_HAS_BASETEXTURE
            v.v_TextureCoordinate = computeParticleVaryingUV(attr, normalizedAge);
          #endif
        } else {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
        return v;
      }

      void frag(Varyings v) {
        vec4 color = material_BaseColor * v.v_Color;
        #ifdef MATERIAL_HAS_BASETEXTURE
          color *= texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
        #endif
        color.rgb += material_EmissiveColor;
        gl_FragColor = color;
      }
    }
  }
}
