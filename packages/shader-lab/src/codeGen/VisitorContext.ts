import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/Enums";
import { SymbolTable } from "../common/SymbolTable";
import { GSErrorName } from "../GSError";
import { ASTNode } from "../parser/AST";
import { ESymbolType, SymbolInfo } from "../parser/symbolTable";
import { IParamInfo, StructProp } from "../parser/types";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabUtils } from "../ShaderLabUtils";

/** @internal */
export class VisitorContext {
  private static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);
  private static _singleton: VisitorContext;
  static get context() {
    return this._singleton;
  }

  static reset() {
    if (!this._singleton) {
      this._singleton = new VisitorContext();
    }
    this._singleton.reset();
  }

  attributeList: IParamInfo[] = [];
  attributeStructs: ASTNode.StructSpecifier[] = [];
  varyingStruct?: ASTNode.StructSpecifier;
  mrtStruct?: ASTNode.StructSpecifier;

  stage: EShaderStage;

  _referencedAttributeList: Record<string, IParamInfo & { qualifier?: string }>;
  _referencedGlobals: Record<string, SymbolInfo | SymbolInfo[]>;
  _referencedVaryingList: Record<string, IParamInfo & { qualifier?: string }>;
  _referencedMRTList: Record<string, StructProp | string>;

  _curFn?: ASTNode.FunctionProtoType;

  _passSymbolTable: SymbolTable<SymbolInfo>;

  reset() {
    this.attributeList.length = 0;
    this.attributeStructs.length = 0;
    this._referencedAttributeList = Object.create(null);
    this._referencedGlobals = Object.create(null);
    this._referencedVaryingList = Object.create(null);
    this._referencedMRTList = Object.create(null);
    this.mrtStruct = undefined;
  }

  isAttributeStruct(type: string) {
    return this.attributeStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isVaryingStruct(type: string) {
    return this.varyingStruct?.ident?.lexeme === type;
  }

  isMRTStruct(type: string) {
    return this.mrtStruct?.ident?.lexeme === type;
  }

  referenceAttribute(ident: BaseToken): Error | void {
    if (this._referencedAttributeList[ident.lexeme]) return;

    const prop = this.attributeList.find((item) => item.ident.lexeme === ident.lexeme);
    if (!prop) {
      return ShaderLabUtils.createGSError(
        `referenced attribute not found: ${ident.lexeme}`,
        GSErrorName.CompilationError,
        ShaderLab._processingPassText,
        ident.location
      );
    }
    this._referencedAttributeList[ident.lexeme] = prop;
  }

  referenceVarying(ident: BaseToken): Error | void {
    if (this._referencedVaryingList[ident.lexeme]) return;

    const prop = this.varyingStruct?.propList.find((item) => item.ident.lexeme === ident.lexeme);
    if (!prop) {
      return ShaderLabUtils.createGSError(
        `referenced varying not found: ${ident.lexeme}`,
        GSErrorName.CompilationError,
        ShaderLab._processingPassText,
        ident.location
      );
    }
    this._referencedVaryingList[ident.lexeme] = prop;
  }

  referenceMRTProp(ident: BaseToken): Error | void {
    if (this._referencedMRTList[ident.lexeme]) return;

    const prop = this.mrtStruct?.propList.find((item) => item.ident.lexeme === ident.lexeme);
    if (!prop) {
      return ShaderLabUtils.createGSError(
        `referenced mrt not found: ${ident.lexeme}`,
        GSErrorName.CompilationError,
        ShaderLab._processingPassText,
        ident.location
      );
    }
    this._referencedMRTList[ident.lexeme] = prop;
  }

  referenceGlobal(ident: string, type: ESymbolType): void {
    if (this._referencedGlobals[ident]) return;

    if (type === ESymbolType.FN) {
      const entries = this._passSymbolTable._table.get(ident);
      if (entries) {
        for (let i = 0; i < entries.length; i++) {
          const item = entries[i];
          if (item.type !== ESymbolType.FN) continue;
          (<SymbolInfo[]>(this._referencedGlobals[ident] ||= [])).push(item);
        }
        return;
      }
    }
    const lookupSymbol = VisitorContext._lookupSymbol;
    lookupSymbol.set(ident, type);
    const sm = this._passSymbolTable.lookup(lookupSymbol);
    if (sm) {
      this._referencedGlobals[ident] = sm;
    }
  }
}
