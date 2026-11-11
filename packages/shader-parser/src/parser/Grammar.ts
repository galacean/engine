import { ETokenType } from "../common";
import { NoneTerminal, GrammarSymbol } from "./GrammarSymbol";
import Production from "../lalr/Production";

export class Grammar {
  readonly productions: Production[];

  readonly startSymbol: NoneTerminal;

  static create(start: NoneTerminal, productions: GrammarSymbol[][]) {
    const _ps = productions.map((gsl) => {
      return new Production(<NoneTerminal>gsl[0], gsl.slice(1));
    });
    return new Grammar(start, _ps);
  }

  constructor(start: NoneTerminal, productions: Production[]) {
    this.startSymbol = start;
    productions.unshift(new Production(NoneTerminal.START, [start]));
    this.productions = productions;
  }

  getProductionList(nonTerminal: NoneTerminal) {
    return this.productions.filter((item) => item.goal === nonTerminal);
  }

  isNullableNT(NT: NoneTerminal) {
    return this.productions.find((item) => item.goal === NT && item.derivation[0] === ETokenType.EPSILON);
  }

  getProductionByID(pid: number) {
    return Production.pool.get(pid);
  }
}
