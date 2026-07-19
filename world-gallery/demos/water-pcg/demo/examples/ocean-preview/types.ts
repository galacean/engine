/** Parameters for the deterministic GPU Gerstner Ocean preview. */
import type { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";

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
