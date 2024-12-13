import { EShaderStage } from "../common/Enums";
import { ASTNode } from "../parser/AST";
import { ESymbolType, SymbolTable, SymbolInfo } from "../parser/symbolTable";
import { IParamInfo, StructProp } from "../parser/types";
import { GSErrorName } from "../GSError";
import { BaseToken } from "../common/BaseToken";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabUtils } from "../ShaderLabUtils";

/** @internal */
export class VisitorContext {
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

  _referencedAttributeList: Record<string, IParamInfo & { qualifier?: string }> = Object.create(null);
  _referencedGlobals: Record<string, SymbolInfo | ASTNode.PrecisionSpecifier> = Object.create(null);
  _referencedVaryingList: Record<string, IParamInfo & { qualifier?: string }> = Object.create(null);
  _referencedMRTList: Record<string, StructProp | string> = Object.create(null);

  _curFn?: ASTNode.FunctionProtoType;

  _passSymbolTable: SymbolTable;

  private constructor() {}

  get passSymbolTable() {
    return this._passSymbolTable;
  }

  reset() {
    this.attributeList.length = 0;
    this.attributeStructs.length = 0;
    this._referencedAttributeList = Object.create(null);
    this._referencedGlobals = Object.create(null);
    this._referencedVaryingList = Object.create(null);
    this._referencedMRTList = Object.create(null);
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

  referenceAttribute(ident: BaseToken): Error {
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

  referenceVarying(ident: BaseToken): Error | undefined {
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

  referenceMRTProp(ident: BaseToken): Error | undefined {
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

  referenceGlobal(ident: string, type: ESymbolType) {
    if (this._referencedGlobals[ident]) return;

    if (type === ESymbolType.FN) {
      const fnEntries = this._passSymbolTable.getAllFnSymbols(ident);
      for (let i = 0; i < fnEntries.length; i++) {
        const key = i === 0 ? ident : ident + i;
        this._referencedGlobals[key] = fnEntries[i];
      }
      return;
    }
    const sm = this.passSymbolTable.lookup({ ident, symbolType: type });
    if (sm) {
      this._referencedGlobals[ident] = sm;
    }
  }
}
