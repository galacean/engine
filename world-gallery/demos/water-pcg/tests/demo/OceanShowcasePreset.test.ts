import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { gerstnerFeatureOceanPreview, showcaseOceanPreview } from "../../demo/examples/ocean-preview/presets";
import { createOceanRingLayout } from "../../runtime/ocean/OceanRingGeometry";

describe("Ocean showcase presets", () => {
  it("locks the hero to High 12-wave rings and opt-in five-tap Planar reflection", () => {
    const waves = compileWaterWaveAsset(showcaseOceanPreview.waveAsset, showcaseOceanPreview.quality);
    const rings = createOceanRingLayout({
      size: showcaseOceanPreview.size,
      ringCount: 3,
      patchSegments: 12,
      waterLevel: showcaseOceanPreview.waterLevel,
      maxHorizontalDisplacement: waves.maxHorizontalDisplacement,
      maxVerticalDisplacement: waves.maxVerticalDisplacement,
      skirtDepth: 2
    });

    expect(showcaseOceanPreview.quality).toBe(WaterQualityTier.High);
    expect(waves.activeWaveCount).toBe(12);
    expect(rings.patches).toHaveLength(37);
    expect(showcaseOceanPreview.reflectionSource).toBe("planar");
    expect(showcaseOceanPreview.reflectionSampling?.highFilterSampleCount).toBe(5);
    expect(gerstnerFeatureOceanPreview.reflectionSource).toBe("sky");
  });
});
