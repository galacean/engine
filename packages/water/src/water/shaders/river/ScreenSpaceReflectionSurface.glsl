
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
      sampler2D material_SurfaceNormalTexture;
#if {{USE_LOCAL_MAP}}
      sampler2D material_LocalMapTexture;
      vec4 renderer_LocalMapBodyToUv;
      vec4 renderer_LocalMapBodyOrigin;
      vec4 renderer_LocalMapUvRect;
      float renderer_LocalMapConfluence;
#endif
      float material_FlowSpeed;
      vec4 material_FlowNormalOffsets;
      float material_SurfaceSeed;
      vec4 material_SurfaceDomainOffsets;
      float material_SurfaceWarpOffset;
      float material_SurfaceMaxDisplacement;
      float material_SurfaceLengthScale;
      float material_ShoreDampingWidth;
      float material_SurfaceTurbulence;
      float material_FlowNormalStrength;
      float material_MacroDisplacementEnabled;
      float material_MicroSurfaceEnabled;
      float material_SurfaceTimeOverride;
      float material_Roughness;
      float material_MaximumSurfaceOpticalDistance;
      highp sampler2D camera_DepthTexture;
      mat4 camera_ViewInvMat;
      float material_ScreenSpaceReflectionMode;
      float material_ScreenSpaceReflectionIntensity;

{{SURFACE_APPEARANCE_UNIFORMS}}

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec4 COLOR_0;
        vec2 TEXCOORD_0;
        vec2 TEXCOORD_1;
        vec2 TEXCOORD_2;
        vec2 TEXCOORD_3;
        vec2 TEXCOORD_4;
        vec2 TEXCOORD_5;
      };
      struct Varyings {
        vec3 objectPosition;
        vec3 worldPosition;
        vec2 worldFlow;
        vec2 motionCoordinates;
        float riverHalfWidth;
        float localFlowSpeed;
        vec3 macroNormalWS;
        float authoredDepth;
        float surfaceEyeDepth;
        vec4 clipPosition;
        vec2 meshUv;
        vec3 tangentWS;
      };
      struct RiverScreenSpaceReflectionSurfaceOutput {
        layout(location = 0) vec4 geometry;
        layout(location = 1) vec4 responseColor;
      };

{{VALUE_003_RIVER_GEOMETRY_MODULE}}
{{SURFACE_NORMAL_FUNCTIONS}}
{{ROUGHNESS_DEPTH_FUNCTIONS}}
{{ROUGHNESS_PATTERN_FUNCTIONS}}

      Varyings vert(Attributes attr) {
        Varyings output;
        RiverGeometryVertex geometry = evaluateRiverGeometry(attr);
        output.objectPosition = geometry.localPosition.xyz;
        output.worldPosition = geometry.worldPosition.xyz;
        output.worldFlow = geometry.worldFlow;
        output.motionCoordinates = attr.TEXCOORD_2;
        output.riverHalfWidth = attr.TEXCOORD_3.x;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        output.macroNormalWS = geometry.macroNormalWS;
        output.authoredDepth = attr.TEXCOORD_3.y;
        output.surfaceEyeDepth = -(camera_ViewMat * geometry.worldPosition).z;
        output.clipPosition = geometry.clipPosition;
        output.meshUv = attr.TEXCOORD_0;
        output.tangentWS = geometry.worldTangent;
        gl_Position = geometry.clipPosition;
        return output;
      }

      RiverScreenSpaceReflectionSurfaceOutput frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        if (
          material_ScreenSpaceReflectionMode < 1.5
            || material_ScreenSpaceReflectionMode > 2.5
        ) discard;
        if (waterConnectionShore(input.worldPosition.xz, input.riverHalfWidth - abs(input.motionCoordinates.x)) <= 0.0) discard;
        float elapsedTime = surfaceTime();
{{LOCAL_SAMPLING}}
{{SURFACE_NORMAL_STATEMENTS}}
        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;
{{ROUGHNESS_DEPTH_MODULE}}
{{SURFACE_ROUGHNESS_STATEMENTS}}
        vec3 viewNormal = safeNormalize3(
          mat3(camera_ViewMat) * surfaceNormalWS,
          vec3(0.0, 0.0, 1.0)
        );
        RiverScreenSpaceReflectionSurfaceOutput surfaceOutput;
        surfaceOutput.geometry = packScreenSpaceReflectionSurface(
          viewNormal,
          effectiveSurfaceRoughness,
          1.0
        );
        surfaceOutput.responseColor = vec4(vec3(material_ScreenSpaceReflectionIntensity), 1.0);
        return surfaceOutput;
      }
