import { IRenderState } from "../codeGen/types";
import { ASTNode } from "./AST";
import SymbolTable from "../common/SymbolTable";

export class ShaderData {
  settingRenderState?: ASTNode.GLRenderStateDeclarator;
  symbolTable: SymbolTable;

  renderStates: IRenderState = [{}, {}];

  tags: Record<string, string | number | boolean> = {};

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];
}
