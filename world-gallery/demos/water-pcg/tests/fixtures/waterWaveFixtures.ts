import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import type { DirectionalGerstnerWaterWaveAssetV1 } from "../../authoring/wave/types/WaterWaveTypes";

export const directionalWaterWaveFixture: DirectionalGerstnerWaterWaveAssetV1 = {
  schemaVersion: WaterWaveSchemaVersion.V1,
  model: WaterWaveModel.DirectionalGerstner,
  generator: {
    waveCount: 16,
    seed: 41791,
    randomness: 0.82,
    minWavelength: 2.2,
    maxWavelength: 28,
    wavelengthFalloff: 1.25,
    minAmplitude: 0.025,
    maxAmplitude: 0.48,
    amplitudeFalloff: 1.6,
    dominantWindAngle: 0.35,
    dominantAngularSpread: 1.1,
    smallWaveSteepness: 0.28,
    largeWaveSteepness: 0.68,
    steepnessFalloff: 1.2
  }
};
