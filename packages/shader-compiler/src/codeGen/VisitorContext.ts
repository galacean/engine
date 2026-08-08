import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { EShaderStage } from "@galacean/engine-shader-parser/internal";
import { SymbolTable } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { ESymbolType, SymbolInfo } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole, StructProp } from "@galacean/engine-shader-parser/internal";

/** @internal */
export class VisitorContext {
  private readonly _lookupSymbol = new SymbolInfo("", null);

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
   * Per-stage variable-to-role maps. Split so a same-named param/local in both entries
   * (e.g. `input`) resolves to the correct role for the current stage; module-level
   * globals populate both maps. Codegen picks the map via `getStructVarRole(varName)`.
   */
  _vertexStructVarMap: Record<string, ShaderStructRole>;
  _fragmentStructVarMap: Record<string, ShaderStructRole>;

  _passSymbolTable: SymbolTable<SymbolInfo>;
  codeCache = new WeakMap<TreeNode, string>();
  fragmentReturns = new WeakSet<ASTNode.JumpStatement>();

  constructor() {
    this.reset();
  }

  reset(resetAll = true) {
    this.codeCache = new WeakMap();
    this.fragmentReturns = new WeakSet();
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
      // Struct-var bindings are pass-scoped; both stage maps are cleared here and
      // repopulated from `ShaderCoreInfo` before codegen.
      this._vertexStructVarMap = Object.create(null);
      this._fragmentStructVarMap = Object.create(null);
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
  getStructRole(typeLexeme: string): ShaderStructRole | undefined {
    if (this.isAttributeStruct(typeLexeme)) return ShaderStructRole.Attribute;
    if (this.isVaryingStruct(typeLexeme)) return ShaderStructRole.Varying;
    if (this.isMRTStruct(typeLexeme)) return ShaderStructRole.Mrt;
  }

  /** Register a variable in a specific stage as holding a varying/attribute/mrt struct value. */
  registerStructVar(stage: EShaderStage, varName: string, role: ShaderStructRole): void {
    const map = stage === EShaderStage.VERTEX ? this._vertexStructVarMap : this._fragmentStructVarMap;
    map[varName] = role;
  }

  /** Look up the role of a struct-typed variable in the stage currently being generated. */
  getStructVarRole(varName: string): ShaderStructRole | undefined {
    return (this.stage === EShaderStage.VERTEX ? this._vertexStructVarMap : this._fragmentStructVarMap)[varName];
  }

  referenceAttribute(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.attributeList, this._referencedAttributeList);
  }

  referenceVarying(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.varyingList, this._referencedVaryingList);
  }

  referenceMRTProp(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.mrtList, this._referencedMRTList);
  }

  referenceGlobal(ident: string, type: ESymbolType): void {
    if (this._referencedGlobals[ident]) return;

    this._referencedGlobals[ident] = [];

    const lookupSymbol = this._lookupSymbol;
    lookupSymbol.set(ident, type);
    this._passSymbolTable.getSymbols(lookupSymbol, true, this._referencedGlobals[ident]);
  }

  // Track which IO props are actually referenced (drives in/out emission). A missing member is no
  // longer flagged here — that's the parser's struct-field check (UndeclaredStructMember).
  private _referenceProp(name: string, list: StructProp[], refList: Record<string, StructProp[]>): void {
    if (refList[name]) return;
    refList[name] = list.filter((item) => item.ident.lexeme === name);
  }
}
