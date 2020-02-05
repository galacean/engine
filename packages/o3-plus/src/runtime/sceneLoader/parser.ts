import * as r3 from "@alipay/o3";
import { parserSceneGraph } from "./sceneGraph";
import { fetchConfig, loadAssets } from "./assets";

const defaultOptions = {
  autoPlay: true
};

export async function loadScene(options: Options): Promise<r3.Engine> {
  const engine = new r3.Engine();
  (engine as any).canvas = options.canvas;
  options = { ...defaultOptions, ...options };

  if (!options.config && !options.path) {
    throw new Error("config is not provided");
  }
  const config = options.config || (await fetchConfig(options.path));

  const { assets = {}, sceneGraph = {} } = config;

  assets && (await loadAssets(engine, assets, options.onProgress, options.local));

  parserSceneGraph(engine, sceneGraph, options);

  options.autoPlay && engine.run();

  return engine;
}

export interface Options {
  canvas?: string | HTMLCanvasElement;
  path?: string;
  config?: any;
  autoPlay?: boolean;
  onProgress?: () => {};
  local?: boolean; // 是否本地开发环境
  rhiAttr: WebGLContextAttributes & { enableCollect?: boolean };
}
