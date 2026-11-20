Shader "Pipeline/ShadowCaster" {
  SubShader "Default" {
    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }

      RenderQueueType material_ShadowCasterRenderQueue;

      RenderQueueType = material_ShadowCasterRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"

      #if defined(MATERIAL_IS_ALPHA_CUTOFF) || (defined(SCENE_ENABLE_TRANSPARENT_SHADOW) && defined(MATERIAL_IS_TRANSPARENT))
        #define NEED_SHADOW_ALPHA
        #ifdef MATERIAL_HAS_BASETEXTURE
          #define NEED_SHADOW_UV
        #endif
        #ifdef RENDERER_ENABLE_VERTEXCOLOR
          #define NEED_SHADOW_VERTEX_ALPHA
        #endif
      #endif

      vec2 scene_ShadowBias;
      vec3 scene_LightDirection;

      #ifdef NEED_SHADOW_ALPHA
        vec4 material_BaseColor;
        float material_AlphaCutoff;
        #ifdef NEED_SHADOW_UV
          sampler2D material_BaseTexture;
          #ifdef MATERIAL_NEED_TILING_OFFSET
            vec4 material_TilingOffset;
          #endif
        #endif
      #endif

      struct Varyings {
        #ifdef NEED_SHADOW_UV
          vec2 v_uv;
        #endif
        #ifdef NEED_SHADOW_VERTEX_ALPHA
          float v_vertexAlpha;
        #endif
      };

      vec3 applyShadowBias(vec3 positionWS) {
        positionWS -= scene_LightDirection * scene_ShadowBias.x;
        return positionWS;
      }

      vec3 applyShadowNormalBias(vec3 positionWS, vec3 normalWS) {
        float invNdotL = 1.0 - clamp(dot(-scene_LightDirection, normalWS), 0.0, 1.0);
        float scale = invNdotL * scene_ShadowBias.y;
        positionWS += normalWS * vec3(scale);
        return positionWS;
      }

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

          #ifdef RENDERER_HAS_NORMAL
            mat3 skinNormalMatrix = inverse(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
          #endif
        #endif

        #ifdef NEED_SHADOW_UV
          #ifdef RENDERER_HAS_UV
            v.v_uv = attr.TEXCOORD_0;
          #else
            v.v_uv = vec2(0.0, 0.0);
          #endif
          #ifdef MATERIAL_NEED_TILING_OFFSET
            v.v_uv = v.v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
          #endif
        #endif

        #ifdef NEED_SHADOW_VERTEX_ALPHA
          v.v_vertexAlpha = attr.COLOR_0.a;
        #endif

        vec4 positionWS = renderer_ModelMat * position;

        positionWS.xyz = applyShadowBias(positionWS.xyz);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalWS = normalize(mat3(renderer_NormalMat) * normal);
          positionWS.xyz = applyShadowNormalBias(positionWS.xyz, normalWS);
        #endif

        vec4 positionCS = camera_VPMat * positionWS;
        positionCS.z = max(positionCS.z, -1.0);
        gl_Position = positionCS;

        return v;
      }


      void frag(Varyings v) {
        #ifdef NEED_SHADOW_ALPHA
          float alpha = material_BaseColor.a;
          #ifdef NEED_SHADOW_UV
            alpha *= texture2D(material_BaseTexture, v.v_uv).a;
          #endif
          #ifdef NEED_SHADOW_VERTEX_ALPHA
            alpha *= v.v_vertexAlpha;
          #endif
          #ifdef MATERIAL_IS_ALPHA_CUTOFF
            if (alpha < material_AlphaCutoff) {
              discard;
            }
          #endif
          #if defined(SCENE_ENABLE_TRANSPARENT_SHADOW) && defined(MATERIAL_IS_TRANSPARENT)
            float noise = fract(52.982919 * fract(dot(vec2(0.06711, 0.00584), gl_FragCoord.xy)));
            if (alpha <= noise) {
              discard;
            }
          #endif
        #endif
      }
    }
  }
}
