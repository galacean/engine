Shader "Pipeline/SSRReceiver" {
  SubShader "Default" {
    Pass "SSRReceiver" {
      Tags { pipelineStage = "SSRReceiver" }

      RenderQueueType renderQueueType;
      CullMode rasterStateCullMode;

      DepthState = {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }

      BlendState = {
        Enabled = false;
      }

      StencilState = {
        Enabled = true;
        ReferenceValue = 1;
        Mask = 255;
        WriteMask = 255;
        CompareFunctionFront = CompareFunction.Always;
        CompareFunctionBack = CompareFunction.Always;
        PassOperationFront = StencilOperation.Replace;
        PassOperationBack = StencilOperation.Replace;
        FailOperationFront = StencilOperation.Keep;
        FailOperationBack = StencilOperation.Keep;
        ZFailOperationFront = StencilOperation.Keep;
        ZFailOperationBack = StencilOperation.Keep;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = renderQueueType;

      VertexShader = ssrReceiverVertex;
      FragmentShader = ssrReceiverFragment;

      #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
        #define SSR_HAS_VERTEX_NORMAL
      #endif

      #if defined(SSR_HAS_VERTEX_NORMAL) && defined(RENDERER_HAS_TANGENT) && (defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE))
        #define NEED_VERTEX_TANGENT
      #endif

      #if defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY)
        #define NEED_TANGENT_SPACE
      #endif

      #if ((defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT)) && defined(MATERIAL_HAS_BASETEXTURE)) || defined(MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE) || defined(MATERIAL_HAS_NORMALTEXTURE) || (defined(NEED_TANGENT_SPACE) && !defined(NEED_VERTEX_TANGENT)) || (defined(MATERIAL_ENABLE_CLEAR_COAT) && (defined(MATERIAL_HAS_CLEAR_COAT_TEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE))) || (defined(MATERIAL_ENABLE_ANISOTROPY) && defined(MATERIAL_HAS_ANISOTROPY_TEXTURE))
        #define SSR_NEED_UV
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Normal.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      #define SSR_MIN_PERCEPTUAL_ROUGHNESS 0.045

      float material_ScreenSpaceReflectionIntensity;
      vec4 camera_SSRParams;

      #if defined(SSR_NEED_UV) && defined(MATERIAL_NEED_TILING_OFFSET)
        vec4 material_TilingOffset;
      #endif
      #if defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT)
        vec4 material_BaseColor;
        #ifdef MATERIAL_HAS_BASETEXTURE
          sampler2D material_BaseTexture;
        #endif
      #endif
      #ifdef MATERIAL_IS_ALPHA_CUTOFF
        float material_AlphaCutoff;
      #endif
      float material_Roughness;
      #if defined(MATERIAL_HAS_NORMALTEXTURE) || (defined(MATERIAL_ENABLE_CLEAR_COAT) && defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE))
        float material_NormalIntensity;
      #endif

      #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
        sampler2D material_RoughnessMetallicTexture;
      #endif
      #ifdef MATERIAL_HAS_NORMALTEXTURE
        sampler2D material_NormalTexture;
      #endif

      #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float material_ClearCoat;
        float material_ClearCoatRoughness;
        #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
          sampler2D material_ClearCoatTexture;
        #endif
        #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
          sampler2D material_ClearCoatRoughnessTexture;
        #endif
        #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
          sampler2D material_ClearCoatNormalTexture;
        #endif
      #endif

      #ifdef MATERIAL_ENABLE_ANISOTROPY
        vec3 material_AnisotropyInfo;
        #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
          sampler2D material_AnisotropyTexture;
        #endif
      #endif

      struct Varyings {
        #ifdef SSR_NEED_UV
          vec2 uv;
        #endif
        #if defined(RENDERER_ENABLE_VERTEXCOLOR) && (defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT))
          float vertexAlpha;
        #endif
        vec3 positionWS;
        #ifdef SSR_HAS_VERTEX_NORMAL
          vec3 normalWS;
          #ifdef NEED_VERTEX_TANGENT
            vec3 tangentWS;
            vec3 bitangentWS;
          #endif
        #endif
      };

      struct SSRReceiverOutput {
        layout(location = 0) vec4 normalRoughness;
        layout(location = 1) vec4 receiverDepth;
      };

      float ssrGetAARoughnessFactor(vec3 n) {
        #ifdef HAS_DERIVATIVES
          float traceScale = camera_SSRParams.z > 0.0 ? camera_SSRParams.z : 1.0;
          vec3 dxy = max(abs(dFdx(n)), abs(dFdy(n))) * traceScale;
          return max(max(dxy.x, dxy.y), dxy.z);
        #else
          return 0.0;
        #endif
      }

      Varyings ssrReceiverVertex(Attributes attributes) {
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
          mat4 skinMatrix = getSkinMatrix(attributes);
          position = skinMatrix * position;
          #ifdef SSR_HAS_VERTEX_NORMAL
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #ifdef NEED_VERTEX_TANGENT
              tangent.xyz = tangent.xyz * skinNormalMatrix;
            #endif
          #endif
        #endif

        #ifdef SSR_HAS_VERTEX_NORMAL
          mat3 normalMat = mat3(renderer_NormalMat);
          varyings.normalWS = normalize(normalMat * normal);
          #ifdef NEED_VERTEX_TANGENT
            vec3 tangentWS = normalize(normalMat * tangent.xyz);
            varyings.tangentWS = tangentWS;
            varyings.bitangentWS = cross(varyings.normalWS, tangentWS) * tangent.w;
          #endif
        #endif

        #ifdef SSR_NEED_UV
          vec2 uv = vec2(0.0);
          #ifdef RENDERER_HAS_UV
            uv = attributes.TEXCOORD_0;
          #endif
          #ifdef MATERIAL_NEED_TILING_OFFSET
            uv = uv * material_TilingOffset.xy + material_TilingOffset.zw;
          #endif
          varyings.uv = uv;
        #endif

        #if defined(RENDERER_ENABLE_VERTEXCOLOR) && (defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT))
          varyings.vertexAlpha = attributes.COLOR_0.a;
        #endif

        vec4 worldPosition = renderer_ModelMat * position;
        varyings.positionWS = worldPosition.xyz / worldPosition.w;
        gl_Position = renderer_MVPMat * position;
        return varyings;
      }

      SSRReceiverOutput ssrReceiverFragment(Varyings varyings) {
        if (material_ScreenSpaceReflectionIntensity <= 0.0) {
          discard;
        }

        #ifdef SSR_NEED_UV
          vec2 uv = varyings.uv;
        #endif

        #if defined(MATERIAL_IS_ALPHA_CUTOFF) || defined(MATERIAL_IS_TRANSPARENT)
          float alpha = material_BaseColor.a;
          #ifdef MATERIAL_HAS_BASETEXTURE
            alpha *= texture2D(material_BaseTexture, uv).a;
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
            if (alpha <= 0.004) {
              discard;
            }
          #endif
        #endif

        float roughness = material_Roughness;
        #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
          roughness *= texture2D(material_RoughnessMetallicTexture, uv).g;
        #endif

        #ifdef SSR_HAS_VERTEX_NORMAL
          vec3 geomNormal = normalize(varyings.normalWS);
        #elif defined(HAS_DERIVATIVES)
          vec3 geomNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS))) * camera_ProjectionParams.x;
        #else
          vec3 geomNormal = vec3(0.0, 0.0, 1.0);
        #endif
        bool frontFacing = gl_FrontFacing;
        geomNormal *= float(frontFacing) * 2.0 - 1.0;

        vec3 surfaceNormal = geomNormal;
        #ifdef NEED_TANGENT_SPACE
          #ifdef NEED_VERTEX_TANGENT
            mat3 tbn = mat3(varyings.tangentWS, varyings.bitangentWS, varyings.normalWS);
          #else
            mat3 tbn = getTBNByDerivatives(uv, geomNormal, varyings.positionWS, frontFacing);
          #endif
          #ifdef MATERIAL_HAS_NORMALTEXTURE
            surfaceNormal = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, uv, frontFacing);
          #endif
        #endif

        float baseRoughness = max(SSR_MIN_PERCEPTUAL_ROUGHNESS, min(roughness + ssrGetAARoughnessFactor(surfaceNormal), 1.0));

        #ifdef MATERIAL_ENABLE_ANISOTROPY
          vec3 viewDir = getViewDirection(camera_Position, camera_Forward, varyings.positionWS);
          float aniso = material_AnisotropyInfo.z;
          vec3 anisoDir = vec3(material_AnisotropyInfo.xy, 0.0);
          #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
            vec3 anisoInfo = texture2D(material_AnisotropyTexture, uv).rgb;
            aniso *= anisoInfo.b;
            anisoDir.xy *= anisoInfo.rg * 2.0 - 1.0;
          #endif
          vec3 anisoT = normalize(mat3(tbn[0], tbn[1], surfaceNormal) * anisoDir);
          vec3 anisoB = normalize(cross(surfaceNormal, anisoT));
          vec3 aDir = (aniso >= 0.0) ? anisoB : anisoT;
          vec3 aTan = cross(aDir, viewDir);
          vec3 aNorm = cross(aTan, aDir);
          surfaceNormal = normalize(mix(surfaceNormal, aNorm, abs(aniso) * saturate(5.0 * roughness)));
        #endif

        vec3 chosenNormal = surfaceNormal;
        float chosenRoughness = baseRoughness;

        #ifdef MATERIAL_ENABLE_CLEAR_COAT
          float clearCoat = material_ClearCoat;
          float ccRoughness = material_ClearCoatRoughness;
          #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
            clearCoat *= texture2D(material_ClearCoatTexture, uv).r;
          #endif
          #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
            ccRoughness *= texture2D(material_ClearCoatRoughnessTexture, uv).g;
          #endif
          clearCoat = saturate(clearCoat);
          #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
            vec3 ccNormal = getNormalByNormalTexture(tbn, material_ClearCoatNormalTexture, material_NormalIntensity, uv, frontFacing);
          #else
            vec3 ccNormal = geomNormal;
          #endif
          float finalCCRoughness = max(SSR_MIN_PERCEPTUAL_ROUGHNESS, min(ccRoughness + ssrGetAARoughnessFactor(ccNormal), 1.0));
          if (clearCoat > 0.1 && finalCCRoughness < baseRoughness) {
            chosenNormal = ccNormal;
            chosenRoughness = finalCCRoughness;
          }
        #endif

        if (chosenRoughness >= camera_SSRParams.y) {
          discard;
        }

        float eyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
        SSRReceiverOutput output;
        output.normalRoughness = packSSRNormalRoughness(chosenNormal, chosenRoughness);
        output.receiverDepth = encodeSSRDepth(eyeDepth, camera_ProjectionParams.z);
        return output;
      }
    }
  }
}
