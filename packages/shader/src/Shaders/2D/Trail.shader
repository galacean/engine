Shader "2D/Trail" {
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
    Pass "Default" {
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

      VertexShader = TrailVertex;
      FragmentShader = TrailFragment;

      #include "Common/Common.glsl"
      #include "Particle/ParticleCommon.glsl"

      struct a2v {
        vec4 a_PositionBirthTime;
        vec4 a_CornerTangent;
        float a_Distance;
      };

      struct v2f {
        vec2 v_uv;
        vec4 v_color;
      };

      vec4 renderer_TrailParams;
      vec2 renderer_DistanceParams;
      vec3 camera_Position;
      mat4 camera_ViewMat;
      mat4 camera_ProjMat;
      vec2 renderer_WidthCurve[4];
      vec4 renderer_ColorKeys[4];
      vec2 renderer_AlphaKeys[4];
      vec4 renderer_CurveMaxTime;
      vec4 material_BaseColor;
      mediump vec3 material_EmissiveColor;

      #ifdef MATERIAL_HAS_BASETEXTURE
        sampler2D material_BaseTexture;
      #endif

      #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        sampler2D material_EmissiveTexture;
      #endif

      v2f TrailVertex(a2v attr) {
        v2f v;

        vec3 position = attr.a_PositionBirthTime.xyz;
        float corner = attr.a_CornerTangent.x;
        vec3 tangent = attr.a_CornerTangent.yzw;
        float distFromHead = renderer_DistanceParams.x - attr.a_Distance;
        float totalDist = renderer_DistanceParams.x - renderer_DistanceParams.y;
        float relativePos = totalDist > 0.0 ? distFromHead / totalDist : 0.0;

        vec3 toCamera = normalize(camera_Position - position);
        vec3 right = cross(tangent, toCamera);
        float rightLenSq = dot(right, right);

        if (rightLenSq < 0.000001) {
          right = cross(tangent, vec3(0.0, 1.0, 0.0));
          rightLenSq = dot(right, right);
          if (rightLenSq < 0.000001) {
            right = cross(tangent, vec3(1.0, 0.0, 0.0));
            rightLenSq = dot(right, right);
          }
        }

        right = right * inversesqrt(rightLenSq);

        float width = evaluateParticleCurve(renderer_WidthCurve, min(relativePos, renderer_CurveMaxTime.z));
        vec3 worldPosition = position + right * width * 0.5 * corner;

        gl_Position = camera_ProjMat * camera_ViewMat * vec4(worldPosition, 1.0);

        float u = renderer_TrailParams.x == 0.0 ? relativePos : distFromHead;
        float vCoord = corner * 0.5 + 0.5;
        v.v_uv = vec2(u * renderer_TrailParams.y, vCoord * renderer_TrailParams.z);
        v.v_color = evaluateParticleGradient(renderer_ColorKeys, renderer_CurveMaxTime.x, renderer_AlphaKeys, renderer_CurveMaxTime.y, relativePos);

        return v;
      }

      void TrailFragment(v2f v) {
        vec4 color = material_BaseColor * v.v_color;

        #ifdef MATERIAL_HAS_BASETEXTURE
          color *= texture2DSRGB(material_BaseTexture, v.v_uv);
        #endif

        vec3 emissiveRadiance = material_EmissiveColor;

        #ifdef MATERIAL_HAS_EMISSIVETEXTURE
          emissiveRadiance *= texture2DSRGB(material_EmissiveTexture, v.v_uv).rgb;
        #endif

        color.rgb += emissiveRadiance;
        gl_FragColor = color;
      }
    }
  }
}
