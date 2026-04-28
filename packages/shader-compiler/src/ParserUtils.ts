import { ETokenType, GalaceanDataType, TypeAny } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { TreeNode } from "./parser/AST";
import { GrammarSymbol, NoneTerminal } from "./parser/GrammarSymbol";
// #if _VERBOSE
import { Keyword } from "./common/enums/Keyword";
import State from "./lalr/State";
// #endif

export class ParserUtils {
  static unwrapNodeByType<T = TreeNode>(node: TreeNode, type: NoneTerminal): T | undefined {
    const child = node.children[0];
    if (child instanceof Token) return;
    if (child.nt === type) return child as T;
    return ParserUtils.unwrapNodeByType(child, type);
  }

  // #if _VERBOSE
  /**
   * Check if type `tb` is compatible with type `ta`.
   */
  static typeCompatible(ta: GalaceanDataType, tb: GalaceanDataType | undefined) {
    if (tb == undefined || tb === TypeAny) return true;
    if (ta === Keyword.INT) {
      return ta === tb || tb === Keyword.UINT;
    }
    return ta === tb;
  }

  static toString(sm: GrammarSymbol) {
    if (this.isTerminal(sm)) {
      return ETokenType[sm] ?? Keyword[sm];
    }
    return NoneTerminal[sm];
  }
  // #endif

  static isTerminal(sm: GrammarSymbol) {
    return sm < NoneTerminal.START;
  }

  /**
   * @internal
   */
  // #if _VERBOSE
  static printStatePool(logPath: string) {
    let output = "";

    console.log("========== Parser Pool ==========");

    let count = 0;
    for (const state of State.pool.values()) {
      count++;
      let tmp = "";
      tmp += `${state.id}: \n`.padEnd(4);
      for (const psItem of state.items) {
        tmp += "     " + psItem.toString() + "\n";
      }
      output += tmp;
    }

    console.log("state count:", count);
    console.log(output);
  }
  // #endif
}
