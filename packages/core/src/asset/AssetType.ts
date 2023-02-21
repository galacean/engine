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
  /** AnimationClip. */
  AnimationClip = "AnimationClip",
  /** AnimatorController. */
  AnimatorController = "AnimatorController",
  /** Prefab.*/
  Prefab = "prefab",
  /** Compress Texture. */
  KTX = "ktx",
  /** Cube Compress Texture. */
  KTXCube = "ktx-cube",
  /** Sprite. */
  Sprite = "sprite",
  /** Sprite Atlas. */
  SpriteAtlas = "sprite-atlas",
  /** Ambient light. */
  Env = "environment",
  /** Scene. */
  Scene = "scene",
  /** HDR to cube. */
  HDR = "HDR",
  /** Font. */
  Font = "font",
  /** Source Font, include ttf、 otf and woff. */
  SourceFont = "source-font"
}
