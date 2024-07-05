import Grammar from "./Grammar";
import { ENonTerminal, GrammarSymbol } from "./GrammarSymbol";
import { BaseToken } from "../common/BaseToken";
import { ETokenType } from "../common";
import { EAction, StateActionTable, StateGotoTable } from "../lalr/types";
import { ASTNode, TreeNode } from "./AST";
import SematicAnalyzer from "./SemanticAnalyzer";
import { TraceStackItem } from "./types";
import { addTranslationRule, createGrammar } from "../lalr/CFG";
import { LALR1 } from "../lalr";
import { ParserUtils } from "../Utils";
import { Logger } from "../Logger";

/**
 * The syntax parser and sematic analyzer of `ShaderLab` compiler
 */
export default class Parser {
  readonly actionTable: StateActionTable;
  readonly gotoTable: StateGotoTable;
  readonly grammar: Grammar;
  readonly sematicAnalyzer: SematicAnalyzer;
  private traceBackStack: (TraceStackItem | number)[] = [];
  logger = new Logger("Parser");

  private get curState() {
    return this.traceBackStack[this.traceBackStack.length - 1] as number;
  }
  private get stateActionTable() {
    return this.actionTable.get(this.curState)!;
  }
  private get stateGotoTable() {
    return this.gotoTable.get(this.curState);
  }

  static _singleton: Parser;

  static create() {
    if (!this._singleton) {
      const grammar = createGrammar();
      const generator = new LALR1(grammar);
      generator.generate();
      this._singleton = new Parser(generator.actionTable, generator.gotoTable, grammar);
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

  parse(tokens: Generator<BaseToken, BaseToken>) {
    this.sematicAnalyzer.reset();
    const start = performance.now();
    const { traceBackStack, sematicAnalyzer } = this;
    traceBackStack.push(0);

    let nextToken = tokens.next();
    let loopCount = 0;
    while (true) {
      loopCount += 1;
      const token = nextToken.value;

      const actionInfo = this.stateActionTable.get(token.type);
      if (actionInfo?.action === EAction.Shift) {
        traceBackStack.push(token, actionInfo.target!);
        nextToken = tokens.next();
        // #if _DEVELOPMENT
        this.printStack(nextToken.value);
        // #endif
      } else if (actionInfo?.action === EAction.Accept) {
        // this.logger.debug(`Accept! State automata run ${loopCount} times! cost time ${performance.now() - start}ms`);
        console.log(`Accept! State automata run ${loopCount} times! cost time ${performance.now() - start}ms`);
        sematicAnalyzer.acceptRule?.(sematicAnalyzer);
        return sematicAnalyzer.semanticStack.pop() as ASTNode.GLShaderProgram;
      } else if (actionInfo?.action === EAction.Reduce) {
        const target = actionInfo.target!;
        const reduceProduction = this.grammar.getProductionByID(target)!;
        // #if _DEVELOPMENT
        this.logger.log(`Reduce: ${reduceProduction.toString()}`);
        // #endif
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
        // #if _DEVELOPMENT
        this.printStack(token);
        // #endif
        translationRule?.(sematicAnalyzer, ...values);

        const gotoTable = this.stateGotoTable;
        traceBackStack.push(reduceProduction.goal);

        const nextState = gotoTable?.get(reduceProduction.goal)!;
        traceBackStack.push(nextState);
        // #if _DEVELOPMENT
        this.printStack(token);
        // #endif
        continue;
      } else {
        this.logger.errorLoc(token.location, `parse error token ${token.lexeme}`);
        // #if _DEVELOPMENT
        throw `invalid action table by token ${token.lexeme}, ${token.location.start.line}, ${token.location.start.column}`;
        // #endif
      }
    }
  }

  // #if _DEVELOPMENT
  private printStack(nextToken: BaseToken) {
    if (!Logger.enabled) return;

    let str = "";
    for (let i = 0; i < this.traceBackStack.length - 1; i++) {
      const state = <ENonTerminal>this.traceBackStack[i++];
      const token = this.traceBackStack[i];
      str += `State${state} - ${(<BaseToken>token).lexeme ?? ParserUtils.toString(token as GrammarSymbol)}; `;
    }
    str += `State${this.traceBackStack[this.traceBackStack.length - 1]} --- ${nextToken.lexeme}`;
    this.logger.log(str);
  }
  // #endif
}
