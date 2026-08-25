import { ETokenType } from "../common";
import { BaseToken } from "../common/BaseToken";
import type { BranchSemantics } from "../common/BranchSemantics";
import { Keyword } from "../common/enums/Keyword";
import { GSErrorName } from "../GSError";
import { LALR1 } from "../lalr";
import { addTranslationRule, createGrammar } from "../lalr/CFG";
import { EAction, StateActionTable, StateGotoTable } from "../lalr/types";
import { MacroDefineList } from "../Preprocessor";
import { ParserUtils } from "../ParserUtils";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ASTNode, TreeNode } from "./AST";
import { Grammar } from "./Grammar";
import { NoneTerminal } from "./GrammarSymbol";
import SemanticAnalyzer from "./SemanticAnalyzer";
import type { SemanticDiagnostics } from "./SemanticDiagnostics";
import { ESymbolType, SymbolInfo } from "./symbolTable";
import { TraceStackItem } from "./types";
import type { ParserObjectPool } from "../ParserObjectPool";
import type { ShaderSourceMapSegment } from "../ir";

/**
 * Parses shader tokens and performs the parser-owned semantic pass.
 * @internal
 */
export class ShaderTargetParser {
  readonly actionTable: StateActionTable;
  readonly gotoTable: StateGotoTable;
  readonly grammar: Grammar;
  readonly semanticAnalyzer: SemanticAnalyzer;
  readonly blockingErrors: Error[] = [];
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

  /**
   * Gets semantic errors collected for the current parse.
   * @returns Mutable parser-owned error storage.
   * @internal
   */
  get errors() {
    return this.semanticAnalyzer.errors;
  }

  private static _tables?: {
    readonly actionTable: StateActionTable;
    readonly gotoTable: StateGotoTable;
    readonly grammar: Grammar;
  };

  /**
   * Creates a parser that reuses the immutable generated grammar tables.
   * @param branchSemantics - Optional analyzer branch-proof implementation.
   * @param semanticDiagnostics - Optional semantic diagnostic factory.
   * @param source - Source attached to parser errors.
   * @param objectPool - Optional high-water object pool for synchronous compilation.
   * @param semanticErrorsBlockCodegen - Whether semantic errors enter the backend admission gate.
   * @param authoringAnalysisEnabled - Whether analyzer-only semantic facts are collected.
   * @returns Configured shader target parser.
   */
  static create(
    branchSemantics?: BranchSemantics,
    semanticDiagnostics?: SemanticDiagnostics,
    source?: string,
    objectPool?: ParserObjectPool,
    semanticErrorsBlockCodegen = false,
    authoringAnalysisEnabled = semanticDiagnostics !== undefined
  ): ShaderTargetParser {
    let tables = this._tables;
    if (!tables) {
      const grammar = createGrammar();
      const generator = new LALR1(grammar);
      generator.generate();
      tables = this._tables = {
        actionTable: generator.actionTable,
        gotoTable: generator.gotoTable,
        grammar
      };
    }

    const parser = new ShaderTargetParser(
      tables.actionTable,
      tables.gotoTable,
      tables.grammar,
      branchSemantics,
      semanticDiagnostics,
      source,
      objectPool,
      semanticErrorsBlockCodegen,
      authoringAnalysisEnabled
    );
    addTranslationRule(parser.semanticAnalyzer);
    return parser;
  }

  private constructor(
    actionTable: StateActionTable,
    gotoTable: StateGotoTable,
    grammar: Grammar,
    branchSemantics?: BranchSemantics,
    semanticDiagnostics?: SemanticDiagnostics,
    private _source?: string,
    objectPool?: ParserObjectPool,
    readonly semanticErrorsBlockCodegen = false,
    authoringAnalysisEnabled = semanticDiagnostics !== undefined
  ) {
    this.actionTable = actionTable;
    this.gotoTable = gotoTable;
    this.grammar = grammar;
    this.semanticAnalyzer = new SemanticAnalyzer(
      branchSemantics,
      semanticDiagnostics,
      objectPool,
      authoringAnalysisEnabled
    );
  }

  /**
   * Replaces the source used to format errors for a reused parser.
   * @param source - Expanded source for the next parse.
   * @internal
   */
  setSource(source: string): void {
    this._source = source;
    this.semanticAnalyzer.semanticDiagnostics?.setSource?.(source);
  }

  /**
   * Replaces the generated-source provenance used for ShaderLab inheritance-aware declarations.
   * @param sourceMap - Ordered source segments for the next parse.
   * @internal
   */
  setSourceMap(sourceMap: readonly ShaderSourceMapSegment[]): void {
    this.semanticAnalyzer.setSourceMap(sourceMap);
  }

  /**
   * Parses one token stream and performs parser-owned semantic analysis.
   * @param tokens - Token stream ending with an explicit EOF token.
   * @param macroDefineList - Visible macro definitions collected by the lexer.
   * @returns Parsed program, or `null` after a blocking syntax failure.
   */
  parse(tokens: Generator<BaseToken, BaseToken>, macroDefineList: MacroDefineList): ASTNode.GLShaderProgram | null {
    this.semanticAnalyzer.reset(macroDefineList);
    this.blockingErrors.length = 0;
    const { _traceBackStack: traceBackStack, semanticAnalyzer } = this;
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
        // it knows that from its own children)
        if (token.type === Keyword.MACRO_DEFINE_PARAMS) {
          semanticAnalyzer.pushScope();
          for (const p of ParserUtils.parseMacroParamList(token.lexeme)) {
            semanticAnalyzer.symbolTableStack.insert(new SymbolInfo(p, ESymbolType.VAR));
          }
        }
        if (semanticAnalyzer.semanticDiagnostics && (token.type === Keyword.FOR || token.type === Keyword.WHILE)) {
          semanticAnalyzer.pushScope();
        }
        nextToken = tokens.next();
      } else if (actionInfo?.action === EAction.Accept) {
        semanticAnalyzer.acceptRule?.(semanticAnalyzer);
        const program = semanticAnalyzer.semanticStack.pop() as ASTNode.GLShaderProgram;
        return program;
      } else if (actionInfo?.action === EAction.Reduce) {
        const target = actionInfo.target!;
        const reduceProduction = this.grammar.getProductionByID(target)!;
        const translationRule = semanticAnalyzer.getTranslationRule(reduceProduction.id);

        const values: (TreeNode | BaseToken)[] = [];

        for (let i = reduceProduction.derivation.length - 1; i >= 0; i--) {
          if (reduceProduction.derivation[i] === ETokenType.EPSILON) continue;
          traceBackStack.pop();
          const token = traceBackStack.pop();
          if (token instanceof BaseToken) {
            values.unshift(token);
          } else {
            const astNode = semanticAnalyzer.semanticStack.pop()!;
            values.unshift(astNode);
          }
        }
        translationRule?.(semanticAnalyzer, ...values);
        // Runtime grammar elides the analyzer-only IterationStatement node, so compiler semantic
        // validation closes the scope at reduction instead of relying on that node's callback
        if (
          semanticAnalyzer.semanticDiagnostics &&
          !semanticAnalyzer.diagnosticsEnabled &&
          reduceProduction.goal === NoneTerminal.iteration_statement
        ) {
          semanticAnalyzer.popScope();
        }

        const gotoTable = this.stateGotoTable;
        traceBackStack.push(reduceProduction.goal);

        const nextState = gotoTable!.get(reduceProduction.goal)!;
        traceBackStack.push(nextState);
        continue;
      } else {
        const error = ShaderCompilerUtils.createGSError(
          `Unexpected token ${token.lexeme}`,
          GSErrorName.CompilationError,
          this._source,
          token.location
        );
        this.semanticAnalyzer.errors.push(error);
        this.blockingErrors.push(error);
        return null;
      }
    }
  }
}
