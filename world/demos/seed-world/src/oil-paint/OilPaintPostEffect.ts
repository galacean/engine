import { PostProcessEffect, PostProcessEffectFloatParameter } from "@galacean/engine";

/**
 * Pluggable 120-FPS Oil Paint stylization post-processing effect:
 * Single-pass, zero-extra-RT, zero-DepthPrePass native-resolution painterly Kuwahara
 * with micro-detail protection (preserves animal eyes & diamond window mullions),
 * painted sky & clouds, native impasto paint-edge ridge, and oil varnish glaze.
 */
export class OilPaintPostEffect extends PostProcessEffect {
  /** Blend strength of the detail-preserving painterly Kuwahara pass (0..1). */
  painterlyStrength = new PostProcessEffectFloatParameter(0.88, 0, 1);

  /** Resolution-normalized brushstroke radius (in 720px short-edge pixels, 0..10). */
  brushRadius = new PostProcessEffectFloatParameter(5.0, 0, 10);

  /** Painterly pigment plane contrast, chroma richness & varnish glaze (0..1). */
  colorStylize = new PostProcessEffectFloatParameter(0.38, 0, 1);

  /** Native-resolution paint-edge ridge relief along brushstroke boundaries (0..1.5). */
  screenImpasto = new PostProcessEffectFloatParameter(0.25, 0, 1.5);

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
