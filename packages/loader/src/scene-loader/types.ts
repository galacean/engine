import { Engine } from "@oasis-engine/core";
import { SchemaResource } from "./resources";

export interface NodeConfig {
  /**
   * Node id
   */
  id: string;
  /**
   * Index of parent's children
   */
  index: number;
  /**
   * Name of node
   */
  name: string;
  /**
   * Position of node
   */
  position: [number, number, number];
  /**
   * Euler rotation of node
   */
  rotation: [number, number, number];
  /**
   * Scale of node
   */
  scale: [number, number, number];
  /**
   * Parent node
   */
  parent: string | undefined;
  /**
   * Children of node
   */
  children: string[];
  /**
   * Components of node
   */
  abilities?: string[];
  /**
   * Is active of
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
export interface ComponentConfig {
  /**
   * ComponentId id
   */
  id: string;
  /**
   * Node id of component
   */
  node: string;
  /**
   * Ability type
   */
  type: string;
  /**
   * Ability props
   */
  props: Props;
  /**
   * Index of components
   */
  index: number;
}

// todo
export interface AssetConfig {
  /**
   * Asset id
   */
  id?: string;
  /**
   * Asset name
   */
  name: string;
  /**
   * Asset type
   */
  type: string;
  /**
   * Asset props
   */
  props?: any;
  /**
   * Asset url
   */
  url?: string;
  /**
   * Asset source
   */
  source?: string;
  /**
   * Asset resource
   */
  resource?: any;
}

export interface Schema {
  nodes: {
    [nodeId: string]: NodeConfig;
  };
  abilities: {
    [abiliId: string]: ComponentConfig;
  };
  assets: {
    [assetId: string]: AssetConfig;
  };
  version: number;
  [name: string]: any;
}

export interface ClassType<T> extends Function {
  new (...args: any[]): T;
}

export interface Options {
  /** Engine of scene */
  engine: Engine;
  /** HTMLCanvasElement */
  canvas?: HTMLCanvasElement;
  /** Scene data */
  config?: Schema;
  /** Call engine.run() automatically */
  autoPlay?: boolean;
  onProgress?: () => {};
  local?: boolean;
  scripts?: { [name: string]: any };
  /** Attributes of GLContext */
  rhiAttr?: WebGLContextAttributes & { enableCollect?: boolean };
  /** Timeout of loading */
  timeout?: number;
  /** Fps of engine run */
  fps?: number;
  /** Whether to use compress texture */
  useCompressedTexture?: boolean;
  /** Engine */
  // engine?: Engine;
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
