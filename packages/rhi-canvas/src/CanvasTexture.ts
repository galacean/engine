import {
  IPlatformTexture,
  TextureFilterMode,
  TextureWrapMode,
  TextureDepthCompareFunction,
  Texture
} from "@oasis-engine/core";
import { CanvasRenderer } from "./CanvasRenderer";

export class CanvasTexture implements IPlatformTexture {
  /** @internal */
  _rhi: CanvasRenderer;
  /** @internal */
  _texture: Texture;
  /** @internal */
  _canvasTexture: TexImageSource;

  /**
   * Wrapping mode for texture coordinate S.
   */
  set wrapModeU(value: TextureWrapMode) {}

  /**
   * Wrapping mode for texture coordinate T.
   */
  set wrapModeV(value: TextureWrapMode) {}

  /**
   * Filter mode for texture.
   */
  set filterMode(value: TextureFilterMode) {}

  /**
   * Anisotropic level for texture.
   */
  set anisoLevel(value: number) {}

  set depthCompareFunction(value: TextureDepthCompareFunction) {}

  constructor(rhi: CanvasRenderer, texture: Texture) {
    this._rhi = rhi;
    this._texture = texture;
  }

  /**
   * Destroy texture.
   */
  destroy() {
    this._texture && (this._texture = null);
    this._canvasTexture && (this._canvasTexture = null);
  }

  /**
   * Generate multi-level textures based on the 0th level data.
   */
  generateMipmaps(): void {}

  /**
   * @internal
   */
  setUseDepthCompareMode(value: boolean): void {}
}
