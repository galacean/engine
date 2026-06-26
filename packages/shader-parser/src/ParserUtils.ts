import { ETokenType, GalaceanDataType, TypeAny } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { ASTNode, TreeNode } from "./parser/AST";
import { GrammarSymbol, NoneTerminal } from "./parser/GrammarSymbol";
import { Keyword } from "./common/enums/Keyword";

export class ParserUtils {
  private static _swizzleSets = ["xyzw", "rgba", "stpq"];

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
    const size = ParserUtils.vectorComponentCount(baseType);
    if (size === 0) return null;
    if (swizzle.length < 1 || swizzle.length > 4) {
      return `Invalid swizzle ".${swizzle}": a vector swizzle selects 1-4 components.`;
    }
    const sets = ParserUtils._swizzleSets;
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

  /** A sampler (opaque) type — not constructible: it cannot be a function return, a local, or a value. */
  static isSamplerType(type: GalaceanDataType | undefined): boolean {
    switch (type) {
      case Keyword.SAMPLER2D:
      case Keyword.SAMPLER3D:
      case Keyword.SAMPLER_CUBE:
      case Keyword.SAMPLER2D_SHADOW:
      case Keyword.SAMPLER_CUBE_SHADOW:
      case Keyword.SAMPLER2D_ARRAY:
      case Keyword.SAMPLER2D_ARRAY_SHADOW:
      case Keyword.I_SAMPLER2D:
      case Keyword.I_SAMPLER3D:
      case Keyword.I_SAMPLER_CUBE:
      case Keyword.I_SAMPLER2D_ARRAY:
      case Keyword.U_SAMPLER2D:
      case Keyword.U_SAMPLER3D:
      case Keyword.U_SAMPLER_CUBE:
      case Keyword.U_SAMPLER2D_ARRAY:
        return true;
      default:
        return false;
    }
  }

  /**
   * Evaluate an expression node to its compile-time numeric literal, unwrapping the single-child
   * precedence chain and parenthesised groups. Returns `undefined` for anything that is not a plain
   * numeric literal (identifiers, compound/arithmetic expressions) — callers treat that as "not a
   * known constant" and skip (continue-with-unknown), so this never produces a false positive.
   */
  static constNumericValue(node: TreeNode): number | undefined {
    let cur: TreeNode = node;
    while (true) {
      if (cur instanceof ASTNode.PrimaryExpression) {
        if (cur.children.length === 3) {
          const inner = cur.children[1];
          if (!(inner instanceof TreeNode)) return undefined;
          cur = inner;
          continue;
        }
        const leaf = cur.children[0];
        if (
          leaf instanceof Token &&
          (leaf.type === ETokenType.INT_CONSTANT || leaf.type === ETokenType.FLOAT_CONSTANT)
        ) {
          const n = Number(leaf.lexeme);
          return Number.isNaN(n) ? undefined : n;
        }
        return undefined;
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

  /** A boolean scalar/vector type. */
  static isBoolType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.BOOL || type === Keyword.BVEC2 || type === Keyword.BVEC3 || type === Keyword.BVEC4;
  }

  /** An integer scalar/vector type (signed or unsigned). */
  static isIntegerType(type: GalaceanDataType | undefined): boolean {
    switch (type) {
      case Keyword.INT:
      case Keyword.UINT:
      case Keyword.IVEC2:
      case Keyword.IVEC3:
      case Keyword.IVEC4:
      case Keyword.UVEC2:
      case Keyword.UVEC3:
      case Keyword.UVEC4:
        return true;
      default:
        return false;
    }
  }

  /**
   * True when `type` is a known type that cannot be an operand of an arithmetic operator (+, -, *, /):
   * bool, sampler, or struct. Returns false for `TypeAny`/unknown so callers skip (continue-with-unknown).
   * The numeric/vector/matrix size-compatibility rules are intentionally left to the type system.
   */
  static nonArithmeticOperand(type: GalaceanDataType | undefined): boolean {
    return (
      type != undefined &&
      type !== TypeAny &&
      (this.isBoolType(type) || this.isSamplerType(type) || typeof type === "string")
    );
  }

  /** A scalar numeric/bool type (the things a vector is built from). */
  static isScalarType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.FLOAT || type === Keyword.INT || type === Keyword.UINT || type === Keyword.BOOL;
  }

  /**
   * Result type of an arithmetic binary operator (+, -, *, /) on operands `a` and `b`, for the
   * confident GLSL cases only: same type → that type; numeric-scalar ⊙ vector/matrix → the vector/
   * matrix (component-wise / scalar broadcast). Everything ambiguous (scalar promotion like int⊙float,
   * matrix·vector, mismatched vector sizes, any non-arithmetic operand) returns `TypeAny` — leaving the
   * type unknown exactly as before, so this only ever *adds* information and never mis-deduces.
   */
  static arithmeticResultType(
    a: GalaceanDataType | undefined,
    b: GalaceanDataType | undefined
  ): GalaceanDataType | undefined {
    if (a == undefined || b == undefined || a === TypeAny || b === TypeAny) return TypeAny;
    if (this.nonArithmeticOperand(a) || this.nonArithmeticOperand(b)) return TypeAny;
    if (a === b) return a;
    const aScalar = this.isScalarType(a);
    const bScalar = this.isScalarType(b);
    if (aScalar && bScalar) return TypeAny; // different scalars: int/float promotion — stay conservative
    if (aScalar) return b; // scalar ⊙ vector/matrix
    if (bScalar) return a;
    return TypeAny; // vector·matrix, mismatched vector sizes — leave unknown
  }

  /** Component count of a vector type (2/3/4), or 0 for non-vectors. */
  static vectorComponentCount(type: GalaceanDataType | undefined): number {
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
}
