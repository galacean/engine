import { ETokenType } from "../common";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { GSErrorName } from "../GSError";
import type { GSError } from "../GSError";
import { LALR1 } from "../lalr";
import { addTranslationRule, createGrammar } from "../lalr/CFG";
import { EAction, StateActionTable, StateGotoTable } from "../lalr/types";
import { MacroDefineList } from "../Preprocessor";
import { ParserUtils } from "../ParserUtils";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ASTNode, TreeNode } from "./AST";
import { Grammar } from "./Grammar";
import SematicAnalyzer from "./SemanticAnalyzer";
import { ESymbolType, SymbolInfo } from "./symbolTable";
import { TraceStackItem } from "./types";

/**
 * The syntax parser and sematic analyzer of `ShaderCompiler` compiler
 */
export class ShaderTargetParser {
  readonly actionTable: StateActionTable;
  readonly gotoTable: StateGotoTable;
  readonly grammar: Grammar;
  readonly sematicAnalyzer: SematicAnalyzer;
  private _traceBackStack: (TraceStackItem | number)[] = [];

  private get curState() {
    return this._traceBackStack[this._traceBackStack.length - 1] as number;
  }
  private get stateActionTable() {
    return this.actionTable.get(this.curState)!;
  }
  private get stateGotoTable() {
    return this.gotoTable.get(this.curState);
  }

  /** @internal */
  get errors() {
    return this.sematicAnalyzer.errors;
  }

  static _singleton: ShaderTargetParser;

  static create() {
    if (!this._singleton) {
      const grammar = createGrammar();
      const generator = new LALR1(grammar);
      generator.generate();
      this._singleton = new ShaderTargetParser(generator.actionTable, generator.gotoTable, grammar);
      addTranslationRule(this._singleton.sematicAnalyzer);
    }

    return this._singleton;
  }

  private constructor(actionTable: StateActionTable, gotoTable: StateGotoTable, grammar: Grammar) {
    this.actionTable = actionTable;
    this.gotoTable = gotoTable;
    this.grammar = grammar;
    this.sematicAnalyzer = new SematicAnalyzer();
  }

  parse(
    tokens: Generator<BaseToken, BaseToken>,
    macroDefineList: MacroDefineList,
    diagnosticsEnabled = false
  ): ASTNode.GLShaderProgram | null {
    this.sematicAnalyzer.reset(macroDefineList, diagnosticsEnabled);
    const { _traceBackStack: traceBackStack, sematicAnalyzer } = this;
    // A prior parse that bailed early (syntax error -> `return null` below) leaves this working
    // stack dirty; the parser is a shared singleton, so start every parse from a clean stack or a
    // failed compile corrupts the next one.
    traceBackStack.length = 0;
    traceBackStack.push(0);

    let nextToken = tokens.next();
    while (true) {
      const token = nextToken.value;

      const actionInfo = this.stateActionTable.get(token.type);
      if (actionInfo?.action === EAction.Shift) {
        traceBackStack.push(token, actionInfo.target!);
        // Function-like `#define` form params live in a scope wrapping the
        // value AST, mirroring how `function_header` opens a scope for GLSL
        // function parameters. Push on shift of `MACRO_DEFINE_PARAMS`; the
        // matching `popScope` runs when `MacroDefine.semanticAnalyze` reduces
        // the production (only the function-like alternative needs it, and
        // it knows that from its own children).
        if (token.type === Keyword.MACRO_DEFINE_PARAMS) {
          sematicAnalyzer.pushScope();
          for (const p of ParserUtils.parseMacroParamList(token.lexeme)) {
            sematicAnalyzer.symbolTableStack.insert(new SymbolInfo(p, ESymbolType.VAR));
          }
        }
        // #if _VERBOSE
        if (diagnosticsEnabled && (token.type === Keyword.FOR || token.type === Keyword.WHILE)) {
          sematicAnalyzer.pushScope();
        }
        // #endif
        nextToken = tokens.next();
      } else if (actionInfo?.action === EAction.Accept) {
        sematicAnalyzer.acceptRule?.(sematicAnalyzer);
        const program = sematicAnalyzer.semanticStack.pop() as ASTNode.GLShaderProgram;
        return program;
      } else if (actionInfo?.action === EAction.Reduce) {
        const target = actionInfo.target!;
        const reduceProduction = this.grammar.getProductionByID(target)!;
        const translationRule = sematicAnalyzer.getTranslationRule(reduceProduction.id);

        const values: (TreeNode | BaseToken)[] = [];

        for (let i = reduceProduction.derivation.length - 1; i >= 0; i--) {
          if (reduceProduction.derivation[i] === ETokenType.EPSILON) continue;
          traceBackStack.pop();
          const token = traceBackStack.pop();
          if (token instanceof BaseToken) {
            values.unshift(token);
          } else {
            const astNode = sematicAnalyzer.semanticStack.pop()!;
            values.unshift(astNode);
          }
        }
        translationRule?.(sematicAnalyzer, ...values);

        const gotoTable = this.stateGotoTable;
        traceBackStack.push(reduceProduction.goal);

        const nextState = gotoTable?.get(reduceProduction.goal)!;
        traceBackStack.push(nextState);
        continue;
      } else {
        const error = ShaderCompilerUtils.createGSError(
          `Unexpected token ${token.lexeme}`,
          GSErrorName.CompilationError,
          ShaderCompilerUtils.processingPassText,
          token.location
        );
        // #if _VERBOSE
        this.sematicAnalyzer.errors.push(<GSError>error);
        // #endif
        return null;
      }
    }
  }
}
