import { ETokenType } from "../common";
import { NoneTerminal, Terminal } from "../parser/GrammarSymbol";
import Production from "./Production";
import GrammarUtils from "./Utils";

export default class StateItem {
  static _id = 0;

  readonly production: Production;
  readonly position: number;
  readonly lookaheadSet: Set<Terminal>;
  readonly id: number;

  _needReInfer = true;
  get needReInfer() {
    return this._needReInfer;
  }
  set needReInfer(v: boolean) {
    this._needReInfer = v;
  }

  get curSymbol() {
    return this.production.derivation[this.position];
  }
  get nextSymbol() {
    return this.production.derivation[this.position + 1];
  }

  constructor(production: Production, position: number, lookahead: Iterable<Terminal>) {
    this.production = production;
    this.position = position;
    this.lookaheadSet = new Set();
    for (const la of lookahead) {
      this.lookaheadSet.add(la);
    }
    this.id = StateItem._id++;
  }

  addLookahead(ts: Iterable<Terminal>) {
    for (const t of ts) {
      if (this.lookaheadSet.has(t)) continue;
      this.lookaheadSet.add(t);
      this.needReInfer = true;
    }
  }

  symbolByOffset(offset: number) {
    return this.production.derivation[this.position + offset];
  }

  canReduce() {
    if (this.position > this.production.derivation.length - 1) return true;
    else {
      for (let i = this.position; i < this.production.derivation.length; i++) {
        if (this.production.derivation[i] !== ETokenType.EPSILON) return false;
      }
      return true;
    }
  }

  advance() {
    // #if _VERBOSE
    if (this.canReduce()) throw `Error: advance reduce-able parsing state item`;
    // #endif
    return new StateItem(this.production, this.position + 1, this.lookaheadSet);
  }

  // #if _VERBOSE
  toString() {
    const coreItem = this.production.derivation.map((item) => GrammarUtils.toString(item));
    coreItem[this.position] = "." + (coreItem[this.position] ?? "");

    return `${NoneTerminal[this.production.goal]} :=> ${coreItem.join("|")} ;${Array.from(this.lookaheadSet)
      .map((item) => GrammarUtils.toString(item))
      .join("/")}`;
  }
  // #endif
}
