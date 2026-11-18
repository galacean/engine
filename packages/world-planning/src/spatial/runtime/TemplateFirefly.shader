Shader "Planning/FireflyParticle" {
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
      Bool depthWriteEnabled;
      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      DepthState = { WriteEnabled = depthWriteEnabled; }
      RasterState = { CullMode = rasterStateCullMode; }
      RenderQueueType = renderQueueType;

      #include "ShaderLibrary/Particle/ParticleVert.glsl"
      float material_MinScreenFraction;

      VertexShader = fireflyVertex;
      FragmentShader = fireflyFragment;
      Varyings fireflyVertex(Attributes attr) {
        Varyings v;
        float age = renderer_CurrentTime - attr.a_DirectionTime.w;
        float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
        if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
          vec3 position = computeParticleCenter(attr, age, normalizedAge, v);
          gl_Position = camera_ProjMat * camera_ViewMat * vec4(position, 1.0);
          vec2 size = abs(computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge) * renderer_SizeScale.xy);
          // Projection: screen-height fraction = diameter * Pyy / (2 * clipW).
          // This preserves the small physical sprite nearby and an optical glow
          // footprint for distant, otherwise subpixel luminous points.
          float minimumDiameter = 2.0 * material_MinScreenFraction * abs(gl_Position.w) / abs(camera_ProjMat[1][1]);
          vec2 extraSize = max(vec2(minimumDiameter) - size, vec2(0.0));
          gl_Position.xy += attr.a_CornerTextureCoordinate.xy * extraSize * vec2(camera_ProjMat[0][0], camera_ProjMat[1][1]);
          v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
          #ifdef MATERIAL_HAS_BASETEXTURE
            v.v_TextureCoordinate = computeParticleVaryingUV(attr, normalizedAge);
          #endif
        } else {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
        return v;
      }
      void fireflyFragment(Varyings v) {
        vec4 color = material_BaseColor * v.v_Color;
        #ifdef MATERIAL_HAS_BASETEXTURE
          color *= texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
        #endif
        gl_FragColor = color;
      }
    }
  }
}
