import { PostProcessEffect, PostProcessEffectFloatParameter } from "@galacean/engine";

/**
 * Pluggable Oil Paint stylization post-processing effect:
 * High-performance 3-pass Structure-Tensor (1/4-res) + 4-Sector Anisotropic Kuwahara (1/2-res)
 * + full-res scene-anchored paint-edge ridge impasto & varnish tone curve (zero screen-space lens mask).
 */
export class OilPaintPostEffect extends PostProcessEffect {
  /** Blend strength of the Anisotropic Kuwahara brushstroke transformation (0..1). */
  painterlyStrength = new PostProcessEffectFloatParameter(0.5, 0, 1);

  /** Resolution-normalized brushstroke radius (in 720px short-edge pixels, identical on PC & Mobile, 0..14). */
  brushRadius = new PostProcessEffectFloatParameter(2.9, 0, 14);

  /** Elongation ratio of brushstrokes along local image edges (0 = isotropic, 2.5 = sweeping Van Gogh flow). */
  strokeAnisotropy = new PostProcessEffectFloatParameter(1.45, 0, 2.5);

  /** Painterly pigment plane contrast, chroma richness & varnish glaze (0..1). */
  colorStylize = new PostProcessEffectFloatParameter(0.42, 0, 1);

  /** Scene-anchored paint-edge ridge relief along brushstroke boundaries (0..1.5, zero sky/lens overlay). */
  screenImpasto = new PostProcessEffectFloatParameter(0.3, 0, 1.5);

  /** 3D surface shader impasto relief synced to `scene_OilPaintImpasto` (0..2). */
  impasto = new PostProcessEffectFloatParameter(1.0, 0, 2);

  /** 3D surface shader brushstroke frequency synced to `scene_OilPaintBrushScale` (0.2..2.5). */
  brushScale = new PostProcessEffectFloatParameter(1.0, 0.2, 2.5);

  /** Optional split-screen A/B comparison position (0 = full oil paint, 0.5 = left original / right painted). */
  compareSplit = new PostProcessEffectFloatParameter(0, 0, 1);

  override isValid(): boolean {
    return this.enabled;
  }
}
