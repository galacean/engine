import { TextureFilterMode, TextureWrapMode } from "../texture";

/**
 * Texture interface specification.
 */
export interface IPlatformTexture {
  /**
   * Wrapping mode for texture coordinate S.
   */
  wrapModeU: TextureWrapMode;

  /**
   * Wrapping mode for texture coordinate T.
   */
  wrapModeV: TextureWrapMode;

  /**
   * Filter mode for texture.
   */
  filterMode: TextureFilterMode;

  /**
   * Anisotropic level for texture.
   */
  anisoLevel: number;

  /**
   * Destroy texture.
   */
  destroy(): void;

  /**
   * Generate multi-level textures based on the 0th level data.
   */
  generateMipmaps(): void;
}
