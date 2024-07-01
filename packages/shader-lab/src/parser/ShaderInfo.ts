import { IRenderState } from "../codeGen/types";
import { ASTNode } from "./AST";
import SymbolTable from "../common/SymbolTable";

export class ShaderData {
  symbolTable: SymbolTable;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];
}
