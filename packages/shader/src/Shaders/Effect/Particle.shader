Shader "Effect/Particle" {
  Editor {
    Properties {
      Header("Base") {
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }
      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", HDRColor) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }
      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff("AlphaCutoff", Range(0, 1, 0.01)) = 0;
      }
    }
  }

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
      Bool depthWriteEnabled;

      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      DepthState = {
        WriteEnabled = depthWriteEnabled;
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

          #if defined(RENDERER_MODE_MESH) && defined(RENDERER_ENABLE_VERTEXCOLOR)
              color *= v.v_MeshColor;
          #endif

          #ifdef MATERIAL_HAS_BASETEXTURE
              color *= texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
          #endif

          vec3 emissiveRadiance = material_EmissiveColor;
          #ifdef MATERIAL_HAS_EMISSIVETEXTURE
              emissiveRadiance *= texture2DSRGB(material_EmissiveTexture, v.v_TextureCoordinate).rgb;
          #endif

          color.rgb += emissiveRadiance;

          gl_FragColor = color;
      }
    }
  }
}
