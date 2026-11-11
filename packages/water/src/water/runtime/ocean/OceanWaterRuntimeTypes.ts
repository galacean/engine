import type { WaterConnectionPort } from "../../authoring/connections/WaterConnection";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import type { OceanNearshoreOutsidePolicies } from "../../authoring/ocean/OceanNearshoreTypes";
import type { WaterReflectionSource } from "../optics/WaterReflectionPolicy";
import type { OceanDebugView } from "./OceanDebugView";
import type { OceanRuntimeTuning } from "./OceanRuntimeTuning";
import type { OceanTextures } from "./OceanTextureLibrary";

export type OceanSurfaceTopology = "finite";
export type OceanCapabilityMode = "render-and-query";

/** Engine-object-free Body source. Rendering parameters belong to the one canonical Look. */
export interface OceanWaterSourceConfig {
  readonly connections?: readonly WaterConnectionPort[];
  readonly waterLevel: number;
  readonly nearshoreDescriptor: OceanNearshoreDescriptorV1;
}

/** Engine-facing configuration for the finite, render-and-query Ocean runtime. */
export interface OceanWaterRuntimeConfig extends OceanWaterSourceConfig {
  readonly surfaceShader?: import("@galacean/engine-core").Shader;
  readonly renderContract?: CompiledWaterRenderContractV1;
  /** Resolved from the published Water Look, never from diagnostic state. */
  readonly color?: OceanRuntimeTuning["color"];
  readonly waterBodyId: string;
  readonly surfaceCenterXZ: readonly [number, number];
  readonly size: number;
  readonly surfaceTopology: "finite";
  readonly capabilityMode: "render-and-query";
  readonly textures: Readonly<OceanTextures>;
  readonly sceneFogEnabled: boolean;
  readonly surfaceTimeOverride?: number;
  readonly lodDebug?: boolean;
  readonly debugView?: OceanDebugView;
}

export interface OceanWaterRuntimeFeatureAvailability {
  readonly environmentReflection: true;
  readonly refraction: true;
  readonly surfaceFoam: true;
  readonly intersectionFoam: true;
  readonly caustics: true;
  readonly translucency: true;
  readonly screenSpaceReflection: false;
  readonly crestFoam: false;
  readonly windField: false;
  readonly surfaceQuery: true;
  readonly temporalFoam: false;
  readonly interaction: false;
}

export interface OceanWaterRuntimeMetrics {
  readonly responseModel: "ocean";
  readonly lookId: string;
  readonly parameterHash: string;
  readonly waterLevel: number;
  readonly surfaceTopology: "finite";
  readonly cameraRelative: true;
  readonly capabilityMode: "render-and-query";
  readonly sceneFogEnabled: boolean;
  readonly reflectionSource: WaterReflectionSource;
  readonly screenSpaceReflectionEnabled: false;
  readonly crestFoamEnabled: false;
  readonly windFieldEnabled: false;
  readonly surfaceQueryEnabled: true;
  readonly interactionEnabled: false;
  readonly temporalFoamEnabled: false;
  readonly waveGroupCount: 3;
  readonly sourceWaveCount: 2;
  readonly geometryWaveBandlimitEnabled: true;
  /** Eight scalar trigonometric lanes per active four-wave group after sine/cosine reuse. */
  readonly maximumGeometryWaveTrigonometricEvaluationsPerVertex: 24;
  readonly bandlimitViewportHeight: number;
  readonly farFieldPresentation: "camera-relative-graded-rings";
  readonly farFieldMaximumTextureSampleCount: number;
  readonly farFieldAdditionalRenderTargetCount: 0;
  readonly farFieldUsesSceneTextures: false;
  readonly farFieldClosureTransitionStartMetres: number;
  readonly farFieldClosureTransitionEndMetres: number;
  readonly farFieldRingCount: number;
  readonly farFieldSegmentsPerEdge: number;
  readonly farFieldInnerHalfExtentMetres: number;
  readonly farFieldActualDepthOuterHalfExtentMetres: number;
  readonly farFieldProjectionMarkerHalfExtentMetres: number;
  readonly farFieldProjectionMinimumDistanceMetres: number;
  readonly farFieldProjectionMaximumDistanceMetres: number;
  readonly farFieldProjectionMaximumErrorPixels: number;
  readonly farFieldQuadCount: number;
  readonly presentationPath: "detailed" | "far-only";
  readonly presentationPathTransitionCount: number;
  readonly detailedPathDrawCount: number;
  readonly detailedPathVertexCount: number;
  readonly detailedPathTriangleCount: number;
  readonly farOnlyPathDrawCount: number;
  readonly farOnlyPathVertexCount: number;
  readonly farOnlyPathTriangleCount: number;
  readonly farOnlyFillDrawCount: 1;
  readonly farOnlyFillVertexCount: number;
  readonly farOnlyFillTriangleCount: number;
  readonly textureCount: 5;
  readonly textureContainerFormat: "ktx2";
  readonly compressedTextureCount: number;
  readonly uncompressedTextureFallbackCount: number;
  readonly textureResourceBytes: number;
  readonly geometryResourceBytes: number;
  /** Unified footprint: geometry + nearshore atlas + the five page-owned Ocean textures. */
  readonly ownedGpuBytes: number;
  readonly maximumOwnedGpuBytes: number;
  readonly gpuBudgetHeadroomBytes: number;
  readonly nearshoreEnabled: true;
  readonly outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>;
  readonly nearshoreSourceHash: string;
  readonly nearshoreWetTexelCount: number;
  readonly nearshoreDryTexelCount: number;
  readonly nearshoreResourceBytes: number;
  readonly nearshoreQueryResourceBytes: 0;
  /** Currently submitted presentation path, excluding inactive resident meshes. */
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly residentMeshCount: number;
  readonly residentTriangleCount: number;
  readonly residentVertexCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly meshUploadCount: number;
  /** Created Mesh resources that have not been destroyed; independent of the submitted presentation path. */
  readonly activeMeshCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  /** Created Material resources that have not been destroyed; independent of the submitted presentation path. */
  readonly activeMaterialCount: number;
  readonly vertexBufferBytes: number;
  readonly indexBufferBytes: number;
  readonly nearFieldWindowSizeMetres: number;
  readonly nearFieldCellSizeMetres: number;
  readonly nearFieldSnapSizeMetres: number;
  readonly nearFieldMinimumGuaranteedRadiusMetres: number;
  readonly nearFieldCellCount: number;
  readonly nearFieldCenterX: number;
  readonly nearFieldCenterZ: number;
  readonly nearFieldRelocationCount: number;
  readonly nearFieldDrawCount: number;
  readonly nearFieldVertexCount: number;
  readonly nearFieldTriangleCount: number;
  readonly activeNearFieldDrawCount: number;
  readonly activeNearFieldVertexCount: number;
  readonly activeNearFieldTriangleCount: number;
  readonly activeFarOnlyFillDrawCount: number;
  readonly activeFarOnlyFillVertexCount: number;
  readonly activeFarOnlyFillTriangleCount: number;
  readonly farFieldDrawCount: number;
  readonly farFieldVertexCount: number;
  readonly farFieldTriangleCount: number;
  readonly minimumCellSize: number;
  readonly maximumActualCellSize: number;
  readonly worldMinimumX: number;
  readonly worldMinimumZ: number;
  readonly worldMaximumX: number;
  readonly worldMaximumZ: number;
  readonly cameraFeatureRequested: boolean;
  readonly cameraFeaturesAvailable: boolean;
  readonly cameraSceneFieldsRequired: boolean;
  readonly cameraSceneFieldDemandReason: "detailed-closure" | "far-only" | "debug-forced";
  readonly cameraSceneFieldMinimumDistanceMetres: number;
  readonly cameraSceneFieldReleaseDistanceMetres: number;
  readonly cameraSceneFieldReacquireDistanceMetres: number;
  readonly cameraSceneFieldTransitionCount: number;
  readonly refractionEnabled: boolean;
  readonly surfaceTimeOverride: number | undefined;
  readonly frameCount: number;
  readonly perFrameMeshUpload: false;
}
