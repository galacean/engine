/**
 * Shader lab interface.
 */
export interface IShaderLab {
  parseShader(shaderSource: string): IShaderInfo;
}

export interface IShaderInfo {
  name: string;
  subShaders: ISubShaderInfo[];
}

export interface ISubShaderInfo {
  passes: IShaderPassInfo[];
  tags?: Record<string, number | string | boolean>;
}

export interface IShaderPassInfo {
  name: string;
  vert: string;
  frag: string;
  tags?: Record<string, number | string | boolean>;
  renderStates: Record<string, any>;
}
