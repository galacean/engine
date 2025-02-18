import { GalaceanDataType } from "../../common";
import { ASTNode } from "../AST";

export class SymbolDataType {
  constructor(
    public type: GalaceanDataType,
    public typeLexeme: string,
    public arraySpecifier?: ASTNode.ArraySpecifier
  ) {}
}
