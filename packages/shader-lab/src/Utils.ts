import { ENonTerminal, GrammarSymbol } from "./Parser/GrammarSymbol";
import Token from "./Token";
import { EKeyword, ETokenType } from "./common";
import { TreeNode } from "./Parser/AST";
import { GalaceanDataType } from "./Parser/types";

export class ParserUtils {
  static unwrapNodeByType<T = TreeNode>(node: TreeNode, type: ENonTerminal): T | undefined {
    const child = node.children[0];
    if (child instanceof Token) return;
    if (child.nt === type) return child as T;
    return ParserUtils.unwrapNodeByType(child, type);
  }

  // #if _DEVELOPMENT
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
}
