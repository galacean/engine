/** Ocean material presentation; values and storage remain defined by the native Material contract. */
export const OCEAN_MATERIAL_PROPERTY_UI: Readonly<
  Record<string, readonly [group: string, label: string, showIf?: string, color?: boolean]>
> = {
  material_AppearanceV2DepthShallowColor: ["surface", "shallowColor", undefined, true],
  material_AppearanceV2DepthDeepColor: ["surface", "deepColor", undefined, true],
  material_Water_appearance_featureFlags_depthTint: ["advanced", "depthTint"],
  material_Water_appearance_appearance_depthResponse_terms_0_coefficientPerMeter: ["advanced", "depthResponse0"],
  material_Water_appearance_appearance_depthResponse_terms_1_coefficientPerMeter: ["advanced", "depthResponse1"],
  material_Water_optics_profile_absorptionCoefficient: ["advanced", "absorption"],
  material_Water_optics_profile_scatteringColor: ["advanced", "scatteringColor"],
  material_Water_optics_profile_scatteringCoefficient: ["advanced", "scattering"],
  material_Ocean_smoothWaves: ["textures", "smoothWaves"],
  material_Ocean_roughWaves: ["textures", "roughWaves"],
  material_AppearanceV2MacroNormalStrength: ["surface", "macroNormalStrength"],
  material_Water_appearance_featureFlags_externalNormal: ["advanced", "externalNormal"],
  material_Water_look_oceanResponse_timeScale: ["surface", "timeScale"],
  material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond: ["advanced", "detailSpeed0"],
  material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio: ["advanced", "detailStrength0"],
  material_Water_look_oceanResponse_microDetailResponse_0_speedRatio: ["advanced", "detailSpeedRatio0"],
  material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond: ["advanced", "detailSpeed1"],
  material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio: ["advanced", "detailStrength1"],
  material_Water_look_oceanResponse_microDetailResponse_1_speedRatio: ["advanced", "detailSpeedRatio1"],
  material_Water_optics_profile_roughness: ["surface", "roughness"],
  material_Water_optics_profile_reflectionIntensity: ["lighting", "reflectionIntensity"],
  material_Water_look_reflectionSampling_screenSpaceCompositeIntensity: ["advanced", "ssrStrength"],
  material_Water_look_reflectionSampling_environmentFallbackIntensity: ["advanced", "environmentStrength"],
  material_Water_look_reflectionSampling_distortionStrength: ["advanced", "reflectionDistortion"],
  material_Water_appearance_featureFlags_directSpecular: ["advanced", "directSpecular"],
  material_Water_appearance_appearance_directionalHighlight_strength: ["advanced", "highlightStrength"],
  material_Water_appearance_appearance_directionalHighlight_exponent: ["advanced", "highlightExponent"],
  material_Water_appearance_appearance_directionalHighlight_distortion: ["advanced", "highlightDistortion"],
  material_Water_appearance_appearance_directionalHighlight_sharp: ["advanced", "sharpHighlight"],
  material_Water_appearance_appearance_refraction_enabled: ["lighting", "surfaceRefraction"],
  material_Water_optics_refractionEnabled: ["advanced", "opticalRefraction"],
  material_AppearanceV2RefractionUvScale: [
    "lighting",
    "refractionUvScale",
    "material_Water_appearance_appearance_refraction_enabled"
  ],
  material_Water_optics_profile_refractionStrength: ["advanced", "refractionStrength"],
  material_Water_optics_profile_indexOfRefraction: ["advanced", "indexOfRefraction"],
  material_Water_optics_profile_maximumViewDistance: ["advanced", "viewDistance"],
  material_Water_optics_profile_maximumSurfaceOpticalDistance: ["advanced", "opticalDistance"],
  material_Ocean_foam: ["foam", "foamTexture", "material_Water_look_foam_enabled"],
  material_Water_look_foam_enabled: ["foam", "foamEnabled"],
  material_Water_look_foam_intensity: ["foam", "foamIntensity", "material_Water_look_foam_enabled"],
  material_Water_look_foam_color: ["foam", "foamColor", "material_Water_look_foam_enabled"],
  material_Ocean_caustics: ["caustics", "causticsTexture"],
  material_Water_optics_caustics: ["surface", "causticsEnabled"],
  material_Ocean_intersectionNoise: ["shoreline", "intersectionNoise"],
  material_Water_appearance_featureFlags_coastalAlpha: ["advanced", "coastalAlpha"],
  material_Water_appearance_featureFlags_contactFoam: ["advanced", "contactFoam"],
  material_Water_appearance_appearance_boundaryEffects_0_rangeMeters: ["shoreline", "shorelineRange"],
  material_Water_appearance_appearance_boundaryEffects_0_invert: ["advanced", "invertShoreline"],
  material_Water_appearance_appearance_boundaryEffects_0_outputs_refractionSuppression: [
    "advanced",
    "shorelineRefraction"
  ],
  material_WaterProfile: ["advanced", "profile"],
  material_Water_appearance_appearance_primaryColorClosure: ["advanced", "colorComposition"],
  material_Water_appearance_appearance_refraction_normalSource: ["advanced", "refractionNormal"],
  material_Water_appearance_appearance_refraction_validation: ["advanced", "refractionValidation"],
  material_Water_appearance_appearance_composition: ["advanced", "composition"],
  material_Water_look_reflectionSampling_maximumDistortionPixels: ["advanced", "maximumDistortion"],
  material_Water_look_reflectionSampling_edgeFadeTexels: ["advanced", "edgeFade"],
  material_Water_look_reflectionSampling_minimumClipW: ["advanced", "minimumClipW"],
  material_Water_look_reflectionSampling_roughnessFootprintTexels: ["advanced", "roughnessFootprint"],
  material_Water_look_reflectionSampling_highFilterSampleCount: ["advanced", "filterSamples"],
  material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness: ["advanced", "normalRoughness"],
  material_Water_reflectionPolicy_policy_preferred: ["advanced", "reflectionPolicy"],
  material_WaterReflectionFallback0: ["advanced", "reflectionFallback0"],
  material_WaterReflectionFallback1: ["advanced", "reflectionFallback1"],
  material_Water_renderState_depthWriteEnabled: ["advanced", "depthWrite"],
  material_Water_renderState_queue: ["advanced", "renderQueue"],
  material_Water_renderState_priorityOffset: ["advanced", "priorityOffset"],
  material_Water_renderState_cullMode: ["advanced", "cullMode"],
  material_Water_renderState_blendMode: ["advanced", "blendMode"]
};

/** UI limits mirror the public optics compiler and reflection sampler. */
export const OCEAN_MATERIAL_PROPERTY_RANGES: Readonly<Record<string, readonly [number, number, number]>> = {
  material_Water_optics_profile_roughness: [0, 1, 0.01],
  material_Water_optics_profile_refractionStrength: [0, 8, 0.01],
  material_Water_optics_profile_reflectionIntensity: [0, 4, 0.01],
  material_Water_optics_profile_indexOfRefraction: [1, 4, 0.001],
  material_Water_look_reflectionSampling_screenSpaceCompositeIntensity: [0, 1, 0.01],
  material_Water_look_reflectionSampling_environmentFallbackIntensity: [0, 4, 0.01],
  material_Water_look_reflectionSampling_distortionStrength: [0, 0.25, 0.001],
  material_Water_look_reflectionSampling_maximumDistortionPixels: [0, 64, 1],
  material_Water_look_reflectionSampling_edgeFadeTexels: [1, 64, 0.1],
  material_Water_look_reflectionSampling_minimumClipW: [1e-6, 1, 1e-6],
  material_Water_look_reflectionSampling_roughnessFootprintTexels: [0.5, 8, 0.1],
  material_Water_appearance_appearance_boundaryEffects_0_outputs_refractionSuppression: [0, 1, 0.01],
  material_Water_look_foam_intensity: [0, 8, 0.01],
  material_Water_look_oceanResponse_timeScale: [0.1, 4, 0.01],
  material_AppearanceV2MacroNormalStrength: [0, 2, 0.001],
  material_Water_appearance_appearance_directionalHighlight_strength: [0, 64, 0.1],
  material_Water_appearance_appearance_directionalHighlight_exponent: [1, 8196, 1],
  material_Water_appearance_appearance_directionalHighlight_distortion: [0, 2, 0.01],
  material_AppearanceV2RefractionUvScale: [0, 8, 0.01],
  material_Water_appearance_appearance_boundaryEffects_0_rangeMeters: [0.01, 20, 0.01]
};

/** Product controls with a verified Ocean runtime consumer. All other authored values stay intact. */
export const OCEAN_MATERIAL_VISIBLE_PROPERTIES: readonly string[] = [
  "material_AppearanceV2DepthShallowColor",
  "material_AppearanceV2DepthDeepColor",
  "material_Water_optics_profile_roughness",
  "material_AppearanceV2MacroNormalStrength",
  "material_Ocean_smoothWaves",
  "material_Ocean_roughWaves",
  "material_Water_look_foam_enabled",
  "material_Ocean_foam",
  "material_Water_look_foam_intensity",
  "material_Water_look_foam_color",
  "material_Ocean_caustics",
  "material_Ocean_intersectionNoise",
  "material_Water_appearance_appearance_boundaryEffects_0_rangeMeters",
  "material_Water_optics_profile_reflectionIntensity",
  "material_Water_appearance_appearance_refraction_enabled",
  "material_AppearanceV2RefractionUvScale"
];

export const OCEAN_MATERIAL_HIDDEN_PROPERTIES: readonly string[] = Object.keys(OCEAN_MATERIAL_PROPERTY_UI).filter(
  (name) => !OCEAN_MATERIAL_VISIBLE_PROPERTIES.includes(name)
);

export const OCEAN_MATERIAL_PROPERTY_PRESENTATION: Readonly<Record<string, "Color" | "RGB">> = {
  material_Water_optics_profile_scatteringColor: "Color",
  material_Water_optics_profile_absorptionCoefficient: "RGB",
  material_Water_look_foam_color: "RGB"
};
