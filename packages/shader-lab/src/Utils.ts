import { ENonTerminal, GrammarSymbol } from "./parser/GrammarSymbol";
import { BaseToken as Token } from "./common/BaseToken";
import { EKeyword, ETokenType, GalaceanDataType } from "./common";
import { TreeNode } from "./parser/AST";
// #if _EDITOR
import State from "./lalr/State";
// #endif

export class ParserUtils {
  static unwrapNodeByType<T = TreeNode>(node: TreeNode, type: ENonTerminal): T | undefined {
    const child = node.children[0];
    if (child instanceof Token) return;
    if (child.nt === type) return child as T;
    return ParserUtils.unwrapNodeByType(child, type);
  }

  // #if _EDITOR
  /**
   * Check if type `tb` is compatible with type `ta`.
   */
  static typeCompatible(ta: GalaceanDataType, tb: GalaceanDataType | undefined) {
    if (tb == undefined) return true;
    if (ta === EKeyword.INT) {
      return ta === tb || tb === EKeyword.UINT;
    }
    return ta === tb;
  }

  static toString(sm: GrammarSymbol) {
    if (this.isTerminal(sm)) {
      return ETokenType[sm] ?? EKeyword[sm];
    }
    return ENonTerminal[sm];
  }
  // #endif

  static isTerminal(sm: GrammarSymbol) {
    return sm < ENonTerminal.START;
  }

  /**
   * @internal
   */
  // #if _EDITOR
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
