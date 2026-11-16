import { Engine, EngineConfiguration } from "@galacean/engine-core";
import { HeadlessCanvas } from "./HeadlessCanvas";
import { NullGraphicDevice } from "./NullGraphicDevice";

/** Engine simulation and resources without graphics or DOM input. */
export class HeadlessEngine extends Engine {
  /**
   * Create a paused engine without opening a graphics device.
   * @param configuration - Physics, compiler and fixed canvas dimensions
   * @returns The initialized engine; call update or run to advance simulation
   */
  static create(configuration: HeadlessEngineConfiguration = {}): Promise<HeadlessEngine> {
    const canvas = new HeadlessCanvas(configuration.width, configuration.height);
    const engine = new HeadlessEngine(canvas, new NullGraphicDevice(), configuration);
    return engine._initialize(configuration);
  }
}

/** Options for an engine without graphics, XR or DOM input. */
export interface HeadlessEngineConfiguration extends Pick<EngineConfiguration, "physics" | "shaderCompiler"> {
  /** Fixed canvas width in pixels, defaults to 1. */
  width?: number;
  /** Fixed canvas height in pixels, defaults to 1. */
  height?: number;
}
