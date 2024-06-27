import { ETokenType } from "../common";
import { ENonTerminal, GrammarSymbol } from "./GrammarSymbol";
import Production from "../lalr/Production";

export default class Grammar {
  readonly productions: Production[];

  readonly startSymbol: ENonTerminal;

  static create(start: ENonTerminal, productions: GrammarSymbol[][]) {
    const _ps = productions.map((gsl) => {
      return new Production(<ENonTerminal>gsl[0], gsl.slice(1));
    });
    return new Grammar(start, _ps);
  }

  constructor(start: ENonTerminal, productions: Production[]) {
    this.startSymbol = start;
    productions.unshift(new Production(ENonTerminal.START, [start]));
    this.productions = productions;
  }

  getProductionList(nonTerminal: ENonTerminal) {
    return this.productions.filter((item) => item.goal === nonTerminal);
  }

  isNullableNT(NT: ENonTerminal) {
    return this.productions.find((item) => item.goal === NT && item.derivation[0] === ETokenType.EPSILON);
  }

  getProductionByID(pid: number) {
    return Production.pool.get(pid);
  }
}
