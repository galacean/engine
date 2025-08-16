import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/Enums";
import { SymbolTable } from "../common/SymbolTable";
import { GSErrorName } from "../GSError";
import { ASTNode } from "../parser/AST";
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

  _referencedAttributeList: Record<string, StructProp[]>;
  _referencedVaryingList: Record<string, Array<StructProp & { qualifier?: string }>>;
  _referencedGlobals: Record<string, SymbolInfo | SymbolInfo[]>;
  _referencedMRTList: Record<string, StructProp | string>;

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
  }

  isAttributeStruct(type: string) {
    return this.attributeStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isVaryingStruct(type: string) {
    return this.varyingStructs[0]?.ident?.lexeme === type;
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

    if (type === ESymbolType.FN) {
      const entries = this._passSymbolTable._table.get(ident);
      if (entries) {
        for (let i = 0; i < entries.length; i++) {
          const item = entries[i];
          if (item.isInMacroBranch) continue;
          if (item.type !== ESymbolType.FN) continue;
          (<SymbolInfo[]>(this._referencedGlobals[ident] ||= [])).push(item);
        }
      }
      return;
    }

    const lookupSymbol = VisitorContext._lookupSymbol;
    lookupSymbol.set(ident, type);
    const sm = this._passSymbolTable.getSymbol(lookupSymbol);
    if (sm) {
      this._referencedGlobals[ident] = sm;
    }
  }
}
