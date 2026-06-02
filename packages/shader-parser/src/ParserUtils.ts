import { ETokenType, GalaceanDataType, TypeAny } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { ASTNode, TreeNode } from "./parser/AST";
import { GrammarSymbol, NoneTerminal } from "./parser/GrammarSymbol";
import { Keyword } from "./common/enums/Keyword";
import State from "./lalr/State";

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
   * Walk single-child precedence-chain wrappers down to a `VariableIdentifier`,
   * returning the leaf node (or `undefined` for any compound expression).
   *
   * `allowParens` chooses between two callers' needs:
   *   - `true` — descend through `( expression )` form, so `(v)` resolves to
   *     `v`. Use when the caller substitutes at the expression root
   *     (aliasing, renaming); user-written parens carry no extra meaning.
   *   - `false` — any 3-child `PrimaryExpression` aborts; `(v)` stays
   *     compound. Use when the caller treats the unwrapped node as a single
   *     token (IO-struct arg drop, alias detection); user-written parens
   *     must not collapse.
   */
  static unwrapBareIdentifier(
    node: TreeNode,
    options: { allowParens: boolean }
  ): ASTNode.VariableIdentifier | undefined {
    let cur: TreeNode = node;
    while (true) {
      if (cur instanceof ASTNode.VariableIdentifier) return cur;
      if (options.allowParens && cur instanceof ASTNode.PrimaryExpression && cur.children.length === 3) {
        const inner = cur.children[1];
        if (!(inner instanceof TreeNode)) return undefined;
        cur = inner;
        continue;
      }
      if (cur instanceof ASTNode.ExpressionAstNode && cur.children.length === 1) {
        const child = cur.children[0];
        if (!(child instanceof TreeNode)) return undefined;
        cur = child;
        continue;
      }
      return undefined;
    }
  }

  /**
   * Lexeme variant of `unwrapBareIdentifier({ allowParens: true })` for callers
   * that already work with strings. Returns `null` for compound expressions.
   */
  static extractDirectIdentLexeme(expr: TreeNode): string | null {
    const ident = ParserUtils.unwrapBareIdentifier(expr, { allowParens: true });
    if (!ident) return null;
    const child = ident.children[0];
    return child instanceof Token ? child.lexeme : null;
  }

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

  /**
   * Validate a `.field` access on a vector as a GLSL swizzle. Returns an error message when the
   * access is an invalid swizzle on a known vector type, or `null` when it is valid or the base
   * is not a known vector (struct member / scalar / unresolved — left for other checks).
   */
  static swizzleError(baseType: GalaceanDataType | undefined, swizzle: string): string | null {
    const size = ParserUtils._vectorComponentCount(baseType);
    if (size === 0) return null;
    if (swizzle.length < 1 || swizzle.length > 4) {
      return `Invalid swizzle ".${swizzle}": a vector swizzle selects 1-4 components.`;
    }
    const sets = ["xyzw", "rgba", "stpq"];
    let setIndex = -1;
    for (const ch of swizzle) {
      let matched = false;
      for (let s = 0; s < sets.length; s++) {
        const idx = sets[s].indexOf(ch);
        if (idx === -1) continue;
        if (setIndex === -1) setIndex = s;
        else if (setIndex !== s)
          return `Invalid swizzle ".${swizzle}": components must come from one set (xyzw, rgba, or stpq).`;
        if (idx >= size)
          return `Invalid swizzle ".${swizzle}": component '${ch}' is out of range for a ${size}-component vector.`;
        matched = true;
        break;
      }
      if (!matched) return `Invalid swizzle ".${swizzle}": '${ch}' is not a vector component.`;
    }
    return null;
  }

  /**
   * GLSL ES 3.00 assignability with implicit scalar/vector conversions (spec 4.1.10):
   * `int → uint, float`; `uint → float`; `ivecN → uvecN, vecN`; `uvecN → vecN`. Returns `true`
   * when `source` may be assigned to `target`, or when either side is unknown / a struct (those
   * are skipped — not modeled here). Returns `false` only for a definite type conflict.
   */
  static isAssignable(target: GalaceanDataType | undefined, source: GalaceanDataType | undefined): boolean {
    if (target == undefined || source == undefined || target === TypeAny || source === TypeAny) return true;
    if (typeof target === "string" || typeof source === "string") return true;
    if (target === source) return true;
    switch (source) {
      case Keyword.INT:
        return target === Keyword.UINT || target === Keyword.FLOAT;
      case Keyword.UINT:
        return target === Keyword.FLOAT;
      case Keyword.IVEC2:
        return target === Keyword.UVEC2 || target === Keyword.VEC2;
      case Keyword.IVEC3:
        return target === Keyword.UVEC3 || target === Keyword.VEC3;
      case Keyword.IVEC4:
        return target === Keyword.UVEC4 || target === Keyword.VEC4;
      case Keyword.UVEC2:
        return target === Keyword.VEC2;
      case Keyword.UVEC3:
        return target === Keyword.VEC3;
      case Keyword.UVEC4:
        return target === Keyword.VEC4;
      default:
        return false;
    }
  }

  /** Human-readable GLSL name of a resolved type, for diagnostic messages. */
  static typeName(type: GalaceanDataType | undefined): string {
    if (typeof type === "string") return type;
    if (type == undefined) return "unknown";
    return (Keyword[type] ?? String(type)).toLowerCase();
  }

  private static _vectorComponentCount(type: GalaceanDataType | undefined): number {
    switch (type) {
      case Keyword.VEC2:
      case Keyword.IVEC2:
      case Keyword.UVEC2:
      case Keyword.BVEC2:
        return 2;
      case Keyword.VEC3:
      case Keyword.IVEC3:
      case Keyword.UVEC3:
      case Keyword.BVEC3:
        return 3;
      case Keyword.VEC4:
      case Keyword.IVEC4:
      case Keyword.UVEC4:
      case Keyword.BVEC4:
        return 4;
      default:
        return 0;
    }
  }

  static toString(sm: GrammarSymbol) {
    if (this.isTerminal(sm)) {
      return ETokenType[sm] ?? Keyword[sm];
    }
    return NoneTerminal[sm];
  }

  static isTerminal(sm: GrammarSymbol) {
    return sm < NoneTerminal.START;
  }

  /**
   * @internal
   */
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
}
