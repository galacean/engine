import {
  PostProcessEffect,
  PostProcessEffectEnumParameter,
  PostProcessEffectFloatParameter
} from "@galacean/engine";

export enum OilPaintKuwaharaQuality {
  High = "high",
  Mobile = "mobile"
}

/**
 * Pluggable Oil Paint stylization post-processing effect:
 * Genuine Kyprianidis (2009) perceptual-sRGB Gaussian-smoothed Structure-Tensor
 * + 8-Sector Polynomial Anisotropic Kuwahara + full-res scene-anchored paint-edge ridge & varnish glaze.
 * Defaults match Panel 3 reference (R=5, anisotropy=1.0, strength=1.0, q=8).
 */
export class OilPaintPostEffect extends PostProcessEffect {
  /** Quality tier for Anisotropic Kuwahara: High (640p, 37-tap 8-sector) vs Mobile (420p, 21-tap 8-sector). */
  kuwaharaQuality = new PostProcessEffectEnumParameter(OilPaintKuwaharaQuality, OilPaintKuwaharaQuality.High);

  /** Blend strength of the Anisotropic Kuwahara brushstroke transformation (0..1). */
  painterlyStrength = new PostProcessEffectFloatParameter(1.0, 0, 1);

  /** Resolution-normalized brushstroke radius (in 720px short-edge pixels, identical on PC & Mobile, 0..14). */
  brushRadius = new PostProcessEffectFloatParameter(5.0, 0, 14);

  /** Elongation ratio of brushstrokes along local image edges (0 = isotropic, 1.0 = Kyprianidis alpha=1, 2.5 = sweeping). */
  strokeAnisotropy = new PostProcessEffectFloatParameter(1.0, 0, 2.5);

  /** Painterly pigment plane contrast, chroma richness & varnish glaze (0..1). */
  colorStylize = new PostProcessEffectFloatParameter(0.35, 0, 1);

  /** Scene-anchored paint-edge ridge relief along brushstroke boundaries (0..1.5, zero sky/lens overlay). */
  screenImpasto = new PostProcessEffectFloatParameter(0.22, 0, 1.5);

  /** 3D surface shader impasto relief synced to `scene_OilPaintImpasto` (0..2). */
  impasto = new PostProcessEffectFloatParameter(1.4, 0, 2);

  /** 3D surface shader brushstroke frequency synced to `scene_OilPaintBrushScale` (0.2..2.5). */
  brushScale = new PostProcessEffectFloatParameter(0.72, 0.2, 2.5);

  /** Optional split-screen A/B comparison position (0 = full oil paint, 0.5 = left original / right painted). */
  compareSplit = new PostProcessEffectFloatParameter(0, 0, 1);

  override isValid(): boolean {
    return this.enabled;
  }
}
