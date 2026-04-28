import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/enums/ShaderStage";
import { SymbolTable } from "../common/SymbolTable";
import { GSErrorName } from "../GSError";
import { ASTNode, TreeNode } from "../parser/AST";
import { ESymbolType, SymbolInfo } from "../parser/symbolTable";
import { StructProp } from "../parser/types";
import { ShaderCompiler } from "../ShaderCompiler";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

/** Role of a struct type in the shader compiler's IO flattening. */
export type StructRole = "varying" | "attribute" | "mrt";

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
  mrtStructs: ASTNode.StructSpecifier[] = [];
  mrtList: StructProp[] = [];

  stage: EShaderStage;
  stageEntry: string;

  _referencedAttributeList: Record<string, StructProp[]>;
  _referencedVaryingList: Record<string, StructProp[]>;
  _referencedMRTList: Record<string, StructProp[]>;
  _referencedGlobals: Record<string, SymbolInfo[]>;
  _referencedGlobalMacroASTs: TreeNode[] = [];
  /**
   * Maps variable names (function params, locals, and globals whose type is a
   * varying/attribute/mrt struct) to their role. Populated during stage setup and
   * used by macro-value rewriting to recognize `varName.prop` patterns that should
   * be flattened against the IO lists.
   */
  _structVarMap: Record<string, StructRole>;

  _passSymbolTable: SymbolTable<SymbolInfo>;

  reset(resetAll = true) {
    if (resetAll) {
      this.attributeStructs.length = 0;
      this.attributeList.length = 0;
      this.varyingStructs.length = 0;
      this.varyingList.length = 0;
      this.mrtStructs.length = 0;
      this.mrtList.length = 0;
    }

    this._referencedAttributeList = Object.create(null);
    this._referencedVaryingList = Object.create(null);
    this._referencedMRTList = Object.create(null);
    this._referencedGlobals = Object.create(null);
    this._referencedGlobalMacroASTs.length = 0;
    if (resetAll) {
      // Struct-var bindings are pass-scoped, not stage-scoped — global `#define`
      // values must see the same bindings in both the vertex and fragment outputs,
      // so we keep the map across the vertex→fragment stage transition.
      this._structVarMap = Object.create(null);
    }
  }

  isAttributeStruct(type: string) {
    return this.attributeStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isVaryingStruct(type: string) {
    return this.varyingStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  isMRTStruct(type: string) {
    return this.mrtStructs.findIndex((item) => item.ident!.lexeme === type) !== -1;
  }

  /** Return the role of a struct type, or undefined if it isn't one of the IO roles. */
  getStructRole(typeLexeme: string): StructRole | undefined {
    if (this.isAttributeStruct(typeLexeme)) return "attribute";
    if (this.isVaryingStruct(typeLexeme)) return "varying";
    if (this.isMRTStruct(typeLexeme)) return "mrt";
  }

  /** Register a variable as holding a value of a varying/attribute/mrt struct type. */
  registerStructVar(varName: string, role: StructRole): void {
    this._structVarMap[varName] = role;
  }

  referenceAttribute(ident: BaseToken): Error | void {
    return this._referenceProp(
      "attribute",
      ident.lexeme,
      this.attributeList,
      this._referencedAttributeList,
      ident.location
    );
  }

  referenceVarying(ident: BaseToken): Error | void {
    return this._referenceProp("varying", ident.lexeme, this.varyingList, this._referencedVaryingList, ident.location);
  }

  referenceMRTProp(ident: BaseToken): Error | void {
    return this._referenceProp("mrt", ident.lexeme, this.mrtList, this._referencedMRTList, ident.location);
  }

  referenceGlobal(ident: string, type: ESymbolType): void {
    if (this._referencedGlobals[ident]) return;

    this._referencedGlobals[ident] = [];

    const lookupSymbol = VisitorContext._lookupSymbol;
    lookupSymbol.set(ident, type);
    this._passSymbolTable.getSymbols(lookupSymbol, true, this._referencedGlobals[ident]);
  }

  private _referenceProp(
    role: StructRole,
    name: string,
    list: StructProp[],
    refList: Record<string, StructProp[]>,
    location: any
  ): Error | void {
    if (refList[name]) return;
    const props = list.filter((item) => item.ident.lexeme === name);
    if (!props.length) {
      return ShaderCompilerUtils.createGSError(
        `referenced ${role} not found: ${name}`,
        GSErrorName.CompilationError,
        ShaderCompiler._processingPassText,
        location
      );
    }
    refList[name] = props;
  }
}
