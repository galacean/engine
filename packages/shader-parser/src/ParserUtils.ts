import { ETokenType, GalaceanDataType } from "./common";
import { BaseToken as Token } from "./common/BaseToken";
import { ASTNode, TreeNode } from "./parser/AST";
import { BuiltinFunction } from "./parser/builtin";
import { GrammarSymbol, NoneTerminal } from "./parser/GrammarSymbol";
import { Keyword } from "./common/enums/Keyword";
import { VarSymbol } from "./parser/symbolTable";
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
   * Finds the final syntactic statement inside the parser's block/statement wrappers.
   * @param node - Block, statement list, wrapper, or leaf node.
   * @returns Final statement leaf, or `undefined` for an empty block.
   * @internal
   */
  static lastStatement(node: TreeNode): TreeNode | undefined {
    if (
      node instanceof ASTNode.Statement ||
      node instanceof ASTNode.SimpleStatement ||
      node instanceof ASTNode.CompoundStatement ||
      node instanceof ASTNode.CompoundStatementNoScope
    ) {
      if (node.children.length === 2) return;
      for (const child of node.children) {
        if (!(child instanceof TreeNode)) continue;
        const statement = ParserUtils.lastStatement(child);
        if (statement) return statement;
      }
      return;
    }
    if (node instanceof ASTNode.StatementList) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (!(child instanceof TreeNode)) continue;
        const statement = ParserUtils.lastStatement(child);
        if (statement) return statement;
      }
      return;
    }
    return node;
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

  /**
   * Evaluates a constant integral expression when its exact value is known from the parsed AST.
   * Macro-backed or otherwise variant-dependent expressions return `undefined` so callers can
   * preserve them for the runtime preprocessor.
   * @param node - Integral expression to evaluate.
   * @returns The exact 32-bit value, or `undefined` when it cannot be proven statically.
   * @internal
   */
  static constIntegerValue(node: TreeNode): number | undefined {
    return ParserUtils._constIntegerValue(node, new Set());
  }

  private static _constIntegerValue(node: TreeNode, resolving: Set<VarSymbol>): number | undefined {
    if (node instanceof ASTNode.PrimaryExpression) {
      if (node.children.length === 3) {
        const inner = node.children[1];
        return inner instanceof TreeNode ? ParserUtils._constIntegerValue(inner, resolving) : undefined;
      }
      const leaf = node.children[0];
      if (leaf instanceof Token && leaf.type === ETokenType.INT_CONSTANT) {
        const value = Number(leaf.lexeme.replace(/[uU]$/, ""));
        return Number.isSafeInteger(value) ? ParserUtils._normalizeInteger(value, node.type) : undefined;
      }
    }

    const ident = ParserUtils.unwrapBareIdentifier(node, { allowParens: true });
    if (ident) {
      const child = ident.children[0];
      if (!(child instanceof Token)) return;
      const symbols = ident.resolvedSymbols();
      if (!symbols.length) return;
      let resolvedValue: number | undefined;
      for (const symbol of symbols) {
        if (!(symbol instanceof VarSymbol) || !symbol.isConst || resolving.has(symbol)) return;
        const initializer = ParserUtils._constInitializer(symbol);
        if (!initializer) return;
        resolving.add(symbol);
        const value = ParserUtils._constIntegerValue(initializer, resolving);
        resolving.delete(symbol);
        if (value === undefined || (resolvedValue !== undefined && resolvedValue !== value)) return;
        resolvedValue = value;
      }
      return resolvedValue;
    }

    if (node instanceof ASTNode.FunctionCallGeneric) {
      const fn = node.children[0] as ASTNode.FunctionIdentifier;
      if (fn.ident !== "int" && fn.ident !== "uint") return;
      const params = node.children[2];
      if (!(params instanceof ASTNode.FunctionCallParameterList) || params.paramNodes.length !== 1) return;
      const value = ParserUtils._constIntegerValue(params.paramNodes[0], resolving);
      return value === undefined ? undefined : ParserUtils._normalizeInteger(value, node.type);
    }

    const children = node.children;
    const nodeType = node instanceof ASTNode.ExpressionAstNode ? node.type : undefined;
    if (children.length === 1) {
      const child = children[0];
      return child instanceof TreeNode ? ParserUtils._constIntegerValue(child, resolving) : undefined;
    }
    if (node instanceof ASTNode.ConditionalExpression && children.length === 5) {
      const condition = children[0];
      const whenTrue = children[2];
      const whenFalse = children[4];
      if (!(condition instanceof TreeNode) || !(whenTrue instanceof TreeNode) || !(whenFalse instanceof TreeNode)) {
        return;
      }
      const conditionValue = ParserUtils._constIntegerValue(condition, resolving);
      return conditionValue === undefined
        ? undefined
        : ParserUtils._constIntegerValue(conditionValue !== 0 ? whenTrue : whenFalse, resolving);
    }
    if (children.length === 2 && children[1] instanceof TreeNode) {
      const operator = ParserUtils._operatorLexeme(children[0]);
      const operand = ParserUtils._constIntegerValue(children[1], resolving);
      if (operator === undefined || operand === undefined) return;
      let value: number;
      if (operator === "+") value = operand;
      else if (operator === "-") value = -operand;
      else if (operator === "~") value = ~operand;
      else if (operator === "!") value = operand === 0 ? 1 : 0;
      else return;
      return ParserUtils._normalizeInteger(value, nodeType);
    }
    if (children.length === 3 && children[0] instanceof TreeNode && children[2] instanceof TreeNode) {
      if (node instanceof ASTNode.AssignmentExpression) return;
      const operator = ParserUtils._operatorLexeme(children[1]);
      const left = ParserUtils._constIntegerValue(children[0], resolving);
      const right = ParserUtils._constIntegerValue(children[2], resolving);
      if (operator === undefined || left === undefined || right === undefined) return;
      let value: number;
      switch (operator) {
        case "+":
          value = left + right;
          break;
        case "-":
          value = left - right;
          break;
        case "*":
          value = left * right;
          break;
        case "/":
          if (right === 0) return;
          value = Math.trunc(left / right);
          break;
        case "%":
          if (right === 0) return;
          value = left % right;
          break;
        case "<<":
          value = left << right;
          break;
        case ">>":
          value = nodeType === Keyword.UINT ? left >>> right : left >> right;
          break;
        case "&":
          value = left & right;
          break;
        case "^":
          value = left ^ right;
          break;
        case "|":
          value = left | right;
          break;
        case "&&":
          value = left !== 0 && right !== 0 ? 1 : 0;
          break;
        case "^^":
          value = (left !== 0) !== (right !== 0) ? 1 : 0;
          break;
        case "||":
          value = left !== 0 || right !== 0 ? 1 : 0;
          break;
        case "<":
          value = left < right ? 1 : 0;
          break;
        case ">":
          value = left > right ? 1 : 0;
          break;
        case "<=":
          value = left <= right ? 1 : 0;
          break;
        case ">=":
          value = left >= right ? 1 : 0;
          break;
        case "==":
          value = left === right ? 1 : 0;
          break;
        case "!=":
          value = left !== right ? 1 : 0;
          break;
        default:
          return;
      }
      return ParserUtils._normalizeInteger(value, nodeType);
    }
    return;
  }

  private static _constInitializer(symbol: VarSymbol): TreeNode | undefined {
    const declaration = symbol.astNode;
    if (declaration instanceof ASTNode.InitDeclaratorList || declaration instanceof ASTNode.VariableDeclaration) {
      return declaration.declarator?.initializer;
    }
    return declaration instanceof TreeNode ? declaration : undefined;
  }

  private static _operatorLexeme(node: unknown): string | undefined {
    if (node instanceof Token) return node.lexeme;
    if (!(node instanceof TreeNode)) return;
    for (const child of node.children) {
      const lexeme = ParserUtils._operatorLexeme(child);
      if (lexeme !== undefined) return lexeme;
    }
    return;
  }

  private static _normalizeInteger(value: number, type: GalaceanDataType | undefined): number {
    return type === Keyword.UINT ? value >>> 0 : value | 0;
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
   * @param node - Expression to classify using its retained symbol-resolution facts.
   * @returns Whether every reachable operand is a compile-time constant.
   */
  static isConstExpr(node: TreeNode): boolean {
    if (ParserUtils.constNumericValue(node) !== undefined) return true;
    if (ParserUtils._isBooleanLiteral(node)) return true;
    const ident = ParserUtils.unwrapBareIdentifier(node, { allowParens: true });
    if (ident) {
      const child = ident.children[0];
      // A `#define`'d name at use is lexed as a MACRO_CALL (only registered macros become one), so
      // it's a compile-time constant — its replacement is fixed before the compiler runs.
      if (child instanceof ASTNode.MacroCallSymbol || child instanceof ASTNode.MacroCallFunction) return true;
      if (!(child instanceof Token)) return false;
      const symbols = ident.resolvedSymbols();
      return symbols.length > 0 && symbols.every((symbol) => symbol instanceof VarSymbol && symbol.isConst);
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
        if (arg instanceof TreeNode && !ParserUtils.isConstExpr(arg)) return false;
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
          if (!ParserUtils.isConstExpr(c)) return false;
        }
      }
      return sawSubExpr;
    }
    return false;
  }

  private static _isBooleanLiteral(node: TreeNode): boolean {
    let current = node;
    while (true) {
      if (current instanceof ASTNode.PrimaryExpression) {
        if (current.children.length === 3) {
          const child = current.children[1];
          if (!(child instanceof TreeNode)) return false;
          current = child;
          continue;
        }
        const token = current.children[0];
        return token instanceof Token && (token.type === Keyword.True || token.type === Keyword.False);
      }
      if (current instanceof ASTNode.ExpressionAstNode && current.children.length === 1) {
        const child = current.children[0];
        if (!(child instanceof TreeNode)) return false;
        current = child;
        continue;
      }
      return false;
    }
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
