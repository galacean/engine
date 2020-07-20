import { Scene } from "../Scene";
import { SceneManager } from "./SceneManager";

type RHIWebGL = any;
type RHIWebGPU = any;
type RHIVulkan = any;
type RHI = RHIWebGL | RHIWebGPU | RHIVulkan;

interface ContextOption {
  width?: number;
  height?: number;
  pixelRatio?: number;
  alpha?: boolean;
  antialias?: boolean;
  depth?: boolean;
  failIfMajorPerformanceCaveat?: boolean;
  powerPreference?: "default" | "high-performance" | "low-power";
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
}

/**
 * Engine 作为整个 Oasis 引擎的控制器，一个 Engine 对应一个 Context
 */
export declare class Engine {
  /** 硬件抽象,可以配置 WebGL、WebGPU、Vulkan */
  get rhi(): RHI;

  /** 宽 */
  get drawingWidth(): number;
  /** 高 */
  get drawingHeight(): number;

  /** 在线或离屏 canvas */
  get canvas(): HTMLCanvasElement | OffscreenCanvas;

  /** 场景管理器 */
  get sceneManager(): SceneManager;

  /**
   * @param canvas - 当前支持 HTMLCanvasElement 和 OffscreenCanvas
   * @param option - 针对 canvas 的额外配置，根据官方文档来配置
   */
  constructor(canvas: string | HTMLCanvasElement | OffscreenCanvas, option: ContextOption, rhi?: RHI);

  /**
   * 持续渲染全部或某个场景
   * @param scene - 渲染的场景，若不传，则默认渲染全部场景
   * */
  public run(scene?: Scene): void;

  /**
   * 单帧渲染全部或某个场景
   * @param scene - 渲染的场景，若不传，则默认渲染全部场景
   * */
  public render(scene?: Scene): void;

  /** 设置/限制帧速率，一般情况下FPS取值范围[15,60] */
  public setFPS(fps: number): void;

  /** 修改 drawing width/height */
  public resize(width?: number, height?: number): void;

  /**
   * 暂停全部或某个场景
   * @param scene - 暂停的场景，若不传，则默认暂停全部场景
   * */
  public pause(scene?: Scene): void;

  /**
   * 继续全部或某个场景
   * @param scene - 继续的场景，若不传，则默认继续全部场景
   * */
  public resume(scene?: Scene): void;

  /** 销毁整个引擎 */
  public destroy(): void;
}
