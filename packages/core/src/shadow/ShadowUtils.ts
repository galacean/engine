import { ShadowResolution } from "./enum/ShadowResolution";
import { TextureFormat } from "../texture";
import { Renderer } from "../Renderer";
import { BoundingFrustum } from "@oasis-engine/math";
import { Camera } from "../Camera";

export class ShadowUtils {
  static shadowResolution(value: ShadowResolution): number {
    switch (value) {
      case ShadowResolution.Low:
        return 512;
      case ShadowResolution.Medium:
        return 1024;
      case ShadowResolution.High:
        return 2048;
      case ShadowResolution.VeryHigh:
        return 4096;
    }
  }

  static shadowDepthFormat(value: ShadowResolution): TextureFormat {
    return TextureFormat.Depth16;
  }

  static shadowCullFrustum(camera: Camera, renderer: Renderer, frustum: BoundingFrustum) {
    if (renderer.castShadows) {
      renderer._render(camera);
    }
  }
}
