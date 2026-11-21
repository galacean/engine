Shader "Pipeline/SSRContributionDepth" {
  SubShader "Default" {
    Pass "SSRContributionDepth" {
      Tags { pipelineStage = "SSRContributionDepth" }

      RenderQueueType renderQueueType;
      CullMode rasterStateCullMode;

      DepthState = {
        Enabled = true;
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }

      BlendState = {
        Enabled = false;
        ColorWriteMask = ColorWriteMask.None;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = renderQueueType;

      VertexShader = contributionDepthVertex;
      FragmentShader = contributionDepthFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"

      struct Varyings {
        vec2 uv;
        #ifdef RENDERER_ENABLE_VERTEXCOLOR
          float vertexAlpha;
        #endif
      };

      vec4 material_TilingOffset;
      vec4 material_BaseColor;
      float material_AlphaCutoff;
      #ifdef MATERIAL_HAS_BASETEXTURE
        sampler2D material_BaseTexture;
      #endif

      Varyings contributionDepthVertex(Attributes attributes) {
        Varyings varyings;
        vec4 position = vec4(attributes.POSITION, 1.0);

        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = vec3(attributes.NORMAL);
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4(attributes.TANGENT);
          #endif
        #endif

        #ifdef RENDERER_HAS_BLENDSHAPE
          calculateBlendShape(attributes, position
            #ifdef RENDERER_HAS_NORMAL
              , normal
              #ifdef RENDERER_HAS_TANGENT
                , tangent
              #endif
            #endif
          );
        #endif

        #ifdef RENDERER_HAS_SKIN
          position = getSkinMatrix(attributes) * position;
        #endif

        vec2 uv = vec2(0.0);
        #ifdef RENDERER_HAS_UV
          uv = attributes.TEXCOORD_0;
        #endif
        #ifdef MATERIAL_NEED_TILING_OFFSET
          uv = uv * material_TilingOffset.xy + material_TilingOffset.zw;
        #endif
        varyings.uv = uv;

        #ifdef RENDERER_ENABLE_VERTEXCOLOR
          varyings.vertexAlpha = attributes.COLOR_0.a;
        #endif

        gl_Position = renderer_MVPMat * position;
        return varyings;
      }

      void contributionDepthFragment(Varyings varyings) {
        #if defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT)
          float alpha = material_BaseColor.a;
          #ifdef MATERIAL_HAS_BASETEXTURE
            alpha *= texture2D(material_BaseTexture, varyings.uv).a;
          #endif
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            alpha *= varyings.vertexAlpha;
          #endif
          #ifdef MATERIAL_IS_ALPHA_CUTOFF
            if (alpha < material_AlphaCutoff) {
              discard;
            }
          #endif
          #ifdef MATERIAL_IS_TRANSPARENT
            if (alpha <= 0.01) {
              discard;
            }
          #endif
        #endif
      }
    }
  }
}
