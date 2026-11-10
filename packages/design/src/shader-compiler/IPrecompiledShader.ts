import type { IShaderInterfaceBindings } from "./IShaderInterfaceBindings";
import type { ShaderInstruction } from "./ICondition";

export interface IPrecompiledShader {
  name: string;
  platformTarget: number;
  subShaders: IPrecompiledSubShader[];
}

export interface IPrecompiledSubShader {
  name: string;
  tags?: Record<string, number | string | boolean>;
  passes: IPrecompiledPass[];
}

export interface IPrecompiledPass {
  name: string;
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  renderStates: {
    constantMap: Record<string, number | string | boolean | number[]>;
    variableMap: Record<string, string>;
  };
  /** Interface bindings emitted together with the shader instructions. */
  interfaceBindings?: IShaderInterfaceBindings;
  vertexShaderInstructions?: ShaderInstruction[];
  fragmentShaderInstructions?: ShaderInstruction[];
}
