import { PostProcessEffect, PostProcessEffectFloatParameter } from "@galacean/engine";

/**
 * Pluggable 120-FPS Oil Paint stylization post-processing effect:
 * Single-pass, zero-extra-RT, zero-DepthPrePass native-resolution 5-tap L1 Kuwahara
 * with scalar micro-detail protection (preserves animal eyes & diamond window mullions)
 * and seamless painted sky & clouds.
 */
export class OilPaintPostEffect extends PostProcessEffect {
  /** Blend strength of the detail-preserving painterly Kuwahara pass (0..1). */
  painterlyStrength = new PostProcessEffectFloatParameter(0.88, 0, 1);

  /** Resolution-normalized brushstroke radius (in 720px short-edge pixels, 0..10). */
  brushRadius = new PostProcessEffectFloatParameter(5.0, 0, 10);

  /** 3D surface shader impasto relief synced to `scene_OilPaintImpasto` (0..2). */
  impasto = new PostProcessEffectFloatParameter(1.4, 0, 2);

  /** 3D surface shader brushstroke frequency synced to `scene_OilPaintBrushScale` (0.2..2.5). */
  brushScale = new PostProcessEffectFloatParameter(0.72, 0.2, 2.5);

  override isValid(): boolean {
    return this.enabled;
  }
}
