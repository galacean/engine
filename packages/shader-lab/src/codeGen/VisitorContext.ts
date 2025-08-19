import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/Enums";
import { SymbolTable } from "../common/SymbolTable";
import { GSErrorName } from "../GSError";
import { ASTNode, TreeNode } from "../parser/AST";
import { ESymbolType, SymbolInfo } from "../parser/symbolTable";
import { StructProp } from "../parser/types";
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

  attributeStructs: ASTNode.StructSpecifier[] = [];
  attributeList: StructProp[] = [];
  varyingStructs: ASTNode.StructSpecifier[] = [];
  varyingList: StructProp[] = [];
  mrtStruct?: ASTNode.StructSpecifier;

  stage: EShaderStage;
  stageEntry: string;

  getCacheCodeInMacroBranch = false;

  _referencedAttributeList: Record<string, StructProp[]>;
  _referencedVaryingList: Record<string, Array<StructProp & { qualifier?: string }>>;
  _referencedGlobals: Record<string, SymbolInfo[]>;
  _referencedMRTList: Record<string, StructProp | string>;
  _referencedGlobalMacroASTs: TreeNode[] = [];

  _passSymbolTable: SymbolTable<SymbolInfo>;

  reset(resetAll = true) {
    if (resetAll) {
      this.attributeStructs.length = 0;
      this.attributeList.length = 0;
      this.varyingStructs.length = 0;
      this.varyingList.length = 0;
      this.mrtStruct = undefined;
    }

    this._referencedAttributeList = Object.create(null);
    this._referencedGlobals = Object.create(null);
    this._referencedVaryingList = Object.create(null);
    this._referencedMRTList = Object.create(null);
    this._referencedGlobalMacroASTs.length = 0;
    this.getCacheCodeInMacroBranch = false;
  }

  isAttributeStruct(type: string) {
    return this.attributeStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isVaryingStruct(type: string) {
    return this.varyingStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isMRTStruct(type: string) {
    return this.mrtStruct?.ident?.lexeme === type;
  }

  referenceAttribute(ident: BaseToken): Error | void {
    const lexeme = ident.lexeme;
    if (this._referencedAttributeList[lexeme]) return;

    const props = this.attributeList.filter((item) => item.ident.lexeme === lexeme);
    if (!props.length) {
      return ShaderLabUtils.createGSError(
        `referenced attribute not found: ${lexeme}`,
        GSErrorName.CompilationError,
        ShaderLab._processingPassText,
        ident.location
      );
    }
    this._referencedAttributeList[lexeme] = props;
  }

  referenceVarying(ident: BaseToken): Error | void {
    const lexeme = ident.lexeme;
    if (this._referencedVaryingList[lexeme]) return;

    const props = this.varyingList.filter((item) => item.ident.lexeme === lexeme);
    if (!props.length) {
      return ShaderLabUtils.createGSError(
        `referenced varying not found: ${lexeme}`,
        GSErrorName.CompilationError,
        ShaderLab._processingPassText,
        ident.location
      );
    }
    this._referencedVaryingList[lexeme] = props;
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

    this._referencedGlobals[ident] = [];

    const lookupSymbol = VisitorContext._lookupSymbol;
    lookupSymbol.set(ident, type);
    this._passSymbolTable.getSymbols(lookupSymbol, true, this._referencedGlobals[ident]);
  }
}
