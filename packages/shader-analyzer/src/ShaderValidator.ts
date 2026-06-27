import {
  ASTNode,
  BaseToken,
  DiagnosticType,
  ETokenType,
  GSError,
  GSErrorName,
  Keyword,
  ParserUtils,
  ShaderCompilerUtils,
  TreeNode,
  TypeAny,
  TypeSystem
} from "@galacean/engine-shader-parser";

/**
 * Post-parse validation pass. Walks the already-typed AST (the parser built the symbol table and
 * inferred `.type` inline; only validation moved here) and collects diagnostics. The pass source is
 * passed in — `parseShaderPass` clears `ShaderCompilerUtils.processingPassText` on exit, so the
 * caller supplies the same source context the inline check carried.
 */
export class ShaderValidator {
  static validate(program: ASTNode.GLShaderProgram, source: string): GSError[] {
    const errors: GSError[] = [];
    ShaderValidator._walk(program, source, errors);
    return errors;
  }

  private static _walk(node: TreeNode, source: string, errors: GSError[]): void {
    if (node instanceof ASTNode.SelectionStatement) {
      ShaderValidator._checkNonBoolCondition(node, source, errors);
    } else if (node instanceof ASTNode.FunctionCallGeneric) {
      ShaderValidator._checkConstructorArgs(node, source, errors);
    } else if (node instanceof ASTNode.UnaryExpression) {
      ShaderValidator._checkUnaryOperand(node, source, errors);
    } else if (node instanceof ASTNode.MultiplicativeExpression) {
      ShaderValidator._checkArithmeticOperands(node, source, errors);
      ShaderValidator._checkConstDivideByZero(node, source, errors);
    } else if (node instanceof ASTNode.AdditiveExpression) {
      ShaderValidator._checkArithmeticOperands(node, source, errors);
    } else if (node instanceof ASTNode.ShiftExpression) {
      ShaderValidator._checkShiftRange(node, source, errors);
    }
    const children = node.children;
    if (children) {
      for (const child of children) {
        if (child instanceof TreeNode) ShaderValidator._walk(child, source, errors);
      }
    }
  }

  private static _push(
    errors: GSError[],
    message: string,
    source: string,
    location: ASTNode.ExpressionAstNode["location"],
    code: DiagnosticType
  ): void {
    errors.push(
      <GSError>ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, source, location, code)
    );
  }

  /**
   * `if (cond)` — cond must be a bool. GLSL ES has no implicit scalar→bool, so a float/int
   * condition is an error. Skip TypeAny (unknown) to avoid false positives (continue-with-unknown).
   */
  private static _checkNonBoolCondition(node: ASTNode.SelectionStatement, source: string, errors: GSError[]): void {
    const condition = node.children.find((c) => c instanceof ASTNode.ExpressionAstNode) as
      | ASTNode.ExpressionAstNode
      | undefined;
    if (!condition) return;
    const t = condition.type;
    if (t !== TypeAny && t !== Keyword.BOOL) {
      ShaderValidator._push(
        errors,
        `Condition of 'if' must be a bool, got '${TypeSystem.typeName(t)}'.`,
        source,
        condition.location,
        DiagnosticType.NonBoolCondition
      );
    }
  }

  /**
   * A builtin numeric constructor (`vecN(...)` etc.) cannot take a sampler/struct argument
   * (ConstructorArgType), and a vecN needs exactly N components — too few is ConstructorArgCount.
   */
  private static _checkConstructorArgs(node: ASTNode.FunctionCallGeneric, source: string, errors: GSError[]): void {
    const functionIdentifier = node.children[0] as ASTNode.FunctionIdentifier;
    if (!functionIdentifier.isBuiltin) return;
    if (!(node.children.length === 4 && node.children[2] instanceof ASTNode.FunctionCallParameterList)) return;
    const list = node.children[2] as ASTNode.FunctionCallParameterList;
    const badIndex = list.paramSig.findIndex((t) => TypeSystem.isSamplerType(t) || typeof t === "string");
    if (badIndex >= 0) {
      const argNode = list.paramNodes[badIndex] as TreeNode | undefined;
      ShaderValidator._push(
        errors,
        `Cannot construct '${TypeSystem.typeName(functionIdentifier.ident)}' from a '${TypeSystem.typeName(
          list.paramSig[badIndex]
        )}' argument.`,
        source,
        argNode?.location ?? list.location,
        DiagnosticType.ConstructorArgType
      );
      return;
    }
    // A vecN constructor needs exactly N components from its arguments — too few is an error.
    // A single scalar is a valid splat; matrices/unknown args can't be counted, so skip those.
    const need = TypeSystem.vectorComponentCount(functionIdentifier.ident);
    if (need <= 0) return;
    let total = 0;
    let countable = list.paramSig.length > 0;
    for (const t of list.paramSig) {
      const c = TypeSystem.isScalarType(t) ? 1 : TypeSystem.vectorComponentCount(t);
      if (c === 0) {
        countable = false;
        break;
      }
      total += c;
    }
    const singleScalar = list.paramSig.length === 1 && TypeSystem.isScalarType(list.paramSig[0]);
    if (countable && !singleScalar && total < need) {
      ShaderValidator._push(
        errors,
        `Constructor '${TypeSystem.typeName(functionIdentifier.ident)}' needs ${need} components but the arguments provide ${total}.`,
        source,
        list.location,
        DiagnosticType.ConstructorArgCount
      );
    }
  }

  /**
   * Unary operand-type rules: `!` needs bool, `~` needs integer, `-`/`+` need numeric. The operand
   * type is read directly (not the deduced result), so this fires for known operands and skips
   * TypeAny (continue-with-unknown); `++`/`--` reduce with a raw token child and are not handled here.
   */
  private static _checkUnaryOperand(node: ASTNode.UnaryExpression, source: string, errors: GSError[]): void {
    if (node.children.length !== 2 || !(node.children[0] instanceof ASTNode.UnaryOperator)) return;
    const opToken = (node.children[0] as ASTNode.UnaryOperator).children[0];
    const operand = node.children[1] as ASTNode.ExpressionAstNode;
    const t = operand.type;
    if (!(opToken instanceof BaseToken) || t === TypeAny) return;
    let bad = false;
    switch (opToken.type) {
      case ETokenType.BANG:
        bad = !TypeSystem.isBoolType(t);
        break;
      case ETokenType.TILDE:
        bad = !TypeSystem.isIntegerType(t);
        break;
      case ETokenType.DASH:
      case ETokenType.PLUS:
        bad = TypeSystem.isBoolType(t) || TypeSystem.isSamplerType(t) || typeof t === "string";
        break;
    }
    if (bad) {
      ShaderValidator._push(
        errors,
        `Operator '${opToken.lexeme}' cannot be applied to operand of type '${TypeSystem.typeName(t)}'.`,
        source,
        node.location,
        DiagnosticType.InvalidUnaryOperand
      );
    }
  }

  /** Operands of `*` `/` `%` `+` `-` must be arithmetic (numeric scalar/vector/matrix), not bool/sampler/struct. */
  private static _checkArithmeticOperands(
    node: ASTNode.MultiplicativeExpression | ASTNode.AdditiveExpression,
    source: string,
    errors: GSError[]
  ): void {
    if (node.children.length !== 3) return;
    const bad = ParserUtils.firstNonArithmeticOperand(node.children[0], node.children[2]);
    if (bad) {
      ShaderValidator._push(
        errors,
        `Type '${TypeSystem.typeName(bad.type)}' is not a valid operand for an arithmetic operator.`,
        source,
        bad.location,
        DiagnosticType.InvalidBinaryOperands
      );
    }
  }

  /**
   * Integer division/modulo by a compile-time constant zero is an error; float `1.0/0.0` yields Inf
   * (unspecified, not an error). `%` is integer-only in GLSL ES; `/` qualifies only when the result
   * type deduced to an integer (int/int) — FLOAT or TypeAny don't flag.
   */
  private static _checkConstDivideByZero(
    node: ASTNode.MultiplicativeExpression,
    source: string,
    errors: GSError[]
  ): void {
    if (node.children.length !== 3) return;
    const op = node.children[1];
    const divisor = node.children[2];
    // A non-arithmetic operand already reported InvalidBinaryOperands; don't double-report on the same node.
    if (ParserUtils.firstNonArithmeticOperand(node.children[0], divisor)) return;
    if (
      op instanceof BaseToken &&
      divisor instanceof TreeNode &&
      ParserUtils.constNumericValue(divisor) === 0 &&
      (op.type === ETokenType.PERCENT || (op.type === ETokenType.SLASH && TypeSystem.isIntegerType(node.type)))
    ) {
      ShaderValidator._push(
        errors,
        op.type === ETokenType.PERCENT ? "Modulo by constant zero." : "Division by constant zero.",
        source,
        divisor.location,
        DiagnosticType.ConstDivideByZero
      );
    }
  }

  /** A shift by a constant amount outside [0, 32) is out of range — GLSL ES int/uint are 32-bit. */
  private static _checkShiftRange(node: ASTNode.ShiftExpression, source: string, errors: GSError[]): void {
    if (node.children.length !== 3) return;
    const amount = node.children[2];
    if (!(amount instanceof TreeNode)) return;
    const n = ParserUtils.constNumericValue(amount);
    if (n !== undefined && (n < 0 || n >= 32)) {
      ShaderValidator._push(
        errors,
        `Shift amount ${n} is out of range; must be in [0, 32).`,
        source,
        amount.location,
        DiagnosticType.ShiftOutOfRange
      );
    }
  }
}
