import { Logger } from "../Logger";
import { ASTNode } from "../Parser/AST";
import SymbolTable, { ESymbolType, SymbolInfo } from "../Parser/SymbolTable";
import { GalaceanDataType, IParamInfo } from "../Parser/types";
import { EShaderStage } from "./constants";

export class VisitorContext {
  attributeList: IParamInfo[] = [];
  attributeStructs: ASTNode.StructSpecifier[] = [];
  varyingStruct?: ASTNode.StructSpecifier;

  stage: EShaderStage;

  _referencedAttributeList: Map<string, IParamInfo> = new Map();
  _referencedGlobals: Map<string, SymbolInfo> = new Map();
  _referencedVaryingList: Map<string, IParamInfo> = new Map();

  _curFn?: ASTNode.FunctionProtoType;

  _passSymbolTable: SymbolTable;
  get passSymbolTable() {
    return this._passSymbolTable;
  }

  logger = new Logger("visitor context");

  reset() {
    this.attributeList.length = 0;
    this.attributeStructs.length = 0;
    this._referencedAttributeList.clear();
    this._referencedGlobals.clear();
    this._referencedVaryingList.clear();
  }

  isAttributeStruct(type: string) {
    return this.attributeStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isVaryingStruct(type: string) {
    return this.varyingStruct?.ident?.lexeme === type;
  }

  referenceAttribute(ident: string) {
    if (this._referencedAttributeList.has(ident)) return;

    const prop = this.attributeList.find((item) => item.ident.lexeme === ident);
    if (!prop) {
      this.logger.log(Logger.RED, "referenced attribute not found:", ident);
      return;
    }
    this._referencedAttributeList.set(ident, prop);
  }

  referenceVarying(ident: string) {
    if (this._referencedVaryingList.has(ident)) return;

    const prop = this.varyingStruct?.propList.find((item) => item.ident.lexeme === ident);
    if (!prop) {
      this.logger.log(Logger.RED, "referenced varying not found:", ident);
      return;
    }
    this._referencedVaryingList.set(ident, prop);
  }

  referenceGlobal(ident: string, type: ESymbolType, signature?: GalaceanDataType[]) {
    if (this._referencedGlobals.has(ident)) return;

    const sm = this.passSymbolTable.lookup(ident, type, signature);
    if (sm) {
      this._referencedGlobals.set(ident, sm);
    }
  }
}
