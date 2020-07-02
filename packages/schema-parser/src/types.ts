import { SchemaResource } from "./resources";

export interface NodeConfig {
  /**
   * 节点 id
   */
  id: string;
  /**
   * 节点在 parent 里的 index
   */
  index: number;
  /**
   * 节点名称
   */
  name: string;
  /**
   * 节点坐标
   */
  position: [number, number, number];
  /**
   * 节点旋转四元数
   */
  rotation: [number, number, number];
  /**
   * 节点缩放
   */
  scale: [number, number, number];
  /**
   * 父节点，默认为根节点
   */
  parent: string | undefined;
  /**
   * 子节点，默认为 []
   */
  children: string[];
  /**
   * abilities 默认为 []
   */
  abilities?: string[];
  /**
   * 是否激活，默认为 true
   */
  isActive?: boolean;
}

export interface Props {
  [key: string]: any | AssetProp;
}

export interface AssetProp {
  type: "asset";
  /**
   * asset id
   */
  id: string;
}
export interface AbilityConfig {
  /**
   * ability id
   */
  id: string;
  /**
   * ability 所属 node id
   */
  node: string;
  /**
   * ability type
   */
  type: string;
  /**
   * ability props
   */
  props: Props;
  /**
   * ability 在 node abilities 的 index，默认是最后一个
   */
  index: number;
}

// todo
export interface AssetConfig {
  /**
   * asset id
   */
  id?: string;
  /**
   * asset name
   */
  name: string;
  /**
   * asset type
   */
  type: string;
  /**
   * asset props
   */
  props?: any;
  /**
   * asset url
   */
  url?: string;
  /**
   * asset source
   */
  source?: string;
  /**
   * asset resource
   */
  resource?: any;
}

export interface Schema {
  nodes: {
    [nodeId: string]: NodeConfig;
  };
  abilities: {
    [abiliId: string]: AbilityConfig;
  };
  assets: {
    [assetId: string]: AssetConfig;
  };
  [name: string]: any;
}

export interface ClassType<T> extends Function {
  new (...args: any[]): T;
}

export interface Options {
  canvas?: HTMLCanvasElement;
  // 传入 schema
  config?: Schema;
  // 是否自动调用 engine.run()，默认为 false
  autoPlay?: boolean;
  onProgress?: () => {};
  // 脚本是否本地开发环境
  local?: boolean;
  scripts?: { [name: string]: any };
  // gl context 参数
  rhiAttr?: WebGLContextAttributes & { enableCollect?: boolean };
  // 全局资源超时时间
  timeout?: number;
  // engine run 的 fps
  fps?: number;
  // 是否使用压缩纹理
  useCompressedTexture?: boolean;
}

export interface LoadAttachedResourceResult {
  resources: Array<SchemaResource>;
  structure: LoadAttachedResourceResultStructure;
}
interface LoadAttachedResourceResultStructure {
  index: number;
  props?: {
    [propName: string]: LoadAttachedResourceResultStructure | Array<LoadAttachedResourceResultStructure>;
  };
}
