import { GalaceanDataType } from "../../common";
import type { ASTNode } from "../AST";

export class SymbolDataType {
  constructor(
    public type: GalaceanDataType,
    public typeLexeme: string,
    public arraySpecifier?: ASTNode.ArraySpecifier,
    /** Exact custom-struct declarations visible where this type was resolved. @internal */
    public structDeclarations: readonly ASTNode.StructSpecifier[] = []
  ) {}
}
