/**
 * Asset Type.
 */
export enum AssetType {
  /**
   * Plain text.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  Text = 0,
  /**
   * JSON.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  JSON = 1,
  /**
   * ArrayBuffer.
   * @remarks Will not be cached based on url in ResourceManager.
   */
  Buffer = 2,
  /** 2D Texture. */
  Texture2D = 3,
  /** Cube Texture. */
  TextureCube = 4,
  /** Material. */
  Material = 5,
  /** Mesh. */
  Mesh = 6,
  /** Animation Clip. */
  AnimationClip = 7,
  /** Prefab.*/
  Perfab = 8,
  /** Compress Texture. */
  KTX = 9,
  /** Cube Compress Texture. */
  KTXCube = 10,
  /** @todo Scene. */
  // Scene = 9
  /** Editor File loader, for editor custom loader. */
  EditorFile = 100
}
