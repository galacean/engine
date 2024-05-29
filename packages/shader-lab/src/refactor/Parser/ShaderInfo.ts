import { ASTNode } from "./AST";
import SymbolTable from "./SymbolTable";
import { IEngineType } from "../EngineType";

export enum EShaderDataType {
  Pass,
  SubShader,
  Shader
}

export abstract class ShaderData {
  abstract dataType: EShaderDataType;

  settingRenderState?: ASTNode.GLRenderStateDeclarator;
  symbolTable: SymbolTable;

  renderStates: IRenderState = [{}, {}];

  tags: Record<string, string | number | boolean> = {};
}

export class GLPassShaderData extends ShaderData {
  dataType = EShaderDataType.Pass;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;
}

export class GLSubShaderData extends ShaderData {
  dataType = EShaderDataType.SubShader;

  passList: (ASTNode.GLUsePassDeclaration | ASTNode.GLPassProgram)[] = [];
}

export class GLShaderData extends ShaderData {
  dataType = EShaderDataType.Shader;

  subShaderList: ASTNode.GLSubShaderProgram[] = [];
}
