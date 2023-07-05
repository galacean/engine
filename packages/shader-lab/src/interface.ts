import { AstNode } from "./astNode";
import { IAstInfo, IPositionRange, IShaderAstContent } from "./astNode/types";
import { DiagnosticSeverity } from "./constants";

/**
 * Shader lab interface
 */
export interface IShaderLab {
  /**  */
  initialize(): void;
  /**
   * parse galacean shader
   */
  parseShader(shaderCode: string): IShaderInfo;
}

export interface IDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /**
   * The token which caused the parser error.
   */
  token: IPositionRange;
}

export interface IShaderMainFunction {
  type: "vert" | "frag";
  functionAst: IAstInfo;
}

interface IReference {
  referenced: boolean;
}

export interface IGlobal extends IReference {
  ast: AstNode;
  name: string;
}

export interface IShaderInfo {
  ast: AstNode<IShaderAstContent>;
  name: string;
  subShaders: Array<SubShaderInfo>;
  editorProperties: Record<string, any>;
  diagnostics: Array<IDiagnostic>;
}

export interface SubShaderInfo {
  name: string;
  passes: Array<IShaderPass>;
  tags?: Record<string, any>;
}

export interface IShaderPass {
  name: string;
  vert: string;
  frag: string;
  tags?: Record<string, any>;
  renderStates: IRenderState;
}

export type IRenderState = Record<string, any>;
