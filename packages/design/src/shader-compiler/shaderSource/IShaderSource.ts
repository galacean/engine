import { IComputeKernelSource } from "./IComputeKernelSource";
import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";
import { ISubShaderSource } from "./ISubShaderSource";

export interface IShaderSource {
  name: string;
  /** Top-level ShaderLab program kind; defaults to `"raster"` for `Shader "..."`. */
  kind?: "raster" | "compute";
  pendingContents: IStatement[];
  subShaders: ISubShaderSource[];
  /** Compute kernels parsed from a top-level `ComputeShader "..."` program. */
  computeKernels?: IComputeKernelSource[];
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
}
