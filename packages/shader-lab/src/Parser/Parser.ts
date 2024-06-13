import Grammar from "./Grammar";
import { ENonTerminal, GrammarSymbol } from "./GrammarSymbol";
import Token from "../Token";
import { ETokenType } from "../common";
import { EAction, StateActionTable, StateGotoTable } from "../LALR/types";
import { ASTNode, TreeNode } from "./AST";
import SematicAnalyzer from "./SemanticAnalyzer";
import { TraceStackItem } from "./types";
import { addTranslationRule, createGrammar } from "../LALR/cfg";
import { LALR1 } from "../LALR";
import { ParserUtils } from "../Utils";
import { Logger } from "../Logger";
import { ParseError } from "../Error";

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

  static create() {
    const grammar = createGrammar();
    const generator = new LALR1(grammar);
    generator.generate();
    const parser = new Parser(generator.actionTable, generator.gotoTable, grammar);
    addTranslationRule(parser.sematicAnalyzer);
    return parser;
  }

  private constructor(actionTable: StateActionTable, gotoTable: StateGotoTable, grammar: Grammar) {
    this.actionTable = actionTable;
    this.gotoTable = gotoTable;
    this.grammar = grammar;
    this.sematicAnalyzer = new SematicAnalyzer();
  }

  parse(tokens: Generator<Token, Token>) {
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
        this.printStack(nextToken.value);
      } else if (actionInfo?.action === EAction.Accept) {
        this.logger.debug(`Accept! State automata run ${loopCount} times! cost time ${performance.now() - start}ms`);
        sematicAnalyzer.acceptRule?.(sematicAnalyzer);
        return sematicAnalyzer.semanticStack.pop() as ASTNode.GLShaderProgram;
      } else if (actionInfo?.action === EAction.Reduce) {
        const target = actionInfo.target!;
        const reduceProduction = this.grammar.getProductionByID(target)!;
        this.logger.log(`Reduce: ${reduceProduction.toString()}`);
        const translationRule = sematicAnalyzer.getTranslationRule(reduceProduction.id);

        const values: (TreeNode | Token)[] = [];

        for (let i = reduceProduction.derivation.length - 1; i >= 0; i--) {
          if (reduceProduction.derivation[i] === ETokenType.EPSILON) continue;
          traceBackStack.pop();
          const token = traceBackStack.pop();
          if (token instanceof Token) {
            values.unshift(token);
          } else {
            const astNode = sematicAnalyzer.semanticStack.pop()!;
            values.unshift(astNode);
          }
        }
        this.printStack(token);
        translationRule?.(sematicAnalyzer, ...values);

        const gotoTable = this.stateGotoTable;
        traceBackStack.push(reduceProduction.goal);

        const nextState = gotoTable?.get(reduceProduction.goal)!;
        traceBackStack.push(nextState);
        this.printStack(token);
        continue;
      } else {
        this.logger.errorLoc(token.location, `parse error token ${token}`);
        throw new ParseError(`invalid action table by token ${token.lexeme}`, token.location);
      }
    }
  }

  printStack(nextToken: Token) {
    if (!Logger.enabled) return;

    let str = "";
    for (let i = 0; i < this.traceBackStack.length - 1; i++) {
      const state = <ENonTerminal>this.traceBackStack[i++];
      const token = this.traceBackStack[i];
      str += `State${state} - ${(<Token>token).lexeme ?? ParserUtils.toString(token as GrammarSymbol)}; `;
    }
    str += `State${this.traceBackStack[this.traceBackStack.length - 1]} --- ${nextToken.lexeme}`;
    this.logger.log(str);
  }
}
