import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { WaterSurfaceAppearanceAssetV1 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { WaterSurfaceAppearanceVariantKey } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import type { HeightfieldWaterCompositionMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import type { WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";

export type GrasslandsPcgCaseId = "showcase-grasslands-stylized-water";
export type GrasslandsPcgRuntime = "grasslands";
export type GrasslandsPcgPresetId = "hero-grasslands";
export type GrasslandsWaterBodyType = "heightfield";
export type GrasslandsLandscapeRegionId = "far-river" | "narrow-channel" | "mid-bay" | "near-shoal";
export type GrasslandsVector2 = readonly [number, number];
export type GrasslandsVector3 = readonly [number, number, number];
export type GrasslandsColor4 = readonly [number, number, number, number];

export type GrasslandsMechanismRoiId =
  | "detail-normal"
  | "refraction"
  | "depth-color"
  | "contact-foam-left"
  | "contact-foam-right"
  | "coastal-alpha"
  | "specular-response";

export type GrasslandsCandidateValidationRoiId =
  | "candidate-left-bank"
  | "candidate-right-bank"
  | "candidate-open-water"
  | "candidate-static-large-rock-left"
  | "candidate-static-large-rock-right"
  | "candidate-static-small-rock"
  | "candidate-anchor-left"
  | "candidate-anchor-right"
  | "candidate-anchor-channel"
  | "candidate-far-river"
  | "candidate-narrow-channel"
  | "candidate-mid-bay"
  | "candidate-near-shoal"
  | "candidate-near-optics"
  | "candidate-mid-optics"
  | "candidate-far-optics";

export interface GrasslandsWorldBounds {
  readonly minimum: GrasslandsVector3;
  readonly maximum: GrasslandsVector3;
}

export interface GrasslandsCameraFixture {
  readonly mode: "fixed";
  readonly position: GrasslandsVector3;
  readonly target: GrasslandsVector3;
  readonly forward: GrasslandsVector3;
  readonly fieldOfViewDegrees: number;
  readonly nearClip: number;
  readonly farClip: number;
}

export interface GrasslandsDirectLightFixture {
  readonly color: GrasslandsVector3;
  readonly intensity: number;
  readonly forward: GrasslandsVector3;
}

export interface GrasslandsMechanismRoi {
  readonly id: GrasslandsMechanismRoiId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly purpose: string;
}

export interface GrasslandsCandidateValidationRoi {
  readonly id: GrasslandsCandidateValidationRoiId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly purpose: string;
}

export interface GrasslandsAnchorRockFixture {
  readonly id: string;
  readonly position: GrasslandsVector3;
  readonly halfExtents: GrasslandsVector3;
  readonly bounds: GrasslandsWorldBounds;
  readonly validationCritical: true;
}

export interface GrasslandsDecorationFixture {
  readonly id: string;
  readonly kind: "bank-tuft";
  readonly position: GrasslandsVector3;
  readonly scale: number;
  readonly validationCritical: false;
}

export interface GrasslandsScenicRockFixture {
  readonly id: string;
  readonly kind: "underwater-bed" | "shore";
  readonly position: GrasslandsVector3;
  readonly halfExtents: GrasslandsVector3;
  readonly bounds: GrasslandsWorldBounds;
  readonly validationCritical: false;
}

export interface GrasslandsSceneMaterialFixture {
  readonly baseColor: GrasslandsColor4;
  readonly specularColor: GrasslandsColor4;
  readonly emissiveColor: GrasslandsColor4;
  readonly shininess: number;
}

export interface GrasslandsSceneMaterialsFixture {
  readonly bed: GrasslandsSceneMaterialFixture;
  readonly bank: GrasslandsSceneMaterialFixture;
  readonly rock: GrasslandsSceneMaterialFixture;
}

export interface GrasslandsTerrainCrossSection {
  readonly centerXZ: GrasslandsVector2;
  readonly leftHalfWidth: number;
  readonly rightHalfWidth: number;
  readonly bedDepth: number;
}

export interface GrasslandsTerrainSampling {
  readonly longitudinalSegments: number;
  readonly grassLateralSegments: number;
  readonly sandLateralSegments: number;
  readonly bedLateralSegments: number;
  readonly sandBandWidth: number;
}

export interface GrasslandsLandscapeRegionFixture {
  readonly id: GrasslandsLandscapeRegionId;
  readonly zRange: GrasslandsVector2;
  readonly focusXZ: GrasslandsVector2;
  readonly purpose: string;
}

export interface GrasslandsTerrainRecipe {
  readonly model: "analytic-centerline-width";
  readonly interpolation: "catmull-rom";
  readonly waterSurfaceHeight: number;
  readonly authoredBedHeight: number;
  readonly minimumTerrainBedHeight: number;
  readonly bankNoise: "none";
  readonly sampling: GrasslandsTerrainSampling;
  readonly crossSections: readonly GrasslandsTerrainCrossSection[];
  readonly landscapeRegions: readonly GrasslandsLandscapeRegionFixture[];
}

export interface GrasslandsWaterControllerPresentationConfig {
  readonly compositionMode: HeightfieldWaterCompositionMode.PrecomposedReplace;
  readonly depthWriteEnabled: true;
}

export interface GrasslandsTargetMaterialConfig {
  /** Original Grasslands source parameter; only the derived scroll/time enter Appearance. */
  readonly sourceWaveSpeed: number;
  readonly surfaceAppearance: WaterSurfaceAppearanceAssetV1;
  readonly opticalProfile: WaterOpticalProfile;
  readonly controller: GrasslandsWaterControllerPresentationConfig;
}

export interface GrasslandsPcgFixture {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly seed: number;
  readonly caseId: GrasslandsPcgCaseId;
  readonly runtime: GrasslandsPcgRuntime;
  readonly preset: GrasslandsPcgPresetId;
  readonly waterBodyType: GrasslandsWaterBodyType;
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly descriptorHash: string;
  readonly appearanceAssetId: string;
  readonly appearanceHash: string;
  readonly appearanceVariantKey: WaterSurfaceAppearanceVariantKey;
  readonly externalAssetHash: string;
  readonly targetMaterialConfig: GrasslandsTargetMaterialConfig;
  readonly fixtureHash: string;
  readonly waterBounds: GrasslandsWorldBounds;
  readonly wetTexelCount: number;
  readonly camera: GrasslandsCameraFixture;
  readonly directLight: GrasslandsDirectLightFixture;
  readonly captureViewport: readonly [number, number];
  readonly mechanismRois: readonly GrasslandsMechanismRoi[];
  readonly candidateValidationRois: readonly GrasslandsCandidateValidationRoi[];
  readonly terrain: GrasslandsTerrainRecipe;
  readonly sceneMaterials: GrasslandsSceneMaterialsFixture;
  readonly anchorRocks: readonly GrasslandsAnchorRockFixture[];
  readonly scenicRocks: readonly GrasslandsScenicRockFixture[];
  readonly decorations: readonly GrasslandsDecorationFixture[];
  readonly gameplayQueryRegistered: false;
}
