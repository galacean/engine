import { ShadowResolution } from "./enum/ShadowResolution";
import { TextureFormat } from "../texture";
import { Renderer } from "../Renderer";
import { BoundingFrustum } from "@oasis-engine/math";
import { Camera } from "../Camera";

export class ShadowUtils {
  static shadowResolution(value: ShadowResolution): number {
    switch (value) {
      case ShadowResolution.Low:
        return 256;
      case ShadowResolution.Medium:
        return 512;
      case ShadowResolution.High:
        return 1024;
      case ShadowResolution.VeryHigh:
        return 2048;
    }
  }

  static shadowDepthFormat(value: ShadowResolution): TextureFormat {
    switch (value) {
      case ShadowResolution.Low:
        return TextureFormat.Depth16;
      case ShadowResolution.Medium:
        return TextureFormat.Depth16;
      case ShadowResolution.High:
        return TextureFormat.Depth16;
      case ShadowResolution.VeryHigh:
        return TextureFormat.Depth16;
    }
  }

  static shadowCullFrustum(camera: Camera, renderer: Renderer, frustum: BoundingFrustum) {
    if (renderer.castShadows && frustum.intersectsBox(renderer.bounds)) {
      renderer._render(camera);
    }
  }
}
