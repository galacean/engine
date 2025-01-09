import { ASTNode } from "./AST";
import { TargetSymbolTable } from "../parser/symbolTable";

export class ShaderData {
  symbolTable: TargetSymbolTable;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];
}
