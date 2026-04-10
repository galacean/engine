Shader "PBR" {
  Editor {
    Properties{
      Header("Base"){
        material_IOR("IOR", Range(0, 5, 0.01)) = 1.5;
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Metal Roughness") {
        material_Metal( "Metal", Range(0,1,0.01) ) = 1;
        material_Roughness( "Roughness", Range( 0, 1, 0.01 ) ) = 1;
        material_RoughnessMetallicTexture("RoughnessMetallicTexture", Texture2D);
      }
      
      Header("Specular") {
        material_SpecularIntensity( "Intensity", Range(0,2,0.01) ) = 1;
        material_SpecularColor( "Color", Color ) = (1, 1, 1, 1);
        material_SpecularIntensityTexture("IntensityTexture", Texture2D);
        material_SpecularColorTexture("ColorTexture", Texture2D);
      }

      Header("Anisotropy") {
        anisotropy("Intensity", Range(0, 1, 0.01)) = 0;
        anisotropyRotation("Rotation", Range(0, 360, 1)) = 0;
        material_AnisotropyTexture("Texture", Texture2D);
      }

      Header("Normal") {
        material_NormalTexture("NormalTexture", Texture2D);
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", HDRColor ) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Occlusion") {
        material_OcclusionTexture("OcclusionTexture", Texture2D);
        material_OcclusionIntensity("OcclusionIntensity", Range(0, 5, 0.01)) = 1;
        material_OcclusionTextureCoord("OcclusionTextureCoord", Float) = 0;
      }
      
      Header("Clear Coat") {
        material_ClearCoat("ClearCoat", Range(0, 1, 0.01)) = 0;
        material_ClearCoatTexture("ClearCoatTexture", Texture2D);
        material_ClearCoatRoughness("ClearCoatRoughness", Range(0, 1, 0.01)) = 0;
        material_ClearCoatRoughnessTexture("ClearCoatRoughnessTexture", Texture2D);
        material_ClearCoatNormalTexture("ClearCoatNormalTexture", Texture2D);
      }

      Header("Thin Film Iridescence"){
        iridescence("Iridescence", Range(0, 1, 0.01)) = 0;
        iridescenceIOR("IOR", Range(1, 5, 0.01)) = 1.3;
        iridescenceRange("ThicknessRange", Vector2) = (100, 400);
        material_IridescenceThicknessTexture("ThicknessTexture", Texture2D);
        material_IridescenceTexture("IridescenceTexture", Texture2D);
      }

      Header("Sheen"){
        sheenColor("Color", Color ) = (0, 0, 0, 1);
        sheenIntensity("Intensity", Range(0, 1, 0.01)) = 1;
        material_SheenRoughness("Roughness", Range(0, 1, 0.01)) = 0;
        material_SheenTexture("ColorTexture", Texture2D);
        material_SheenRoughnessTexture("RoughnessTexture", Texture2D);
      }

      Header("Transmission") {
        material_Transmission("Transmission", Range(0, 1, 0.01)) = 0;
        material_TransmissionTexture("TransmissionTexture", Texture2D);
        material_Thickness("Thickness", Range(0, 5, 0.01)) = 0;
        material_ThicknessTexture("ThicknessTexture", Texture2D);
        refractionMode("RefractionMode", Enum(Sphere:0, Planar:1)) = 1;
        material_AttenuationColor("AttenuationColor", Color ) = (1, 1, 1, 1);
        material_AttenuationDistance("AttenuationDistance", Range(0, 1, 0.01)) = 0;
      }

      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff( "AlphaCutoff", Range(0, 1, 0.01) ) = 0;
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }
      
    UIScript "UIScriptPath";
  }
        
    SubShader "Default" {
      Pass "ShadowCaster" {
        Tags { pipelineStage = "ShadowCaster" }

        RenderQueueType material_ShadowCasterRenderQueue;
        RenderQueueType = material_ShadowCasterRenderQueue;

        VertexShader = shadowVert;
        FragmentShader = shadowFrag;

        #include "Common/Common.glsl"
        #include "Common/Transform.glsl"
        #include "Skin/Skin.glsl"
        #include "Skin/BlendShape.glsl"

        mat4 camera_VPMat;
        vec2 scene_ShadowBias;
        vec3 scene_LightDirection;

        vec4 material_BaseColor;
        sampler2D material_BaseTexture;
        float material_AlphaCutoff;

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

          #ifdef RENDERER_HAS_UV
            vec2 TEXCOORD_0;
          #endif
        };

        struct Varyings {
          vec2 v_uv;
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

        Varyings shadowVert(Attributes attr) {
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
              mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
              normal = normal * skinNormalMatrix;
            #endif
          #endif

          #ifdef RENDERER_HAS_UV
            v.v_uv = attr.TEXCOORD_0;
          #else
            v.v_uv = vec2(0.0, 0.0);
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

        #ifdef ENGINE_NO_DEPTH_TEXTURE
          vec4 pack(float depth) {
            const vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
            const vec4 bitMask = vec4(1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0, 0.0);
            vec4 rgbaDepth = fract(depth * bitShift);
            rgbaDepth -= rgbaDepth.gbaa * bitMask;
            return rgbaDepth;
          }
        #endif

        void shadowFrag(Varyings v) {
          #if defined(MATERIAL_IS_ALPHA_CUTOFF) || (defined(SCENE_ENABLE_TRANSPARENT_SHADOW) && defined(MATERIAL_IS_TRANSPARENT))
            float alpha = material_BaseColor.a;
            #ifdef MATERIAL_HAS_BASETEXTURE
              alpha *= texture2D(material_BaseTexture, v.v_uv).a;
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

          #ifdef ENGINE_NO_DEPTH_TEXTURE
            gl_FragColor = pack(gl_FragCoord.z);
          #else
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          #endif
        }
      }

      Pass "DepthOnly" {
        Tags { pipelineStage = "DepthOnly" }

        RenderQueueType material_DepthOnlyRenderQueue;
        RenderQueueType = material_DepthOnlyRenderQueue;

        VertexShader = depthVert;
        FragmentShader = depthFrag;

        #include "Common/Common.glsl"
        #include "Common/Transform.glsl"
        #include "Skin/Skin.glsl"
        #include "Skin/BlendShape.glsl"

        mat4 camera_VPMat;

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
          float _placeholder;
        };

        Varyings depthVert(Attributes attr) {
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

          gl_Position = camera_VPMat * renderer_ModelMat * position;

          return v;
        }

        void depthFrag(Varyings v) {
        }
      }

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

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
        
        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "PBR/ForwardPassPBR.glsl"
      }
    }
  }