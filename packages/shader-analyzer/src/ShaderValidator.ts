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
  ShaderRange,
  TreeNode,
  TypeAny,
  TypeSystem
} from "@galacean/engine-shader-parser";

/**
 * Walk-local context threaded down the recursion: the enclosing function (for the declared return
 * type and the recursion self-call check) and the current loop nesting depth (for break/continue).
 * These can't be read off a node post-parse — the parser carried them as transient SA state — so the
 * walk reconstructs them as it descends.
 */
interface WalkContext {
  currentFunction: ASTNode.FunctionDefinition | null;
  loopDepth: number;
}

/**
 * Post-parse validation pass. Walks the already-typed AST (the parser built the symbol table and
 * inferred `.type` inline; only validation moved here) and collects diagnostics. The pass source is
 * passed in — `parseShaderPass` clears `ShaderCompilerUtils.processingPassText` on exit, so the
 * caller supplies the same source context the inline check carried.
 */
export class ShaderValidator {
  static validate(program: ASTNode.GLShaderProgram, source: string): GSError[] {
    const v = new ShaderValidator(source);
    v._walk(program, { currentFunction: null, loopDepth: 0 });
    return v._errors;
  }

  private _errors: GSError[] = [];

  private constructor(private _source: string) {}

  private _walk(node: TreeNode, ctx: WalkContext): void {
    // A FunctionDefinition becomes the enclosing function for its subtree (GLSL has no nested
    // functions, so it always replaces rather than nests); an iteration statement (for/while/do)
    // raises the loop depth for its subtree.
    let childCtx = ctx;
    if (node instanceof ASTNode.FunctionDefinition) {
      this._checkFunctionReturn(node);
      childCtx = { currentFunction: node, loopDepth: ctx.loopDepth };
    } else if (node instanceof ASTNode.IterationStatement) {
      childCtx = { currentFunction: ctx.currentFunction, loopDepth: ctx.loopDepth + 1 };
    } else if (node instanceof ASTNode.SelectionStatement) {
      this._checkNonBoolCondition(node);
    } else if (node instanceof ASTNode.JumpStatement) {
      this._checkJump(node, ctx);
    } else if (node instanceof ASTNode.FunctionCallGeneric) {
      this._checkConstructorArgs(node);
      this._checkRecursiveCall(node, ctx);
    } else if (node instanceof ASTNode.UnaryExpression) {
      this._checkUnaryOperand(node);
    } else if (node instanceof ASTNode.MultiplicativeExpression) {
      // A bad operand reports InvalidBinaryOperands and suppresses the divide-by-zero check on the
      // same node — clean operands are the only case the const-zero check needs to consider.
      if (!this._checkArithmeticOperands(node)) this._checkConstDivideByZero(node);
    } else if (node instanceof ASTNode.AdditiveExpression) {
      this._checkArithmeticOperands(node);
    } else if (node instanceof ASTNode.ShiftExpression) {
      this._checkShiftRange(node);
    } else if (node instanceof ASTNode.PostfixExpression) {
      this._checkPostfix(node);
    } else if (node instanceof ASTNode.FunctionDeclarator) {
      this._checkReturnType(node);
    }
    const children = node.children;
    if (children) {
      for (const child of children) {
        if (child instanceof TreeNode) this._walk(child, childCtx);
      }
    }
  }

  private _push(message: string, location: ShaderRange, code: DiagnosticType): void {
    this._errors.push(
      ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, this._source, location, code)
    );
  }

  /**
   * `if (cond)` — cond must be a bool. GLSL ES has no implicit scalar→bool, so a float/int
   * condition is an error. Skip TypeAny (unknown) to avoid false positives (continue-with-unknown).
   */
  private _checkNonBoolCondition(node: ASTNode.SelectionStatement): void {
    const condition = node.children.find((c) => c instanceof ASTNode.ExpressionAstNode) as
      | ASTNode.ExpressionAstNode
      | undefined;
    if (!condition) return;
    const t = condition.type;
    if (t !== TypeAny && t !== Keyword.BOOL) {
      this._push(
        `Condition of 'if' must be a bool, got '${TypeSystem.typeName(t)}'.`,
        condition.location,
        DiagnosticType.NonBoolCondition
      );
    }
  }

  /**
   * A builtin numeric constructor (`vecN(...)` etc.) cannot take a sampler/struct argument
   * (ConstructorArgType), and a vecN needs exactly N components — too few is ConstructorArgCount.
   */
  private _checkConstructorArgs(node: ASTNode.FunctionCallGeneric): void {
    const functionIdentifier = node.children[0] as ASTNode.FunctionIdentifier;
    if (!functionIdentifier.isBuiltin) return;
    if (!(node.children.length === 4 && node.children[2] instanceof ASTNode.FunctionCallParameterList)) return;
    const list = node.children[2] as ASTNode.FunctionCallParameterList;
    const badIndex = list.paramSig.findIndex((t) => TypeSystem.isSamplerType(t) || typeof t === "string");
    if (badIndex >= 0) {
      const argNode = list.paramNodes[badIndex] as TreeNode | undefined;
      this._push(
        `Cannot construct '${TypeSystem.typeName(functionIdentifier.ident)}' from a '${TypeSystem.typeName(
          list.paramSig[badIndex]
        )}' argument.`,
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
      this._push(
        `Constructor '${TypeSystem.typeName(functionIdentifier.ident)}' needs ${need} components but the arguments provide ${total}.`,
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
  private _checkUnaryOperand(node: ASTNode.UnaryExpression): void {
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
      this._push(
        `Operator '${opToken.lexeme}' cannot be applied to operand of type '${TypeSystem.typeName(t)}'.`,
        node.location,
        DiagnosticType.InvalidUnaryOperand
      );
    }
  }

  /**
   * Operands of `*` `/` `%` `+` `-` must be arithmetic (numeric scalar/vector/matrix), not
   * bool/sampler/struct. Returns true when a bad operand was reported, so the caller can suppress a
   * redundant divide-by-zero diagnostic on the same node.
   */
  private _checkArithmeticOperands(node: ASTNode.MultiplicativeExpression | ASTNode.AdditiveExpression): boolean {
    if (node.children.length !== 3) return false;
    const bad = ParserUtils.firstNonArithmeticOperand(node.children[0], node.children[2]);
    if (bad) {
      this._push(
        `Type '${TypeSystem.typeName(bad.type)}' is not a valid operand for an arithmetic operator.`,
        bad.location,
        DiagnosticType.InvalidBinaryOperands
      );
      return true;
    }
    return false;
  }

  /**
   * Integer division/modulo by a compile-time constant zero is an error; float `1.0/0.0` yields Inf
   * (unspecified, not an error). `%` is integer-only in GLSL ES; `/` qualifies only when the result
   * type deduced to an integer (int/int) — FLOAT or TypeAny don't flag. Only reached with clean
   * operands (the arithmetic-operand check already suppressed bad ones), so it scans operands once.
   */
  private _checkConstDivideByZero(node: ASTNode.MultiplicativeExpression): void {
    if (node.children.length !== 3) return;
    const op = node.children[1];
    // Gate on the operator before touching operands: only `/` and `%` can divide by zero.
    if (!(op instanceof BaseToken) || (op.type !== ETokenType.PERCENT && op.type !== ETokenType.SLASH)) return;
    if (op.type === ETokenType.SLASH && !TypeSystem.isIntegerType(node.type)) return;
    const divisor = node.children[2];
    if (divisor instanceof TreeNode && ParserUtils.constNumericValue(divisor) === 0) {
      this._push(
        op.type === ETokenType.PERCENT ? "Modulo by constant zero." : "Division by constant zero.",
        divisor.location,
        DiagnosticType.ConstDivideByZero
      );
    }
  }

  /** A shift by a constant amount outside [0, 32) is out of range — GLSL ES int/uint are 32-bit. */
  private _checkShiftRange(node: ASTNode.ShiftExpression): void {
    if (node.children.length !== 3) return;
    const amount = node.children[2];
    if (!(amount instanceof TreeNode)) return;
    const n = ParserUtils.constNumericValue(amount);
    if (n !== undefined && (n < 0 || n >= 32)) {
      this._push(
        `Shift amount ${n} is out of range; must be in [0, 32).`,
        amount.location,
        DiagnosticType.ShiftOutOfRange
      );
    }
  }

  /**
   * Stateless postfix checks: an invalid swizzle on a known vector (`InvalidSwizzle`), and the
   * `base[index]` family — `gl_FragData[i]` (`GlFragData`), a scalar non-array base (`NonIndexableType`),
   * a non-integer index (`NonIntegerIndex`), and a constant index past a known vector/array size
   * (`IndexOutOfBounds`). The struct-field (`else if`) path stays inline in the parser since it reads the
   * symbol table; preserve the original control flow here (early returns, gl_FragData-vs-index branching).
   */
  private _checkPostfix(node: ASTNode.PostfixExpression): void {
    const children = node.children;
    if (children.length === 3 && children[2] instanceof BaseToken) {
      const base = children[0] as ASTNode.ExpressionAstNode;
      const field = children[2];
      const swizzleError = ParserUtils.swizzleError(base.type, field.lexeme);
      if (swizzleError) {
        this._push(swizzleError, field.location, DiagnosticType.InvalidSwizzle);
      }
    } else if (children.length === 4) {
      // `base [ index ]`.
      if (ParserUtils.extractDirectIdentLexeme(children[0] as TreeNode) === "gl_FragData") {
        // `gl_FragData[i]` is removed in the IO model — flag regardless of stage, independent of struct roles.
        this._push("Please use MRT struct instead of gl_FragData.", children[0].location, DiagnosticType.GlFragData);
        return;
      }
      const base = children[0] as ASTNode.ExpressionAstNode;
      const index = children[2];
      // A scalar (non-array) base can't be indexed at all. Resolve the base to a bare variable so an
      // array (`a[3]`) or a vector (`v[0]`) is excluded; non-variable/compound bases stay unknown.
      if (TypeSystem.isScalarType(base.type)) {
        const baseIdent = ParserUtils.unwrapBareIdentifier(base, { allowParens: true });
        if (baseIdent && !baseIdent.isArray) {
          const m = `Type '${TypeSystem.typeName(base.type)}' is not indexable.`;
          this._push(m, base.location, DiagnosticType.NonIndexableType);
        }
      }
      if (!(index instanceof ASTNode.ExpressionAstNode)) return;
      // The index must be an integer; a constant integer index past a known vector's size is out of bounds.
      const indexType = index.type;
      if (indexType !== TypeAny && !TypeSystem.isIntegerType(indexType)) {
        const m = `Index must be an integer, got '${TypeSystem.typeName(indexType)}'.`;
        this._push(m, index.location, DiagnosticType.NonIntegerIndex);
        return;
      }
      const size = TypeSystem.vectorComponentCount(base.type);
      if (size > 0) {
        const n = ParserUtils.constNumericValue(index);
        if (n !== undefined && (n < 0 || n >= size)) {
          const m = `Index ${n} is out of bounds for a ${size}-component vector.`;
          this._push(m, index.location, DiagnosticType.IndexOutOfBounds);
        }
      } else {
        // A constant index past a fixed-size array's bounds is out of bounds (Naga bounds-checks
        // fixed-size arrays, not just vectors). Unsized / non-array bases keep arraySize undefined.
        const baseIdent = ParserUtils.unwrapBareIdentifier(base, { allowParens: true });
        const arraySize = baseIdent?.arraySize;
        if (arraySize !== undefined) {
          const n = ParserUtils.constNumericValue(index);
          if (n !== undefined && (n < 0 || n >= arraySize)) {
            const m = `Index ${n} is out of bounds for an array of size ${arraySize}.`;
            this._push(m, index.location, DiagnosticType.IndexOutOfBounds);
          }
        }
      }
    }
  }

  /** A sampler (opaque) type cannot be returned by value — GLSL forbids it. */
  private _checkReturnType(node: ASTNode.FunctionDeclarator): void {
    const returnType = node.returnType;
    if (TypeSystem.isSamplerType(returnType.type)) {
      this._push(
        `Function return type '${TypeSystem.typeName(returnType.type)}' is not constructible; samplers cannot be returned.`,
        returnType.location,
        DiagnosticType.NonConstructibleReturnType
      );
    }
  }

  /**
   * Function-level MissingReturn: a non-void function with no return statement. The void-with-value
   * case is reported per-jump in `_checkJump` (the parser no longer records `returnStatement` for
   * void functions — it's a codegen invariant, see AST.ts FunctionDefinition.semanticAnalyze).
   */
  private _checkFunctionReturn(node: ASTNode.FunctionDefinition): void {
    const returnType = node.protoType.returnType;
    if (returnType.type !== Keyword.VOID && !node.returnStatement) {
      this._push(`No return statement found.`, returnType.location, DiagnosticType.MissingReturn);
    }
  }

  /**
   * Jump-statement checks needing walk-local context: `InvalidReturnType` fires per-jump — a value
   * return in a `void` function, or a `return value;` whose value isn't assignable to the declared
   * non-void return type. A `break`/`continue` at loop depth 0 (outside any loop) is
   * `MisplacedControlFlow`.
   */
  private _checkJump(node: ASTNode.JumpStatement, ctx: WalkContext): void {
    const children = node.children;
    const keyword = ASTNode._unwrapToken(children[0]).type;
    if (keyword === Keyword.RETURN) {
      if (!ctx.currentFunction) return;
      const declared = ctx.currentFunction.protoType.returnType.type;
      if (declared === Keyword.VOID) {
        // `void f() { return value; }` — the value at children[1] is illegal.
        if (children.length === 3) {
          this._push("Return in void function.", children[1].location, DiagnosticType.InvalidReturnType);
        }
      } else if (children.length === 3) {
        const returned = (children[1] as ASTNode.ExpressionAstNode).type;
        if (declared != undefined && !TypeSystem.isAssignable(declared, returned)) {
          this._push(
            `Cannot return a value of type '${TypeSystem.typeName(returned)}' from a function returning '${TypeSystem.typeName(declared)}'.`,
            children[1].location,
            DiagnosticType.InvalidReturnType
          );
        }
      }
    } else if ((keyword === Keyword.BREAK || keyword === Keyword.CONTINUE) && ctx.loopDepth === 0) {
      this._push(
        `'${keyword === Keyword.BREAK ? "break" : "continue"}' is only allowed inside a loop.`,
        node.location,
        DiagnosticType.MisplacedControlFlow
      );
    }
  }

  /**
   * GLSL forbids recursion: a call whose callee name AND parameter signature match the enclosing
   * function (the same overload) is `RecursiveFunction`. The parser short-circuits this same case
   * during overload resolution (so it isn't mis-reported as Undefined/NoMatchingOverload); the
   * exact-signature match avoids flagging a call to a different overload of the same name.
   */
  private _checkRecursiveCall(node: ASTNode.FunctionCallGeneric, ctx: WalkContext): void {
    const currentFunction = ctx.currentFunction;
    if (!currentFunction) return;
    const functionIdentifier = node.children[0] as ASTNode.FunctionIdentifier;
    if (functionIdentifier.isBuiltin) return;
    const fnIdent = functionIdentifier.ident as string;
    const proto = currentFunction.protoType;
    if (proto.ident.lexeme !== fnIdent) return;

    let callSig: ASTNode.FunctionCallParameterList["paramSig"] | undefined;
    if (node.children.length === 4 && node.children[2] instanceof ASTNode.FunctionCallParameterList) {
      callSig = (node.children[2] as ASTNode.FunctionCallParameterList).paramSig;
    }
    const headerSig = proto.paramSig ?? [];
    const cSig = callSig ?? [];
    if (headerSig.length === cSig.length && headerSig.every((t, i) => t === cSig[i])) {
      this._push(
        `Recursive call to '${fnIdent}' is not allowed (GLSL forbids recursion).`,
        node.location,
        DiagnosticType.RecursiveFunction
      );
    }
  }
}
