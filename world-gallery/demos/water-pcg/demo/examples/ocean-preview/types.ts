/** Parameters for the deterministic GPU Gerstner Ocean preview. */
import type { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import type { WaterReflectionSource } from "../../../runtime/optics/WaterReflectionPolicy";
import type { WaterOpticalProfile } from "../../../runtime/optics/WaterOpticalProfile";
import type { ResolvedWaterOpticsTier, WaterOpticsTier } from "../../../runtime/optics/WaterSurfaceOpticsTypes";

export interface OceanPreviewConfig {
  size: number;
  resolution: number;
  waterLevel: number;
  amplitudeScale: number;
  timeScale: number;
  quality: WaterQualityTier;
  waveAsset: WaterWaveAssetV1;
  alpha: number;
  foamIntensity: number;
  oceanColor: string;
  /** Defaults to sky until a per-camera WaterReflectionService is attached. */
  reflectionSource?: WaterReflectionSource;
  /** Independent optics tier; Experimental deliberately resolves through High. */
  opticsTier?: WaterOpticsTier;
  opticalProfile?: WaterOpticalProfile;
  refractionEnabled?: boolean;
}

export interface OceanPreviewMetrics {
  readonly waveModel: WaterWaveModel;
  readonly quality: WaterQualityTier;
  readonly shaderWaveCount: number;
  readonly activeWaveCount: number;
  readonly sourceHash: string;
  readonly meshUploadCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly activeMeshCount: number;
  readonly activeMaterialCount: number;
  readonly vertexCount: number;
  readonly ringCount: number;
  readonly patchCount: number;
  readonly visiblePatchCount: number;
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly visibleTriangleCount: number;
  readonly originSnapCount: number;
  readonly originX: number;
  readonly originZ: number;
  readonly baseCellSize: number;
  readonly coverageHalfExtent: number;
  readonly reflectionSource: WaterReflectionSource;
  readonly requestedOpticsTier?: WaterOpticsTier;
  readonly resolvedOpticsTier?: ResolvedWaterOpticsTier;
  readonly compiledOpticsTier?: ResolvedWaterOpticsTier;
  readonly refractionEnabled: boolean;
  readonly cameraFeatureRequested: boolean;
  readonly frameCount: number;
  readonly perFrameMeshUpload: false;
}

export interface OceanPreviewStressResult {
  readonly requestedIterations: number;
  readonly completedIterations: number;
  readonly initialMeshUploadCount: number;
  readonly finalMeshUploadCount: number;
  readonly activeMeshCount: number;
  readonly activeMaterialCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly sourceHash: string;
}
