import { ETokenType, GalaceanDataType } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { ASTNode, TreeNode } from "./parser/AST";
import { BuiltinFunction } from "./parser/builtin";
import { GrammarSymbol, NoneTerminal } from "./parser/GrammarSymbol";
import { Keyword } from "./common/enums/Keyword";
import SemanticAnalyzer from "./parser/SemanticAnalyzer";
import { ESymbolType, VarSymbol } from "./parser/symbolTable";
import { TypeSystem } from "./parser/TypeSystem";

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
   * Validate a `.field` access on a vector as a GLSL swizzle. Returns an error message when the
   * access is an invalid swizzle on a known vector type, or `null` when it is valid or the base
   * is not a known vector (struct member / scalar / unresolved — left for other checks).
   */
  static swizzleError(baseType: GalaceanDataType | undefined, swizzle: string): string | null {
    const size = TypeSystem.vectorComponentCount(baseType);
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

  /** Recursively walk a `type_qualifier` token chain for a keyword (e.g. `const`, `flat`; test by value as CONST === 0). */
  static hasQualifier(node: TreeNode, keyword: Keyword): boolean {
    for (const child of node.children) {
      if (child instanceof Token) {
        if (child.type === keyword) return true;
      } else if (child instanceof TreeNode && ParserUtils.hasQualifier(child, keyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether an expression is a compile-time constant per GLSL ES §4.3.3. Covers numeric literals,
   * bare identifiers whose symbol is `const`, `#define`d names, built-in function calls whose
   * arguments are themselves constant (e.g. `sin(0.5)`, `vec3(1.0, 2.0, 3.0)`), and any compound
   * expression (binary / unary / ternary) whose sub-expressions are all constant.
   * Non-constant references (uniforms, non-const locals) return false. Called only by diagnostics
   * (NonConstInitializer / NonConstArraySize) — codegen doesn't consult it.
   */
  static isConstExpr(node: TreeNode, sa: SemanticAnalyzer): boolean {
    if (ParserUtils.constNumericValue(node) !== undefined) return true;
    const leaf = ParserUtils.unwrapBareIdentifier(node, { allowParens: true })?.children[0];
    if (leaf instanceof Token && (leaf.type === Keyword.True || leaf.type === Keyword.False)) return true;
    const ident = ParserUtils.unwrapBareIdentifier(node, { allowParens: true });
    if (ident) {
      const child = ident.children[0];
      // A `#define`'d name at use is lexed as a MACRO_CALL (only registered macros become one), so
      // it's a compile-time constant — its replacement is fixed before the compiler runs.
      if (child instanceof ASTNode.MacroCallSymbol || child instanceof ASTNode.MacroCallFunction) return true;
      if (!(child instanceof Token)) return false;
      if (sa.macroDefineList[child.lexeme]) return true;
      const lookup = SemanticAnalyzer._lookupSymbol;
      lookup.set(child.lexeme, ESymbolType.VAR);
      const symbol = sa.symbolTableStack.lookup(lookup, true);
      return symbol instanceof VarSymbol && symbol.isConst;
    }
    // Built-in function call: constant iff every argument is constant. `FunctionIdentifier.isBuiltin`
    // covers keyword constructors (vec3/mat3/...); regular built-in functions (sin/cos/sqrt/...)
    // are identified via `BuiltinFunction.isExist`. User-defined calls stay non-constant since a
    // user function body may reach uniforms transitively.
    if (node instanceof ASTNode.FunctionCallGeneric) {
      const fnIdent = node.children[0] as ASTNode.FunctionIdentifier;
      const isConstructor = fnIdent.isBuiltin;
      const isBuiltinFn = typeof fnIdent.ident === "string" && BuiltinFunction.isExist(fnIdent.ident);
      if (!isConstructor && !isBuiltinFn) return false;
      const list = node.children[2];
      if (!(list instanceof ASTNode.FunctionCallParameterList)) return true;
      for (const arg of list.paramNodes) {
        if (arg instanceof TreeNode && !ParserUtils.isConstExpr(arg, sa)) return false;
      }
      return true;
    }
    // Compound expression (binary / unary / ternary / shift / additive / multiplicative): constant
    // iff every sub-expression is constant. A non-const operand short-circuits — this is how
    // `u_uniform + sin(0.5)` correctly reports non-const even though `sin(0.5)` is const.
    if (node instanceof ASTNode.ExpressionAstNode) {
      let sawSubExpr = false;
      for (const c of node.children) {
        if (c instanceof ASTNode.ExpressionAstNode) {
          sawSubExpr = true;
          if (!ParserUtils.isConstExpr(c, sa)) return false;
        }
      }
      return sawSubExpr;
    }
    return false;
  }

  /** The first arithmetic-binary operand whose type can't be an operand (bool/sampler/struct), else undefined. */
  static firstNonArithmeticOperand(a: TreeNode | Token, b: TreeNode | Token): ASTNode.ExpressionAstNode | undefined {
    for (const n of [a, b]) {
      if (n instanceof ASTNode.ExpressionAstNode && TypeSystem.nonArithmeticOperand(n.type)) return n;
    }
    return undefined;
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
