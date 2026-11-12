#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#if {{HAS_CAUSTICS}} == 1
      sampler2D material_AppearanceV2CausticsTexture;
      vec4 material_AppearanceV2CausticsTransform;
      vec4 material_AppearanceV2CausticsResponse;
      vec2 material_AppearanceV2CausticsParallax;
#endif
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;
#if {{HAS_MACRO_NORMAL_STRENGTH}} == 1
      float material_AppearanceV2MacroNormalStrength;
#endif
#if {{HAS_DIRECTIONAL_HIGHLIGHT}} == 1
      float material_AppearanceV2DirectionalHighlightStrength;
      float material_AppearanceV2DirectionalHighlightExponent;
      float material_AppearanceV2DirectionalHighlightDistortion;
      float material_AppearanceV2DirectionalHighlightSharp;
#endif

#if {{DETAIL_LAYER_COUNT}} > 0
#if {{DETAIL_0_USES_TEXTURE}} == 1
      sampler2D material_AppearanceV2Detail0Texture;
#endif
      vec4 material_AppearanceV2Detail0Transform;
      vec2 material_AppearanceV2Detail0Rotation;
      float material_AppearanceV2Detail0Strength;
#endif
#if {{DETAIL_LAYER_COUNT}} > 1
#if {{DETAIL_1_USES_TEXTURE}} == 1
      sampler2D material_AppearanceV2Detail1Texture;
#endif
      vec4 material_AppearanceV2Detail1Transform;
      vec2 material_AppearanceV2Detail1Rotation;
      float material_AppearanceV2Detail1Strength;
#endif

#if {{DEPTH_RESPONSE_MODEL}} == 3 || {{DEPTH_RESPONSE_MODEL}} == 4 || {{DEPTH_RESPONSE_MODEL}} == 5
      float material_AppearanceV2DepthMaximumOpacity;
      float material_AppearanceV2DepthCoefficient0;
      float material_AppearanceV2DepthCoefficient1;
      vec4 material_AppearanceV2DepthShallowColor;
      vec4 material_AppearanceV2DepthDeepColor;
#elif {{DEPTH_RESPONSE_MODEL}} != 0
      float material_AppearanceV2DepthDistance;
#if {{DEPTH_RESPONSE_MODEL}} == 1
      float material_AppearanceV2DepthExponent;
      vec4 material_AppearanceV2DepthColor;
#else
      float material_AppearanceV2DepthStop0Position;
      vec4 material_AppearanceV2DepthStop0Color;
      float material_AppearanceV2DepthStop1Position;
      vec4 material_AppearanceV2DepthStop1Color;
#if {{DEPTH_COLOR_STOP_COUNT}} > 2
      float material_AppearanceV2DepthStop2Position;
      vec4 material_AppearanceV2DepthStop2Color;
#endif
#if {{DEPTH_COLOR_STOP_COUNT}} > 3
      float material_AppearanceV2DepthStop3Position;
      vec4 material_AppearanceV2DepthStop3Color;
#endif
#endif
#endif

#if {{BOUNDARY_EFFECT_COUNT}} > 0
      float material_AppearanceV2Boundary0Range;
#if {{BOUNDARY_0_USES_POWER_RESPONSE}} == 1
      float material_AppearanceV2Boundary0Exponent;
#endif
#if {{BOUNDARY_0_OUTPUT_ALPHA}} == 1
      float material_AppearanceV2Boundary0Alpha;
#endif
#if {{BOUNDARY_0_OUTPUT_COLOR}} == 1
      vec3 material_AppearanceV2Boundary0Color;
#endif
#if {{BOUNDARY_0_OUTPUT_ROUGHNESS}} == 1
      float material_AppearanceV2Boundary0Roughness;
#endif
#if {{BOUNDARY_0_OUTPUT_REFRACTION}} == 1
      float material_AppearanceV2Boundary0RefractionSuppression;
#endif
#if {{BOUNDARY_0_HAS_PATTERN}} == 1
      float material_AppearanceV2Boundary0PatternWorldScale;
      float material_AppearanceV2Boundary0PatternTimeRate;
      float material_AppearanceV2Boundary0PatternOpacity;
      vec3 material_AppearanceV2Boundary0PatternWeights;
      float material_AppearanceV2Boundary0PatternLacunarity;
#if {{BOUNDARY_0_USES_POWER_PATTERN}} == 1
      float material_AppearanceV2Boundary0PatternExponent;
#endif
#endif
#endif

#if {{BOUNDARY_EFFECT_COUNT}} > 1
      float material_AppearanceV2Boundary1Range;
#if {{BOUNDARY_1_USES_POWER_RESPONSE}} == 1
      float material_AppearanceV2Boundary1Exponent;
#endif
#if {{BOUNDARY_1_OUTPUT_ALPHA}} == 1
      float material_AppearanceV2Boundary1Alpha;
#endif
#if {{BOUNDARY_1_OUTPUT_COLOR}} == 1
      vec3 material_AppearanceV2Boundary1Color;
#endif
#if {{BOUNDARY_1_OUTPUT_ROUGHNESS}} == 1
      float material_AppearanceV2Boundary1Roughness;
#endif
#if {{BOUNDARY_1_OUTPUT_REFRACTION}} == 1
      float material_AppearanceV2Boundary1RefractionSuppression;
#endif
#if {{BOUNDARY_1_HAS_PATTERN}} == 1
      float material_AppearanceV2Boundary1PatternWorldScale;
      float material_AppearanceV2Boundary1PatternTimeRate;
      float material_AppearanceV2Boundary1PatternOpacity;
      vec3 material_AppearanceV2Boundary1PatternWeights;
      float material_AppearanceV2Boundary1PatternLacunarity;
#if {{BOUNDARY_1_USES_POWER_PATTERN}} == 1
      float material_AppearanceV2Boundary1PatternExponent;
#endif
#endif
#endif

#if {{BOUNDARY_EFFECT_COUNT}} > 2
      float material_AppearanceV2Boundary2Range;
#if {{BOUNDARY_2_USES_POWER_RESPONSE}} == 1
      float material_AppearanceV2Boundary2Exponent;
#endif
#if {{BOUNDARY_2_OUTPUT_ALPHA}} == 1
      float material_AppearanceV2Boundary2Alpha;
#endif
#if {{BOUNDARY_2_OUTPUT_COLOR}} == 1
      vec3 material_AppearanceV2Boundary2Color;
#endif
#if {{BOUNDARY_2_OUTPUT_ROUGHNESS}} == 1
      float material_AppearanceV2Boundary2Roughness;
#endif
#if {{BOUNDARY_2_OUTPUT_REFRACTION}} == 1
      float material_AppearanceV2Boundary2RefractionSuppression;
#endif
#if {{BOUNDARY_2_HAS_PATTERN}} == 1
      float material_AppearanceV2Boundary2PatternWorldScale;
      float material_AppearanceV2Boundary2PatternTimeRate;
      float material_AppearanceV2Boundary2PatternOpacity;
      vec3 material_AppearanceV2Boundary2PatternWeights;
      float material_AppearanceV2Boundary2PatternLacunarity;
#if {{BOUNDARY_2_USES_POWER_PATTERN}} == 1
      float material_AppearanceV2Boundary2PatternExponent;
#endif
#endif
#endif

#if {{BOUNDARY_EFFECT_COUNT}} > 3
      float material_AppearanceV2Boundary3Range;
#if {{BOUNDARY_3_USES_POWER_RESPONSE}} == 1
      float material_AppearanceV2Boundary3Exponent;
#endif
#if {{BOUNDARY_3_OUTPUT_ALPHA}} == 1
      float material_AppearanceV2Boundary3Alpha;
#endif
#if {{BOUNDARY_3_OUTPUT_COLOR}} == 1
      vec3 material_AppearanceV2Boundary3Color;
#endif
#if {{BOUNDARY_3_OUTPUT_ROUGHNESS}} == 1
      float material_AppearanceV2Boundary3Roughness;
#endif
#if {{BOUNDARY_3_OUTPUT_REFRACTION}} == 1
      float material_AppearanceV2Boundary3RefractionSuppression;
#endif
#if {{BOUNDARY_3_HAS_PATTERN}} == 1
      float material_AppearanceV2Boundary3PatternWorldScale;
      float material_AppearanceV2Boundary3PatternTimeRate;
      float material_AppearanceV2Boundary3PatternOpacity;
      vec3 material_AppearanceV2Boundary3PatternWeights;
      float material_AppearanceV2Boundary3PatternLacunarity;
#if {{BOUNDARY_3_USES_POWER_PATTERN}} == 1
      float material_AppearanceV2Boundary3PatternExponent;
#endif
#endif
#endif

      float material_AppearanceDirectSpecularEnabled;
#endif
