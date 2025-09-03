import { ETokenType, ShaderRange } from "../common";
import { ASTNode, TreeNode } from "../parser/AST";
import { TranslationRule } from "../parser/SemanticAnalyzer";
import { NoneTerminal, GrammarSymbol } from "../parser/GrammarSymbol";
import Production from "./Production";
import { ActionInfo, EAction } from "./types";
import { ShaderLab } from "../ShaderLab";
import { ClearableObjectPool, IPoolElement } from "@galacean/engine";
import { NodeChild } from "../parser/types";
import { Keyword } from "../common/enums/Keyword";

export default class GrammarUtils {
  static isTerminal(sm: GrammarSymbol) {
    return sm < NoneTerminal.START;
  }

  static toString(sm: GrammarSymbol) {
    if (this.isTerminal(sm)) {
      return ETokenType[sm] ?? Keyword[sm];
    }
    return NoneTerminal[sm];
  }

  static createProductionWithOptions(
    goal: NoneTerminal,
    options: GrammarSymbol[][],
    /** the ast node */
    astTypePool?: ClearableObjectPool<
      { set: (loc: ShaderRange, children: NodeChild[]) => void } & IPoolElement & TreeNode
    >
  ) {
    const ret: [GrammarSymbol[], TranslationRule | undefined][] = [];
    for (const opt of options) {
      ret.push([
        [goal, ...opt],
        function (sa, ...children) {
          if (!children[0]) return;
          const start = children[0].location.start;
          const end = children[children.length - 1].location.end;
          const location = ShaderLab.createRange(start, end);
          ASTNode.get(astTypePool ?? ASTNode.TrivialNode.pool, sa, location, children);
        }
      ]);
    }
    return ret;
  }

  static addMapSetItem<K, T>(map: Map<K, Set<T>>, k: K, v: T) {
    const set = map.get(k) ?? new Set();
    set.add(v);
    map.set(k, set);
  }

  static isSubSet<T>(sa: Set<T>, sb: Set<T>) {
    for (const item of sa) {
      if (!sb.has(item)) return false;
    }
    return true;
  }

  static isActionEqual(a: ActionInfo, b: ActionInfo) {
    return a.action === b.action && a.target === b.target;
  }

  // #if _VERBOSE
  static printAction(actionInfo: ActionInfo) {
    const production = Production.pool.get(actionInfo.target!);
    return `<Action: ${EAction[actionInfo.action]} -> ${this.printProduction(production)}>`;
  }

  static printProduction(production: Production) {
    const deriv = production.derivation.map((gs) => GrammarUtils.toString(gs)).join("|");
    return `${NoneTerminal[production.goal]} :=> ${deriv}`;
  }
  // #endif
}
