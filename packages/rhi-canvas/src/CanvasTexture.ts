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
  _canvasTexture: HTMLCanvasElement;
  /** @internal */
  _ctx: CanvasRenderingContext2D;

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
    const canvas = this._canvasTexture = document.createElement("canvas");
    this._ctx = canvas.getContext("2d");
    canvas.width = texture.width;
    canvas.height = texture.height;
  }

  /**
   * Destroy texture.
   */
  destroy() {
    this._texture && (this._texture = null);
    this._canvasTexture && (this._canvasTexture = null);
    this._ctx && (this._ctx = null);
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
