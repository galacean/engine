import type { ShaderData } from "../shader/ShaderData";

/**
 * Platform compute shader program executable on compute-capable backends (WebGPU).
 */
export interface IPlatformComputeProgram {
  readonly isValid: boolean;
  dispatch(workgroupCountX: number, workgroupCountY: number, workgroupCountZ: number, shaderData: ShaderData): void;
  destroy(): void;
}
