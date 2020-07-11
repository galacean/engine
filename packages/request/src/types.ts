export type Config = {
  /**
   * 超时
   */
  timeout?: number;
  /**
   * 重试次数
   */
  retry?: number;
} & (
  | {
      /**
       * 加载 url
       */
      url: string;
      /**
       * 加载类型，若不传则自动判断
       */
      type?: Exclude<LoaderType, LoaderType.TextureCube>;
    }
  | {
      /**
       * 若传入数组则表示是 TextureCube
       */
      url: string[];
      /**
       * 加载类型是 TextureCube。
       */
      type?: LoaderType.TextureCube;
    }
);

export interface Loader<T> {
  load(config: Config): Promise<T>;
}

type ProgressFunc = (item: any, currentCount: number, totalCount: number) => void;

export interface Asset {
  /**
   * asset 唯一 id。
   */
  cacheId: number;
  /**
   * 永不销毁。
   */
  neverDestroy: boolean;
  /**
   * 引用计数。
   */
  _references: number;
  /**
   * 增加引用计数。
   */
  _incrementRef(): void;
  /**
   * 减少引用计数，若引用计数为 0，判定销毁。
   */
  _decrementRef(): void;
  /**
   * 销毁资源。
   */
  destroy(): void;
}

export interface Http {
  request<T>(
    url: string,
    config: RequestInit & {
      type?: XMLHttpRequestResponseType | "image";
      retryCount?: number;
      timeout?: number;
    }
  ): Promise<T>;
}

export enum LoaderType {
  Binary = "binary", // 生成 ArrayBuffer
  TextureCube = "cube", // 生成 TextureCube
  GLTF = "gltf", // 生成 Prefab || GLTF 对象 {materials, lights, scenes, cameras, mesh, textures, extensions}
  HDR = "hdr", // 生成 TextureCube
  Image = "image", // 生成 Image
  JSON = "json", // 生成 object
  KTX = "ktx", // 生成 CompressedTexture
  Text = "text", // 生成 string
  Texture2D = "texture2d" // 生成 Texture2D
}

export interface AssetManager {
  _meshes;
  _materials;
  _textures;
  _cubeTextures;
  /**
   * 加载单个资源。
   * @param config 资源加载配置
   */
  load(config: Config): Promise<Asset>;
  /**
   * 加载一组资源。
   * @param configs 资源加载配置组
   * @param onProgress 资源加载进度回调，每当一个资源加载完成则调用该方法
   */
  loadAll(configs: Config[], onProgress?: ProgressFunc): Promise<Asset[]>;
  /**
   * 销毁无用资源。
   */
  gc(): void;
  /**
   * 销毁所有资源。
   */
  destroy(): void;
}



class DerivedPromise<T> extends Promise<T> {

}

let a:Promise
