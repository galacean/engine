import Grammar from "../parser/Grammar";
import { ENonTerminal, GrammarSymbol, Terminal } from "../parser/GrammarSymbol";
import State from "./State";
import StateItem from "./StateItem";
import GrammarUtils from "./Utils";
import { EKeyword, ETokenType } from "../common";
import Utils from "./Utils";
import { ActionInfo, ActionTable, EAction, GotoTable, StateActionTable, StateGotoTable } from "./types";

export default class LALR1 {
  readonly firstSetMap: Map<ENonTerminal, Set<Terminal>> = new Map();
  readonly followSetMap: Map<ENonTerminal, Set<Terminal>> = new Map();

  readonly actionTable: StateActionTable = new Map();
  readonly gotoTable: StateGotoTable = new Map();
  private grammar: Grammar;

  /** For circle detect */
  private _firstSetNTStack: ENonTerminal[] = [];

  constructor(grammar: Grammar) {
    this.grammar = grammar;
  }

  generate() {
    this.computeFirstSet();
    this.buildStateTable();
  }

  private buildStateTable() {
    const startStateItemCore = [new StateItem(this.grammar.productions[0], 0, [ETokenType.EOF])];
    const startState = State.create(startStateItemCore);
    this._extendState(startState);
  }

  private _extendState(state: State) {
    if (!state.needReInfer) return;
    this.closure(state);
    const newStates = this.inferNextState(state);
    for (const ns of newStates) {
      this._extendState(ns);
    }
  }

  private closure(state: State) {
    for (const core of state.cores) {
      if (!core.canReduce()) {
        this._extendStateItem(state, core);
      }
    }
    state.closured = true;
    return state;
  }

  private _extendStateItem(state: State, item: StateItem) {
    if (GrammarUtils.isTerminal(item.curSymbol)) return;

    const productionList = this.grammar.getProductionList(<ENonTerminal>item.curSymbol);

    if (item.nextSymbol) {
      let newLookaheadSet = new Set<Terminal>();
      let lastFirstSet: Set<Terminal> | undefined;
      let terminalExist = false;
      // when A :=> a.BC, a;  ==》 B :=> .xy, First(Ca)
      // newLookAhead = First(Ca)
      for (let i = 1, nextSymbol = item.symbolByOffset(1); !!nextSymbol; nextSymbol = item.symbolByOffset(++i)) {
        if (GrammarUtils.isTerminal(nextSymbol)) {
          newLookaheadSet.add(<Terminal>nextSymbol);
          terminalExist = true;
          break;
        }
        lastFirstSet = this.firstSetMap.get(<ENonTerminal>nextSymbol)!;
        for (const t of lastFirstSet) {
          newLookaheadSet.add(t);
        }
        if (!lastFirstSet.has(ETokenType.EPSILON)) break;
      }
      if (!terminalExist && lastFirstSet?.has(ETokenType.EPSILON)) {
        for (const t of item.lookaheadSet) {
          newLookaheadSet.add(t);
        }
      }

      for (const production of productionList) {
        const newItem = state.createStateItem(production, 0);
        if (!state.items.has(newItem) || !Utils.isSubSet(newLookaheadSet, newItem.lookaheadSet)) {
          state.items.add(newItem);
          newItem.addLookahead(newLookaheadSet);
          this._extendStateItem(state, newItem);
        }
      }
    } else {
      for (const production of productionList) {
        const newItem = state.createStateItem(production, 0);
        if (!state.items.has(newItem) || !Utils.isSubSet(item.lookaheadSet, newItem.lookaheadSet)) {
          state.items.add(newItem);
          newItem.addLookahead(item.lookaheadSet);
          this._extendStateItem(state, newItem);
        }
      }
    }
  }

  private inferNextState(state: State): Set<State> {
    const coreMap: Map<GrammarSymbol, Set<StateItem>> = new Map();
    const stateActionTable: ActionTable = this.actionTable.get(state.id) ?? new Map();
    const stateGotoTable: GotoTable = this.gotoTable.get(state.id) ?? new Map();

    this.actionTable.set(state.id, stateActionTable);
    this.gotoTable.set(state.id, stateGotoTable);

    for (const stateItem of state.items) {
      if (stateItem.canReduce()) {
        let action: ActionInfo;
        if (stateItem.production.goal !== ENonTerminal.START) {
          action = {
            action: EAction.Reduce,
            target: stateItem.production.id
          };
        } else {
          action = { action: EAction.Accept };
        }

        for (const t of stateItem.lookaheadSet) {
          this.addAction(stateActionTable, t, action);
        }
      } else {
        const nextItem = stateItem.advance();
        Utils.addMapSetItem(coreMap, stateItem.curSymbol, nextItem);
      }

      stateItem.needReInfer = false;
    }

    const newStates = new Set<State>();
    for (const [gs, cores] of coreMap.entries()) {
      const newState = State.create(Array.from(cores));
      if (GrammarUtils.isTerminal(gs)) {
        this.addAction(stateActionTable, <Terminal>gs, {
          action: EAction.Shift,
          target: newState.id
        });
      } else {
        stateGotoTable.set(<ENonTerminal>gs, newState.id);
      }

      newStates.add(newState);
    }

    return newStates;
  }

  /** Resolve shift-reduce/reduce-reduce conflict detect */
  private addAction(table: ActionTable, terminal: Terminal, action: ActionInfo) {
    const exist = table.get(terminal);
    if (exist && !Utils.isActionEqual(exist, action)) {
      // Resolve dangling else ambiguity
      if (terminal === EKeyword.ELSE && exist.action === EAction.Shift && action.action === EAction.Reduce) {
        return;
      } else {
        // #if _DEVELOPMENT
        console.warn(
          `conflict detect: <Terminal ${GrammarUtils.toString(terminal)}>`,
          Utils.printAction(exist),
          " -> ",
          Utils.printAction(action)
        );
        // #endif
      }
    }
    table.set(terminal, action);
  }

  // https://people.cs.pitt.edu/~jmisurda/teaching/cs1622/handouts/cs1622-first_and_follow.pdf
  private computeFirstSet() {
    for (const production of this.grammar.productions.slice(1)) {
      this.computeFirstSetForNT(production.goal);
    }
  }

  private computeFirstSetForNT(NT: ENonTerminal) {
    // circle detect
    const idx = this._firstSetNTStack.findIndex((item) => item === NT);
    if (idx !== -1) {
      const computingFS = this.firstSetMap.get(NT)!;
      const len = this._firstSetNTStack.length;
      for (let i = len - 1; i > idx; i--) {
        const curNT = this._firstSetNTStack[i];
        this.firstSetMap.set(curNT, computingFS);
      }
      return computingFS;
    }
    this._firstSetNTStack.push(NT);

    const productionList = this.grammar.getProductionList(NT);
    const firstSet = new Set<Terminal>();
    this.firstSetMap.set(NT, firstSet);
    if (this.grammar.isNullableNT(NT)) firstSet.add(ETokenType.EPSILON);

    for (const production of productionList) {
      let i = 0;
      for (; i < production.derivation.length; i++) {
        const gs = production.derivation[i];
        if (GrammarUtils.isTerminal(gs)) {
          firstSet.add(<Terminal>gs);
          break;
        }

        const succeedFirstSet = this.computeFirstSetForNT(<ENonTerminal>gs);

        for (const item of succeedFirstSet) {
          if (item !== ETokenType.EPSILON) firstSet.add(item);
        }
        if (!this.grammar.isNullableNT(<ENonTerminal>gs)) break;
      }
      if (i === production.derivation.length) firstSet.add(ETokenType.EPSILON);
    }

    this._firstSetNTStack.pop();
    return firstSet;
  }
}
