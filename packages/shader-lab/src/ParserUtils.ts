import { ETokenType, GalaceanDataType, TypeAny } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { ASTNode, TreeNode } from "./parser/AST";
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

  /**
   * Parse a function-macro parameter-list lexeme (`"(a, b, c)"`) into its parameter
   * names. An empty list `"()"` yields `[]`. Leading/trailing whitespace around each
   * name is trimmed. Empty entries from consecutive commas are filtered out.
   */
  static parseMacroParamList(lexeme: string): string[] {
    const inner = lexeme.replace(/^\s*\(\s*|\s*\)\s*$/g, "");
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Return the lexeme of `expr` when it is (transitively) a single bare identifier
   * wrapped in primary/postfix expression nodes, e.g. `o` → "o". Returns null for
   * compound expressions (`o.x`, `foo(..)`, `arr[0]`, …). Useful for callers that
   * want to apply a substitution rule only at the root of an expression, never on
   * swizzles or nested member access.
   */
  static extractDirectIdentLexeme(expr: TreeNode): string | null {
    let cur: TreeNode | Token = expr;
    while (cur) {
      if (cur instanceof ASTNode.PostfixExpression) {
        if (cur.children.length !== 1) return null;
        cur = cur.children[0];
        continue;
      }
      if (cur instanceof ASTNode.PrimaryExpression) {
        if (cur.children.length !== 1) return null;
        cur = cur.children[0];
        continue;
      }
      if (cur instanceof ASTNode.VariableIdentifier) {
        const child = cur.children[0];
        if (child instanceof Token) return child.lexeme;
        return null;
      }
      return null;
    }
    return null;
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
