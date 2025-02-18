import { NoneTerminal, GrammarSymbol } from "../parser/GrammarSymbol";

export default class Production {
  private static _id = 0;
  static pool: Map<number, Production> = new Map();

  readonly goal: NoneTerminal;
  readonly derivation: GrammarSymbol[];
  readonly id: number;

  constructor(goal: NoneTerminal, derivation: GrammarSymbol[]) {
    this.goal = goal;
    this.derivation = derivation;
    this.id = Production._id++;
    Production.pool.set(this.id, this);
  }
}
