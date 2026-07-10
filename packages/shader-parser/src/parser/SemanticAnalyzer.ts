import { ShaderRange } from "../common";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { GSError, GSErrorName } from "../GSError";
import type { DiagnosticType } from "../DiagnosticType";
import { SymbolInfo } from "../parser/symbolTable";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import { NodeChild } from "./types";

import { MacroDefineList } from "../Preprocessor";

export type TranslationRule<T = any> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * @internal
 * The semantic analyzer of `ShaderCompiler` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SemanticAnalyzer {
  /**
   * @internal
   */
  static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);

  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTableStack: SymbolTableStack<SymbolInfo, SymbolTable<SymbolInfo>> = new SymbolTableStack();
  curFunctionInfo: {
    header?: ASTNode.FunctionDeclarator;
    returnStatement?: ASTNode.JumpStatement;
  } = {};
  private _shaderData = new ShaderData();
  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  private _macroDefineList: MacroDefineList;

  readonly errors: Error[] = [];

  /**
   * Names for which an `AmbiguousMacroBranchType` warning has already been emitted this pass.
   * A single symbol declared with divergent types (e.g. `renderer_BlendShapeWeights` with 4 array
   * sizes) has dozens of reference sites in shipping code; without dedupe the editor UI would
   * flood with identical warnings. Report-once-per-pass keeps the signal at one row per divergent
   * symbol. Reset in `reset()`.
   */
  readonly _ambiguousReported = new Set<string>();

  get shaderData() {
    return this._shaderData;
  }

  get macroDefineList(): MacroDefineList {
    return this._macroDefineList;
  }

  constructor() {
    this.pushScope();
  }

  reset(macroDefineList: MacroDefineList) {
    this._macroDefineList = macroDefineList;
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this.symbolTableStack.clear();
    this.pushScope();
    this.errors.length = 0;
    this._ambiguousReported.clear();
  }

  pushScope() {
    this.symbolTableStack.pushScope(new SymbolTable<SymbolInfo>());
  }

  popScope() {
    return this.symbolTableStack.popScope();
  }

  addTranslationRule(pid: number, rule: TranslationRule) {
    this._translationRuleTable.set(pid, rule);
  }

  getTranslationRule(pid: number) {
    return this._translationRuleTable.get(pid);
  }

  reportError(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    this.errors.push(
      new GSError(GSErrorName.CompilationError, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  reportWarning(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    this.errors.push(
      new GSError(GSErrorName.CompilationWarn, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }
}
