/**
 * Asset Type.
 */
export enum AssetType {
  /**
   * Plain text.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  Text = "text",
  /**
   * JSON.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  JSON = "json",
  /**
   * ArrayBuffer.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  Buffer = "buffer",
  /** 2D Texture. */
  Texture2D = "texture2d",
  /** Cube Texture. */
  TextureCube = "texture-cube",
  /** Material. */
  Material = "material",
  /** Mesh. */
  Mesh = "mesh",
  /** Animation Clip. */
  AnimationClip = "animation-clip",
  /** Prefab.*/
  Perfab = "prefab",
  /** Compress Texture. */
  KTX = "ktx",
  /** Cube Compress Texture. */
  KTXCube = "ktx-cube",
  /** HDR to Cube Texture */
  HDR = "hdr"
}
