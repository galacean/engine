Shader "Pipeline/DepthOnly" {
  SubShader "Default" {
    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      RenderQueueType material_DepthOnlyRenderQueue;

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"

      #if defined(MATERIAL_IS_ALPHA_CUTOFF) && defined(MATERIAL_HAS_BASETEXTURE)
        #define NEED_DEPTH_UV
      #endif
      #if defined(MATERIAL_IS_ALPHA_CUTOFF) && defined(RENDERER_ENABLE_VERTEXCOLOR)
        #define NEED_DEPTH_VERTEX_ALPHA
      #endif

      #ifdef MATERIAL_IS_ALPHA_CUTOFF
        vec4 material_BaseColor;
        float material_AlphaCutoff;
        #ifdef MATERIAL_HAS_BASETEXTURE
          sampler2D material_BaseTexture;
          #ifdef MATERIAL_NEED_TILING_OFFSET
            vec4 material_TilingOffset;
          #endif
        #endif
      #endif

      struct Varyings {
        #ifdef NEED_DEPTH_UV
          vec2 v_uv;
        #endif
        #ifdef NEED_DEPTH_VERTEX_ALPHA
          float v_vertexAlpha;
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

        #ifdef NEED_DEPTH_UV
          #ifdef RENDERER_HAS_UV
            v.v_uv = attr.TEXCOORD_0;
          #else
            v.v_uv = vec2(0.0, 0.0);
          #endif
          #ifdef MATERIAL_NEED_TILING_OFFSET
            v.v_uv = v.v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
          #endif
        #endif

        #ifdef NEED_DEPTH_VERTEX_ALPHA
          v.v_vertexAlpha = attr.COLOR_0.a;
        #endif

        gl_Position = camera_VPMat * renderer_ModelMat * position;

        return v;
      }

      void frag(Varyings v) {
        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          float alpha = material_BaseColor.a;
          #ifdef NEED_DEPTH_UV
            alpha *= texture2D(material_BaseTexture, v.v_uv).a;
          #endif
          #ifdef NEED_DEPTH_VERTEX_ALPHA
            alpha *= v.v_vertexAlpha;
          #endif
          if (alpha < material_AlphaCutoff) {
            discard;
          }
        #endif
      }
    }
  }
}
