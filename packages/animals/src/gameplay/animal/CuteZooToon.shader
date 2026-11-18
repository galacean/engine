Shader "Animal/CuteZooToon" {
  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnly"
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      CullMode rasterStateCullMode;
      RasterState = { CullMode = rasterStateCullMode; }
      VertexShader = toonVertex;
      FragmentShader = toonFragment;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"
      // This diffuse-only material never evaluates reflection maps or local lights.
      #undef SCENE_USE_SPECULAR_ENV
      #undef SCENE_USE_SPECULAR_ENV_BLEND
      #undef SCENE_POINT_LIGHT_COUNT
      #undef SCENE_SPOT_LIGHT_COUNT
      #include "ShaderLibrary/Lighting/Light.glsl"
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      vec4 material_BaseColor;
      #ifdef MATERIAL_HAS_BASETEXTURE
        sampler2D material_BaseTexture;
        vec4 material_TilingOffset;
      #endif
      #ifdef MATERIAL_IS_ALPHA_CUTOFF
        float material_AlphaCutoff;
      #endif
      float animal_Brightness;
      float animal_Step;
      vec3 animal_ShadeColor;
      #ifdef ANIMAL_TOON_RIM
        float animal_RimStrength;
        float animal_RimPower;
        vec3 animal_RimColor;
      #endif
      #ifdef ANIMAL_TOON_FEATHER
        float animal_Feather;
      #endif
      #ifdef ANIMAL_TOON_SECOND_SHADE
        float animal_SecondStep;
        vec3 animal_SecondShadeColor;
      #endif

      struct ToonVaryings {
        vec3 positionWS;
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalWS;
        #endif
        #ifdef MATERIAL_HAS_BASETEXTURE
          vec2 uv;
        #endif
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
      };

      ToonVaryings toonVertex(Attributes attributes) {
        ToonVaryings v;
        vec4 position = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = attributes.TANGENT;
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
          #ifdef RENDERER_HAS_NORMAL
            normal = normal * INVERSE_MAT(mat3(skinMatrix));
          #endif
        #endif
        vec4 worldPosition = renderer_ModelMat * position;
        v.positionWS = worldPosition.xyz / worldPosition.w;
        #ifdef RENDERER_HAS_NORMAL
          v.normalWS = mat3(renderer_NormalMat) * normal;
        #endif
        #ifdef MATERIAL_HAS_BASETEXTURE
          #ifdef RENDERER_HAS_UV
            v.uv = attributes.TEXCOORD_0 * material_TilingOffset.xy + material_TilingOffset.zw;
          #else
            v.uv = material_TilingOffset.zw;
          #endif
        #endif
        #if SCENE_FOG_MODE != 0
          v.positionVS = (renderer_MVMat * position).xyz;
        #endif
        gl_Position = renderer_MVPMat * position;
        return v;
      }

      vec3 toonEnvironment(vec3 normal) {
        vec3 irradiance;
        #ifdef SCENE_USE_SH
          #ifdef SCENE_USE_REALTIME_SH
            irradiance = getRealtimeLightProbeIrradiance(normal);
          #else
            irradiance = max(vec3(0.0), scene_EnvSH[0] + scene_EnvSH[1] * normal.y
              + scene_EnvSH[2] * normal.z + scene_EnvSH[3] * normal.x
              + scene_EnvSH[4] * normal.y * normal.x + scene_EnvSH[5] * normal.y * normal.z
              + scene_EnvSH[6] * (3.0 * normal.z * normal.z - 1.0)
              + scene_EnvSH[7] * normal.z * normal.x
              + scene_EnvSH[8] * (normal.x * normal.x - normal.y * normal.y));
          #endif
        #else
          irradiance = scene_EnvMapLight.diffuse * PI;
        #endif
        return irradiance * scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
      }

      // UTS double-shade feather: the transition ends at the authored threshold.
      float toonBand(float value, float threshold) {
        #ifdef ANIMAL_TOON_FEATHER
          return clamp((value - threshold + animal_Feather) / animal_Feather, 0.0, 1.0);
        #else
          return step(threshold, value);
        #endif
      }

      void toonFragment(ToonVaryings v) {
        vec4 albedo = material_BaseColor;
        #ifdef MATERIAL_HAS_BASETEXTURE
          albedo *= texture2DSRGB(material_BaseTexture, v.uv);
        #endif
        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          if (albedo.a < material_AlphaCutoff) discard;
        #endif
        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = normalize(v.normalWS) * (float(gl_FrontFacing) * 2.0 - 1.0);
        #else
          vec3 normal = vec3(0.0, 1.0, 0.0);
        #endif
        vec3 environment = toonEnvironment(normal);
        vec3 illumination = environment;
        #ifdef SCENE_DIRECT_LIGHT_COUNT
          float visibility = 1.0;
          #ifdef NEED_CALCULATE_SHADOWS
            visibility = sampleShadowMap(v.positionWS, getShadowCoord(v.positionWS));
          #endif
          visibility *= sampleVolumetricCloudShadow(v.positionWS);
          for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
              float shadow = i == 0 ? visibility : 1.0;
              float halfLambert = dot(normal, -scene_DirectLightDirection[i]) * 0.5 + 0.5;
              float value = halfLambert * clamp(shadow * 0.5 + 0.8, 0.0, 1.0);
              vec3 shade = animal_ShadeColor;
              #ifdef ANIMAL_TOON_SECOND_SHADE
                shade = mix(animal_SecondShadeColor, shade, toonBand(value, animal_SecondStep));
              #endif
              vec3 palette = mix(shade, vec3(1.0), toonBand(value, animal_Step));
              // Match UTS's maximum rather than adding environment twice. Keep real
              // occlusion and night darkness instead of its fixed minimum-light floor.
              vec3 toon = palette * max(environment, scene_DirectLightColor[i]);
              illumination = mix(environment, toon, shadow);
            }
          }
        #endif
        #ifdef ANIMAL_TOON_RIM
          vec3 viewDirection = normalize(camera_Position - v.positionWS);
          float rim = pow(1.0 - max(0.0, dot(normal, viewDirection)), animal_RimPower);
          // Light-dependent rim, never a self-lit floor at night.
          illumination += max(environment, illumination) * animal_RimColor * rim * animal_RimStrength;
        #endif
        vec4 color = vec4(albedo.rgb * illumination * animal_Brightness, 1.0);
        #if SCENE_FOG_MODE != 0
          color = fog(color, v.positionVS);
        #endif
        gl_FragColor = color;
      }
    }
  }
}
