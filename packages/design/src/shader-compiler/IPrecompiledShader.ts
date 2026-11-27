import type { IShaderProgramSource } from "./IShaderProgramSource";
import type { IComputeProgramSource } from "./IWebGPUShaderProgram";

export interface IPrecompiledShader {
  name: string;
  platformTarget: number;
  subShaders: IPrecompiledSubShader[];
}

export interface IPrecompiledComputeShader {
  kind: "compute";
  name: string;
  platformTarget: number;
  kernels: IPrecompiledComputeKernel[];
}

export interface IPrecompiledComputeKernel
  extends Pick<IComputeProgramSource, "workgroupSize" | "uniformBlocks" | "wgslComputeInstructions" | "wgsl"> {
  name: string;
  entry: string;
}

export interface IPrecompiledSubShader {
  name: string;
  tags?: Record<string, number | string | boolean>;
  passes: IPrecompiledPass[];
}

export interface IPrecompiledPass
  extends Pick<
    IShaderProgramSource,
    | "vertexShaderInstructions"
    | "fragmentShaderInstructions"
    | "wgslVertexInstructions"
    | "wgslFragmentInstructions"
    | "vertexOutputNames"
    | "uniformBlocks"
    | "uniformPlan"
    | "wgsl"
  > {
  name: string;
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  renderStates: {
    constantMap: Record<string, number | string | boolean | number[]>;
    variableMap: Record<string, string>;
  };
}
