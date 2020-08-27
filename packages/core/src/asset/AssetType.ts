/**
 * 资产类型。
 */
export enum AssetType {
  /**
   * 文本。
   * @remarks 在资源管理器中不会根据 url 缓存。
   */
  Text = 0,
  /**
   * JSON。
   * @remarks 在资源管理器中不会根据 url 缓存。
   */
  JSON = 1,
  /**
   * 缓冲。
   * @remarks 在资源管理器中不会根据 url 缓存。
   */
  Buffer = 2,
  /** 2D纹理。*/
  Texture2D = 3,
  /** 立方纹理。*/
  TextureCube = 4,
  /** 材质。*/
  Material = 5,
  /** 网格。*/
  Mesh = 6,
  /** 动画文件。*/
  AnimationClip = 7,
  /** 预设。*/
  Perfab = 8, // 先走 GLTFLoader
  /** 压缩纹理。*/
  KTX = 9,
  /** 立方压缩纹理。*/
  KTXCube = 10
  /** @todo 场景。*/
  // Scene = 9
}
