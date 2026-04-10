Shader "Unlit" {
  Editor {
    Properties {
      Header("Base") {
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff("AlphaCutoff", Range(0, 1, 0.01)) = 0;
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }

    UIScript "UIScriptPath";
  }

  SubShader "Default" {
    UsePass "PBR/Default/ShadowCaster"
    UsePass "PBR/Default/DepthOnly"

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

      DepthState = {
        WriteEnabled = depthWriteEnabled;
      }

      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = renderQueueType;

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/Common.glsl"
      #include "Common/Transform.glsl"
      #include "Common/Fog.glsl"
      #include "Skin/Skin.glsl"
      #include "Skin/BlendShape.glsl"

      vec4 material_TilingOffset;
      vec4 material_BaseColor;
      float material_AlphaCutoff;

      #ifdef MATERIAL_HAS_BASETEXTURE
          sampler2D material_BaseTexture;
      #endif

      struct Attributes {
          vec3 POSITION;

          #ifdef RENDERER_HAS_BLENDSHAPE
              #ifndef RENDERER_BLENDSHAPE_USE_TEXTURE
                  vec3 POSITION_BS0;
                  vec3 POSITION_BS1;
                  #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
                      vec3 NORMAL_BS0;
                      vec3 NORMAL_BS1;
                      vec3 TANGENT_BS0;
                      vec3 TANGENT_BS1;
                  #else
                      #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) || defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
                          vec3 POSITION_BS2;
                          vec3 POSITION_BS3;
                          #ifdef RENDERER_BLENDSHAPE_HAS_NORMAL
                              vec3 NORMAL_BS0;
                              vec3 NORMAL_BS1;
                              vec3 NORMAL_BS2;
                              vec3 NORMAL_BS3;
                          #endif
                          #ifdef RENDERER_BLENDSHAPE_HAS_TANGENT
                              vec3 TANGENT_BS0;
                              vec3 TANGENT_BS1;
                              vec3 TANGENT_BS2;
                              vec3 TANGENT_BS3;
                          #endif
                      #else
                          vec3 POSITION_BS2;
                          vec3 POSITION_BS3;
                          vec3 POSITION_BS4;
                          vec3 POSITION_BS5;
                          vec3 POSITION_BS6;
                          vec3 POSITION_BS7;
                      #endif
                  #endif
              #endif
          #endif

          #ifdef RENDERER_HAS_UV
              vec2 TEXCOORD_0;
          #endif

          #ifdef RENDERER_HAS_SKIN
              vec4 JOINTS_0;
              vec4 WEIGHTS_0;
          #endif

          #ifdef RENDERER_HAS_NORMAL
              vec3 NORMAL;
          #endif

          #ifdef RENDERER_HAS_TANGENT
              vec4 TANGENT;
          #endif
      };

      struct Varyings {
          vec2 v_uv;
          #if SCENE_FOG_MODE != 0
              vec3 v_positionVS;
          #endif
      };

      Varyings vert(Attributes attr) {
          Varyings v;

          vec4 position = vec4(attr.POSITION, 1.0);

          #ifdef RENDERER_HAS_NORMAL
              vec3 normal = attr.NORMAL;
              #ifdef RENDERER_HAS_TANGENT
                  vec4 tangent = attr.TANGENT;
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

          #ifdef RENDERER_HAS_UV
              v.v_uv = attr.TEXCOORD_0;
          #else
              v.v_uv = vec2(0.0);
          #endif
          #ifdef MATERIAL_NEED_TILING_OFFSET
              v.v_uv = v.v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
          #endif

          gl_Position = renderer_MVPMat * position;

          #if SCENE_FOG_MODE != 0
              v.v_positionVS = (renderer_MVMat * position).xyz;
          #endif

          return v;
      }

      void frag(Varyings v) {
          vec4 baseColor = material_BaseColor;

          #ifdef MATERIAL_HAS_BASETEXTURE
              baseColor *= texture2DSRGB(material_BaseTexture, v.v_uv);
          #endif

          #ifdef MATERIAL_IS_ALPHA_CUTOFF
              if (baseColor.a < material_AlphaCutoff) {
                  discard;
              }
          #endif

          gl_FragColor = baseColor;

          #ifndef MATERIAL_IS_TRANSPARENT
              gl_FragColor.a = 1.0;
          #endif

          #if SCENE_FOG_MODE != 0
              gl_FragColor = fog(gl_FragColor, v.v_positionVS);
          #endif
      }
    }
  }
}
