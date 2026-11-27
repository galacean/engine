Shader "Pipeline/DepthOnly" {
  SubShader "Default" {
    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      RenderQueueType material_DepthOnlyRenderQueue;
      CullMode rasterStateCullMode;

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"

      #ifdef MATERIAL_IS_ALPHA_CUTOFF
        vec4 material_TilingOffset;
        vec4 material_BaseColor;
        float material_AlphaCutoff;
        #ifdef MATERIAL_HAS_BASETEXTURE
          sampler2D material_BaseTexture;
        #endif
      #endif

      struct Varyings {
        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          vec2 uv;
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            float vertexAlpha;
          #endif
        #endif
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        vec4 position = vec4(attr.POSITION, 1.0);

        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = vec3(attr.NORMAL);
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4(attr.TANGENT);
          #endif
        #endif

        #ifdef RENDERER_HAS_BLENDSHAPE
          calculateBlendShape(attr, position
            #ifdef RENDERER_HAS_NORMAL
              , normal
              #ifdef RENDERER_HAS_TANGENT
                , tangent
              #endif
            #endif
          );
        #endif

        #ifdef RENDERER_HAS_SKIN
          mat4 skinMatrix = getSkinMatrix(attr);
          position = skinMatrix * position;
        #endif

        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          #ifdef RENDERER_HAS_UV
            v.uv = attr.TEXCOORD_0;
          #else
            v.uv = vec2(0.0);
          #endif
          #ifdef MATERIAL_NEED_TILING_OFFSET
            v.uv = v.uv * material_TilingOffset.xy + material_TilingOffset.zw;
          #endif
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            v.vertexAlpha = attr.COLOR_0.a;
          #endif
        #endif

        gl_Position = camera_VPMat * renderer_ModelMat * position;
        return v;
      }

      void frag(Varyings v) {
        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          float alpha = material_BaseColor.a;
          #ifdef MATERIAL_HAS_BASETEXTURE
            alpha *= texture2D(material_BaseTexture, v.uv).a;
          #endif
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            alpha *= v.vertexAlpha;
          #endif
          if (alpha < material_AlphaCutoff) {
            discard;
          }
        #endif
      }
    }
  }
}
