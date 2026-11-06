
Shader "AIWorld/RiverSurfaceLocalMapBodyLocalV2AppearanceV2watersurfacematerialv12b852e5af9cd14f0" {
int material_WaterProfile;
int material_WaterRiverDrops;
float material_Water_look_reflectionSampling_screenSpaceCompositeIntensity;
float material_Water_look_reflectionSampling_environmentFallbackIntensity;
float material_Water_look_reflectionSampling_distortionStrength;
float material_Water_look_reflectionSampling_maximumDistortionPixels;
float material_Water_look_reflectionSampling_edgeFadeTexels;
float material_Water_look_reflectionSampling_minimumClipW;
float material_Water_look_reflectionSampling_roughnessFootprintTexels;
float material_Water_look_reflectionSampling_highFilterSampleCount;
float material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness;
float material_Water_look_oceanResponse_timeScale;
float material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond;
float material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio;
float material_Water_look_oceanResponse_microDetailResponse_0_speedRatio;
float material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond;
float material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio;
float material_Water_look_oceanResponse_microDetailResponse_1_speedRatio;
sampler2D material_Water_look_riverDrops_textures_directional;
sampler2D material_Water_look_riverDrops_textures_cloud;
sampler2D material_Water_look_riverDrops_textures_lines;
sampler2D material_Water_look_riverDrops_textures_edge;
sampler2D material_Water_look_riverDrops_textures_voronoi;
sampler2D material_Water_look_riverDrops_textures_foam;
sampler2D material_Water_look_riverDrops_textures_mist;
sampler2D material_Water_look_riverDrops_textures_splash;
vec2 material_Water_look_riverDrops_layers_directional_scale;
vec2 material_Water_look_riverDrops_layers_directional_velocity;
vec2 material_Water_look_riverDrops_layers_cloud_scale;
vec2 material_Water_look_riverDrops_layers_cloud_velocity;
vec2 material_Water_look_riverDrops_layers_lines_scale;
vec2 material_Water_look_riverDrops_layers_lines_velocity;
vec2 material_Water_look_riverDrops_layers_edge_scale;
vec2 material_Water_look_riverDrops_layers_edge_velocity;
vec2 material_Water_look_riverDrops_layers_voronoi_scale;
vec2 material_Water_look_riverDrops_layers_voronoi_velocity;
vec2 material_Water_look_riverDrops_layers_foam_scale;
vec2 material_Water_look_riverDrops_layers_foam_velocity;
vec3 material_Water_look_riverDrops_colors_0;
vec3 material_Water_look_riverDrops_colors_1;
vec3 material_Water_look_riverDrops_colors_2;
vec3 material_Water_look_riverDrops_colors_3;
float material_Water_look_riverDrops_speed;
float material_Water_look_riverDrops_opacity;
float material_Water_look_riverDrops_normalStrength;
float material_Water_look_riverDrops_colorContrast;
float material_Water_look_riverDrops_parallaxDepth;
float material_Water_look_riverDrops_foamOpacity;
float material_Water_look_riverDrops_sprayOpacity;
float material_Water_look_riverDrops_mistOpacity;
float material_Water_look_riverDrops_curtain_lineDistortion;
float material_Water_look_riverDrops_curtain_lineOpacity;
float material_Water_look_riverDrops_curtain_lineReveal;
float material_Water_look_riverDrops_curtain_bottomFoamStart;
float material_Water_look_riverDrops_curtain_bottomFoamThreshold;
float material_Water_look_riverDrops_curtain_edgeCutout;
float material_Water_look_riverDrops_curtain_edgeFoamThreshold;
float material_Water_look_riverDrops_curtain_edgeFoamOpacity;
float material_Water_look_riverDrops_curtain_entryFade;
float material_Water_look_riverDrops_curtain_dotsThreshold;
float material_Water_look_riverDrops_curtain_dotsOpacity;
vec2 material_Water_look_riverDrops_impact_scale;
float material_Water_look_riverDrops_impact_velocity;
float material_Water_look_riverDrops_impact_distortion;
float material_Water_look_riverDrops_impact_lengthMultiplier;
float material_Water_look_riverDrops_impact_lengthPower;
float material_Water_look_riverDrops_impact_widthPower;
float material_Water_look_riverDrops_impact_threshold;
int material_Water_look_foam_enabled;
float material_Water_look_foam_intensity;
vec4 material_Water_look_foam_color;
int material_Water_appearance_appearance_primaryColorClosure;
vec2 material_Water_appearance_appearance_detailLayers_0_scale;
vec2 material_Water_appearance_appearance_detailLayers_0_velocity;
int material_Water_appearance_appearance_detailLayers_0_space;
float material_Water_appearance_appearance_detailLayers_0_strength;
float material_Water_appearance_appearance_detailLayers_0_rotationDegrees;
int material_Water_appearance_appearance_detailLayers_0_normalConvention;
int material_Water_appearance_appearance_detailLayers_0_strengthMode;
int material_Water_appearance_appearance_detailLayers_0_blend;
sampler2D material_Water_appearance_appearance_detailLayers_0_texture;
vec2 material_Water_appearance_appearance_detailLayers_1_scale;
vec2 material_Water_appearance_appearance_detailLayers_1_velocity;
int material_Water_appearance_appearance_detailLayers_1_space;
float material_Water_appearance_appearance_detailLayers_1_strength;
float material_Water_appearance_appearance_detailLayers_1_rotationDegrees;
int material_Water_appearance_appearance_detailLayers_1_normalConvention;
int material_Water_appearance_appearance_detailLayers_1_strengthMode;
int material_Water_appearance_appearance_detailLayers_1_blend;
sampler2D material_Water_appearance_appearance_detailLayers_1_texture;
float material_Water_appearance_appearance_depthResponse_colorCoefficientPerMeter;
float material_Water_appearance_appearance_depthResponse_opacityCoefficientPerMeter;
float material_Water_appearance_appearance_depthResponse_maximumOpacity;
float material_Water_appearance_appearance_boundaryEffects_0_rangeMeters;
int material_Water_appearance_appearance_boundaryEffects_0_invert;
float material_Water_appearance_appearance_boundaryEffects_0_outputs_alpha;
float material_Water_appearance_appearance_boundaryEffects_1_rangeMeters;
int material_Water_appearance_appearance_boundaryEffects_1_invert;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_worldScale;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_timeRate;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_opacity;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_count;
vec3 material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_weights;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_lacunarity;
int material_Water_appearance_appearance_boundaryEffects_1_pattern_invert;
float material_Water_appearance_appearance_boundaryEffects_1_pattern_exponent;
vec3 material_Water_appearance_appearance_boundaryEffects_1_outputs_color;
int material_Water_appearance_appearance_refraction_enabled;
int material_Water_appearance_appearance_refraction_normalSource;
int material_Water_appearance_appearance_refraction_validation;
int material_Water_appearance_appearance_composition;
float material_Water_appearance_appearance_flowNormalStrength;
vec2 material_Water_appearance_appearance_caustics_scale;
vec2 material_Water_appearance_appearance_caustics_velocity;
float material_Water_appearance_appearance_caustics_intensity;
float material_Water_appearance_appearance_caustics_distortion;
float material_Water_appearance_appearance_caustics_parallaxOffset;
float material_Water_appearance_appearance_caustics_parallaxBias;
float material_Water_appearance_appearance_caustics_fadeCoefficientPerMeter;
float material_Water_appearance_appearance_caustics_opacityContribution;
sampler2D material_Water_appearance_appearance_caustics_texture;
int material_Water_appearance_featureFlags_externalNormal;
int material_Water_appearance_featureFlags_depthTint;
int material_Water_appearance_featureFlags_coastalAlpha;
int material_Water_appearance_featureFlags_contactFoam;
int material_Water_appearance_featureFlags_directSpecular;
vec3 material_Water_optics_profile_absorptionCoefficient;
vec3 material_Water_optics_profile_scatteringColor;
float material_Water_optics_profile_scatteringCoefficient;
float material_Water_optics_profile_maximumViewDistance;
float material_Water_optics_profile_indexOfRefraction;
float material_Water_optics_profile_maximumSurfaceOpticalDistance;
float material_Water_optics_profile_refractionStrength;
float material_Water_optics_profile_roughness;
float material_Water_optics_profile_reflectionIntensity;
int material_Water_optics_refractionEnabled;
int material_Water_optics_caustics;
int material_Water_reflectionPolicy_policy_preferred;
int material_WaterReflectionFallback0;
int material_WaterReflectionFallback1;
int material_Water_renderState_depthWriteEnabled;
int material_Water_renderState_queue;
float material_Water_renderState_priorityOffset;
int material_Water_renderState_cullMode;
int material_Water_renderState_blendMode;
Editor { Properties {
material_WaterProfile("material_WaterProfile", Enum(lake:0, river:1, ocean:2)) = 1;
material_WaterRiverDrops("material_WaterRiverDrops", Boolean) = true;
material_Water_look_reflectionSampling_screenSpaceCompositeIntensity("material_Water_look_reflectionSampling_screenSpaceCompositeIntensity", Float) = 1;
material_Water_look_reflectionSampling_environmentFallbackIntensity("material_Water_look_reflectionSampling_environmentFallbackIntensity", Float) = 1;
material_Water_look_reflectionSampling_distortionStrength("material_Water_look_reflectionSampling_distortionStrength", Float) = 0.025;
material_Water_look_reflectionSampling_maximumDistortionPixels("material_Water_look_reflectionSampling_maximumDistortionPixels", Float) = 64;
material_Water_look_reflectionSampling_edgeFadeTexels("material_Water_look_reflectionSampling_edgeFadeTexels", Float) = 8;
material_Water_look_reflectionSampling_minimumClipW("material_Water_look_reflectionSampling_minimumClipW", Float) = 0.001;
material_Water_look_reflectionSampling_roughnessFootprintTexels("material_Water_look_reflectionSampling_roughnessFootprintTexels", Float) = 3;
material_Water_look_reflectionSampling_highFilterSampleCount("material_Water_look_reflectionSampling_highFilterSampleCount", Float) = 1;
material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness("material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness", Float) = 0;
material_Water_look_oceanResponse_timeScale("material_Water_look_oceanResponse_timeScale", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond("material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond", Float) = 0;
material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio("material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_0_speedRatio("material_Water_look_oceanResponse_microDetailResponse_0_speedRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond("material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond", Float) = 100;
material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio("material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_1_speedRatio("material_Water_look_oceanResponse_microDetailResponse_1_speedRatio", Float) = 1;
material_Water_look_riverDrops_textures_directional("material_Water_look_riverDrops_textures_directional", Texture2D);
material_Water_look_riverDrops_textures_cloud("material_Water_look_riverDrops_textures_cloud", Texture2D);
material_Water_look_riverDrops_textures_lines("material_Water_look_riverDrops_textures_lines", Texture2D);
material_Water_look_riverDrops_textures_edge("material_Water_look_riverDrops_textures_edge", Texture2D);
material_Water_look_riverDrops_textures_voronoi("material_Water_look_riverDrops_textures_voronoi", Texture2D);
material_Water_look_riverDrops_textures_foam("material_Water_look_riverDrops_textures_foam", Texture2D);
material_Water_look_riverDrops_textures_mist("material_Water_look_riverDrops_textures_mist", Texture2D);
material_Water_look_riverDrops_textures_splash("material_Water_look_riverDrops_textures_splash", Texture2D);
material_Water_look_riverDrops_layers_directional_scale("material_Water_look_riverDrops_layers_directional_scale", Vector2) = (1, 2);
material_Water_look_riverDrops_layers_directional_velocity("material_Water_look_riverDrops_layers_directional_velocity", Vector2) = (0, -0.94);
material_Water_look_riverDrops_layers_cloud_scale("material_Water_look_riverDrops_layers_cloud_scale", Vector2) = (0.2, 0.5);
material_Water_look_riverDrops_layers_cloud_velocity("material_Water_look_riverDrops_layers_cloud_velocity", Vector2) = (-0.03, 0);
material_Water_look_riverDrops_layers_lines_scale("material_Water_look_riverDrops_layers_lines_scale", Vector2) = (4, 3);
material_Water_look_riverDrops_layers_lines_velocity("material_Water_look_riverDrops_layers_lines_velocity", Vector2) = (0, -1);
material_Water_look_riverDrops_layers_edge_scale("material_Water_look_riverDrops_layers_edge_scale", Vector2) = (1, 1);
material_Water_look_riverDrops_layers_edge_velocity("material_Water_look_riverDrops_layers_edge_velocity", Vector2) = (0, -0.45);
material_Water_look_riverDrops_layers_voronoi_scale("material_Water_look_riverDrops_layers_voronoi_scale", Vector2) = (0.7, 2.2);
material_Water_look_riverDrops_layers_voronoi_velocity("material_Water_look_riverDrops_layers_voronoi_velocity", Vector2) = (0, -0.42);
material_Water_look_riverDrops_layers_foam_scale("material_Water_look_riverDrops_layers_foam_scale", Vector2) = (1.3, 1.52);
material_Water_look_riverDrops_layers_foam_velocity("material_Water_look_riverDrops_layers_foam_velocity", Vector2) = (0, -0.48);
material_Water_look_riverDrops_colors_0("material_Water_look_riverDrops_colors_0", Vector3) = (0, 0.1220324755937144, 0.5028864550454939);
material_Water_look_riverDrops_colors_1("material_Water_look_riverDrops_colors_1", Vector3) = (0, 0.4356639051580454, 1);
material_Water_look_riverDrops_colors_2("material_Water_look_riverDrops_colors_2", Vector3) = (0, 0.7754727764002606, 1);
material_Water_look_riverDrops_colors_3("material_Water_look_riverDrops_colors_3", Vector3) = (1, 1, 1);
material_Water_look_riverDrops_speed("material_Water_look_riverDrops_speed", Float) = 1;
material_Water_look_riverDrops_opacity("material_Water_look_riverDrops_opacity", Float) = 1;
material_Water_look_riverDrops_normalStrength("material_Water_look_riverDrops_normalStrength", Float) = 0.1;
material_Water_look_riverDrops_colorContrast("material_Water_look_riverDrops_colorContrast", Float) = 0.37;
material_Water_look_riverDrops_parallaxDepth("material_Water_look_riverDrops_parallaxDepth", Float) = 0.192;
material_Water_look_riverDrops_foamOpacity("material_Water_look_riverDrops_foamOpacity", Float) = 1;
material_Water_look_riverDrops_sprayOpacity("material_Water_look_riverDrops_sprayOpacity", Float) = 0.6;
material_Water_look_riverDrops_mistOpacity("material_Water_look_riverDrops_mistOpacity", Float) = 0.24;
material_Water_look_riverDrops_curtain_lineDistortion("material_Water_look_riverDrops_curtain_lineDistortion", Float) = 0.3;
material_Water_look_riverDrops_curtain_lineOpacity("material_Water_look_riverDrops_curtain_lineOpacity", Float) = 1.23;
material_Water_look_riverDrops_curtain_lineReveal("material_Water_look_riverDrops_curtain_lineReveal", Float) = 0.45;
material_Water_look_riverDrops_curtain_bottomFoamStart("material_Water_look_riverDrops_curtain_bottomFoamStart", Float) = 0.338;
material_Water_look_riverDrops_curtain_bottomFoamThreshold("material_Water_look_riverDrops_curtain_bottomFoamThreshold", Float) = 0.181;
material_Water_look_riverDrops_curtain_edgeCutout("material_Water_look_riverDrops_curtain_edgeCutout", Float) = 0.1;
material_Water_look_riverDrops_curtain_edgeFoamThreshold("material_Water_look_riverDrops_curtain_edgeFoamThreshold", Float) = 0.6;
material_Water_look_riverDrops_curtain_edgeFoamOpacity("material_Water_look_riverDrops_curtain_edgeFoamOpacity", Float) = 0.5;
material_Water_look_riverDrops_curtain_entryFade("material_Water_look_riverDrops_curtain_entryFade", Float) = 7.2;
material_Water_look_riverDrops_curtain_dotsThreshold("material_Water_look_riverDrops_curtain_dotsThreshold", Float) = 0.752;
material_Water_look_riverDrops_curtain_dotsOpacity("material_Water_look_riverDrops_curtain_dotsOpacity", Float) = 0.313;
material_Water_look_riverDrops_impact_scale("material_Water_look_riverDrops_impact_scale", Vector2) = (0.4, 1.42);
material_Water_look_riverDrops_impact_velocity("material_Water_look_riverDrops_impact_velocity", Float) = -0.35;
material_Water_look_riverDrops_impact_distortion("material_Water_look_riverDrops_impact_distortion", Float) = 0.1061;
material_Water_look_riverDrops_impact_lengthMultiplier("material_Water_look_riverDrops_impact_lengthMultiplier", Float) = 1.07;
material_Water_look_riverDrops_impact_lengthPower("material_Water_look_riverDrops_impact_lengthPower", Float) = 1.31;
material_Water_look_riverDrops_impact_widthPower("material_Water_look_riverDrops_impact_widthPower", Float) = 0.21;
material_Water_look_riverDrops_impact_threshold("material_Water_look_riverDrops_impact_threshold", Float) = 0.22;
material_Water_look_foam_enabled("material_Water_look_foam_enabled", Boolean) = false;
material_Water_look_foam_intensity("material_Water_look_foam_intensity", Float) = 0;
material_Water_look_foam_color("material_Water_look_foam_color", Color) = (1, 1, 1, 1);
material_Water_appearance_appearance_primaryColorClosure("material_Water_appearance_appearance_primaryColorClosure", Enum(physical-volume:0, refracted-albedo-depth-ramp:1, stylized-depth-ramp:2, lit-scene-color-depth-ramp:3, scene-color-composite-depth-ramp:4)) = 1;
material_Water_appearance_appearance_detailLayers_0_scale("material_Water_appearance_appearance_detailLayers_0_scale", Vector2) = (0.02, 0.02);
material_Water_appearance_appearance_detailLayers_0_velocity("material_Water_appearance_appearance_detailLayers_0_velocity", Vector2) = (0, 0);
material_Water_appearance_appearance_detailLayers_0_space("material_Water_appearance_appearance_detailLayers_0_space", Enum(world-xz:0, object-xz:1, mesh-uv:2, flow-advected:3)) = 3;
material_Water_appearance_appearance_detailLayers_0_strength("material_Water_appearance_appearance_detailLayers_0_strength", Float) = 1;
material_Water_appearance_appearance_detailLayers_0_rotationDegrees("material_Water_appearance_appearance_detailLayers_0_rotationDegrees", Float) = 0;
material_Water_appearance_appearance_detailLayers_0_normalConvention("material_Water_appearance_appearance_detailLayers_0_normalConvention", Enum(opengl:0, directx:1)) = 0;
material_Water_appearance_appearance_detailLayers_0_strengthMode("material_Water_appearance_appearance_detailLayers_0_strengthMode", Enum(reconstruct-after-scale:0, preserve-source-z:1)) = 1;
material_Water_appearance_appearance_detailLayers_0_blend("material_Water_appearance_appearance_detailLayers_0_blend", Enum(whiteout:0, partial-derivative:1, reoriented:2, add-slope:3)) = 0;
material_Water_appearance_appearance_detailLayers_0_texture("material_Water_appearance_appearance_detailLayers_0_texture", Texture2D);
material_Water_appearance_appearance_detailLayers_1_scale("material_Water_appearance_appearance_detailLayers_1_scale", Vector2) = (0.01, 0.01);
material_Water_appearance_appearance_detailLayers_1_velocity("material_Water_appearance_appearance_detailLayers_1_velocity", Vector2) = (0.02, 0.02);
material_Water_appearance_appearance_detailLayers_1_space("material_Water_appearance_appearance_detailLayers_1_space", Enum(world-xz:0, object-xz:1, mesh-uv:2, flow-advected:3)) = 0;
material_Water_appearance_appearance_detailLayers_1_strength("material_Water_appearance_appearance_detailLayers_1_strength", Float) = 0.2;
material_Water_appearance_appearance_detailLayers_1_rotationDegrees("material_Water_appearance_appearance_detailLayers_1_rotationDegrees", Float) = 0;
material_Water_appearance_appearance_detailLayers_1_normalConvention("material_Water_appearance_appearance_detailLayers_1_normalConvention", Enum(opengl:0, directx:1)) = 0;
material_Water_appearance_appearance_detailLayers_1_strengthMode("material_Water_appearance_appearance_detailLayers_1_strengthMode", Enum(reconstruct-after-scale:0, preserve-source-z:1)) = 1;
material_Water_appearance_appearance_detailLayers_1_blend("material_Water_appearance_appearance_detailLayers_1_blend", Enum(whiteout:0, partial-derivative:1, reoriented:2, add-slope:3)) = 0;
material_Water_appearance_appearance_detailLayers_1_texture("material_Water_appearance_appearance_detailLayers_1_texture", Texture2D);
material_Water_appearance_appearance_depthResponse_colorCoefficientPerMeter("material_Water_appearance_appearance_depthResponse_colorCoefficientPerMeter", Float) = 0.09;
material_Water_appearance_appearance_depthResponse_opacityCoefficientPerMeter("material_Water_appearance_appearance_depthResponse_opacityCoefficientPerMeter", Float) = 0.53;
material_Water_appearance_appearance_depthResponse_maximumOpacity("material_Water_appearance_appearance_depthResponse_maximumOpacity", Float) = 0.844;
material_AppearanceV2DepthShallowColor("material_AppearanceV2DepthShallowColor", Vector4) = (0.006074269400017052, 0.2966979803815373, 0.9162945912785126, 1);
material_AppearanceV2DepthDeepColor("material_AppearanceV2DepthDeepColor", Vector4) = (0.009610201956499068, 0.1290884565842658, 0.3837282394757702, 1);
material_Water_appearance_appearance_boundaryEffects_0_rangeMeters("material_Water_appearance_appearance_boundaryEffects_0_rangeMeters", Float) = 0.3546099290780142;
material_Water_appearance_appearance_boundaryEffects_0_invert("material_Water_appearance_appearance_boundaryEffects_0_invert", Boolean) = false;
material_Water_appearance_appearance_boundaryEffects_0_outputs_alpha("material_Water_appearance_appearance_boundaryEffects_0_outputs_alpha", Float) = 1;
material_Water_appearance_appearance_boundaryEffects_1_rangeMeters("material_Water_appearance_appearance_boundaryEffects_1_rangeMeters", Float) = 0.0957;
material_Water_appearance_appearance_boundaryEffects_1_invert("material_Water_appearance_appearance_boundaryEffects_1_invert", Boolean) = true;
material_Water_appearance_appearance_boundaryEffects_1_pattern_worldScale("material_Water_appearance_appearance_boundaryEffects_1_pattern_worldScale", Float) = 1.332;
material_Water_appearance_appearance_boundaryEffects_1_pattern_timeRate("material_Water_appearance_appearance_boundaryEffects_1_pattern_timeRate", Float) = 1;
material_Water_appearance_appearance_boundaryEffects_1_pattern_opacity("material_Water_appearance_appearance_boundaryEffects_1_pattern_opacity", Float) = 0.889;
material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_count("material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_count", Float) = 3;
material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_weights("material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_weights", Vector3) = (0.5, 0.25, 0.125);
material_Water_appearance_appearance_boundaryEffects_1_pattern_lacunarity("material_Water_appearance_appearance_boundaryEffects_1_pattern_lacunarity", Float) = 2;
material_Water_appearance_appearance_boundaryEffects_1_pattern_invert("material_Water_appearance_appearance_boundaryEffects_1_pattern_invert", Boolean) = true;
material_Water_appearance_appearance_boundaryEffects_1_pattern_exponent("material_Water_appearance_appearance_boundaryEffects_1_pattern_exponent", Float) = -1.5;
material_Water_appearance_appearance_boundaryEffects_1_outputs_color("material_Water_appearance_appearance_boundaryEffects_1_outputs_color", Vector3) = (1, 1, 1);
material_Water_appearance_appearance_refraction_enabled("material_Water_appearance_appearance_refraction_enabled", Boolean) = true;
material_AppearanceV2RefractionUvScale("material_AppearanceV2RefractionUvScale", Float) = 0.207;
material_Water_appearance_appearance_refraction_normalSource("material_Water_appearance_appearance_refraction_normalSource", Enum(view-space-delta:0, tangent-space:1, first-detail-layer:2)) = 2;
material_Water_appearance_appearance_refraction_validation("material_Water_appearance_appearance_refraction_validation", Enum(full-scene-depth:0, shifted-scene-depth:1, local-only-safe:2)) = 1;
material_Water_appearance_appearance_composition("material_Water_appearance_appearance_composition", Enum(alpha-blend:0, precomposed-replace:1)) = 1;
material_Water_appearance_appearance_flowNormalStrength("material_Water_appearance_appearance_flowNormalStrength", Float) = 0;
material_AppearanceV2DetailNormalStrength("material_AppearanceV2DetailNormalStrength", Float) = 0.15;
material_Water_appearance_appearance_caustics_scale("material_Water_appearance_appearance_caustics_scale", Vector2) = (0.3246753246753247, 0.3246753246753247);
material_Water_appearance_appearance_caustics_velocity("material_Water_appearance_appearance_caustics_velocity", Vector2) = (-0.025, 0);
material_Water_appearance_appearance_caustics_intensity("material_Water_appearance_appearance_caustics_intensity", Float) = 4.1;
material_Water_appearance_appearance_caustics_distortion("material_Water_appearance_appearance_caustics_distortion", Float) = -0.03;
material_Water_appearance_appearance_caustics_parallaxOffset("material_Water_appearance_appearance_caustics_parallaxOffset", Float) = 0.15;
material_Water_appearance_appearance_caustics_parallaxBias("material_Water_appearance_appearance_caustics_parallaxBias", Float) = 0.42;
material_Water_appearance_appearance_caustics_fadeCoefficientPerMeter("material_Water_appearance_appearance_caustics_fadeCoefficientPerMeter", Float) = 1.1;
material_Water_appearance_appearance_caustics_opacityContribution("material_Water_appearance_appearance_caustics_opacityContribution", Float) = 0;
material_Water_appearance_appearance_caustics_texture("material_Water_appearance_appearance_caustics_texture", Texture2D);
material_Water_appearance_featureFlags_externalNormal("material_Water_appearance_featureFlags_externalNormal", Boolean) = false;
material_Water_appearance_featureFlags_depthTint("material_Water_appearance_featureFlags_depthTint", Boolean) = true;
material_Water_appearance_featureFlags_coastalAlpha("material_Water_appearance_featureFlags_coastalAlpha", Boolean) = false;
material_Water_appearance_featureFlags_contactFoam("material_Water_appearance_featureFlags_contactFoam", Boolean) = false;
material_Water_appearance_featureFlags_directSpecular("material_Water_appearance_featureFlags_directSpecular", Boolean) = true;
material_Water_optics_profile_absorptionCoefficient("material_Water_optics_profile_absorptionCoefficient", Vector3) = (0.16, 0.07, 0.035);
material_Water_optics_profile_scatteringColor("material_Water_optics_profile_scatteringColor", Vector3) = (0.08, 0.32, 0.48);
material_Water_optics_profile_scatteringCoefficient("material_Water_optics_profile_scatteringCoefficient", Float) = 0.12;
material_Water_optics_profile_maximumViewDistance("material_Water_optics_profile_maximumViewDistance", Float) = 120;
material_Water_optics_profile_indexOfRefraction("material_Water_optics_profile_indexOfRefraction", Float) = 1.333;
material_Water_optics_profile_maximumSurfaceOpticalDistance("material_Water_optics_profile_maximumSurfaceOpticalDistance", Float) = 40;
material_Water_optics_profile_refractionStrength("material_Water_optics_profile_refractionStrength", Float) = 1;
material_Water_optics_profile_roughness("material_Water_optics_profile_roughness", Float) = 0.017;
material_Water_optics_profile_reflectionIntensity("material_Water_optics_profile_reflectionIntensity", Float) = 1;
material_Water_optics_refractionEnabled("material_Water_optics_refractionEnabled", Boolean) = true;
material_Water_optics_caustics("material_Water_optics_caustics", Boolean) = false;
material_Water_reflectionPolicy_policy_preferred("material_Water_reflectionPolicy_policy_preferred", Enum(environment:0, ssr:1, analytic:2)) = 1;
material_WaterReflectionFallback0("material_WaterReflectionFallback0", Enum(None:-1, environment:0, ssr:1, analytic:2)) = 0;
material_WaterReflectionFallback1("material_WaterReflectionFallback1", Enum(None:-1, environment:0, ssr:1, analytic:2)) = 2;
material_Water_renderState_depthWriteEnabled("material_Water_renderState_depthWriteEnabled", Boolean) = false;
material_Water_renderState_queue("material_Water_renderState_queue", Enum(opaque:0, alpha-test:1, transparent:2)) = 2;
material_Water_renderState_priorityOffset("material_Water_renderState_priorityOffset", Float) = 0;
material_Water_renderState_cullMode("material_Water_renderState_cullMode", Enum(off:0, front:1, back:2)) = 0;
material_Water_renderState_blendMode("material_Water_renderState_blendMode", Enum(opaque:0, alpha:1, premultiplied-alpha:2, additive:3)) = 1;
} }

  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }
      Bool depthWriteEnabled;
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = depthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ProjMat;
      mat4 camera_ViewMat;
      mat4 camera_ViewInvMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
#ifndef WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED

      struct WaterSurfaceEnvironmentLight {
        vec3 diffuse;
        float mipMapLevel;
        float diffuseIntensity;
        float specularIntensity;
      };
      WaterSurfaceEnvironmentLight scene_EnvMapLight;
      #ifdef SCENE_USE_SH
        #ifdef SCENE_USE_REALTIME_SH
          #include "ShaderLibrary/Lighting/RealtimeSphericalHarmonics.glsl"
        #else
        vec3 scene_EnvSH[9];
        #endif
      #endif

#endif

      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      vec4 camera_DepthBufferParams;
      vec4 camera_ProjectionParams;
      highp sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      sampler2D material_SurfaceNormalTexture;
      sampler2D material_RiverFoamTexture;
      sampler2D material_LocalMapTexture;
      vec4 renderer_LocalMapBodyToUv;
      vec4 renderer_LocalMapBodyOrigin;
      vec4 renderer_LocalMapUvRect;
      float renderer_LocalMapConfluence;

      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      vec4 material_FlowNormalOffsets;
      vec4 material_FlowFoamOffsets;
      float material_FoamIntensity;
      float material_Clarity;
      float material_SurfaceSeed;
      vec4 material_SurfaceDomainOffsets;
      float material_SurfaceWarpOffset;
      float material_SurfaceMaxDisplacement;
      float material_SurfaceLengthScale;
      float material_ShoreDampingWidth;
      float material_SurfaceTurbulence;
      float material_CrestIntensity;
      float material_FlowNormalStrength;
      float material_SurfaceDebugMode;
      float material_MacroDisplacementEnabled;
      float material_MicroSurfaceEnabled;
      float material_SurfaceTimeOverride;
      float material_RefractionEnabled;
      vec3 material_AbsorptionCoefficient;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
      vec3 material_SurfaceScatteringCoefficient;
      float material_SurfaceScatteringPhaseG;
#endif
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_FresnelF0;
      float material_RefractionStrength;
      float material_Roughness;
      float material_ReflectionIntensity;
      float material_ReflectionSource;
      float material_WaterScreenSpaceReflectionCompositeIntensity;
      samplerCube material_ReflectionCubeTexture;
      sampler2D camera_ScreenSpaceReflectionTexture;
      float camera_ScreenSpaceReflectionIntensity;
      float camera_ScreenSpaceReflectionMaxRoughness;
#ifndef WATER_ENVIRONMENT_REFLECTION_UNIFORMS_INCLUDED
#define WATER_ENVIRONMENT_REFLECTION_UNIFORMS_INCLUDED

      vec4 material_EnvironmentReflectionParameters;
      float material_EnvironmentFallbackIntensity;
      float material_EnvironmentReflectionMaximumMip;
      vec4 material_EnvironmentReflectionProbePosition;
      vec4 material_EnvironmentReflectionBoxMinimum;
      vec4 material_EnvironmentReflectionBoxMaximum;
      samplerCube material_SecondaryReflectionCubeTexture;
      vec4 material_SecondaryEnvironmentReflectionParameters;
      float material_SecondaryEnvironmentReflectionMaximumMip;
      vec4 material_SecondaryEnvironmentReflectionProbePosition;
      vec4 material_SecondaryEnvironmentReflectionBoxMinimum;
      vec4 material_SecondaryEnvironmentReflectionBoxMaximum;
      float material_EnvironmentReflectionAvailable;
      float material_EnvironmentReflectionBlend;
      #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
      samplerCube material_LocalReflectionCubeTexture;
      float material_LocalEnvironmentReflectionAvailable;
      vec4 material_LocalEnvironmentReflectionParameters;
      float material_LocalEnvironmentReflectionMaximumMip;
      vec4 material_LocalEnvironmentReflectionProbePosition;
      vec4 material_LocalEnvironmentReflectionBoxMinimum;
      vec4 material_LocalEnvironmentReflectionBoxMaximum;
      #endif

#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
      sampler2D material_AppearanceV2CausticsTexture;
      vec4 material_AppearanceV2CausticsTransform;
      vec4 material_AppearanceV2CausticsResponse;
      vec2 material_AppearanceV2CausticsParallax;
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;

      sampler2D material_AppearanceV2Detail0Texture;
      vec4 material_AppearanceV2Detail0Transform;
      vec2 material_AppearanceV2Detail0Rotation;
      float material_AppearanceV2Detail0Strength;
      sampler2D material_AppearanceV2Detail1Texture;
      vec4 material_AppearanceV2Detail1Transform;
      vec2 material_AppearanceV2Detail1Rotation;
      float material_AppearanceV2Detail1Strength;

      float material_AppearanceV2DepthMaximumOpacity;
      float material_AppearanceV2DepthCoefficient0;
      float material_AppearanceV2DepthCoefficient1;
      vec4 material_AppearanceV2DepthShallowColor;
      vec4 material_AppearanceV2DepthDeepColor;
      float material_AppearanceV2DepthDebugView;

      float material_AppearanceV2Boundary0Range;
      float material_AppearanceV2Boundary0Alpha;

      float material_AppearanceV2Boundary1Range;
      vec3 material_AppearanceV2Boundary1Color;
      float material_AppearanceV2Boundary1PatternWorldScale;
      float material_AppearanceV2Boundary1PatternTimeRate;
      float material_AppearanceV2Boundary1PatternOpacity;
      vec3 material_AppearanceV2Boundary1PatternWeights;
      float material_AppearanceV2Boundary1PatternLacunarity;
      float material_AppearanceV2Boundary1PatternExponent;



      float material_AppearanceDirectSpecularEnabled;
#endif

      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"

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
        vec2 worldXZ;
        vec2 worldFlow;
        vec2 motionCoordinates;
        float riverHalfWidth;
        float localFlowSpeed;
        float macroHeight;
        float surfaceEyeDepth;
        float authoredDepth;
        vec3 worldPosition;
        vec3 macroNormalWS;
        vec3 objectPosition;
        vec2 meshUv;
        vec3 tangentWS;
        vec4 clipPosition;
      };

#ifndef WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED

      const float WATER_SURFACE_AMBIENT_PI = 3.141592653589793;

      vec3 waterSurfaceAmbientDiffuseRadiance(vec3 normalWS) {
        vec3 ambientIrradiance = scene_EnvMapLight.diffuse * WATER_SURFACE_AMBIENT_PI;
        #ifdef SCENE_USE_SH
          #ifdef SCENE_USE_REALTIME_SH
          ambientIrradiance = getRealtimeLightProbeIrradiance(normalWS);
          #else
          ambientIrradiance = max(
            scene_EnvSH[0]
              + scene_EnvSH[1] * normalWS.y
              + scene_EnvSH[2] * normalWS.z
              + scene_EnvSH[3] * normalWS.x
              + scene_EnvSH[4] * (normalWS.y * normalWS.x)
              + scene_EnvSH[5] * (normalWS.y * normalWS.z)
              + scene_EnvSH[6] * (3.0 * normalWS.z * normalWS.z - 1.0)
              + scene_EnvSH[7] * (normalWS.z * normalWS.x)
              + scene_EnvSH[8] * (normalWS.x * normalWS.x - normalWS.y * normalWS.y),
            vec3(0.0)
          );
          #endif
        #endif
        return ambientIrradiance
          * max(scene_EnvMapLight.diffuseIntensity, 0.0)
          / WATER_SURFACE_AMBIENT_PI;
      }

#endif

      float saturate(float value) { return clamp(value, 0.0, 1.0); }
#ifndef WATER_ENVIRONMENT_REFLECTION_INCLUDED
#define WATER_ENVIRONMENT_REFLECTION_INCLUDED

      vec3 waterEnvironmentSrgbToLinear(vec3 color) {
        vec3 low = color / 12.92;
        vec3 high = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
        return mix(low, high, step(vec3(0.04045), color));
      }

      vec3 waterEnvironmentReflectionDirection(
        vec3 directionWS,
        vec3 positionWS,
        vec4 probePosition,
        vec3 boxMinimum,
        vec3 boxMaximum
      ) {
        if (probePosition.w < 0.5) {
          return directionWS;
        }
        vec3 directionSign = mix(
          vec3(-1.0),
          vec3(1.0),
          step(vec3(0.0), directionWS)
        );
        vec3 safeDirection = directionSign * max(abs(directionWS), vec3(0.000001));
        vec3 intersectingPlane = mix(
          boxMinimum,
          boxMaximum,
          step(vec3(0.0), directionWS)
        );
        vec3 intersectionDistances = (intersectingPlane - positionWS) / safeDirection;
        float nearestIntersection = min(
          intersectionDistances.x,
          min(intersectionDistances.y, intersectionDistances.z)
        );
        vec3 projectedDirection = positionWS
          + directionWS * max(nearestIntersection, 0.0)
          - probePosition.xyz;
        float projectedValid = step(0.00000001, dot(projectedDirection, projectedDirection));
        return mix(directionWS, projectedDirection, projectedValid);
      }

      vec3 sampleWaterDistantEnvironmentReflection(vec3 directionWS, vec3 positionWS, float roughness) {
        vec3 originalDirectionWS = directionWS;
        directionWS = waterEnvironmentReflectionDirection(
          directionWS,
          positionWS,
          material_EnvironmentReflectionProbePosition,
          material_EnvironmentReflectionBoxMinimum.xyz,
          material_EnvironmentReflectionBoxMaximum.xyz
        );
        vec2 rotation = material_EnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(roughness, 0.0, 1.0)
          * max(material_EnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            waterEnvironmentSrgbToLinear(reflectedRadiance),
            step(0.5, material_EnvironmentReflectionParameters.w)
          );
        #endif
        reflectedRadiance *= max(material_EnvironmentReflectionParameters.z, 0.0);

        float secondaryWeight = clamp(material_EnvironmentReflectionBlend, 0.0, 1.0);
        if (secondaryWeight > 0.0) {
          vec3 secondaryDirection = waterEnvironmentReflectionDirection(
            originalDirectionWS,
            positionWS,
            material_SecondaryEnvironmentReflectionProbePosition,
            material_SecondaryEnvironmentReflectionBoxMinimum.xyz,
            material_SecondaryEnvironmentReflectionBoxMaximum.xyz
          );
          vec2 secondaryRotation = material_SecondaryEnvironmentReflectionParameters.xy;
          secondaryDirection = vec3(
            secondaryRotation.x * secondaryDirection.x + secondaryRotation.y * secondaryDirection.z,
            secondaryDirection.y,
            -secondaryRotation.y * secondaryDirection.x + secondaryRotation.x * secondaryDirection.z
          );
          float secondaryMipLevel = clamp(roughness, 0.0, 1.0)
            * max(material_SecondaryEnvironmentReflectionMaximumMip, 0.0);
          #ifdef HAS_TEX_LOD
            vec3 secondaryRadiance = textureCubeLodEXT(
              material_SecondaryReflectionCubeTexture,
              secondaryDirection,
              secondaryMipLevel
            ).rgb;
          #else
            vec3 secondaryRadiance = textureCube(
              material_SecondaryReflectionCubeTexture,
              secondaryDirection,
              secondaryMipLevel
            ).rgb;
          #endif
          #ifdef ENGINE_NO_SRGB
            secondaryRadiance = mix(
              secondaryRadiance,
              waterEnvironmentSrgbToLinear(secondaryRadiance),
              step(0.5, material_SecondaryEnvironmentReflectionParameters.w)
            );
          #endif
          secondaryRadiance *= max(material_SecondaryEnvironmentReflectionParameters.z, 0.0);
          reflectedRadiance = mix(reflectedRadiance, secondaryRadiance, secondaryWeight);
        }
        return reflectedRadiance * max(material_EnvironmentFallbackIntensity, 0.0);
      }

      #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
      float waterLocalEnvironmentWeight(vec3 positionWS) {
        if (material_LocalEnvironmentReflectionProbePosition.w < 0.5) {
          return 0.0;
        }
        vec3 distanceToBoundary = min(
          positionWS - material_LocalEnvironmentReflectionBoxMinimum.xyz,
          material_LocalEnvironmentReflectionBoxMaximum.xyz - positionWS
        );
        float nearestBoundary = min(distanceToBoundary.x, min(distanceToBoundary.y, distanceToBoundary.z));
        vec3 boxSize = max(
          material_LocalEnvironmentReflectionBoxMaximum.xyz
            - material_LocalEnvironmentReflectionBoxMinimum.xyz,
          vec3(0.001)
        );
        float fadeWidth = max(min(boxSize.x, min(boxSize.y, boxSize.z)) * 0.1, 0.001);
        return smoothstep(0.0, fadeWidth, nearestBoundary);
      }

      vec3 sampleWaterLocalEnvironmentReflection(vec3 directionWS, vec3 positionWS, float roughness) {
        directionWS = waterEnvironmentReflectionDirection(
          directionWS,
          positionWS,
          material_LocalEnvironmentReflectionProbePosition,
          material_LocalEnvironmentReflectionBoxMinimum.xyz,
          material_LocalEnvironmentReflectionBoxMaximum.xyz
        );
        vec2 rotation = material_LocalEnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(roughness, 0.0, 1.0)
          * max(material_LocalEnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_LocalReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_LocalReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            waterEnvironmentSrgbToLinear(reflectedRadiance),
            step(0.5, material_LocalEnvironmentReflectionParameters.w)
          );
        #endif
        return reflectedRadiance * max(material_LocalEnvironmentReflectionParameters.z, 0.0);
      }
      #endif

      vec3 sampleWaterBaseReflectionRadiance(
        vec3 analyticFallbackRadiance,
        vec3 directionWS,
        vec3 positionWS,
        float roughness
      ) {
        vec3 reflectedRadiance = analyticFallbackRadiance;
        if (material_EnvironmentReflectionAvailable > 0.5) {
          reflectedRadiance = sampleWaterDistantEnvironmentReflection(directionWS, positionWS, roughness);
        }
        #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
        if (material_LocalEnvironmentReflectionAvailable > 0.5) {
          float localWeight = waterLocalEnvironmentWeight(positionWS);
          if (localWeight > 0.0) {
            vec3 localRadiance = sampleWaterLocalEnvironmentReflection(directionWS, positionWS, roughness);
            reflectedRadiance = mix(reflectedRadiance, localRadiance, localWeight);
          }
        }
        #endif
        return reflectedRadiance;
      }

      float waterBaseReflectionAvailable() {
        float available = material_EnvironmentReflectionAvailable;
        #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
          available = max(available, material_LocalEnvironmentReflectionAvailable);
        #endif
        return available;
      }

#endif

#ifndef WATER_SURFACE_BRDF_INCLUDED
#define WATER_SURFACE_BRDF_INCLUDED

const float WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS =
  0.045;
const float WATER_SURFACE_BRDF_EPSILON = 0.000001;
const float WATER_SURFACE_BRDF_RECIPROCAL_PI =
  0.3183098861837907;
const float WATER_SURFACE_BRDF_PI = 3.141592653589793;

float waterSurfaceResolvePerceptualRoughness(float perceptualRoughness) {
  return max(
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS,
    clamp(perceptualRoughness, 0.0, 1.0)
  );
}

float waterSurfaceSchlick(float f0, float f90, float dotLH) {
  float boundedF0 = clamp(f0, 0.0, 1.0);
  float boundedF90 = clamp(f90, 0.0, 1.0);
  return boundedF0
    + (boundedF90 - boundedF0)
      * pow(1.0 - clamp(dotLH, 0.0, 1.0), 5.0);
}

float waterSurfaceGgxDistribution(float alpha, float dotNH) {
  float minimumAlpha =
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS
    * WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS;
  float resolvedAlpha = max(minimumAlpha, alpha);
  float alphaSquared = resolvedAlpha * resolvedAlpha;
  float boundedDotNH = clamp(dotNH, 0.0, 1.0);
  float denominator =
    boundedDotNH * boundedDotNH * (alphaSquared - 1.0) + 1.0;
  return WATER_SURFACE_BRDF_RECIPROCAL_PI * alphaSquared
    / max(
      denominator * denominator,
      WATER_SURFACE_BRDF_EPSILON
    );
}

float waterSurfaceGgxSmithCorrelated(float alpha, float dotNL, float dotNV) {
  float minimumAlpha =
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS
    * WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS;
  float resolvedAlpha = max(minimumAlpha, alpha);
  float alphaSquared = resolvedAlpha * resolvedAlpha;
  float boundedDotNL = clamp(dotNL, 0.0, 1.0);
  float boundedDotNV = clamp(dotNV, 0.0, 1.0);
  float gv = boundedDotNL * sqrt(
    alphaSquared
      + (1.0 - alphaSquared) * boundedDotNV * boundedDotNV
  );
  float gl = boundedDotNV * sqrt(
    alphaSquared
      + (1.0 - alphaSquared) * boundedDotNL * boundedDotNL
  );
  return 0.5 / max(gv + gl, WATER_SURFACE_BRDF_EPSILON);
}

float waterSurfaceDirectSpecular(
  float f0,
  float perceptualRoughness,
  float dotNV,
  float dotNL,
  float dotNH,
  float dotLH
) {
  float resolvedRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float alpha = resolvedRoughness * resolvedRoughness;
  float boundedDotNV = clamp(dotNV, 0.0, 1.0);
  float boundedDotNL = clamp(dotNL, 0.0, 1.0);
  float boundedDotNH = clamp(dotNH, 0.0, 1.0);
  float boundedDotLH = clamp(dotLH, 0.0, 1.0);
  float fresnel = waterSurfaceSchlick(f0, 1.0, boundedDotLH);
  float distribution = waterSurfaceGgxDistribution(alpha, boundedDotNH);
  float visibility =
    waterSurfaceGgxSmithCorrelated(alpha, boundedDotNL, boundedDotNV);
  return fresnel
    * distribution
    * visibility
    * boundedDotNL
    * WATER_SURFACE_BRDF_PI;
}

// Same split-sum DFG fit used by the engine PBR environment BRDF. Every
// reflected-radiance source (distant IBL, Local Probe, or SSR) passes
// through this once after confidence/validity composition.
vec2 waterSurfaceEnvironmentDfg(float perceptualRoughness, float dotNV) {
  vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = clamp(perceptualRoughness, 0.0, 1.0) * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * clamp(dotNV, 0.0, 1.0))) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}

vec3 waterSurfaceEnvironmentSpecularWeight(
  float f0,
  float perceptualRoughness,
  float dotNV
) {
  vec2 dfg = waterSurfaceEnvironmentDfg(perceptualRoughness, dotNV);
  return vec3(f0 * dfg.x + dfg.y);
}

// The mobile Lit closure uses a stable direct-BRDF fit rather than the full
// correlated-Smith evaluation above. Keep it opt-in so physical Water PCG
// materials retain the physically-derived default.
float waterSurfaceLitDirectSpecular(
  float f0,
  float perceptualRoughness,
  float dotNL,
  float dotNH,
  float dotLH
) {
  float resolvedPerceptualRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float roughness = max(
    resolvedPerceptualRoughness * resolvedPerceptualRoughness,
    0.0078125
  );
  float roughnessSquared = max(roughness * roughness, 0.00006103515625);
  float denominator = clamp(dotNH, 0.0, 1.0);
  denominator = denominator * denominator * (roughnessSquared - 1.0) + 1.00001;
  float lightDotHalfSquared = max(
    clamp(dotLH, 0.0, 1.0) * clamp(dotLH, 0.0, 1.0),
    0.1
  );
  float normalization = roughness * 4.0 + 2.0;
  float specularTerm = roughnessSquared
    / max(
      denominator * denominator * lightDotHalfSquared * normalization,
      WATER_SURFACE_BRDF_EPSILON
    );
  return clamp(f0, 0.0, 1.0) * specularTerm * clamp(dotNL, 0.0, 1.0);
}

// Mobile Lit environment term: perceptual roughness controls both the
// prefiltered probe mip and the F0-to-grazing interpolation (Pow4).
float waterSurfaceLitEnvironmentSpecularWeight(
  float f0,
  float perceptualRoughness,
  float dotNV
) {
  float resolvedPerceptualRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float roughness = resolvedPerceptualRoughness * resolvedPerceptualRoughness;
  float surfaceReduction = 1.0 / (roughness * roughness + 1.0);
  float grazingTerm = clamp(
    1.0 - resolvedPerceptualRoughness + clamp(f0, 0.0, 1.0),
    0.0,
    1.0
  );
  float fresnelTerm = pow(1.0 - clamp(dotNV, 0.0, 1.0), 4.0);
  return surfaceReduction * mix(clamp(f0, 0.0, 1.0), grazingTerm, fresnelTerm);
}

#endif

#ifndef WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED
#define WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED

struct WaterSurfaceRawRefractionFactsV2 {
  vec3 centeredSceneSample;
  vec3 displacedSceneSample;
  float displacedSampleValidity;
  float depthWeight;
  float shoreValidity;
  float coverage;
};

struct WaterSurfaceRawReflectionFactsV2 {
  vec3 analyticSample;
  vec3 environmentSample;
  float environmentValidity;
  vec3 ssrPremultipliedSample;
  float ssrValidity;
};

struct WaterSurfaceRawFoamFactsV2 {
  float surfaceSignal;
  float shoreSignal;
  float crestSignal;
  float currentSignal;
  float wakeSignal;
  float contactSignal;
  float localSignal;
  float motionScale;
  float enabled;
};

struct WaterSurfaceRawContributionPolicyV2 {
  float primaryColorClosureModel;
  float refractionEnabled;
  float clarity;
  float boundaryRefractionSuppression;
  float reflectionSource;
  float ssrCompositeIntensity;
  float foamIntensity;
  float calibrationMode;
};

struct WaterSurfaceResolvedRawContributionsV2 {
  vec3 refractionSceneColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float foamWeight;
};

void waterSurfaceSampleRawEnvironmentReflectionV2(
  vec3 directionWS,
  vec3 positionWS,
  float perceptualRoughness,
  out vec3 radiance,
  out float validity
) {
  radiance = vec3(0.0);
  validity = 0.0;
  if (material_EnvironmentReflectionAvailable > 0.5) {
    radiance = sampleWaterDistantEnvironmentReflection(
      directionWS,
      positionWS,
      perceptualRoughness
    );
    validity = 1.0;
  }
  #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
    if (material_LocalEnvironmentReflectionAvailable > 0.5) {
      float localWeight = waterLocalEnvironmentWeight(positionWS);
      if (localWeight > 0.0) {
        vec3 localRadiance = sampleWaterLocalEnvironmentReflection(
          directionWS,
          positionWS,
          perceptualRoughness
        );
        if (validity > 0.5) {
          radiance = mix(radiance, localRadiance, localWeight);
        } else {
          radiance = localRadiance;
          validity = localWeight;
        }
      }
    }
  #endif
}

vec3 waterSurfaceResolveAnalyticReflectionFallbackV2(
  float normalY,
  float perceptualRoughness,
  float environmentIntensity
) {
  return mix(
    vec3(0.075, 0.16, 0.21),
    vec3(0.32, 0.48, 0.57),
    mix(
      clamp(normalY * 0.5 + 0.5, 0.0, 1.0),
      0.5,
      clamp(perceptualRoughness, 0.0, 1.0)
    )
  ) * max(environmentIntensity, 0.0);
}

WaterSurfaceResolvedRawContributionsV2 waterSurfaceResolveRawContributionsV2(
  WaterSurfaceRawRefractionFactsV2 refraction,
  WaterSurfaceRawReflectionFactsV2 reflection,
  WaterSurfaceRawFoamFactsV2 foam,
  WaterSurfaceRawContributionPolicyV2 policy
) {
  WaterSurfaceResolvedRawContributionsV2 resolved;
  float proceduralSignal = max(
    max(
      max(foam.surfaceSignal, foam.shoreSignal),
      foam.crestSignal * 0.68 + foam.currentSignal * 0.32
    ),
    foam.wakeSignal
  ) * max(foam.motionScale, 0.0);
  float foamSignal = clamp(
    max(
      max(proceduralSignal, 0.0) * max(policy.foamIntensity, 0.0),
      max(foam.localSignal, 0.0)
    )
      * step(0.5, foam.enabled)
      * (1.0 - step(0.5, policy.calibrationMode)),
    0.0,
    1.0
  );
  resolved.foamWeight = max(
    smoothstep(0.02, 0.78, foamSignal),
    clamp(foam.contactSignal, 0.0, 1.0)
  );

  float displacedValidity = clamp(
    refraction.displacedSampleValidity
      * step(0.5, policy.refractionEnabled),
    0.0,
    1.0
  );
  resolved.refractionSceneColor = mix(
    refraction.centeredSceneSample,
    refraction.displacedSceneSample,
    displacedValidity
  );
  resolved.refractionWeight = clamp(
    (1.0 - step(1.5, policy.primaryColorClosureModel))
      * displacedValidity
      * clamp(refraction.depthWeight, 0.0, 1.0)
      * clamp(refraction.shoreValidity, 0.0, 1.0)
      * clamp(refraction.coverage, 0.0, 1.0)
      * clamp(policy.clarity, 0.0, 1.0)
      * (1.0 - resolved.foamWeight * 0.94)
      * (1.0 - clamp(policy.boundaryRefractionSuppression, 0.0, 1.0)),
    0.0,
    1.0
  );

  vec3 environment = mix(
    reflection.analyticSample,
    reflection.environmentSample,
    clamp(reflection.environmentValidity, 0.0, 1.0)
  );
  resolved.reflectionRadiance = reflection.analyticSample;
  if (policy.reflectionSource > 2.5) {
    float ssrScale = clamp(policy.ssrCompositeIntensity, 0.0, 1.0);
    float ssrBlend = clamp(reflection.ssrValidity * ssrScale, 0.0, 1.0);
    resolved.reflectionRadiance =
      environment * (1.0 - ssrBlend)
      + reflection.ssrPremultipliedSample * ssrScale;
  } else if (policy.reflectionSource > 0.5) {
    resolved.reflectionRadiance = environment;
  }
  return resolved;
}

#endif

#ifndef WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
#define WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
struct WaterSingleScatteringResult {
  vec3 transmittance;
  vec3 lightTransmittance;
  vec3 scattering;
};

float waterScatteringPhase(float phaseG, float cosine) {
  float g = clamp(phaseG, -0.95, 0.95);
  // UE Schlick approximation with a positivity guard at the authoring limits.
  float k = clamp(1.55 * g - 0.55 * g * g * g, -0.99, 0.99);
  float denominator = 1.0 + k * clamp(cosine, -1.0, 1.0);
  return (1.0 - k * k) / (12.5663706144 * denominator * denominator);
}

WaterSingleScatteringResult waterEvaluateSingleScattering(
  vec3 absorption, vec3 scatteringCoefficient, float phaseG,
  float opticalDistance, float lightDistance, float phaseCosine,
  vec3 sunRadiance, vec3 ambientRadiance
) {
  WaterSingleScatteringResult result;
  vec3 sigmaS = max(scatteringCoefficient, vec3(0.0));
  vec3 sigmaT = max(absorption, vec3(0.0)) + sigmaS;
  result.transmittance = exp(-sigmaT * max(opticalDistance, 0.0));
  result.lightTransmittance = exp(-sigmaT * max(lightDistance, 0.0));
  vec3 incoming = max(sunRadiance, vec3(0.0)) * waterScatteringPhase(phaseG, phaseCosine)
    + max(ambientRadiance, vec3(0.0)) / 12.5663706144;
  result.scattering = incoming * clamp(
    sigmaS * (1.0 - result.transmittance) / max(sigmaT, vec3(0.00001)), vec3(0.0), vec3(1.0)
  );
  return result;
}
#endif

#ifndef WATER_SURFACE_CLOSURE_INCLUDED
#define WATER_SURFACE_CLOSURE_INCLUDED
vec3 waterSurfaceResolvePrimaryColor(
  vec3 sceneColor,
  vec3 surfaceColor,
  vec3 depthColor,
  float depthFactor,
  vec3 diffuseLighting,
  float closureModel
) {
  if (closureModel > 3.5) {
    return mix(sceneColor, depthColor, clamp(depthFactor, 0.0, 1.0)) * max(diffuseLighting, vec3(0.0));
  }
  vec3 stylized = mix(
    surfaceColor,
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
  vec3 litScene = mix(
    clamp(sceneColor, vec3(0.0), vec3(1.0)),
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
    return closureModel > 1.5
      ? litScene
      : (closureModel > 0.5 ? stylized : surfaceColor);
}

vec3 waterSurfaceOpticalTransmittance(vec3 absorptionCoefficient, float opticalDepth) {
  return exp(-max(absorptionCoefficient, vec3(0.0)) * max(opticalDepth, 0.0));
}

vec3 waterSurfaceOpticalScattering(
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  float weight = 1.0 - exp(-max(scatteringCoefficient, 0.0) * max(opticalDepth, 0.0));
  return max(scatteringColor, vec3(0.0)) * weight;
}

vec3 waterSurfaceApplyOpticalVolume(
  vec3 surfaceColor,
  vec3 absorptionCoefficient,
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  return surfaceColor * waterSurfaceOpticalTransmittance(absorptionCoefficient, opticalDepth)
    + waterSurfaceOpticalScattering(scatteringColor, scatteringCoefficient, opticalDepth);
}

vec4 waterSurfaceComposeFinal(vec3 color, float alpha, float precomposedReplace) {
  return vec4(color, mix(clamp(alpha, 0.0, 1.0), 1.0, step(0.5, precomposedReplace)));
}

float waterSurfaceResolveAlphaV2(
  float baseAlpha,
  float clarity,
  float opticalDepth,
  float fresnel,
  float foamWeight,
  float calibrationMode,
  float coastalAlpha,
  float coastalAlphaWeight
) {
  float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clamp(clarity, 0.0, 1.0)) * max(opticalDepth, 0.0));
  float alpha = baseAlpha * mix(0.18, 0.94, absorptionAlpha);
  alpha += clamp(fresnel, 0.0, 1.0) * (1.0 - alpha) * 0.48;
  alpha += clamp(foamWeight, 0.0, 1.0) * 0.3 * (1.0 - step(0.5, calibrationMode));
  alpha = mix(alpha, coastalAlpha, clamp(coastalAlphaWeight, 0.0, 1.0));
  return clamp(alpha, 0.0, 1.0);
}

struct WaterSurfaceFinalClosureV2Input {
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  vec3 surfaceScatteringCoefficient;
  float surfaceScatteringPhaseG;
  float sceneToSurfaceDistance;
  float phaseCosine;
  vec3 sunRadiance;
  vec3 ambientRadiance;
  float opticalDebugMode;
#endif
  vec3 primarySceneColor;
  vec3 surfaceColor;
  vec3 depthColor;
  float depthFactor;
  vec3 diffuseLighting;
  float primaryColorClosureModel;
  vec3 absorptionCoefficient;
  vec3 scatteringColor;
  float scatteringCoefficient;
  float opticalDepth;
  vec3 refractionColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float fresnelF0;
  float perceptualRoughness;
  float normalDotView;
  float transmissionFresnelWeight;
  float reflectionIntensity;
  vec3 directSpecularRadiance;
  vec3 boundaryColor;
  vec3 foamColor;
  float foamWeight;
  float baseAlpha;
  float clarity;
  float calibrationMode;
  float coastalAlpha;
  float coastalAlphaWeight;
  float coverage;
  vec3 compositionSceneColor;
  float precomposedReplace;
};

struct WaterSurfaceResolvedLightingV2 {
  vec3 diffuseRadiance;
  vec3 directSpecularRadiance;
};

WaterSurfaceResolvedLightingV2 waterSurfaceCreateResolvedLightingV2(vec3 ambientDiffuseRadiance) {
  WaterSurfaceResolvedLightingV2 lighting;
  lighting.diffuseRadiance = max(ambientDiffuseRadiance, vec3(0.0));
  lighting.directSpecularRadiance = vec3(0.0);
  return lighting;
}

WaterSurfaceResolvedLightingV2 waterSurfaceAccumulateDirectLightingV2(
  WaterSurfaceResolvedLightingV2 lighting,
  vec3 lightRadiance,
  float normalDotView,
  float normalDotLight,
  float normalDotHalf,
  float lightDotHalf,
  float fresnelF0,
  float perceptualRoughness,
  float primaryColorClosureModel,
  float directSpecularEnabled
) {
  vec3 safeLightRadiance = max(lightRadiance, vec3(0.0));
  float safeNormalDotLight = clamp(normalDotLight, 0.0, 1.0);
  float standardDirectSpecular = waterSurfaceDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    normalDotView,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float litDirectSpecular = waterSurfaceLitDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float resolvedDirectSpecular = mix(
    standardDirectSpecular,
    litDirectSpecular,
    step(1.5, primaryColorClosureModel) * (1.0 - step(3.5, primaryColorClosureModel))
  ) * clamp(directSpecularEnabled, 0.0, 1.0);
  lighting.diffuseRadiance += safeLightRadiance * safeNormalDotLight;
  lighting.directSpecularRadiance += safeLightRadiance * resolvedDirectSpecular;
  return lighting;
}

vec4 waterSurfaceEvaluateFinalClosureV2(
  WaterSurfaceFinalClosureV2Input closure,
  float foamColorWeight,
  float depthOpacity
) {
  float fresnel = waterSurfaceSchlick(
    closure.fresnelF0,
    1.0,
    closure.normalDotView
  );
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  WaterSingleScatteringResult medium = waterEvaluateSingleScattering(
    closure.absorptionCoefficient, closure.surfaceScatteringCoefficient, closure.surfaceScatteringPhaseG,
    closure.opticalDepth, closure.sceneToSurfaceDistance, closure.phaseCosine,
    closure.sunRadiance, closure.ambientRadiance
  );
  vec3 tint = mix(closure.surfaceColor, closure.depthColor, clamp(closure.depthFactor, 0.0, 1.0));
  vec3 volume = closure.refractionColor * medium.transmittance * medium.lightTransmittance
    + medium.scattering * max(tint, vec3(0.0));
  vec3 reflectionWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0, closure.perceptualRoughness, closure.normalDotView
  );
  vec3 lit = volume * (1.0 - fresnel)
    + closure.reflectionRadiance * reflectionWeight * max(closure.reflectionIntensity, 0.0)
    + closure.directSpecularRadiance
    + closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  lit = mix(lit, closure.foamColor * max(closure.diffuseLighting, vec3(0.0)), clamp(foamColorWeight, 0.0, 1.0));
  if (closure.opticalDebugMode > 13.5 && closure.opticalDebugMode < 14.5) return vec4(medium.transmittance, 1.0);
  if (closure.opticalDebugMode > 14.5 && closure.opticalDebugMode < 15.5) return vec4(medium.scattering, 1.0);
  // The volume already contains the background. Coverage alone blends its geometric boundary.
  return vec4(mix(closure.compositionSceneColor, lit, clamp(closure.coverage, 0.0, 1.0)), 1.0);
#endif
  vec3 primaryColor = waterSurfaceResolvePrimaryColor(
    closure.primarySceneColor,
    closure.surfaceColor,
    closure.depthColor,
    closure.depthFactor,
    closure.diffuseLighting,
    closure.primaryColorClosureModel
  );
  vec3 opticalVolumeColor = waterSurfaceApplyOpticalVolume(
    primaryColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 baseColor = mix(
    opticalVolumeColor,
    primaryColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 refractedVolumeColor = waterSurfaceApplyOpticalVolume(
    closure.refractionColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 resolvedRefractionColor = mix(
    refractedVolumeColor,
    closure.refractionColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 color = mix(
    baseColor,
    resolvedRefractionColor,
    clamp(closure.refractionWeight, 0.0, 1.0) * (1.0 - step(1.5, closure.primaryColorClosureModel))
  );
  vec3 boundaryContribution = closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  float litSceneColorClosure = step(1.5, closure.primaryColorClosureModel);
  color += boundaryContribution * litSceneColorClosure;
  color *= mix(
    1.0,
    1.0 - fresnel,
    clamp(closure.transmissionFresnelWeight, 0.0, 1.0)
  );
  vec3 reflectionBrdfWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0,
    closure.perceptualRoughness,
    closure.normalDotView
  );
  color += closure.reflectionRadiance
    * reflectionBrdfWeight
    * max(closure.reflectionIntensity, 0.0);
  color += closure.directSpecularRadiance;
  color += boundaryContribution * (1.0 - litSceneColorClosure);
  vec3 litFoamColor = closure.foamColor * max(closure.diffuseLighting, vec3(0.0));
  color = mix(color, litFoamColor, clamp(foamColorWeight, 0.0, 1.0));

  float alpha = waterSurfaceResolveAlphaV2(
    closure.baseAlpha,
    closure.clarity,
    closure.opticalDepth,
    fresnel,
    closure.foamWeight,
    closure.calibrationMode,
    closure.coastalAlpha,
    closure.coastalAlphaWeight
  ) * clamp(closure.coverage, 0.0, 1.0);
  float replace = step(0.5, closure.precomposedReplace);
    color = mix(color, mix(closure.compositionSceneColor, color, alpha), replace);
  return waterSurfaceComposeFinal(color, alpha, replace);
}

// Existing backends retain their opaque depth colors unless they supply depth opacity.
vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure, float foamColorWeight) {
  return waterSurfaceEvaluateFinalClosureV2(closure, foamColorWeight, 1.0);
}

vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure) {
  return waterSurfaceEvaluateFinalClosureV2(closure, closure.foamWeight);
}

// Shared editor picking output; normal rendering retains the resolved optical closure.
#ifdef RENDERER_WORLD_PICK
float renderer_WorldPickBase;
#endif
float renderer_WorldSelectionMode;
vec4 renderer_WorldSelectionAppearance;
vec4 waterSurfaceOutputWithPick(vec4 color) {
#ifdef RENDERER_WORLD_PICK
  if (color.a <= 0.001) discard;
  float id = floor(renderer_WorldPickBase + 0.5);
  #ifdef RENDERER_WORLD_PICK_DEPTH
    id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
  #endif
  return vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
#else
  if (renderer_WorldSelectionMode >= 0.5) {
    vec2 p = gl_FragCoord.xy * renderer_WorldSelectionAppearance.yz * 2.0;
    float phase = renderer_WorldSelectionAppearance.x * 6.2831853;
    // Smooth warped colour pools instead of parallel rainbow stripes. Exact 2.4s loop.
    float field = p.y * 3.0 + sin(p.x * 4.0 + p.y * 2.0) * 0.7;
    float flow = field + phase + 0.24 * sin(phase + p.x * 5.0);
    // Match the saturated spectrum used by generation reveal effects.
    vec3 film = 0.54 + 0.46 * cos(flow + 6.2831853 * vec3(0.03, 0.36, 0.69));
    float sheen = pow(0.5 + 0.5 * sin(flow + p.x * 1.4), 8.0);
    // HDR emission feeds the existing scene Bloom before tonemapping.
    vec3 highlighted = mix(color.rgb, film, 0.82) + film * (1.2 + sheen * 0.8);
    // Fade the entire highlight, including HDR emission, back to the live material.
    float breath = 0.5 - 0.5 * cos(phase);
    color.rgb = mix(color.rgb, highlighted, renderer_WorldSelectionAppearance.w * breath);
  }
  return color;
#endif
}

#endif

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif

#ifndef WATER_SURFACE_APPEARANCE_INCLUDED
#define WATER_SURFACE_APPEARANCE_INCLUDED

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif

float waterSurfaceAppearanceDepthTintFactor(
  float sceneDepthDelta,
  float distance,
  float exponent
) {
  return pow(
    clamp(sceneDepthDelta / max(distance, 0.0001), 0.0, 1.0),
    max(exponent, 0.0001)
  );
}

float waterSurfaceAppearanceCoastalAlpha(
  float sceneDepthDelta,
  float distance
) {
  return clamp(sceneDepthDelta / max(distance, 0.0001), 0.0, 1.0);
}

vec2 waterSurfaceAppearanceRefractionUvDelta(
  vec2 normalDelta,
  float strength
) {
  return normalDelta * max(strength, 0.0);
}

float waterSurfaceAppearanceRefractionSampleValidity(
  float screenInterior,
  float depthContinuity,
  float geometryBehindSurface,
  float centeredDepthBehind,
  float refractedSceneDepthFinite
) {
  return clamp(screenInterior, 0.0, 1.0)
    * clamp(depthContinuity, 0.0, 1.0)
    * clamp(geometryBehindSurface, 0.0, 1.0)
    * clamp(centeredDepthBehind, 0.0, 1.0)
    * clamp(refractedSceneDepthFinite, 0.0, 1.0);
}

#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif

float waterSurfaceAppearanceV2RefractionValidity(
  float insideScreen,
  float waterCoverage,
  float shoreSafety,
  float centeredGeometryBehindSurface,
  float shiftedGeometryBehindSurface,
  float shiftedDepthContinuity
) {
  return clamp(insideScreen, 0.0, 1.0)
    * clamp(waterCoverage, 0.0, 1.0)
    * clamp(shoreSafety, 0.0, 1.0)
    * clamp(centeredGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedDepthContinuity, 0.0, 1.0);
}
#endif

#ifndef WATER_SURFACE_DEPTH_RESPONSE_INCLUDED
#define WATER_SURFACE_DEPTH_RESPONSE_INCLUDED

float waterSurfaceDepthSampleValidity(float rawDepth, float sceneEyeDepth, float surfaceEyeDepth) {
  return step(0.0, sceneEyeDepth)
    * step(sceneEyeDepth, 1000000.0)
    * step(surfaceEyeDepth + 0.000001, sceneEyeDepth)
    * (1.0 - step(0.999999, rawDepth));
}

vec3 waterSurfaceReconstructOpaquePositionWS(
  vec3 surfacePositionWS,
  vec3 cameraPositionWS,
  mat4 cameraViewInverse,
  float surfaceEyeDepth,
  float sceneEyeDepth,
  float orthographicProjection
) {
  float safeSurfaceEyeDepth = max(surfaceEyeDepth, 0.000001);
  vec3 perspectivePosition = cameraPositionWS
    + (surfacePositionWS - cameraPositionWS) * (sceneEyeDepth / safeSurfaceEyeDepth);
  vec3 cameraForwardWS = normalize((cameraViewInverse * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 orthographicPosition = surfacePositionWS
    + cameraForwardWS * max(sceneEyeDepth - surfaceEyeDepth, 0.0);
  return mix(perspectivePosition, orthographicPosition, clamp(orthographicProjection, 0.0, 1.0));
}

// Surface-normal depth uses the normalized physical macro normal; scrolling
// detail normals never affect the appearance depth field.
float waterSurfaceNormalDepth(
  vec3 surfacePositionWS,
  vec3 opaquePositionWS,
  vec3 macroNormalWS
) {
  return abs(dot(surfacePositionWS - opaquePositionWS, normalize(macroNormalWS)));
}

float waterSurfaceDerivedSceneRayDepth(
  float verticalDepth,
  vec3 macroNormalWS,
  vec3 viewDirectionWS
) {
  float projectionDenominator = abs(dot(normalize(viewDirectionWS), normalize(macroNormalWS)));
  return min(
    max(verticalDepth, 0.0) / max(projectionDenominator, 0.001),
    1000000.0
  );
}

// max(1-exp(-a), 1-exp(-b)) == 1-exp(-max(a,b)); one exp for one or two terms.
float waterSurfaceCompositeExponentialDensity(float firstScaledDepth, float secondScaledDepth) {
  return clamp(1.0 - exp(-max(max(firstScaledDepth, 0.0), max(secondScaledDepth, 0.0))), 0.0, 1.0);
}

#endif

#ifndef WATER_ANIMATED_VORONOI_F1_INCLUDED
#define WATER_ANIMATED_VORONOI_F1_INCLUDED

bool waterAnimatedVoronoiF1IsFinite(float value) {
  return value == value && abs(value) < 1.0e20;
}

vec2 waterAnimatedVoronoiF1Hash(vec2 cell) {
  vec2 projected = vec2(
    dot(cell, vec2(127.1, 311.7)),
    dot(cell, vec2(269.5, 183.3))
  );
  return fract(sin(projected) * 43758.5453);
}

float waterAnimatedVoronoiF1Candidate(
  vec2 cell,
  vec2 localPosition,
  vec2 cellOffset,
  float time
) {
  vec2 randomOffset = waterAnimatedVoronoiF1Hash(cell + cellOffset);
  vec2 animatedOffset = sin(time + randomOffset * 6.2831) * 0.5 + 0.5;
  vec2 delta = localPosition - cellOffset - animatedOffset;
  return 0.707 * sqrt(dot(delta, delta));
}

float waterAnimatedVoronoiF1(vec2 position, float time) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  float f1 = 8.0;
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 1.0), time));
  return clamp(f1, 0.0, 1.0);
}

float evaluateWaterAnimatedVoronoiF1(
  vec2 worldPositionXz,
  float surfaceTime,
  float worldScale,
  float timeRate,
  vec3 octaveWeights,
  float lacunarity
) {
    if (
      !waterAnimatedVoronoiF1IsFinite(worldPositionXz.x)
      || !waterAnimatedVoronoiF1IsFinite(worldPositionXz.y)
      || !waterAnimatedVoronoiF1IsFinite(surfaceTime)
      || !waterAnimatedVoronoiF1IsFinite(worldScale)
      || !waterAnimatedVoronoiF1IsFinite(timeRate)
      || !waterAnimatedVoronoiF1IsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterAnimatedVoronoiF1IsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.y) && octaveWeights.y >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.z) && octaveWeights.z >= 0.0)
    ) {
      return 0.0;
    }
  float animatedTime = surfaceTime * timeRate;
  if (!waterAnimatedVoronoiF1IsFinite(animatedTime)) return 0.0;
  float safeWorldScale = worldScale;
  float safeLacunarity = lacunarity;
    float weightSum = octaveWeights.x + octaveWeights.y + octaveWeights.z;
  if (!(weightSum > 0.0) || !waterAnimatedVoronoiF1IsFinite(weightSum)) return 0.0;
  float weightedPattern = 0.0;
  weightedPattern += waterAnimatedVoronoiF1(
    worldPositionXz * safeWorldScale * 1.0,
    animatedTime
  ) * octaveWeights.x;
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity,
      animatedTime
    ) * octaveWeights.y;
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity * safeLacunarity,
      animatedTime
    ) * octaveWeights.z;
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
}

#endif


#ifndef WATER_CONNECTION_FUNCTIONS
#define WATER_CONNECTION_FUNCTIONS
#ifdef MATERIAL_WATER_CONNECTIONS
float material_WaterConnectionCount;
vec4 material_WaterConnectionFrames[4];
vec4 material_WaterConnectionRanges[4];
vec4 material_WaterConnectionBounds[4];
vec4 material_WaterConnectionShoreFields[4];
sampler2D material_WaterConnectionShoreAtlas;
#endif

// motion, SSR contribution, reserved (-1), coverage.
vec4 waterConnectionFacts(vec2 p) {
  vec4 result = vec4(1.0, 1.0, -1.0, 1.0);
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 frame = material_WaterConnectionFrames[i];
    vec4 range = material_WaterConnectionRanges[i];
    vec2 delta = p - frame.xy;
    float along = dot(delta, frame.zw);
    float across = abs(dot(delta, vec2(frame.w, -frame.z)));
    vec4 bounds = material_WaterConnectionBounds[i];
    if (across <= range.x && p.x >= bounds.x && p.y >= bounds.y && p.x <= bounds.z && p.y <= bounds.w &&
      (along * range.z < 0.0 || (along == 0.0 && range.z < 0.0))) result.w = 0.0;
    if (abs(along) <= range.y && across <= range.x) {
      float weight = smoothstep(0.0, range.y, abs(along));
      result.x = min(result.x, weight);
      result.y = min(result.y, mix(1.0, weight, range.w));

    }
  }
#endif
  return result;
}
float waterConnectionShore(vec2 p, float original) {
  float result = original;
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 field = material_WaterConnectionShoreFields[i];
    vec2 grid = (p - field.xy) * field.z;
    float edge = min(min(grid.x, grid.y), min(64.0 - grid.x, 64.0 - grid.y));
    if (edge <= 0.0) continue;
    vec2 uv = vec2((grid.x + 0.5) / 65.0, (grid.y + 0.5 + float(i) * 65.0) / 260.0);
    vec2 encoded = texture2D(material_WaterConnectionShoreAtlas, uv).rg;
    float shore = (dot(encoded, vec2(256.0, 1.0)) / 257.0 * 2.0 - 1.0) * 64.0;
    result = mix(result, shore, smoothstep(0.0, 4.0, edge));
  }
#endif
  return result;
}
vec3 waterConnectionNormal(vec2 p, vec3 normal) {
  return normalize(mix(vec3(0.0, 1.0, 0.0), normal, waterConnectionFacts(p).x));
}
#endif
#ifndef RIVER_GEOMETRY_INCLUDED
#define RIVER_GEOMETRY_INCLUDED

vec2 safeNormalize2(vec2 value, vec2 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

vec3 safeNormalize3(vec3 value, vec3 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

float surfaceTime() {
  float selectedTime = material_SurfaceTimeOverride >= 0.0
    ? material_SurfaceTimeOverride
    : scene_ElapsedTime.x;
  return mod(max(selectedTime, 0.0), 4096.0);
}

// WebGL2 only: PCG RXS-M-XS with the same integer lattice/seed packing as the CPU.
uint riverHashCell(vec2 point) {
  uvec2 cell = uvec2(mod(floor(point), 4096.0));
  uint inputValue = (cell.x + cell.y * 4096u) ^ uint(material_SurfaceSeed);
  uint state = inputValue * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float riverHash21(vec2 point) {
  return float(riverHashCell(point) >> 8u) * (1.0 / 16777216.0);
}

float riverValueNoise(vec2 point) {
  point = mod(point, 4096.0);
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float bottom = mix(riverHash21(cell), riverHash21(cell + vec2(1.0, 0.0)), curve.x);
  float top = mix(
    riverHash21(cell + vec2(0.0, 1.0)),
    riverHash21(cell + vec2(1.0, 1.0)),
    curve.x
  );
  return mix(bottom, top, curve.y);
}

float riverFbm(vec2 point, vec4 offsets) {
  float value = riverValueNoise(point + vec2(0.0, offsets.x)) * 0.55000000;
  value += riverValueNoise(
    point * 2.03000000
      + vec2(17.70000000, 9.20000000 + offsets.y)
  ) * 0.28000000;
  value += riverValueNoise(
    point * 4.11000000
      + vec2(8.30000000, 21.60000000 + offsets.z)
  ) * 0.17000000;
  return value;
}

float riverShoreDamping(float signedAcrossDistance, float halfWidth) {
  float shoreDistance = halfWidth - abs(signedAcrossDistance);
  return smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
}

vec2 riverWarpedDomain(vec2 motionCoord, float warpOffset) {
  float lengthScale = max(material_SurfaceLengthScale, 0.001);
  vec2 baseDomain = vec2(
    motionCoord.x,
    motionCoord.y * 1.50000000
  ) / lengthScale;
  vec2 warp = vec2(
    riverValueNoise(
      baseDomain * 0.55000000
        + vec2(13.10000000, 7.70000000 + warpOffset)
    ),
    riverValueNoise(
      baseDomain * 0.55000000
        + vec2(3.80000000, 19.40000000 + warpOffset)
    )
  ) * 2.0 - 1.0;
  return baseDomain + warp * (0.58000000 * material_SurfaceTurbulence);
}

float riverMacroHeight(
  vec2 motionCoord,
  float halfWidth,
  float localFlowSpeed
) {
  float shoreDamping = riverShoreDamping(motionCoord.x, halfWidth);
  float flowing = localFlowSpeed > 0.00010000 ? 1.0 : 0.0;
  vec4 offsets = material_SurfaceDomainOffsets * flowing;
  vec2 warped = riverWarpedDomain(motionCoord, material_SurfaceWarpOffset * flowing);
  float broad = riverFbm(warped, offsets);
  float ridgeNoise = riverValueNoise(
    warped * 1.37000000
      + vec2(5.20000000, 11.60000000 + offsets.w)
  );
  float ridge = 1.0 - abs(ridgeNoise * 2.0 - 1.0);
  float shape = (broad - 0.5) * 0.72000000
    + (ridge - 0.5) * 0.28000000 * material_SurfaceTurbulence;
  return material_SurfaceMaxDisplacement * shoreDamping * shape;
}

struct RiverGeometryVertex {
  vec4 localPosition;
  vec4 worldPosition;
  vec3 worldTangent;
  vec2 worldFlow;
  float macroHeight;
  vec3 macroNormalWS;
  vec4 clipPosition;
};

RiverGeometryVertex evaluateRiverGeometry(Attributes attr) {
  RiverGeometryVertex geometry;
  float derivativeStep = 0.05000000;
  float sampledFlowSpeed = max(attr.TEXCOORD_1.x, 0.05000000);
  float flowTimeStep = derivativeStep / sampledFlowSpeed;
  float downstreamSpan = flowTimeStep * sampledFlowSpeed;
  float computedMacroHeight = 0.0;
  float acrossDerivative = 0.0;
  float downstreamDerivative = 0.0;
  if (material_SurfaceMaxDisplacement * material_MacroDisplacementEnabled > 0.0) {
  computedMacroHeight = riverMacroHeight(
    attr.TEXCOORD_2,
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  ) * material_MacroDisplacementEnabled;
  float acrossPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float acrossNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  acrossDerivative = (acrossPositive - acrossNegative) / (derivativeStep * 2.0)
    * material_MacroDisplacementEnabled;
  downstreamDerivative = (downstreamPositive - downstreamNegative) / (downstreamSpan * 2.0)
    * material_MacroDisplacementEnabled;
  }
  vec4 localPosition = attr.POSITION;
  float connectionMotion = waterConnectionFacts((renderer_ModelMat * attr.POSITION).xz).x;
  computedMacroHeight *= connectionMotion;
  acrossDerivative *= connectionMotion;
  downstreamDerivative *= connectionMotion;
  localPosition.y += computedMacroHeight;
  vec4 computedWorldPosition = renderer_ModelMat * localPosition;
  vec3 worldTangent = safeNormalize3(
    mat3(renderer_ModelMat) * attr.TANGENT.xyz,
    vec3(0.0, 0.0, 1.0)
  );
  vec2 computedWorldFlow = safeNormalize2(worldTangent.xz, vec2(0.0, 1.0));
  vec2 heightGradient = attr.TEXCOORD_4 * acrossDerivative + attr.TEXCOORD_5 * downstreamDerivative;
  vec3 displacedNormal = attr.NORMAL / max(attr.NORMAL.y, 0.000001)
    - vec3(heightGradient.x, 0.0, heightGradient.y);
  vec3 computedMacroNormalWS = normalize(mat3(renderer_NormalMat) * displacedNormal);
  vec4 computedClipPosition = renderer_MVPMat * localPosition;
  geometry.localPosition = localPosition;
  geometry.worldPosition = computedWorldPosition;
  geometry.worldTangent = worldTangent;
  geometry.worldFlow = computedWorldFlow;
  geometry.macroHeight = computedMacroHeight;
  geometry.macroNormalWS = computedMacroNormalWS;
  geometry.clipPosition = computedClipPosition;
  return geometry;
}

#endif

// RiverDemo (Stylized Water 2, Staggart Creations) adaptation.
// See assets/river/SOURCE.md. Travel-time coordinates preserve downstream transport
// through bends and changes in width/speed; the cross coordinate spans one river width.
float riverSlopeMask(vec3 normalWS) {
  float angle = acos(clamp(normalize(normalWS).y * 2.0 - 1.0, -1.0, 1.0)) * 57.2957795;
  return clamp((2.0 * 40.2 - 90.0 - angle) / (40.2 - 90.0), 0.0, 1.0);
}

vec2 riverSourceUv(vec2 motion, float halfWidth) {
  return vec2(0.5 + motion.x / max(halfWidth * 2.0, 0.001), motion.y * 0.25);
}

vec4 riverPackedUv(vec2 uv, vec2 tiling, vec2 offsets) {
  return vec4(uv * tiling, uv * tiling * 0.5) + vec4(0.0, offsets.x, 0.0, offsets.y);
}

vec3 riverUnpackNormal(vec2 packedNormal) {
  vec2 xy = packedNormal * 2.0 - 1.0;
  return vec3(xy, sqrt(max(1.0 - dot(xy, xy), 0.0)));
}

vec3 riverBlendNormals(vec3 a, vec3 b) {
  // Reoriented normal mapping, as used by the reference's advanced shading.
  a.z += 1.0;
  b.xy = -b.xy;
  return a * dot(a, b) / max(a.z, 0.001) - b;
}

vec3 evaluateRiverFlowNormalWS(vec2 motion, float halfWidth, float localSpeed, vec2 flow, vec3 geometryNormal) {
#ifdef MATERIAL_RIVER_FLOW_NORMAL
  float slope = riverSlopeMask(geometryNormal);
  float gate = step(0.0001, localSpeed);
  vec2 uv = riverSourceUv(motion, halfWidth);
  vec2 tiling = vec2(2.0, 1.0) * (1.2 / max(material_SurfaceLengthScale, 0.5));
  vec4 regularUv = riverPackedUv(uv, tiling, material_FlowNormalOffsets.xy * gate);
  vec3 regular = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.xy).rg),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.zw).rg));
  // Scale only the spatial primary y; the final time rate already includes this half.
  vec4 slopeUv = vec4(uv * tiling * vec2(1.0, 0.5), uv * tiling * 0.5);
  slopeUv.yw += material_FlowNormalOffsets.xx * gate;
  vec3 steep = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.xy).ba),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.zw).ba));
  vec3 detail = mix(regular, steep, slope);
  detail = normalize(mix(vec3(0.0, 0.0, 1.0), detail,
    material_FlowNormalStrength * material_MicroSurfaceEnabled));
  vec3 downstream = safeNormalize3(vec3(flow.x, 0.0, flow.y)
    - geometryNormal * dot(vec3(flow.x, 0.0, flow.y), geometryNormal), vec3(0.0, 0.0, 1.0));
  vec3 across = safeNormalize3(cross(downstream, geometryNormal), vec3(1.0, 0.0, 0.0));
  return safeNormalize3(geometryNormal * detail.z + across * detail.x + downstream * detail.y, geometryNormal);
#else
  return safeNormalize3(geometryNormal, geometryNormal);
#endif
}

      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }

#ifdef MATERIAL_WATER_SURFACE_SCATTERING
      #include "ShaderLibrary/Shadow/Shadow.glsl"
#endif
      Varyings vert(Attributes attr) {
        Varyings output;
        RiverGeometryVertex geometry = evaluateRiverGeometry(attr);
        gl_Position = geometry.clipPosition;
        output.worldXZ = geometry.worldPosition.xz;
        output.worldFlow = geometry.worldFlow;
        output.motionCoordinates = attr.TEXCOORD_2;
        output.riverHalfWidth = attr.TEXCOORD_3.x;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        output.macroHeight = geometry.macroHeight;
        output.surfaceEyeDepth = -(camera_ViewMat * geometry.worldPosition).z;
        output.authoredDepth = attr.TEXCOORD_3.y;
        output.worldPosition = geometry.worldPosition.xyz;
        output.macroNormalWS = geometry.macroNormalWS;
        output.objectPosition = geometry.localPosition.xyz;
        output.meshUv = attr.TEXCOORD_0;
        output.tangentWS = geometry.worldTangent;
        output.clipPosition = geometry.clipPosition;
        return output;
      }

      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        // Evaluate shore coverage from interpolated coordinates, independent of tessellation.
        float physicalShoreDistance = waterConnectionShore(input.worldPosition.xz, input.riverHalfWidth - abs(input.motionCoordinates.x));
        float shoreDamping = smoothstep(0.0, material_ShoreDampingWidth, physicalShoreDistance);
        float elapsedTime = surfaceTime();
        float clarity = saturate(material_Clarity);
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
        float sceneDepthBufferSample = texture2D(camera_DepthTexture, screenUv).r;
        float sceneEyeDepthSample = remapDepthBufferEyeDepth(sceneDepthBufferSample);
        float sceneDepthAvailable = waterSurfaceDepthSampleValidity(
          sceneDepthBufferSample,
          sceneEyeDepthSample,
          input.surfaceEyeDepth
        );
        vec3 fieldViewDirection = safeNormalize3(
          camera_Position - input.worldPosition,
          input.macroNormalWS
        );
        float orthographicProjection = 0.0;
        float sceneRayEyeScale = input.surfaceEyeDepth / max(
          length(camera_Position - input.worldPosition),
          0.001
        );
#ifdef CAMERA_ORTHOGRAPHIC
        orthographicProjection = 1.0;
        sceneRayEyeScale = 1.0;
        fieldViewDirection = safeNormalize3(
          (camera_ViewInvMat * vec4(0.0, 0.0, -1.0, 0.0)).xyz,
          input.macroNormalWS
        );
#endif
        float fallbackSceneRayDepth = waterSurfaceDerivedSceneRayDepth(
          max(input.authoredDepth, 0.0),
          input.macroNormalWS,
          fieldViewDirection
        );
        float sceneEyeDepth = mix(
          input.surfaceEyeDepth + fallbackSceneRayDepth * sceneRayEyeScale,
          sceneEyeDepthSample,
          sceneDepthAvailable
        );
        float sceneDepthDelta = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0);
        // Absorption uses the distance along the camera ray, not vertical bed depth.
        float sampledOpticalDepth = sceneDepthDelta / max(sceneRayEyeScale, 0.001);
        vec3 opaquePositionWS = waterSurfaceReconstructOpaquePositionWS(
          input.worldPosition,
          camera_Position,
          camera_ViewInvMat,
          input.surfaceEyeDepth,
          sceneEyeDepth,
          orthographicProjection
        );
        float exactSurfaceNormalDepth = waterSurfaceNormalDepth(
          input.worldPosition,
          opaquePositionWS,
          input.macroNormalWS
        );
        float waterSurfaceNormalDepthValue = mix(
          max(input.authoredDepth, 0.0),
          exactSurfaceNormalDepth,
          sceneDepthAvailable
        );

        float opticalDepth = clamp(sampledOpticalDepth, 0.0, max(material_MaximumSurfaceOpticalDistance, 0.0));
                // Chunk-local object XZ plus its stable compiled origin is the exact
        // inverse-planar result for the River body, independent of outer
        // translation, yaw, and floating-origin rebasing.
        vec2 bodyLocalXZ = input.objectPosition.xz + renderer_LocalMapBodyOrigin.xy;
        vec2 rawLocalMapUv = bodyLocalXZ * renderer_LocalMapBodyToUv.xy + renderer_LocalMapBodyToUv.zw;
        vec2 localMapUv = clamp(rawLocalMapUv, renderer_LocalMapUvRect.xy, renderer_LocalMapUvRect.zw);
        vec4 localMapSample = texture2D(material_LocalMapTexture, localMapUv);
        vec2 localFlowBody = localMapSample.rg * 2.0 - 1.0;
        vec3 localFlowWorld = mat3(renderer_ModelMat) * vec3(localFlowBody.x, 0.0, localFlowBody.y);
        vec2 localFlow = localFlowWorld.xz;
        float atlasRectMask = step(renderer_LocalMapUvRect.x, rawLocalMapUv.x)
          * step(renderer_LocalMapUvRect.y, rawLocalMapUv.y)
          * step(rawLocalMapUv.x, renderer_LocalMapUvRect.z)
          * step(rawLocalMapUv.y, renderer_LocalMapUvRect.w);
        float localSignedDistance = mix(1.0, localMapSample.a * 2.0 - 1.0, atlasRectMask);
        float confluenceInteriorWeight = smoothstep(
          0.0,
          0.12000000,
          max(localSignedDistance, 0.0)
        );
        float localEffectWeight = atlasRectMask * mix(1.0, confluenceInteriorWeight, renderer_LocalMapConfluence);
        float confluenceFlowWeight = mix(
          1.0,
          0.32000000,
          renderer_LocalMapConfluence
        );
        float confluenceFoamWeight = mix(
          1.0,
          0.38000000,
          renderer_LocalMapConfluence
        );
        float localFlowWeight = step(0.05, dot(localFlow, localFlow)) * localEffectWeight * confluenceFlowWeight;
        float localFoamSource = localMapSample.b * localEffectWeight * confluenceFoamWeight;
        float obstacleRegionWeight = (1.0 - renderer_LocalMapConfluence) * localEffectWeight;

// Shared by Forward and the SSR receiver, including detail layers and face orientation.
        vec2 baseFlow = safeNormalize2(input.worldFlow, vec2(0.0, 1.0));
        vec2 localFlowDirection = safeNormalize2(localFlow, baseFlow);
        vec2 flowDirection = safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight), baseFlow);
        float flowSpeed = max(input.localFlowSpeed * material_FlowSpeed, 0.0);
        vec3 surfaceNormalWS = evaluateRiverFlowNormalWS(input.motionCoordinates, input.riverHalfWidth,
          input.localFlowSpeed, flowDirection, normalize(input.macroNormalWS));
        vec3 baseWorldPosition = input.worldPosition;
        float material_MicroNormalsEnabled = material_MicroSurfaceEnabled;
#ifndef WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
        vec3 appearanceNormalTS = vec3(0.0, 0.0, 1.0);

        vec2 appearanceLayerCoordinate0 = vec2(input.motionCoordinates.y, -input.motionCoordinates.x);
        vec2 appearanceLayerScaled0 = appearanceLayerCoordinate0 * material_AppearanceV2Detail0Transform.xy;
        vec2 appearanceLayerUv0 = vec2(
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.x - appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.y,
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.y + appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.x
        ) + material_AppearanceV2Detail0Transform.zw;
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail0Texture, appearanceLayerUv0),
          material_AppearanceV2Detail0Strength,
          0.0
        );
        // Fade the transported normal, including FirstDetailLayer refraction,
        // rather than switching its time coordinate at a local speed boundary.
        appearanceLayerNormal0 = mix(vec3(0.0, 0.0, 1.0), appearanceLayerNormal0, smoothstep(0.0, 0.05000000, input.localFlowSpeed));
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal0);

        vec2 appearanceLayerCoordinate1 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled1 = appearanceLayerCoordinate1 * material_AppearanceV2Detail1Transform.xy;
        vec2 appearanceLayerUv1 = vec2(
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.x - appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.y,
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.y + appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.x
        ) + material_AppearanceV2Detail1Transform.zw;
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail1Texture, appearanceLayerUv1),
          material_AppearanceV2Detail1Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal1);

        appearanceNormalTS = normalize(mix(vec3(0.0, 0.0, 1.0), appearanceNormalTS, material_AppearanceV2DetailNormalStrength));
        vec3 appearanceTangentWS = safeNormalize3(
          input.tangentWS - input.macroNormalWS * dot(input.tangentWS, input.macroNormalWS),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 appearanceBitangentWS = safeNormalize3(
          cross(input.macroNormalWS, appearanceTangentWS),
          vec3(0.0, 0.0, 1.0)
        );
        vec3 appearanceSurfaceNormalWS = safeNormalize3(
          appearanceTangentWS * appearanceNormalTS.x
            + appearanceBitangentWS * appearanceNormalTS.y
            + input.macroNormalWS * appearanceNormalTS.z,
          input.macroNormalWS
        );
        surfaceNormalWS = safeNormalize3(
          mix(
            surfaceNormalWS,
            appearanceSurfaceNormalWS,
            material_AppearanceV2DetailEnabled * material_MicroNormalsEnabled
          ),
          input.macroNormalWS
        );
#endif

        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        // Geometry decides which side of the sheet is visible. Flipping individual
        // detail normals at grazing angles creates discontinuous dark islands.
        float geometryFacingSign = step(0.0, dot(input.macroNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= geometryFacingSign;

// Material roughness uses centered depth, independent of refraction and its final optical path.
        float effectiveSurfaceRoughness;
        {
#ifndef WATER_SURFACE_APPEARANCE_V2_ROUGHNESS_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_ROUGHNESS_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = 0.0;
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;


        float resolvedBoundaryRoughness = clamp(
          material_Roughness + appearanceBoundaryRoughness,
          0.045,
          1.0
        );
#endif

          effectiveSurfaceRoughness = resolvedBoundaryRoughness;
        }

        float slopeMask = riverSlopeMask(input.macroNormalWS);
        float crestMask = slopeMask;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
        float fresnelF0 = clamp(material_FresnelF0, 0.0, 1.0);
        vec3 sunlightDirectionVector = -scene_SunlightDirection;
        float sunlightDirectionLengthSquared = dot(sunlightDirectionVector, sunlightDirectionVector);
        float sunlightAvailable = step(0.000001, sunlightDirectionLengthSquared);
        vec3 lightDirection = sunlightDirectionVector / max(sqrt(sunlightDirectionLengthSquared), 0.000001);
        float directShadow = 1.0;
#if defined(MATERIAL_WATER_SURFACE_SCATTERING) && defined(NEED_CALCULATE_SHADOWS)
        directShadow = sampleShadowMap(input.worldPosition, getShadowCoord(input.worldPosition));
#endif
        vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * directShadow
          * sunlightAvailable
          * sampleVolumetricCloudShadow(input.worldPosition);
        vec3 halfDirection = safeNormalize3(viewDirection + lightDirection, lightDirection);
        float normalDotLight = saturate(dot(surfaceNormalWS, lightDirection));
        float normalDotHalf = saturate(dot(surfaceNormalWS, halfDirection));
        float lightDotHalf = saturate(dot(lightDirection, halfDirection));
        float distanceToBank = max(0.0, input.riverHalfWidth - abs(input.motionCoordinates.x));
        float shoreEnvelope = 1.0 - smoothstep(
          0.0,
          material_ShoreDampingWidth * 1.15000000,
          distanceToBank
        );
        // The reference uses separate regular/slope samples and an additive dissolve mask.
        // Foam texture pixels are linear, matching Unity's sRGB texture decoding.
        float transportGate = step(0.0001, input.localFlowSpeed);
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        // Grade is rise/run, not radians. Reserve whitewater for rapids and drops;
        // gentle reaches must not receive a full-width foam sheet.
        float foamSlopeMask = smoothstep(0.08, 0.45, length(input.macroNormalWS.xz) / max(abs(input.macroNormalWS.y), 0.05));
#else
        float foamSlopeMask = saturate(slopeMask * 3.0);
#endif
        float regularFoam = 0.0;
        float slopeFoam = 0.0;
#ifdef MATERIAL_RIVER_FOAM
        vec2 foamSourceUv = riverSourceUv(input.motionCoordinates, input.riverHalfWidth);
        foamSourceUv.x += dot(surfaceNormalWS, input.tangentWS) * 0.1;
        vec4 foamUv = riverPackedUv(foamSourceUv, vec2(0.5, 1.0), material_FlowFoamOffsets.xy * transportGate);
        regularFoam = texture2D(material_RiverFoamTexture, foamUv.xy).r
          + texture2D(material_RiverFoamTexture, foamUv.zw).r;
        vec4 slopeFoamUv = riverPackedUv(foamSourceUv, vec2(0.5, 0.5), material_FlowFoamOffsets.xz * transportGate);
        slopeFoam = texture2D(material_RiverFoamTexture, slopeFoamUv.xy).r
          + texture2D(material_RiverFoamTexture, slopeFoamUv.zw).r;
#endif
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        // Average the transported layers before thresholding. Saturating their sum
        // erased the texture gaps and produced broad opaque patches.
        regularFoam *= 0.5;
        slopeFoam *= 0.5;
#else
        regularFoam = saturate(regularFoam);
        slopeFoam = saturate(slopeFoam);
#endif
        float foamNoise = mix(regularFoam, slopeFoam, foamSlopeMask);
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        // The imported foam is linear, so its useful contrast is below 0.5.
        float foamBreakup = smoothstep(0.15, 0.4, foamNoise);
        float crestFoam = foamSlopeMask * foamBreakup * shoreDamping;
        float shoreFoam = shoreEnvelope * shoreEnvelope * foamBreakup * 0.42;
#else
        float foamBreakup = smoothstep(0.25, 0.8, foamNoise);
        float foamThreshold = 1.0 - foamSlopeMask;
        float crestFoam = smoothstep(foamThreshold, foamThreshold + 1.0, foamNoise) * shoreDamping;
        float shoreFoam = shoreEnvelope * foamBreakup * 0.42;
#endif
        float currentFoam = 0.0;
        float localConfluenceFoam = localFoamSource * (1.0 - obstacleRegionWeight) * foamBreakup * 0.6;
        float localWakeFoam = localFoamSource * obstacleRegionWeight * foamBreakup;
        float obstacleEdge = 1.0 - smoothstep(0.0, 0.5, abs(localSignedDistance));
        float obstacleEdgeFoam = obstacleEdge * obstacleRegionWeight * mix(0.25, 0.85, foamBreakup);
        // V2 keeps only a neutral debug value; final color is evaluated
        // from raw Render Contract inputs by the shared Closure.
        vec3 color = material_BaseColor.rgb;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        float slopeTolerance = max(abs(dFdx(input.surfaceEyeDepth)), abs(dFdy(input.surfaceEyeDepth)));
        RiverSceneSample centeredSample = riverSampleScene(screenUv, input.surfaceEyeDepth, slopeTolerance);
        vec3 centeredSceneColor = centeredSample.validity > 0.00001
          ? centeredSample.color : texture2D(camera_OpaqueTexture, screenUv).rgb;
#ifdef CAMERA_ORTHOGRAPHIC
        vec3 incidentVS = vec3(0.0, 0.0, -1.0);
        float refractionProjectionDepth = 1.0;
#else
        vec3 incidentVS = safeNormalize3(mat3(camera_ViewMat) * -viewDirection, vec3(0.0, 0.0, -1.0));
        float refractionProjectionDepth = max(centeredSample.eyeDepth, 0.001);
#endif
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec3 refractedRayVS = refract(incidentVS, surfaceNormalVS, 1.0 / max(material_IndexOfRefraction, 1.0));
        float refractionDepthWeight = smoothstep(0.0, 0.3, max(centeredSample.eyeDepth - input.surfaceEyeDepth, 0.0));
        vec2 slopeDelta = refractedRayVS.xy / max(-refractedRayVS.z, 0.05)
          - incidentVS.xy / max(-incidentVS.z, 0.05);
        vec2 offset = slopeDelta * vec2(camera_ProjMat[0][0], camera_ProjMat[1][1]) * 0.5
          * max(centeredSample.eyeDepth - input.surfaceEyeDepth, 0.0) / refractionProjectionDepth
          * max(material_RefractionStrength, 0.0) * refractionDepthWeight * shoreDamping
          * step(0.5, material_RefractionEnabled);
        vec2 sceneTexel = 1.0 / vec2(textureSize(camera_OpaqueTexture, 0));
        vec2 displacedScreenUv = screenUv + offset;
        vec2 edgeDistanceTexels = min(displacedScreenUv, vec2(1.0) - displacedScreenUv) / sceneTexel;
        float refractionScreenInterior = smoothstep(0.5, 2.5, min(edgeDistanceTexels.x, edgeDistanceTexels.y));
        vec2 refractedScreenUv = clamp(displacedScreenUv, sceneTexel * 0.5, vec2(1.0) - sceneTexel * 0.5);
        RiverSceneSample displacedSample = riverSampleScene(refractedScreenUv, input.surfaceEyeDepth, slopeTolerance);
        float refractionSampleValidity = smoothstep(0.0, 0.25, displacedSample.validity) * refractionScreenInterior;
        vec3 displacedSceneColor = displacedSample.color;
#else
        vec3 macroNormalVS = normalize(mat3(camera_ViewMat) * input.macroNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec2 refractionNormalDelta = appearanceLayerNormal0.xy;
        float refractionDepthWeight = smoothstep(
          0.04000000,
          1.15000000,
          opticalDepth
        );
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta
            * material_AppearanceV2RefractionUvScale
            * max(material_RefractionStrength, 0.0)

            ;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float refractionDepthTolerance = max(
          0.18000000,
          opticalDepth * 0.45000000
        );
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth);
        float refractionSampleValidity = refractionScreenInterior

          * refractedGeometryBehindSurface;
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedSceneColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
#endif
        // Boundary masks use centered fields: refraction suppression must not depend on
        // the optical path that it is about to select. Depth tint uses the selected path below.
        float centeredDepthBehind = smoothstep(0.03, 0.22, sampledOpticalDepth);
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = 0.0;
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
        float appearanceBoundaryField0 = sampledOpticalDepth;
        float appearanceBoundaryRawNormalized0 = appearanceBoundaryField0
          / max(material_AppearanceV2Boundary0Range, 0.0001);
        float appearanceBoundaryNormalized0 = clamp(
          appearanceBoundaryRawNormalized0,
          0.0,
          1.0
        );
        float appearanceBoundaryMask0 = appearanceBoundaryNormalized0;
        appearanceBoundaryMask0 = appearanceBoundaryMask0;


        appearanceBoundaryMask0 *= 1.0;
        appearanceCoastalAlpha = max(
          appearanceCoastalAlpha,
          appearanceBoundaryMask0 * material_AppearanceV2Boundary0Alpha
        );
#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_1_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_1_INCLUDED
        float appearanceBoundaryField1 = sampledOpticalDepth;
        float appearanceBoundaryRawNormalized1 = appearanceBoundaryField1
          / max(material_AppearanceV2Boundary1Range, 0.0001);
        float appearanceBoundaryNormalized1 = clamp(
          appearanceBoundaryRawNormalized1,
          0.0,
          1.0
        );
        float appearanceBoundaryMask1 = appearanceBoundaryNormalized1;
        appearanceBoundaryMask1 = 1.0 - appearanceBoundaryMask1;

        float appearanceBoundaryPattern1 = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, material_AppearanceV2Boundary1PatternTimeRate, material_AppearanceV2Boundary1PatternWorldScale, 1.0, material_AppearanceV2Boundary1PatternWeights, material_AppearanceV2Boundary1PatternLacunarity );

        float appearanceBoundaryPatternResponse1 = pow(max(abs(1.0 - appearanceBoundaryPattern1), 0.0001), material_AppearanceV2Boundary1PatternExponent);

        appearanceBoundaryMask1 = clamp(1.0 - appearanceBoundaryRawNormalized1 + appearanceBoundaryPatternResponse1, 0.0, 1.0) * material_AppearanceV2Boundary1PatternOpacity;

        appearanceBoundaryMask1 *= 1.0;
        contactFoamMask = max(
          contactFoamMask,
          appearanceBoundaryMask1
            * material_AppearanceV2BoundaryMaterialEnabled
        );
        float albedoWeight1 = clamp(appearanceBoundaryMask1 * material_AppearanceV2BoundaryMaterialEnabled, 0.0, 1.0);
        appearanceBoundaryAlbedo = mix(appearanceBoundaryAlbedo, material_AppearanceV2Boundary1Color, albedoWeight1);
        appearanceBoundaryAlbedoWeight = mix(appearanceBoundaryAlbedoWeight, 1.0, albedoWeight1);
#endif

#endif

        float refractionSampleWeight = refractionSampleValidity;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        // Apply boundary suppression once to the shared color/depth selection, not as opacity.
        refractionSampleWeight *= step(0.5, material_RefractionEnabled)
          * (1.0 - clamp(appearanceBoundaryRefractionSuppression, 0.0, 1.0));
        float selectedEyeDepth = mix(centeredSample.eyeDepth, displacedSample.eyeDepth, refractionSampleWeight);
        vec2 selectedUv = mix(screenUv, refractedScreenUv, refractionSampleWeight);
        vec3 refractedOpaquePositionWS = riverScenePositionWS(selectedUv, max(selectedEyeDepth, input.surfaceEyeDepth));
        float selectedDepthValid = step(0.00001, max(centeredSample.validity, refractionSampleWeight));
        float selectedOpticalDepth = length(refractedOpaquePositionWS - input.worldPosition);
        opticalDepth = clamp(mix(sampledOpticalDepth, selectedOpticalDepth, selectedDepthValid), 0.0, material_MaximumSurfaceOpticalDistance);
        refractedOpaquePositionWS = mix(opaquePositionWS, refractedOpaquePositionWS, selectedDepthValid);
#endif
        vec3 rawAnalyticReflectionSample = waterSurfaceResolveAnalyticReflectionFallbackV2(
          surfaceNormalWS.y,
          effectiveSurfaceRoughness,
          1.0
        );
        vec3 rawEnvironmentReflectionSample;
        float rawEnvironmentReflectionValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(
          reflect(-viewDirection, surfaceNormalWS),
          input.worldPosition,
          effectiveSurfaceRoughness,
          rawEnvironmentReflectionSample,
          rawEnvironmentReflectionValidity
        );
        vec3 rawSsrReflectionPremultipliedSample = vec3(0.0);
        float rawSsrReflectionValidity = 0.0;
        if (
          material_ReflectionSource > 2.5 &&
          effectiveSurfaceRoughness < camera_ScreenSpaceReflectionMaxRoughness
        ) {
          vec4 ssrReflection = texture2D(camera_ScreenSpaceReflectionTexture, screenUv);
          float ssrGlobalIntensity = saturate(camera_ScreenSpaceReflectionIntensity) * waterConnectionFacts(input.worldPosition.xz).y;
          rawSsrReflectionPremultipliedSample = ssrReflection.rgb * ssrGlobalIntensity;
          rawSsrReflectionValidity = saturate(
            ssrReflection.a * ssrGlobalIntensity
          );
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
        if (material_SurfaceDebugMode > 0.5) {
          if (material_SurfaceDebugMode > 11.5) {
            if (material_SurfaceDebugMode < 12.5) color = vec3(max(input.authoredDepth, 0.0) / 4.0);
            else if (material_SurfaceDebugMode < 13.5) color = vec3(opticalDepth / 4.0);
            else if (material_SurfaceDebugMode < 16.5) color = vec3(refractionSampleWeight);
            else if (material_SurfaceDebugMode < 17.5) color = vec3(rawSsrReflectionValidity);
            else if (material_SurfaceDebugMode < 18.5) color = vec3(shoreFoam, crestFoam, max(localWakeFoam, obstacleEdgeFoam));
            else if (material_SurfaceDebugMode < 19.5) color = surfaceNormalWS * 0.5 + 0.5;
            else if (material_SurfaceDebugMode < 20.5) color = vec3(directShadow);
            else if (material_SurfaceDebugMode < 21.5) color = vec3(normalDotView);
            else if (material_SurfaceDebugMode < 22.5) color = centeredSceneColor;
            else if (material_SurfaceDebugMode < 23.5) color = mix(centeredSceneColor, displacedSceneColor, refractionSampleWeight);
            else color = rawSsrReflectionPremultipliedSample;
          } else if (material_SurfaceDebugMode < 1.5) {
            color = vec3(
              fract(input.motionCoordinates.x * 0.1),
              fract(input.motionCoordinates.y * 0.1 + material_FlowNormalOffsets.z),
              0.2
            );
          } else if (material_SurfaceDebugMode < 2.5) {
            color = vec3(saturate(input.macroHeight / max(material_SurfaceMaxDisplacement, 0.001) * 0.5 + 0.5));
          } else if (material_SurfaceDebugMode < 3.5) {
            color = vec3(crestMask);
          } else if (material_SurfaceDebugMode < 4.5) {
            color = vec3((surfaceNormalWS.xz - input.macroNormalWS.xz) * 0.5 + 0.5, 1.0);
          } else if (material_SurfaceDebugMode < 5.5) {
            color = vec3(shoreDamping);
          } else if (material_SurfaceDebugMode < 6.5) {
            color = vec3(localFlow * 0.5 + 0.5, 0.5);
          } else if (material_SurfaceDebugMode < 7.5) {
            color = vec3(localFoamSource);
          } else if (material_SurfaceDebugMode < 8.5) {
            color = vec3(localSignedDistance * 0.5 + 0.5);
          } else if (material_SurfaceDebugMode < 9.5) {
            color = vec3(atlasRectMask, 1.0 - atlasRectMask, 0.0);
          } else if (material_SurfaceDebugMode < 10.5) {
            color = vec3(baseFlow * 0.5 + 0.5, 0.5);
          } else {
            color = vec3(flowDirection * 0.5 + 0.5, 0.5);
          }
        }
#ifndef WATER_SURFACE_GEOMETRY_BRIDGE_INCLUDED
#define WATER_SURFACE_GEOMETRY_BRIDGE_INCLUDED

vec3 waterSurface_positionWS = input.worldPosition;
vec3 waterSurface_macroNormalWS = input.macroNormalWS;
vec3 waterSurface_tangentWS = input.tangentWS;
vec3 waterSurface_bitangentWS = safeNormalize3(cross(input.macroNormalWS, input.tangentWS), vec3(0.0, 0.0, 1.0));
vec2 waterSurface_meshUv = input.meshUv;
vec2 waterSurface_flowWS = flowDirection;
float waterSurface_coverage = shoreDamping;
float waterSurface_verticalDepth = input.authoredDepth;
float waterSurface_horizontalShoreDistance = localSignedDistance;
float waterSurface_obstacleContact = max(localFoamSource, max(-localSignedDistance, 0.0));
float waterSurface_waveCrest = crestMask;

#endif

        {
        vec3 waterColor = color;
        WaterSurfaceResolvedLightingV2 resolvedLighting = waterSurfaceCreateResolvedLightingV2(waterSurfaceAmbientDiffuseRadiance(input.macroNormalWS));
        resolvedLighting = waterSurfaceAccumulateDirectLightingV2(
          resolvedLighting,
          sunlightColor,
          normalDotView,
          normalDotLight,
          normalDotHalf,
          lightDotHalf,
          fresnelF0,
          effectiveSurfaceRoughness,
          4.0,
          material_AppearanceDirectSpecularEnabled
        );
        vec3 waterDiffuseLighting = max(resolvedLighting.diffuseRadiance, vec3(0.0));
        float coverage = shoreDamping;
        float material_Alpha = 1.0;
        float material_OpticsCalibrationMode = 0.0;
        float depthRatio = saturate(
          opticalDepth / max(material_MaximumSurfaceOpticalDistance, 0.0001)
        );
#ifndef WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_0_INCLUDED
        float appearanceDepthTintFactor = min(max(sampledOpticalDepth, 0.0) * material_AppearanceV2DepthCoefficient1, material_AppearanceV2DepthMaximumOpacity);
        vec3 appearanceDepthTintColor = mix(material_AppearanceV2DepthShallowColor.rgb, material_AppearanceV2DepthDeepColor.rgb, clamp(max(sampledOpticalDepth, 0.0) * material_AppearanceV2DepthCoefficient0, 0.0, 1.0));
        appearanceDepthTintColor = appearanceDepthTintColor * (1.0 - appearanceBoundaryAlbedoWeight) + appearanceBoundaryAlbedo;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + appearanceBoundaryAlbedoWeight, 0.0, 1.0);
        vec3 causticsView = normalize(camera_Position - input.worldPosition);
        vec2 causticsUv = input.worldPosition.xz * material_AppearanceV2CausticsTransform.xy
          + material_AppearanceV2CausticsTransform.zw
          + material_AppearanceV2CausticsParallax.x * causticsView.xz / (abs(causticsView.y) + material_AppearanceV2CausticsParallax.y)
          + appearanceLayerNormal0.x * material_AppearanceV2CausticsResponse.y;
        vec3 causticsColor = clamp(texture2D(material_AppearanceV2CausticsTexture, causticsUv).rgb * material_AppearanceV2CausticsResponse.x, 0.0, 1.0)
          * (1.0 - clamp(max(sampledOpticalDepth, 0.0) * material_AppearanceV2CausticsResponse.z, 0.0, 1.0));
        appearanceDepthTintColor += causticsColor;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + length(causticsColor) * material_AppearanceV2CausticsResponse.w, 0.0, 1.0);
        appearanceDepthTintFactor *= appearanceCoastalAlpha;
#endif

        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredSceneColor;
        rawRefractionFacts.displacedSceneSample = displacedSceneColor;
        rawRefractionFacts.displacedSampleValidity = refractionSampleWeight;
        rawRefractionFacts.depthWeight = refractionDepthWeight;
        rawRefractionFacts.shoreValidity = shoreDamping;
        rawRefractionFacts.coverage = shoreDamping;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = rawAnalyticReflectionSample;
        rawReflectionFacts.environmentSample = rawEnvironmentReflectionSample;
        rawReflectionFacts.environmentValidity = rawEnvironmentReflectionValidity;
        rawReflectionFacts.ssrPremultipliedSample = rawSsrReflectionPremultipliedSample;
        rawReflectionFacts.ssrValidity = rawSsrReflectionValidity;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = 0.0;
        rawFoamFacts.shoreSignal = shoreFoam;
        rawFoamFacts.crestSignal = crestFoam;
        rawFoamFacts.currentSignal = currentFoam;
        rawFoamFacts.wakeSignal = max(max(localConfluenceFoam, localWakeFoam), obstacleEdgeFoam);
        rawFoamFacts.contactSignal = contactFoamMask;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 1.0;
        rawFoamFacts.enabled = 1.0;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 4.0;
        rawContributionPolicy.refractionEnabled = step(0.5, material_RefractionEnabled) * 1.0;
        rawContributionPolicy.clarity = clarity;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = material_ReflectionSource;
        rawContributionPolicy.ssrCompositeIntensity = material_WaterScreenSpaceReflectionCompositeIntensity;
        rawContributionPolicy.foamIntensity = material_FoamIntensity;
        rawContributionPolicy.calibrationMode = 0.0;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(
          rawRefractionFacts,
          rawReflectionFacts,
          rawFoamFacts,
          rawContributionPolicy
        );
        WaterSurfaceFinalClosureV2Input closureInput;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        closureInput.surfaceScatteringCoefficient = material_SurfaceScatteringCoefficient;
        closureInput.surfaceScatteringPhaseG = material_SurfaceScatteringPhaseG;
        closureInput.sceneToSurfaceDistance = max(input.worldPosition.y - refractedOpaquePositionWS.y, 0.0);
        vec3 volumeRayDirection = safeNormalize3(refract(-viewDirection, surfaceNormalWS, 1.0 / max(material_IndexOfRefraction, 1.0)), -viewDirection);
        closureInput.phaseCosine = dot(lightDirection, volumeRayDirection);
        closureInput.sunRadiance = sunlightColor;
        closureInput.ambientRadiance = waterSurfaceAmbientDiffuseRadiance(input.macroNormalWS);
        closureInput.opticalDebugMode = material_SurfaceDebugMode;
#endif
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = material_BaseColor.rgb;
        closureInput.depthColor = appearanceDepthTintColor;
        closureInput.depthFactor = appearanceDepthTintFactor
          * material_AppearanceV2DepthResponseEnabled;
        closureInput.diffuseLighting = waterDiffuseLighting;
        closureInput.primaryColorClosureModel = 4.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = opticalDepth;
        closureInput.refractionColor = resolvedContributions.refractionSceneColor;
        closureInput.refractionWeight = resolvedContributions.refractionWeight;
        closureInput.reflectionRadiance = resolvedContributions.reflectionRadiance;
        closureInput.fresnelF0 = fresnelF0;
        closureInput.perceptualRoughness = effectiveSurfaceRoughness;
        closureInput.normalDotView = normalDotView;
        closureInput.transmissionFresnelWeight = 0.0;
        closureInput.reflectionIntensity = reflectionIntensity;
        closureInput.directSpecularRadiance = resolvedLighting.directSpecularRadiance;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = material_FoamColor.rgb;
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = material_Alpha;
        closureInput.clarity = clarity;
        closureInput.calibrationMode = material_OpticsCalibrationMode;
        #ifndef WATER_SURFACE_APPEARANCE_V2_COMPOSITION_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_COMPOSITION_0_INCLUDED
closureInput.coastalAlpha = appearanceCoastalAlpha;
        closureInput.coastalAlphaWeight = material_AppearanceV2BoundaryAlphaEnabled;
#endif

        closureInput.coverage = shoreDamping;
        closureInput.compositionSceneColor = centeredSceneColor;
        closureInput.precomposedReplace = 1.0;
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        vec4 resolvedWaterClosure = waterSurfaceEvaluateFinalClosureV2(closureInput);
        if (material_SurfaceDebugMode > 0.5 && (material_SurfaceDebugMode < 13.5 || material_SurfaceDebugMode > 15.5)) {
          resolvedWaterClosure = vec4(color, 1.0);
        }
        gl_FragColor = waterSurfaceOutputWithPick(resolvedWaterClosure);
        }

      }

    }

    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV2"
      }
      DepthState ssrSurfaceDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState ssrSurfaceRasterState { CullMode = CullMode.Off; }
      DepthState = ssrSurfaceDepthState;
      RasterState = ssrSurfaceRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
      sampler2D material_SurfaceNormalTexture;
      sampler2D material_LocalMapTexture;
      vec4 renderer_LocalMapBodyToUv;
      vec4 renderer_LocalMapBodyOrigin;
      vec4 renderer_LocalMapUvRect;
      float renderer_LocalMapConfluence;
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

#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
      sampler2D material_AppearanceV2CausticsTexture;
      vec4 material_AppearanceV2CausticsTransform;
      vec4 material_AppearanceV2CausticsResponse;
      vec2 material_AppearanceV2CausticsParallax;
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;

      sampler2D material_AppearanceV2Detail0Texture;
      vec4 material_AppearanceV2Detail0Transform;
      vec2 material_AppearanceV2Detail0Rotation;
      float material_AppearanceV2Detail0Strength;
      sampler2D material_AppearanceV2Detail1Texture;
      vec4 material_AppearanceV2Detail1Transform;
      vec2 material_AppearanceV2Detail1Rotation;
      float material_AppearanceV2Detail1Strength;

      float material_AppearanceV2DepthMaximumOpacity;
      float material_AppearanceV2DepthCoefficient0;
      float material_AppearanceV2DepthCoefficient1;
      vec4 material_AppearanceV2DepthShallowColor;
      vec4 material_AppearanceV2DepthDeepColor;
      float material_AppearanceV2DepthDebugView;

      float material_AppearanceV2Boundary0Range;
      float material_AppearanceV2Boundary0Alpha;

      float material_AppearanceV2Boundary1Range;
      vec3 material_AppearanceV2Boundary1Color;
      float material_AppearanceV2Boundary1PatternWorldScale;
      float material_AppearanceV2Boundary1PatternTimeRate;
      float material_AppearanceV2Boundary1PatternOpacity;
      vec3 material_AppearanceV2Boundary1PatternWeights;
      float material_AppearanceV2Boundary1PatternLacunarity;
      float material_AppearanceV2Boundary1PatternExponent;



      float material_AppearanceDirectSpecularEnabled;
#endif


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

#ifndef WATER_CONNECTION_FUNCTIONS
#define WATER_CONNECTION_FUNCTIONS
#ifdef MATERIAL_WATER_CONNECTIONS
float material_WaterConnectionCount;
vec4 material_WaterConnectionFrames[4];
vec4 material_WaterConnectionRanges[4];
vec4 material_WaterConnectionBounds[4];
vec4 material_WaterConnectionShoreFields[4];
sampler2D material_WaterConnectionShoreAtlas;
#endif

// motion, SSR contribution, reserved (-1), coverage.
vec4 waterConnectionFacts(vec2 p) {
  vec4 result = vec4(1.0, 1.0, -1.0, 1.0);
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 frame = material_WaterConnectionFrames[i];
    vec4 range = material_WaterConnectionRanges[i];
    vec2 delta = p - frame.xy;
    float along = dot(delta, frame.zw);
    float across = abs(dot(delta, vec2(frame.w, -frame.z)));
    vec4 bounds = material_WaterConnectionBounds[i];
    if (across <= range.x && p.x >= bounds.x && p.y >= bounds.y && p.x <= bounds.z && p.y <= bounds.w &&
      (along * range.z < 0.0 || (along == 0.0 && range.z < 0.0))) result.w = 0.0;
    if (abs(along) <= range.y && across <= range.x) {
      float weight = smoothstep(0.0, range.y, abs(along));
      result.x = min(result.x, weight);
      result.y = min(result.y, mix(1.0, weight, range.w));

    }
  }
#endif
  return result;
}
float waterConnectionShore(vec2 p, float original) {
  float result = original;
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 field = material_WaterConnectionShoreFields[i];
    vec2 grid = (p - field.xy) * field.z;
    float edge = min(min(grid.x, grid.y), min(64.0 - grid.x, 64.0 - grid.y));
    if (edge <= 0.0) continue;
    vec2 uv = vec2((grid.x + 0.5) / 65.0, (grid.y + 0.5 + float(i) * 65.0) / 260.0);
    vec2 encoded = texture2D(material_WaterConnectionShoreAtlas, uv).rg;
    float shore = (dot(encoded, vec2(256.0, 1.0)) / 257.0 * 2.0 - 1.0) * 64.0;
    result = mix(result, shore, smoothstep(0.0, 4.0, edge));
  }
#endif
  return result;
}
vec3 waterConnectionNormal(vec2 p, vec3 normal) {
  return normalize(mix(vec3(0.0, 1.0, 0.0), normal, waterConnectionFacts(p).x));
}
#endif
#ifndef RIVER_GEOMETRY_INCLUDED
#define RIVER_GEOMETRY_INCLUDED

vec2 safeNormalize2(vec2 value, vec2 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

vec3 safeNormalize3(vec3 value, vec3 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

float surfaceTime() {
  float selectedTime = material_SurfaceTimeOverride >= 0.0
    ? material_SurfaceTimeOverride
    : scene_ElapsedTime.x;
  return mod(max(selectedTime, 0.0), 4096.0);
}

// WebGL2 only: PCG RXS-M-XS with the same integer lattice/seed packing as the CPU.
uint riverHashCell(vec2 point) {
  uvec2 cell = uvec2(mod(floor(point), 4096.0));
  uint inputValue = (cell.x + cell.y * 4096u) ^ uint(material_SurfaceSeed);
  uint state = inputValue * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float riverHash21(vec2 point) {
  return float(riverHashCell(point) >> 8u) * (1.0 / 16777216.0);
}

float riverValueNoise(vec2 point) {
  point = mod(point, 4096.0);
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float bottom = mix(riverHash21(cell), riverHash21(cell + vec2(1.0, 0.0)), curve.x);
  float top = mix(
    riverHash21(cell + vec2(0.0, 1.0)),
    riverHash21(cell + vec2(1.0, 1.0)),
    curve.x
  );
  return mix(bottom, top, curve.y);
}

float riverFbm(vec2 point, vec4 offsets) {
  float value = riverValueNoise(point + vec2(0.0, offsets.x)) * 0.55000000;
  value += riverValueNoise(
    point * 2.03000000
      + vec2(17.70000000, 9.20000000 + offsets.y)
  ) * 0.28000000;
  value += riverValueNoise(
    point * 4.11000000
      + vec2(8.30000000, 21.60000000 + offsets.z)
  ) * 0.17000000;
  return value;
}

float riverShoreDamping(float signedAcrossDistance, float halfWidth) {
  float shoreDistance = halfWidth - abs(signedAcrossDistance);
  return smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
}

vec2 riverWarpedDomain(vec2 motionCoord, float warpOffset) {
  float lengthScale = max(material_SurfaceLengthScale, 0.001);
  vec2 baseDomain = vec2(
    motionCoord.x,
    motionCoord.y * 1.50000000
  ) / lengthScale;
  vec2 warp = vec2(
    riverValueNoise(
      baseDomain * 0.55000000
        + vec2(13.10000000, 7.70000000 + warpOffset)
    ),
    riverValueNoise(
      baseDomain * 0.55000000
        + vec2(3.80000000, 19.40000000 + warpOffset)
    )
  ) * 2.0 - 1.0;
  return baseDomain + warp * (0.58000000 * material_SurfaceTurbulence);
}

float riverMacroHeight(
  vec2 motionCoord,
  float halfWidth,
  float localFlowSpeed
) {
  float shoreDamping = riverShoreDamping(motionCoord.x, halfWidth);
  float flowing = localFlowSpeed > 0.00010000 ? 1.0 : 0.0;
  vec4 offsets = material_SurfaceDomainOffsets * flowing;
  vec2 warped = riverWarpedDomain(motionCoord, material_SurfaceWarpOffset * flowing);
  float broad = riverFbm(warped, offsets);
  float ridgeNoise = riverValueNoise(
    warped * 1.37000000
      + vec2(5.20000000, 11.60000000 + offsets.w)
  );
  float ridge = 1.0 - abs(ridgeNoise * 2.0 - 1.0);
  float shape = (broad - 0.5) * 0.72000000
    + (ridge - 0.5) * 0.28000000 * material_SurfaceTurbulence;
  return material_SurfaceMaxDisplacement * shoreDamping * shape;
}

struct RiverGeometryVertex {
  vec4 localPosition;
  vec4 worldPosition;
  vec3 worldTangent;
  vec2 worldFlow;
  float macroHeight;
  vec3 macroNormalWS;
  vec4 clipPosition;
};

RiverGeometryVertex evaluateRiverGeometry(Attributes attr) {
  RiverGeometryVertex geometry;
  float derivativeStep = 0.05000000;
  float sampledFlowSpeed = max(attr.TEXCOORD_1.x, 0.05000000);
  float flowTimeStep = derivativeStep / sampledFlowSpeed;
  float downstreamSpan = flowTimeStep * sampledFlowSpeed;
  float computedMacroHeight = 0.0;
  float acrossDerivative = 0.0;
  float downstreamDerivative = 0.0;
  if (material_SurfaceMaxDisplacement * material_MacroDisplacementEnabled > 0.0) {
  computedMacroHeight = riverMacroHeight(
    attr.TEXCOORD_2,
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  ) * material_MacroDisplacementEnabled;
  float acrossPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float acrossNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  acrossDerivative = (acrossPositive - acrossNegative) / (derivativeStep * 2.0)
    * material_MacroDisplacementEnabled;
  downstreamDerivative = (downstreamPositive - downstreamNegative) / (downstreamSpan * 2.0)
    * material_MacroDisplacementEnabled;
  }
  vec4 localPosition = attr.POSITION;
  float connectionMotion = waterConnectionFacts((renderer_ModelMat * attr.POSITION).xz).x;
  computedMacroHeight *= connectionMotion;
  acrossDerivative *= connectionMotion;
  downstreamDerivative *= connectionMotion;
  localPosition.y += computedMacroHeight;
  vec4 computedWorldPosition = renderer_ModelMat * localPosition;
  vec3 worldTangent = safeNormalize3(
    mat3(renderer_ModelMat) * attr.TANGENT.xyz,
    vec3(0.0, 0.0, 1.0)
  );
  vec2 computedWorldFlow = safeNormalize2(worldTangent.xz, vec2(0.0, 1.0));
  vec2 heightGradient = attr.TEXCOORD_4 * acrossDerivative + attr.TEXCOORD_5 * downstreamDerivative;
  vec3 displacedNormal = attr.NORMAL / max(attr.NORMAL.y, 0.000001)
    - vec3(heightGradient.x, 0.0, heightGradient.y);
  vec3 computedMacroNormalWS = normalize(mat3(renderer_NormalMat) * displacedNormal);
  vec4 computedClipPosition = renderer_MVPMat * localPosition;
  geometry.localPosition = localPosition;
  geometry.worldPosition = computedWorldPosition;
  geometry.worldTangent = worldTangent;
  geometry.worldFlow = computedWorldFlow;
  geometry.macroHeight = computedMacroHeight;
  geometry.macroNormalWS = computedMacroNormalWS;
  geometry.clipPosition = computedClipPosition;
  return geometry;
}

#endif

// RiverDemo (Stylized Water 2, Staggart Creations) adaptation.
// See assets/river/SOURCE.md. Travel-time coordinates preserve downstream transport
// through bends and changes in width/speed; the cross coordinate spans one river width.
float riverSlopeMask(vec3 normalWS) {
  float angle = acos(clamp(normalize(normalWS).y * 2.0 - 1.0, -1.0, 1.0)) * 57.2957795;
  return clamp((2.0 * 40.2 - 90.0 - angle) / (40.2 - 90.0), 0.0, 1.0);
}

vec2 riverSourceUv(vec2 motion, float halfWidth) {
  return vec2(0.5 + motion.x / max(halfWidth * 2.0, 0.001), motion.y * 0.25);
}

vec4 riverPackedUv(vec2 uv, vec2 tiling, vec2 offsets) {
  return vec4(uv * tiling, uv * tiling * 0.5) + vec4(0.0, offsets.x, 0.0, offsets.y);
}

vec3 riverUnpackNormal(vec2 packedNormal) {
  vec2 xy = packedNormal * 2.0 - 1.0;
  return vec3(xy, sqrt(max(1.0 - dot(xy, xy), 0.0)));
}

vec3 riverBlendNormals(vec3 a, vec3 b) {
  // Reoriented normal mapping, as used by the reference's advanced shading.
  a.z += 1.0;
  b.xy = -b.xy;
  return a * dot(a, b) / max(a.z, 0.001) - b;
}

vec3 evaluateRiverFlowNormalWS(vec2 motion, float halfWidth, float localSpeed, vec2 flow, vec3 geometryNormal) {
#ifdef MATERIAL_RIVER_FLOW_NORMAL
  float slope = riverSlopeMask(geometryNormal);
  float gate = step(0.0001, localSpeed);
  vec2 uv = riverSourceUv(motion, halfWidth);
  vec2 tiling = vec2(2.0, 1.0) * (1.2 / max(material_SurfaceLengthScale, 0.5));
  vec4 regularUv = riverPackedUv(uv, tiling, material_FlowNormalOffsets.xy * gate);
  vec3 regular = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.xy).rg),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.zw).rg));
  // Scale only the spatial primary y; the final time rate already includes this half.
  vec4 slopeUv = vec4(uv * tiling * vec2(1.0, 0.5), uv * tiling * 0.5);
  slopeUv.yw += material_FlowNormalOffsets.xx * gate;
  vec3 steep = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.xy).ba),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.zw).ba));
  vec3 detail = mix(regular, steep, slope);
  detail = normalize(mix(vec3(0.0, 0.0, 1.0), detail,
    material_FlowNormalStrength * material_MicroSurfaceEnabled));
  vec3 downstream = safeNormalize3(vec3(flow.x, 0.0, flow.y)
    - geometryNormal * dot(vec3(flow.x, 0.0, flow.y), geometryNormal), vec3(0.0, 0.0, 1.0));
  vec3 across = safeNormalize3(cross(downstream, geometryNormal), vec3(1.0, 0.0, 0.0));
  return safeNormalize3(geometryNormal * detail.z + across * detail.x + downstream * detail.y, geometryNormal);
#else
  return safeNormalize3(geometryNormal, geometryNormal);
#endif
}

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif





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
        // Chunk-local object XZ plus its stable compiled origin is the exact
        // inverse-planar result for the River body, independent of outer
        // translation, yaw, and floating-origin rebasing.
        vec2 bodyLocalXZ = input.objectPosition.xz + renderer_LocalMapBodyOrigin.xy;
        vec2 rawLocalMapUv = bodyLocalXZ * renderer_LocalMapBodyToUv.xy + renderer_LocalMapBodyToUv.zw;
        vec2 localMapUv = clamp(rawLocalMapUv, renderer_LocalMapUvRect.xy, renderer_LocalMapUvRect.zw);
        vec4 localMapSample = texture2D(material_LocalMapTexture, localMapUv);
        vec2 localFlowBody = localMapSample.rg * 2.0 - 1.0;
        vec3 localFlowWorld = mat3(renderer_ModelMat) * vec3(localFlowBody.x, 0.0, localFlowBody.y);
        vec2 localFlow = localFlowWorld.xz;
        float atlasRectMask = step(renderer_LocalMapUvRect.x, rawLocalMapUv.x)
          * step(renderer_LocalMapUvRect.y, rawLocalMapUv.y)
          * step(rawLocalMapUv.x, renderer_LocalMapUvRect.z)
          * step(rawLocalMapUv.y, renderer_LocalMapUvRect.w);
        float localSignedDistance = mix(1.0, localMapSample.a * 2.0 - 1.0, atlasRectMask);
        float confluenceInteriorWeight = smoothstep(
          0.0,
          0.12000000,
          max(localSignedDistance, 0.0)
        );
        float localEffectWeight = atlasRectMask * mix(1.0, confluenceInteriorWeight, renderer_LocalMapConfluence);
        float confluenceFlowWeight = mix(
          1.0,
          0.32000000,
          renderer_LocalMapConfluence
        );
        float confluenceFoamWeight = mix(
          1.0,
          0.38000000,
          renderer_LocalMapConfluence
        );
        float localFlowWeight = step(0.05, dot(localFlow, localFlow)) * localEffectWeight * confluenceFlowWeight;
        float localFoamSource = localMapSample.b * localEffectWeight * confluenceFoamWeight;
        float obstacleRegionWeight = (1.0 - renderer_LocalMapConfluence) * localEffectWeight;

// Shared by Forward and the SSR receiver, including detail layers and face orientation.
        vec2 baseFlow = safeNormalize2(input.worldFlow, vec2(0.0, 1.0));
        vec2 localFlowDirection = safeNormalize2(localFlow, baseFlow);
        vec2 flowDirection = safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight), baseFlow);
        float flowSpeed = max(input.localFlowSpeed * material_FlowSpeed, 0.0);
        vec3 surfaceNormalWS = evaluateRiverFlowNormalWS(input.motionCoordinates, input.riverHalfWidth,
          input.localFlowSpeed, flowDirection, normalize(input.macroNormalWS));
        vec3 baseWorldPosition = input.worldPosition;
        float material_MicroNormalsEnabled = material_MicroSurfaceEnabled;
#ifndef WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
        vec3 appearanceNormalTS = vec3(0.0, 0.0, 1.0);

        vec2 appearanceLayerCoordinate0 = vec2(input.motionCoordinates.y, -input.motionCoordinates.x);
        vec2 appearanceLayerScaled0 = appearanceLayerCoordinate0 * material_AppearanceV2Detail0Transform.xy;
        vec2 appearanceLayerUv0 = vec2(
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.x - appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.y,
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.y + appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.x
        ) + material_AppearanceV2Detail0Transform.zw;
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail0Texture, appearanceLayerUv0),
          material_AppearanceV2Detail0Strength,
          0.0
        );
        // Fade the transported normal, including FirstDetailLayer refraction,
        // rather than switching its time coordinate at a local speed boundary.
        appearanceLayerNormal0 = mix(vec3(0.0, 0.0, 1.0), appearanceLayerNormal0, smoothstep(0.0, 0.05000000, input.localFlowSpeed));
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal0);

        vec2 appearanceLayerCoordinate1 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled1 = appearanceLayerCoordinate1 * material_AppearanceV2Detail1Transform.xy;
        vec2 appearanceLayerUv1 = vec2(
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.x - appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.y,
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.y + appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.x
        ) + material_AppearanceV2Detail1Transform.zw;
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail1Texture, appearanceLayerUv1),
          material_AppearanceV2Detail1Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal1);

        appearanceNormalTS = normalize(mix(vec3(0.0, 0.0, 1.0), appearanceNormalTS, material_AppearanceV2DetailNormalStrength));
        vec3 appearanceTangentWS = safeNormalize3(
          input.tangentWS - input.macroNormalWS * dot(input.tangentWS, input.macroNormalWS),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 appearanceBitangentWS = safeNormalize3(
          cross(input.macroNormalWS, appearanceTangentWS),
          vec3(0.0, 0.0, 1.0)
        );
        vec3 appearanceSurfaceNormalWS = safeNormalize3(
          appearanceTangentWS * appearanceNormalTS.x
            + appearanceBitangentWS * appearanceNormalTS.y
            + input.macroNormalWS * appearanceNormalTS.z,
          input.macroNormalWS
        );
        surfaceNormalWS = safeNormalize3(
          mix(
            surfaceNormalWS,
            appearanceSurfaceNormalWS,
            material_AppearanceV2DetailEnabled * material_MicroNormalsEnabled
          ),
          input.macroNormalWS
        );
#endif

        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        // Geometry decides which side of the sheet is visible. Flipping individual
        // detail normals at grazing angles creates discontinuous dark islands.
        float geometryFacingSign = step(0.0, dot(input.macroNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= geometryFacingSign;

        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;

// Material roughness uses centered depth, independent of refraction and its final optical path.
        float effectiveSurfaceRoughness;
        {
#ifndef WATER_SURFACE_APPEARANCE_V2_ROUGHNESS_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_ROUGHNESS_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = 0.0;
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;


        float resolvedBoundaryRoughness = clamp(
          material_Roughness + appearanceBoundaryRoughness,
          0.045,
          1.0
        );
#endif

          effectiveSurfaceRoughness = resolvedBoundaryRoughness;
        }

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

    }

  }
}
