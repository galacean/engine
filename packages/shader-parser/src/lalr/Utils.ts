import { ETokenType, ShaderRange } from "../common";
import { ASTNode, TreeNode } from "../parser/AST";
import { TranslationRule } from "../parser/SemanticAnalyzer";
import { NoneTerminal, GrammarSymbol } from "../parser/GrammarSymbol";
import Production from "./Production";
import { ActionInfo, EAction } from "./types";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ClearableObjectPool, type IPoolElement } from "@galacean/engine-core";
import { NodeChild } from "../parser/types";
import { Keyword } from "../common/enums/Keyword";

type ASTNodePool = ClearableObjectPool<
  { set: (loc: ShaderRange, children: NodeChild[], trackAnalysis?: boolean) => void } & IPoolElement & TreeNode
>;

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
    astTypePool?: ASTNodePool
  ) {
    return this._createProductionWithOptions(goal, options, astTypePool, astTypePool);
  }

  /**
   * Creates productions whose typed AST nodes are needed only by analyzer diagnostics.
   * @param goal - Production goal symbol.
   * @param options - Alternative right-hand sides.
   * @param analyzerPool - Typed node pool used by analyzer parses.
   * @returns Grammar productions with mode-specific translation rules.
   * @internal
   */
  static createAnalyzerProductionWithOptions(
    goal: NoneTerminal,
    options: GrammarSymbol[][],
    analyzerPool: ASTNodePool
  ) {
    return this._createProductionWithOptions(goal, options, undefined, analyzerPool);
  }

  private static _createProductionWithOptions(
    goal: NoneTerminal,
    options: GrammarSymbol[][],
    runtimePool?: ASTNodePool,
    analyzerPool?: ASTNodePool
  ) {
    const runtimeResolvedPool = runtimePool ?? ASTNode.TrivialNode.pool;
    const analyzerResolvedPool = analyzerPool ?? ASTNode.TrivialNode.pool;
    const ret: [GrammarSymbol[], TranslationRule | undefined][] = [];
    for (const opt of options) {
      // Single-`NonTerminal` RHS + no typed class → this production reduces
      // to a semantic-empty `TrivialNode` wrapper. Elide it at reduce time
      // by pushing the child directly onto the semantic stack. Safe because
      // the parser's GOTO runs off `reduceProduction.goal`, not off the node
      // type on the stack. Single-Terminal RHS (e.g. `unary_operator → PLUS`)
      // isn't eligible — a `BaseToken` can't stand in for an AST node.
      const runtimeCanElide = !runtimePool && opt.length === 1 && !GrammarUtils.isTerminal(opt[0]);
      const analyzerCanElide = !analyzerPool && opt.length === 1 && !GrammarUtils.isTerminal(opt[0]);
      ret.push([
        [goal, ...opt],
        function (sa, ...children) {
          if (!children[0]) return;
          const analyzerMode = sa.diagnosticsEnabled;
          const canElide = analyzerMode ? analyzerCanElide : runtimeCanElide;
          if (canElide) {
            sa.semanticStack.push(children[0] as TreeNode);
          } else {
            const start = children[0].location.start;
            const end = children[children.length - 1].location.end;
            const location = ShaderCompilerUtils.createRange(start, end);
            ASTNode.get(analyzerMode ? analyzerResolvedPool : runtimeResolvedPool, sa, location, children);
          }
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

  static printAction(actionInfo: ActionInfo) {
    const production = Production.pool.get(actionInfo.target!);
    return `<Action: ${EAction[actionInfo.action]} -> ${this.printProduction(production)}>`;
  }

  static printProduction(production: Production) {
    const deriv = production.derivation.map((gs) => GrammarUtils.toString(gs)).join("|");
    return `${NoneTerminal[production.goal]} :=> ${deriv}`;
  }
}
