import {
  ASTNode,
  BaseToken,
  DiagnosticType,
  ESymbolType,
  ETokenType,
  GalaceanDataType,
  GSError,
  GSErrorName,
  Keyword,
  NodeChild,
  ParserUtils,
  ShaderCompilerUtils,
  ShaderRange,
  StructSymbol,
  SymbolInfo,
  TreeNode,
  TypeAny,
  TypeSystem,
  VarSymbol,
  FnSymbol
} from "@galacean/engine-shader-parser";

/**
 * Walk-local context threaded down the recursion: the enclosing function (for the declared return
 * type and the recursion self-call check), the current loop nesting depth (for break/continue), and
 * the pipeline stage of the enclosing entry function (for derivative-in-vertex-shader). These can't
 * be read off a node post-parse — the parser carried them as transient SA state — so the walk
 * reconstructs them as it descends.
 */
interface WalkContext {
  currentFunction: ASTNode.FunctionDefinition | null;
  loopDepth: number;
  /**
   * Pipeline stage of the enclosing entry function, or `null` when outside an entry (top-level
   * declarations, helper functions). Set in the FunctionDefinition branch by matching the function
   * name against the pass's vertex / fragment entry names.
   */
  currentStage: "vertex" | "fragment" | null;
}

/** Fragment-only derivative builtins (GLSL ES 3.00 §8.9) — illegal in the vertex stage. */
const DERIVATIVE_BUILTINS = new Set(["dFdx", "dFdy", "fwidth"]);

/**
 * Post-parse validation pass. Walks the already-typed AST (the parser built the symbol table and
 * inferred `.type` inline; only validation moved here) and collects diagnostics. The pass source is
 * passed in — `parseShaderPass` clears `ShaderCompilerUtils.processingPassText` on exit, so the
 * caller supplies the same source context the inline check carried.
 */
export class ShaderValidator {
  /**
   * Validate an already-parsed program and return collected diagnostics.
   * @param program parsed AST
   * @param source pass source text used for diagnostic ranges
   * @param vertexEntry vertex entry name; forwarded to walk context for stage-conditional checks
   * @param fragmentEntry fragment entry name; forwarded to walk context for stage-conditional checks
   * @returns diagnostics as `GSError[]`
   */
  static validate(
    program: ASTNode.GLShaderProgram,
    source: string,
    vertexEntry: string = "",
    fragmentEntry: string = ""
  ): GSError[] {
    const v = new ShaderValidator(source, vertexEntry, fragmentEntry, program.shaderData);
    v._walk(program, { currentFunction: null, loopDepth: 0, currentStage: null });
    v._reportMutualRecursion();
    v._reportDerivativeReachableFromVertex();
    v._reportBareGlFragData();
    return v._errors;
  }

  /** Scratch SymbolInfo reused by `_nonAssignableReason` for VAR lookups — avoids per-call allocation. */
  private static _varLookup = new SymbolInfo("", ESymbolType.VAR);

  private _errors: GSError[] = [];
  /**
   * Start indices of `gl_FragData` reference locations that appear as the base of a
   * `PostfixExpression[base [ index ]]` — the legal `gl_FragData[i]` shape. Collected by
   * `_checkPostfix` during the walk, then used by `_reportBareGlFragData` to strike these off the
   * `shaderData.glFragDataReferences` list; the residue is bare use.
   */
  private _indexedGlFragDataStarts = new Set<number>();
  /** Function-definition identity → resolved functions it directly calls. */
  private _callGraph = new Map<ASTNode.FunctionDefinition, Set<ASTNode.FunctionDefinition>>();
  /** Entry name → every function definition with that name. */
  private _functionDefinitions = new Map<string, ASTNode.FunctionDefinition[]>();
  /** Function definition → derivative call sites inside its body. Post-walk pass reports the ones
   *  reachable from the vertex entry via the call graph. */
  private _derivativeSites = new Map<ASTNode.FunctionDefinition, { name: string; location: ShaderRange }[]>();

  private constructor(
    private _source: string,
    private _vertexEntry: string,
    private _fragmentEntry: string,
    private _shaderData: ASTNode.GLShaderProgram["shaderData"]
  ) {}

  private _walk(node: TreeNode, ctx: WalkContext): void {
    // A FunctionDefinition becomes the enclosing function for its subtree (GLSL has no nested
    // functions, so it always replaces rather than nests); an iteration statement (for/while/do)
    // raises the loop depth for its subtree.
    let childCtx = ctx;
    if (node instanceof ASTNode.FunctionDefinition) {
      this._checkFunctionReturn(node);
      // Enter the entry function's stage for its subtree so derivative-in-vertex-shader can fire.
      // A helper called by both entries stays `null` — only calls inside the vertex entry itself flag.
      const name = node.protoType.ident.lexeme;
      const stage: WalkContext["currentStage"] =
        name === this._vertexEntry && this._vertexEntry
          ? "vertex"
          : name === this._fragmentEntry && this._fragmentEntry
            ? "fragment"
            : null;
      const definitions = this._functionDefinitions.get(name) ?? [];
      definitions.push(node);
      this._functionDefinitions.set(name, definitions);
      childCtx = { currentFunction: node, loopDepth: ctx.loopDepth, currentStage: stage };
    } else if (node instanceof ASTNode.IterationStatement) {
      this._checkIterationCondition(node);
      childCtx = {
        currentFunction: ctx.currentFunction,
        loopDepth: ctx.loopDepth + 1,
        currentStage: ctx.currentStage
      };
    } else if (node instanceof ASTNode.SelectionStatement) {
      this._checkNonBoolCondition(node);
    } else if (node instanceof ASTNode.ConditionalExpression) {
      this._checkTernaryCondition(node);
    } else if (node instanceof ASTNode.JumpStatement) {
      this._checkJump(node, ctx);
    } else if (node instanceof ASTNode.FunctionCallGeneric) {
      this._checkConstructorArgs(node);
      this._checkRecursiveCall(node, ctx);
      this._checkDerivativeCall(node, ctx);
    } else if (node instanceof ASTNode.UnaryExpression) {
      this._checkUnaryOperand(node);
    } else if (node instanceof ASTNode.MultiplicativeExpression) {
      // A bad operand reports InvalidBinaryOperands and suppresses the divide-by-zero check on the
      // same node — clean operands are the only case the const-zero check needs to consider.
      if (!this._checkArithmeticOperands(node)) {
        this._checkConstDivideByZero(node);
        // `%` additionally requires integer operands per §5.9. Floats slip past _checkArithmetic-
        // Operands because they're a valid arithmetic type, but the driver rejects `float % float`.
        this._checkModuloOperandsInteger(node);
        this._checkArithmeticFamilyMatch(node);
      }
    } else if (node instanceof ASTNode.AdditiveExpression) {
      if (!this._checkArithmeticOperands(node)) this._checkArithmeticFamilyMatch(node);
    } else if (node instanceof ASTNode.ShiftExpression) {
      this._checkShiftRange(node);
      this._checkIntegerBinaryOperands(node);
    } else if (
      node instanceof ASTNode.AndExpression ||
      node instanceof ASTNode.ExclusiveOrExpression ||
      node instanceof ASTNode.InclusiveOrExpression
    ) {
      this._checkIntegerBinaryOperands(node);
    } else if (
      node instanceof ASTNode.LogicalAndExpression ||
      node instanceof ASTNode.LogicalXorExpression ||
      node instanceof ASTNode.LogicalOrExpression
    ) {
      this._checkScalarBoolBinaryOperands(node);
    } else if (node instanceof ASTNode.PostfixExpression) {
      this._checkPostfix(node);
    } else if (node instanceof ASTNode.FunctionDeclarator) {
      this._checkReturnType(node);
    } else if (node instanceof ASTNode.FunctionProtoType) {
      this._checkLocalFunctionPrototype(node, ctx);
    } else if (node instanceof ASTNode.StructSpecifier) {
      this._checkStructSpecifier(node);
    } else if (node instanceof ASTNode.AssignmentExpression) {
      this._checkAssignmentTarget(node);
    }
    const children = node.children;
    if (children) {
      for (const child of children) {
        if (child instanceof TreeNode) this._walk(child, childCtx);
      }
    }
  }

  /**
   * `gl_FragData` is a fragment-output *array* — legal only when indexed (`gl_FragData[i] = ...`).
   * A bare reference (r-value, l-value, swizzle, function arg) is invalid GLSL. The parser
   * collects every `gl_FragData` location into `shaderData.glFragDataReferences`; `_checkPostfix`
   * records the base of every `gl_FragData[i]` shape in `_indexedGlFragDataStarts`. Anything left
   * over — first occurrence only — is reported here.
   */
  private _reportBareGlFragData(): void {
    for (const loc of this._shaderData.glFragDataReferences) {
      if (this._indexedGlFragDataStarts.has(loc.start.index)) continue;
      this._push(
        "'gl_FragData' must be indexed — write to `gl_FragData[i]` or return an MRT struct.",
        loc,
        DiagnosticType.BareGlFragData
      );
      return;
    }
  }

  private _push(message: string, location: ShaderRange, code: DiagnosticType): void {
    this._errors.push(
      ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, this._source, location, code)
    );
  }

  /**
   * GLSL ES §5.8: "the left operand of the assignment operator must be an l-value". The parser only
   * checks type compatibility on assignment; this catches the shapes that couldn't ever be written
   * to — macros, function returns, constant literals, `const`-qualified variables, and compound
   * expressions (r-values by construction). Descend through wrapper nodes (single-child expression
   * chains, parenthesised primaries, postfix `.field` / `[i]` peeling) and report the first shape
   * that isn't assignable.
   */
  private _checkAssignmentTarget(node: ASTNode.AssignmentExpression): void {
    // Only the ternary `lhs op rhs` shape has an LHS to inspect; the single-child form is a pure
    // r-value chain that reaches AssignmentExpression only because of the grammar's precedence tree.
    if (node.children.length !== 3) return;
    const lhs = node.children[0] as ASTNode.ExpressionAstNode;
    const reason = this._nonAssignableReason(lhs);
    if (reason) {
      this._push(
        `Cannot assign to ${reason} — the left operand of '=' must be a modifiable l-value.`,
        lhs.location,
        DiagnosticType.InvalidAssignmentTarget
      );
    }
  }

  /**
   * Describe why `node` is not an l-value, or return undefined if it is one. The descent mirrors
   * the grammar's operator-precedence chain — single-child wrappers pass through, r-value-only
   * constructs (function calls, compound arithmetic, ternary) terminate with a specific reason.
   */
  private _nonAssignableReason(node: TreeNode): string | undefined {
    // Compound / arithmetic / logical / relational shapes produce r-values; the grammar wraps them
    // in AssignmentExpression → ConditionalExpression → ... → PrimaryExpression when only a
    // single-child pass-through fires, so a >1-child form of any of these terminates as non-lvalue.
    if (node instanceof ASTNode.ConditionalExpression && node.children.length > 1) {
      return "a ternary expression result";
    }
    if (
      (node instanceof ASTNode.LogicalOrExpression ||
        node instanceof ASTNode.LogicalXorExpression ||
        node instanceof ASTNode.LogicalAndExpression ||
        node instanceof ASTNode.InclusiveOrExpression ||
        node instanceof ASTNode.ExclusiveOrExpression ||
        node instanceof ASTNode.AndExpression ||
        node instanceof ASTNode.EqualityExpression ||
        node instanceof ASTNode.RelationalExpression ||
        node instanceof ASTNode.ShiftExpression ||
        node instanceof ASTNode.AdditiveExpression ||
        node instanceof ASTNode.MultiplicativeExpression) &&
      node.children.length > 1
    ) {
      return "a compound expression";
    }
    if (node instanceof ASTNode.UnaryExpression && node.children.length > 1) {
      return "a unary-operator result";
    }
    if (node instanceof ASTNode.FunctionCallGeneric) {
      return "a function call result";
    }
    if (node instanceof ASTNode.PostfixExpression) {
      const base = node.children[0];
      if (!(base instanceof TreeNode)) return "an unassignable postfix expression";
      return this._nonAssignableReason(base);
    }
    if (node instanceof ASTNode.PrimaryExpression) {
      if (node.children.length === 1) {
        const child = node.children[0];
        if (child instanceof ASTNode.VariableIdentifier) return this._nonAssignableReason(child);
        if (child instanceof BaseToken) {
          if (child.type === ETokenType.INT_CONSTANT || child.type === ETokenType.FLOAT_CONSTANT) {
            return "a numeric literal";
          }
          if (child.type === Keyword.True || child.type === Keyword.False) return "a boolean literal";
        }
        return undefined;
      }
      // Parenthesised: `( expr )` — l-value-ness passes through the wrapped expression.
      const inner = node.children[1];
      if (inner instanceof TreeNode) return this._nonAssignableReason(inner);
      return undefined;
    }
    if (node instanceof ASTNode.VariableIdentifier) {
      const child = node.children[0];
      // A macro may expand to a legal l-value; its expansion is validated by the runtime compiler.
      if (child instanceof ASTNode.MacroCallSymbol || child instanceof ASTNode.MacroCallFunction) return undefined;
      if (child instanceof BaseToken) {
        const lookup = ShaderValidator._varLookup;
        lookup.set(child.lexeme, ESymbolType.VAR);
        const symbol = this._shaderData.symbolTable.getSymbol(lookup, true, node._branch);
        if (symbol instanceof VarSymbol) {
          if (symbol.isConst) return "a const-qualified variable";
          // GLSL ES §5.9: uniforms, inputs, and samplers are not l-values. Check sampler before
          // uniform — a sampler is *always* uniform in ES (§4.1.7), so both branches would fire,
          // but "a sampler" is a more actionable diagnostic than the generic uniform text.
          if (TypeSystem.isSamplerType(symbol.dataType?.type)) return "a sampler";
          // Galacean's implicit uniform (global, no initializer). Driver rejects `u_i++` as
          // "l-value required (can't modify a uniform "u_i")".
          if (symbol.isUniform) return "a uniform variable";
        }
      }
      return undefined;
    }
    // Single-child expression wrappers (Expression, ConditionalExpression when children.length===1,
    // etc.) don't add semantics — descend into the child.
    if (node.children.length === 1) {
      const child = node.children[0];
      if (child instanceof TreeNode) return this._nonAssignableReason(child);
    }
    return undefined;
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
    this._reportNonBoolCondition(condition, "'if' condition");
  }

  /**
   * `while (cond)` / `for (init; cond; step)` — cond must be a bool. Same rule as `if`; the
   * grammar wraps it in `Condition` (WHILE) or `ForRestStatement > ConditionOpt > Condition` (FOR).
   * A `Condition` in `type id = init` form uses the initializer's type.
   */
  private _checkIterationCondition(node: ASTNode.IterationStatement): void {
    const children = node.children;
    const kw = children[0];
    if (!(kw instanceof BaseToken)) return;
    if (kw.type === Keyword.WHILE) {
      const cond = children[2];
      if (cond instanceof ASTNode.Condition) this._checkConditionNode(cond, "'while' condition");
    } else if (kw.type === Keyword.FOR) {
      const rest = children[3];
      if (rest instanceof ASTNode.ForRestStatement) {
        const opt = rest.children[0];
        if (opt instanceof ASTNode.ConditionOpt && opt.children.length === 1) {
          const inner = opt.children[0];
          if (inner instanceof ASTNode.Condition) this._checkConditionNode(inner, "'for' condition");
        }
      }
    }
  }

  /**
   * Resolve a `Condition` node (either `expression` or `type id = initializer` form) to its
   * expression-typed slot and delegate to the shared non-bool reporter.
   */
  private _checkConditionNode(cond: ASTNode.Condition, label: string): void {
    const c = cond.children;
    // `condition: expression`
    if (c.length === 1 && c[0] instanceof ASTNode.ExpressionAstNode) {
      this._reportNonBoolCondition(c[0] as ASTNode.ExpressionAstNode, label);
      return;
    }
    // `condition: fully_specified_type id '=' initializer` — the initializer at children[3] carries the type.
    if (c.length === 4 && c[3] instanceof ASTNode.ExpressionAstNode) {
      this._reportNonBoolCondition(c[3] as ASTNode.ExpressionAstNode, label);
    }
  }

  /**
   * `cond ? a : b` — cond must be a bool. children[0] is the condition (LogicalOrExpression);
   * the 1-child collapse form is not a ternary and is skipped.
   */
  private _checkTernaryCondition(node: ASTNode.ConditionalExpression): void {
    if (node.children.length !== 5) return;
    const condition = node.children[0];
    if (!(condition instanceof ASTNode.ExpressionAstNode)) return;
    this._reportNonBoolCondition(condition, "ternary condition");
  }

  /** Emit NonBoolCondition when `condition.type` is known and not bool. Skips TypeAny. */
  private _reportNonBoolCondition(condition: ASTNode.ExpressionAstNode, label: string): void {
    const t = condition.type;
    if (t !== TypeAny && t !== Keyword.BOOL) {
      this._push(
        `${label[0].toUpperCase()}${label.slice(1)} must be a bool, got '${TypeSystem.typeName(t)}'.`,
        condition.location,
        DiagnosticType.NonBoolCondition
      );
    }
  }

  /**
   * A builtin numeric constructor (`vecN(...)` etc.) cannot take a sampler/struct argument
   * (ConstructorArgType), and a vecN needs exactly N components — too few OR too many is
   * ConstructorArgCount. A single scalar is a valid splat (short-circuit).
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
    // A vecN / matN constructor needs exactly N components (or N×M for matrices) from its args.
    // Skip when we can't count any side. A single scalar is a valid splat and short-circuits before
    // the exact-count check. Mismatch either direction is ConstructorArgCount.
    const matrixNeed = TypeSystem.matrixComponentCount(functionIdentifier.ident);
    const need = TypeSystem.vectorComponentCount(functionIdentifier.ident) || matrixNeed;
    if (need <= 0) return;
    // GLSL ES §5.4.3: `matN(matM)` — a matrix constructor with a single matrix argument. Always
    // legal regardless of M vs N (source is truncated / padded diagonally). Short-circuit before
    // the component-count check, which would otherwise fire on the source's total component count.
    if (matrixNeed > 0 && list.paramSig.length === 1 && TypeSystem.matrixComponentCount(list.paramSig[0]) > 0) {
      return;
    }
    // GLSL ES §5.4.2: constructing a shorter vector from one longer vector drops trailing
    // components, e.g. `vec3(vec4Value)`. The reverse direction still lacks components.
    if (matrixNeed === 0 && list.paramSig.length === 1 && TypeSystem.vectorComponentCount(list.paramSig[0]) >= need) {
      return;
    }
    let total = 0;
    let countable = list.paramSig.length > 0;
    for (const t of list.paramSig) {
      const c = TypeSystem.isScalarType(t)
        ? 1
        : TypeSystem.vectorComponentCount(t) || TypeSystem.matrixComponentCount(t);
      if (c === 0) {
        countable = false;
        break;
      }
      total += c;
    }
    const singleScalar = list.paramSig.length === 1 && TypeSystem.isScalarType(list.paramSig[0]);
    if (countable && !singleScalar && total !== need) {
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
    if (node.children.length !== 2) return;
    // Prefix `++`/`--` — first child is the raw INC_OP/DEC_OP token (not wrapped in UnaryOperator).
    // The operand must be an l-value per §5.9, same rule as postfix `++`/`--`.
    const firstChild = node.children[0];
    if (
      firstChild instanceof BaseToken &&
      (firstChild.type === ETokenType.INC_OP || firstChild.type === ETokenType.DEC_OP)
    ) {
      const operand = node.children[1];
      if (operand instanceof TreeNode) {
        const reason = this._nonAssignableReason(operand);
        if (reason) {
          this._push(
            `Cannot apply '${firstChild.lexeme}' to ${reason} — the operand of '${firstChild.lexeme}' must be a modifiable l-value.`,
            operand.location,
            DiagnosticType.InvalidAssignmentTarget
          );
        }
      }
      return;
    }
    if (!(firstChild instanceof ASTNode.UnaryOperator)) return;
    const opToken = firstChild.children[0];
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
   * GLSL ES §6.1: function declarations (prototypes) may only appear at global scope. The grammar
   * accepts `int g();` inside a function body, so without this check the parser cascades into a
   * misleading `EntryNotFound`. A `FunctionProtoType` wrapped in a `FunctionDefinition` is the
   * body path — that's a legal definition, not a prototype declaration.
   */
  private _checkLocalFunctionPrototype(node: ASTNode.FunctionProtoType, ctx: WalkContext): void {
    if (!ctx.currentFunction) return;
    if (node.parent instanceof ASTNode.FunctionDefinition) return;
    this._push(
      `Function prototype '${node.ident.lexeme}' cannot be declared inside a function body — declare it at global scope.`,
      node.location,
      DiagnosticType.LocalFunctionPrototype
    );
  }

  /**
   * `%` requires integer operands per §5.9. `_checkArithmeticOperands` accepts floats (they're a
   * valid *arithmetic* type), so this is an additional pass that only fires for the `%` operator.
   * Direct-operand check only — compound expressions resolve to TypeAny per Phase-2 constraint.
   */
  private _checkModuloOperandsInteger(node: ASTNode.MultiplicativeExpression): void {
    if (node.children.length !== 3) return;
    const op = node.children[1];
    if (!(op instanceof BaseToken) || op.type !== ETokenType.PERCENT) return;
    const bad = this._firstNonIntegerOperand(node.children[0], node.children[2]);
    if (bad) {
      this._push(
        `Operator '%' requires integer operands, got '${TypeSystem.typeName(bad.type)}'.`,
        bad.location,
        DiagnosticType.InvalidBinaryOperands
      );
    }
  }

  /**
   * `<<` `>>` `&` `|` `^` — all take integer scalar-or-vector operands per §5.9. Same
   * direct-operand contract as `_checkModuloOperandsInteger`.
   */
  private _checkIntegerBinaryOperands(
    node:
      | ASTNode.ShiftExpression
      | ASTNode.AndExpression
      | ASTNode.ExclusiveOrExpression
      | ASTNode.InclusiveOrExpression
  ): void {
    if (node.children.length !== 3) return;
    const op = node.children[1];
    const opLexeme = op instanceof BaseToken ? op.lexeme : "op";
    const bad = this._firstNonIntegerOperand(node.children[0], node.children[2]);
    if (bad) {
      this._push(
        `Operator '${opLexeme}' requires integer operands, got '${TypeSystem.typeName(bad.type)}'.`,
        bad.location,
        DiagnosticType.InvalidBinaryOperands
      );
    }
  }

  /**
   * `&&` `||` `^^` — each operand must be `bool` scalar per §5.9. GLSL ES rejects `bvecN` operands
   * (desktop-GL 4.x does allow it; ES 3.00 does not).
   */
  private _checkScalarBoolBinaryOperands(
    node: ASTNode.LogicalAndExpression | ASTNode.LogicalXorExpression | ASTNode.LogicalOrExpression
  ): void {
    if (node.children.length !== 3) return;
    const op = node.children[1];
    const opLexeme = op instanceof BaseToken ? op.lexeme : "op";
    const bad = this._firstNonScalarBoolOperand(node.children[0], node.children[2]);
    if (bad) {
      this._push(
        `Operator '${opLexeme}' requires scalar bool operands, got '${TypeSystem.typeName(bad.type)}'.`,
        bad.location,
        DiagnosticType.InvalidBinaryOperands
      );
    }
  }

  /** GLSL ES arithmetic requires matching numeric families and compatible vector/matrix shapes. */
  private _checkArithmeticFamilyMatch(node: ASTNode.MultiplicativeExpression | ASTNode.AdditiveExpression): void {
    if (node.children.length !== 3) return;
    const left = node.children[0];
    const right = node.children[2];
    if (!(left instanceof ASTNode.ExpressionAstNode) || !(right instanceof ASTNode.ExpressionAstNode)) return;
    const lf = ShaderValidator._arithmeticFamily(left.type);
    const rf = ShaderValidator._arithmeticFamily(right.type);
    if (lf === undefined || rf === undefined) return;
    const op = node.children[1];
    const opLexeme = op instanceof BaseToken ? op.lexeme : "op";
    if (lf === rf && ShaderValidator._areArithmeticShapesCompatible(left.type, right.type, opLexeme)) return;
    this._push(
      `Operator '${opLexeme}' cannot combine '${TypeSystem.typeName(left.type)}' and '${TypeSystem.typeName(right.type)}'.`,
      node.location,
      DiagnosticType.InvalidBinaryOperands
    );
  }

  /** Primitive family of a numeric scalar / vector / matrix, or undefined if unknown or non-numeric. */
  private static _arithmeticFamily(t: GalaceanDataType | undefined): "float" | "int" | "uint" | undefined {
    if (t === undefined || t === TypeAny || typeof t === "string") return undefined;
    if (TypeSystem.isBoolType(t) || TypeSystem.isSamplerType(t)) return undefined;
    if (TypeSystem.matrixComponentCount(t) > 0) return "float";
    switch (t) {
      case Keyword.FLOAT:
      case Keyword.VEC2:
      case Keyword.VEC3:
      case Keyword.VEC4:
        return "float";
      case Keyword.INT:
      case Keyword.IVEC2:
      case Keyword.IVEC3:
      case Keyword.IVEC4:
        return "int";
      case Keyword.UINT:
      case Keyword.UVEC2:
      case Keyword.UVEC3:
      case Keyword.UVEC4:
        return "uint";
      default:
        return undefined;
    }
  }

  private static _areArithmeticShapesCompatible(
    left: GalaceanDataType,
    right: GalaceanDataType,
    operator: string
  ): boolean {
    if (left === right || TypeSystem.isScalarType(left) || TypeSystem.isScalarType(right)) return true;
    const leftVectorSize = TypeSystem.vectorComponentCount(left);
    const rightVectorSize = TypeSystem.vectorComponentCount(right);
    if (leftVectorSize || rightVectorSize) {
      if (leftVectorSize && rightVectorSize) return leftVectorSize === rightVectorSize;
      const matrix = leftVectorSize ? TypeSystem.matrixDimensions(right) : TypeSystem.matrixDimensions(left);
      const vectorSize = leftVectorSize || rightVectorSize;
      if (!matrix || operator !== "*") return false;
      return leftVectorSize ? vectorSize === matrix.rows : vectorSize === matrix.columns;
    }
    const leftMatrix = TypeSystem.matrixDimensions(left);
    const rightMatrix = TypeSystem.matrixDimensions(right);
    if (!leftMatrix || !rightMatrix) return false;
    return operator === "*"
      ? leftMatrix.columns === rightMatrix.rows
      : leftMatrix.columns === rightMatrix.columns && leftMatrix.rows === rightMatrix.rows;
  }

  /** First operand whose direct type is neither integer nor `TypeAny`. */
  private _firstNonIntegerOperand(a: NodeChild, b: NodeChild): ASTNode.ExpressionAstNode | undefined {
    if (a instanceof ASTNode.ExpressionAstNode && a.type !== TypeAny && !TypeSystem.isIntegerType(a.type)) return a;
    if (b instanceof ASTNode.ExpressionAstNode && b.type !== TypeAny && !TypeSystem.isIntegerType(b.type)) return b;
    return undefined;
  }

  /** First operand whose direct type is neither `bool` nor `TypeAny`. */
  private _firstNonScalarBoolOperand(a: NodeChild, b: NodeChild): ASTNode.ExpressionAstNode | undefined {
    if (a instanceof ASTNode.ExpressionAstNode && a.type !== TypeAny && a.type !== Keyword.BOOL) return a;
    if (b instanceof ASTNode.ExpressionAstNode && b.type !== TypeAny && b.type !== Keyword.BOOL) return b;
    return undefined;
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
    // `postfix ++` / `postfix --` — the operand must be an l-value per §5.9.
    if (children.length === 2 && children[1] instanceof BaseToken) {
      const op = children[1];
      const operand = children[0];
      if ((op.type === ETokenType.INC_OP || op.type === ETokenType.DEC_OP) && operand instanceof TreeNode) {
        const reason = this._nonAssignableReason(operand);
        if (reason) {
          this._push(
            `Cannot apply '${op.lexeme}' to ${reason} — the operand of '${op.lexeme}' must be a modifiable l-value.`,
            operand.location,
            DiagnosticType.InvalidAssignmentTarget
          );
        }
      }
      return;
    }
    if (children.length === 3 && children[2] instanceof BaseToken) {
      const base = children[0] as ASTNode.ExpressionAstNode;
      const field = children[2];
      // GLSL ES §5.5: `.field` on a receiver that is not a struct, scalar, or vector is invalid.
      // The driver rejects `s.rr` (sampler) or `f().xx` (void return) with "field selection requires
      // structure, vector, or interface block on left hand side". Skip TypeAny — unknown types keep
      // the wiggle room. Struct types are strings; `ParserUtils.swizzleError` already returns null
      // for them and the parser's inline UndeclaredStructMember path takes over.
      const baseType = base.type;
      if (
        baseType !== undefined &&
        baseType !== TypeAny &&
        typeof baseType !== "string" &&
        TypeSystem.vectorComponentCount(baseType) === 0 &&
        !TypeSystem.isScalarType(baseType)
      ) {
        this._push(
          `Field selection '.${field.lexeme}' requires a structure, vector, or scalar receiver — got '${TypeSystem.typeName(baseType)}'.`,
          field.location,
          DiagnosticType.InvalidSwizzle
        );
        return;
      }
      const swizzleError = ParserUtils.swizzleError(base.type, field.lexeme);
      if (swizzleError) {
        this._push(swizzleError, field.location, DiagnosticType.InvalidSwizzle);
      }
    } else if (children.length === 4) {
      // `base [ index ]`.
      const base = children[0] as ASTNode.ExpressionAstNode;
      const index = children[2];
      // `gl_FragData[i]` — record the base's location so `_reportBareGlFragData` treats this
      // occurrence as legal rather than reporting it as a bare use.
      if (ParserUtils.extractDirectIdentLexeme(base) === "gl_FragData") {
        this._indexedGlFragDataStarts.add(base.location.start.index);
      }
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
      // Array-of-vector base like `ivec2 arr[N]` — a[i] indexes the outer array, not the inner
      // vec2. Skip the vector-bounds check when the base is an array; the array-size check
      // still runs below when the array size is known at compile time.
      const baseArrayIdent = ParserUtils.unwrapBareIdentifier(base, { allowParens: true });
      const baseIsArray = !!baseArrayIdent?.isArray;
      const size = baseIsArray ? 0 : TypeSystem.vectorComponentCount(base.type);
      if (size > 0) {
        const n = ParserUtils.constNumericValue(index);
        if (n !== undefined && (n < 0 || n >= size)) {
          const m = `Index ${n} is out of bounds for a ${size}-component vector.`;
          this._push(m, index.location, DiagnosticType.IndexOutOfBounds);
        }
      } else {
        // A constant index past a fixed-size array's bounds is out of bounds — the spec
        // requires bounds-checking fixed-size arrays as well as vectors. Unsized / non-array
        // bases keep arraySize undefined.
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

  /**
   * A sampler (opaque) type or a struct containing a sampler cannot be returned by value — GLSL
   * forbids returning opaque types (spec §6.1). Struct returns look up the members via the symbol
   * table; recursion through nested structs is bounded by declaration order (a struct can only name
   * an already-declared struct).
   */
  private _checkReturnType(node: ASTNode.FunctionDeclarator): void {
    const returnType = node.returnType;
    const t = returnType.type;
    if (TypeSystem.isSamplerType(t)) {
      this._push(
        `Function return type '${TypeSystem.typeName(t)}' is not constructible; samplers cannot be returned.`,
        returnType.location,
        DiagnosticType.NonConstructibleReturnType
      );
      return;
    }
    if (typeof t === "string" && this._structContainsSampler(t, new Set())) {
      this._push(
        `Function return type '${t}' is not constructible; structs containing samplers cannot be returned.`,
        returnType.location,
        DiagnosticType.NonConstructibleReturnType
      );
    }
  }

  private static _structLookup = new SymbolInfo("", null);
  private static _structScratch: StructSymbol[] = [];

  /**
   * Recursively check whether a struct (by name) contains a sampler member at any nesting depth.
   * `visited` breaks cycles that could arise via mutually-referenced typedefs / macros.
   */
  private _structContainsSampler(structName: string, visited: Set<string>): boolean {
    if (visited.has(structName)) return false;
    visited.add(structName);
    const lookup = ShaderValidator._structLookup;
    lookup.set(structName, ESymbolType.STRUCT);
    const structs = this._shaderData.symbolTable.getSymbols(
      lookup as unknown as StructSymbol,
      false,
      ShaderValidator._structScratch
    );
    for (const s of structs) {
      const astNode = s.astNode as ASTNode.StructSpecifier | undefined;
      const propList = astNode?.propList;
      if (!propList) continue;
      for (const prop of propList) {
        const pt = prop.typeInfo.type;
        if (TypeSystem.isSamplerType(pt)) return true;
        if (typeof pt === "string" && this._structContainsSampler(pt, visited)) return true;
      }
    }
    return false;
  }

  /**
   * Function-level MissingReturn: a non-void function whose body does not guarantee a return on
   * every control-flow path. A simple per-path CFG: a block guarantees return if its last executed
   * statement is either a `return value;` or an `if/else` where both arms guarantee. Loops / macros
   * / switch are conservatively treated as "may not return" — a `for {…return…}` doesn't count
   * because the loop might not execute. The void-with-value case is reported per-jump in
   * `_checkJump` (the parser no longer records `returnStatement` for void functions — codegen
   * invariant, see AST.ts FunctionDefinition.semanticAnalyze).
   */
  private _checkFunctionReturn(node: ASTNode.FunctionDefinition): void {
    const returnType = node.protoType.returnType;
    if (returnType.type === Keyword.VOID) return;
    if (!ShaderValidator._blockGuaranteesReturn(node.statements)) {
      this._push(`No return statement found.`, returnType.location, DiagnosticType.MissingReturn);
    }
  }

  /** True if `node` (a block-like or statement wrapper) definitely returns on every path. */
  private static _blockGuaranteesReturn(node: TreeNode | undefined): boolean {
    if (!node) return false;
    // A JumpStatement whose keyword is RETURN — `return value;` (children.length === 3) or
    // `return;` (children.length === 2). Only valid in void, but still terminates the path.
    if (node instanceof ASTNode.JumpStatement) {
      const kw = node.children[0];
      return kw instanceof BaseToken && kw.type === Keyword.RETURN;
    }
    // If/else — both arms must guarantee. `if` alone (no else) doesn't guarantee: the else path
    // falls through.
    if (node instanceof ASTNode.SelectionStatement) {
      // Grammar: IF '(' expression ')' statement (ELSE statement)?
      const children = node.children;
      if (children.length !== 7) return false;
      return (
        ShaderValidator._blockGuaranteesReturn(children[4] as TreeNode) &&
        ShaderValidator._blockGuaranteesReturn(children[6] as TreeNode)
      );
    }
    // `#ifdef … #else … #endif` inside a function body. Analyzer must model the same visibility
    // that codegen does — if every reachable branch (including `#else`) terminates in a return,
    // the whole `#if` block is a return-guarantee. Without an `#else`, the runtime-preprocessor
    // may see zero arms match, so we conservatively say no.
    if (node instanceof ASTNode.MacroIfStatement) {
      return ShaderValidator._macroIfGuaranteesReturn(node);
    }
    // A block/statement wrapper: walk to the last real statement of a block and recurse.
    const last = ShaderValidator._lastStatementOf(node);
    if (last && last !== node) return ShaderValidator._blockGuaranteesReturn(last);
    return false;
  }

  /**
   * `macro_if_statement → macro_push_context statement_list macro_branch`. A `macro_branch` is
   * either `[macro_pop_context]` (bare `#endif`, no `#else`, so at runtime the untaken side
   * falls through), `[macro_else_expression, statement_list, macro_pop_context]`, or
   * `[macro_elif_expression, statement_list, macro_branch]`. For the whole `#if` to guarantee a
   * return, the leading arm's `statement_list` must return AND the tail must terminate on all
   * remaining arms — the recursion also rejects the bare-endif case.
   */
  private static _macroIfGuaranteesReturn(node: ASTNode.MacroIfStatement): boolean {
    const c = node.children;
    if (c.length !== 3) return false;
    const leadStatements = c[1] as TreeNode;
    const tailBranch = c[2] as ASTNode.MacroBranch;
    if (!ShaderValidator._blockGuaranteesReturn(leadStatements)) return false;
    return ShaderValidator._macroBranchGuaranteesReturn(tailBranch);
  }

  private static _macroBranchGuaranteesReturn(node: ASTNode.MacroBranch): boolean {
    const c = node.children;
    // Bare `#endif` — no `#else`, runtime side may fall through. Reject.
    if (c.length === 1) return false;
    if (c.length === 3) {
      // `#else <stmts> #endif` — one final arm, must return.
      if (c[0] instanceof ASTNode.MacroElseExpression) {
        return ShaderValidator._blockGuaranteesReturn(c[1] as TreeNode);
      }
      // `#elif <stmts> <next-branch>` — this arm returns AND the tail terminates on all remaining.
      if (c[0] instanceof ASTNode.MacroElifExpression) {
        return (
          ShaderValidator._blockGuaranteesReturn(c[1] as TreeNode) &&
          ShaderValidator._macroBranchGuaranteesReturn(c[2] as ASTNode.MacroBranch)
        );
      }
    }
    return false;
  }

  /**
   * Descend through the block/statement wrappers used by the grammar (Statement, SimpleStatement,
   * CompoundStatement, CompoundStatementNoScope, StatementList) to the last real statement of a
   * block. Returns `undefined` for empty blocks; returns the input for a non-block leaf.
   */
  private static _lastStatementOf(node: TreeNode): TreeNode | undefined {
    if (
      node instanceof ASTNode.Statement ||
      node instanceof ASTNode.SimpleStatement ||
      node instanceof ASTNode.CompoundStatement ||
      node instanceof ASTNode.CompoundStatementNoScope
    ) {
      const children = node.children;
      // `{}` — empty block.
      if (children.length === 2) return undefined;
      // Walk into the non-brace children (a Statement / StatementList) and take the last real leaf.
      for (const child of children) {
        if (child instanceof TreeNode) {
          const inner = ShaderValidator._lastStatementOf(child);
          if (inner) return inner;
        }
      }
      return undefined;
    }
    if (node instanceof ASTNode.StatementList) {
      // Left-recursive: the last child is always the newest Statement.
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        const c = children[i];
        if (c instanceof TreeNode) {
          const inner = ShaderValidator._lastStatementOf(c);
          if (inner) return inner;
        }
      }
      return undefined;
    }
    return node;
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
      } else if (children.length !== 3) {
        this._push(
          "Return in a non-void function must provide a value.",
          node.location,
          DiagnosticType.InvalidReturnType
        );
      } else {
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
    const callee = node.fnSymbol;
    if (callee instanceof FnSymbol) {
      if (callee.astNode !== currentFunction) {
        let out = this._callGraph.get(currentFunction);
        if (!out) {
          out = new Set();
          this._callGraph.set(currentFunction, out);
        }
        out.add(callee.astNode);
        return;
      }
      this._push(
        `Recursive call to '${fnIdent}' is not allowed (GLSL forbids recursion).`,
        functionIdentifier.location,
        DiagnosticType.RecursiveFunction
      );
      return;
    }
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

  /**
   * After the walk, find call-graph cycles of length ≥ 2 (mutual recursion) and report each cycle
   * on its lexicographically-first participant. Direct self-recursion is already reported at the
   * call site by `_checkRecursiveCall`, so ignore length-1 cycles here.
   */
  private _reportMutualRecursion(): void {
    // Iterative DFS with a recursion stack — for each starting fn, look for a back-edge to something
    // already on the stack that isn't the immediate self edge.
    const seen = new Set<ASTNode.FunctionDefinition>();
    const reported = new Set<ASTNode.FunctionDefinition>();
    for (const start of this._callGraph.keys()) {
      if (seen.has(start)) continue;
      const stack: ASTNode.FunctionDefinition[] = [start];
      const onStack = new Set<ASTNode.FunctionDefinition>([start]);
      const iters: Array<Iterator<ASTNode.FunctionDefinition>> = [(this._callGraph.get(start) ?? new Set()).values()];
      while (stack.length) {
        const it = iters[iters.length - 1];
        const step = it.next();
        if (step.done) {
          const done = stack.pop()!;
          onStack.delete(done);
          seen.add(done);
          iters.pop();
          continue;
        }
        const next = step.value;
        if (onStack.has(next)) {
          // cycle detected — extract the participants from the stack
          const cycleStart = stack.indexOf(next);
          const cycle = stack.slice(cycleStart);
          if (cycle.length >= 2) {
            const marker = cycle.reduce((first, candidate) =>
              candidate.protoType.ident.lexeme < first.protoType.ident.lexeme ? candidate : first
            );
            if (!reported.has(marker)) {
              reported.add(marker);
              this._push(
                `Mutual recursion detected in call chain: ${cycle
                  .map((fn) => fn.protoType.ident.lexeme)
                  .join(" → ")} → ${next.protoType.ident.lexeme} (GLSL forbids recursion).`,
                marker.protoType.ident.location,
                DiagnosticType.RecursiveFunction
              );
            }
          }
          continue;
        }
        if (seen.has(next)) continue;
        stack.push(next);
        onStack.add(next);
        iters.push((this._callGraph.get(next) ?? new Set()).values());
      }
    }
  }

  /**
   * Post-walk pass: transitively reach from the vertex entry via the call graph, and report any
   * derivative call site inside a reachable helper. Helpers called only from the fragment entry
   * are silent; helpers on both paths get flagged (the vertex path evaluates them illegally).
   */
  private _reportDerivativeReachableFromVertex(): void {
    if (!this._vertexEntry) return;
    const reachable = new Set<ASTNode.FunctionDefinition>();
    const stack = [...(this._functionDefinitions.get(this._vertexEntry) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      const callees = this._callGraph.get(cur);
      if (callees) for (const c of callees) stack.push(c);
    }
    // Vertex entry itself is handled inline in `_checkDerivativeCall`; skip it here.
    for (const entry of this._functionDefinitions.get(this._vertexEntry) ?? []) reachable.delete(entry);
    for (const fn of reachable) {
      const sites = this._derivativeSites.get(fn);
      if (!sites) continue;
      for (const s of sites) {
        this._push(
          `Derivative function '${s.name}' is reached from the vertex entry via '${fn.protoType.ident.lexeme}' — derivatives are fragment-only.`,
          s.location,
          DiagnosticType.DerivativeInVertexShader
        );
      }
    }
  }

  /**
   * Fragment-only derivative builtins (`dFdx`/`dFdy`/`fwidth`) — illegal in the vertex shader
   * (`DerivativeInVertexShader`) and require a float/floatN argument (`NonFloatDerivativeArg`).
   * Only user-callable functions reach here (isBuiltin=false, since the identifier is a string name,
   * not a type keyword); constructors like `vec3(...)` never match a derivative name.
   */
  private _checkDerivativeCall(node: ASTNode.FunctionCallGeneric, ctx: WalkContext): void {
    const functionIdentifier = node.children[0] as ASTNode.FunctionIdentifier;
    if (functionIdentifier.isBuiltin) return;
    const name = functionIdentifier.lexeme;
    if (!DERIVATIVE_BUILTINS.has(name)) return;

    if (ctx.currentStage === "vertex") {
      this._push(
        `Derivative function '${name}' is not allowed in the vertex shader (fragment-only).`,
        node.location,
        DiagnosticType.DerivativeInVertexShader
      );
    } else if (ctx.currentFunction) {
      // Record for the post-walk reachability pass: a helper that calls dFdx is illegal when the
      // vertex entry transitively reaches it, even if the helper itself is `currentStage === null`.
      const enclosing = ctx.currentFunction;
      let sites = this._derivativeSites.get(enclosing);
      if (!sites) {
        sites = [];
        this._derivativeSites.set(enclosing, sites);
      }
      sites.push({ name, location: node.location });
    }

    // Spec: derivative builtins take `genType` (float/vec2/vec3/vec4); anything else is a type error.
    if (node.children.length === 4 && node.children[2] instanceof ASTNode.FunctionCallParameterList) {
      const list = node.children[2] as ASTNode.FunctionCallParameterList;
      const paramSig = list.paramSig;
      if (paramSig.length === 1) {
        const t = paramSig[0];
        if (t !== TypeAny && !ShaderValidator._isFloatOrFloatVector(t)) {
          const argNode = list.paramNodes[0] as TreeNode | undefined;
          this._push(
            `'${name}' expects a float or floatN argument, got '${TypeSystem.typeName(t)}'.`,
            argNode?.location ?? list.location,
            DiagnosticType.NonFloatDerivativeArg
          );
        }
      }
    }
  }

  /**
   * `struct Foo { ... }` — flags an empty body (`EmptyStruct`). An empty body is unreachable via
   * the plain grammar (`struct_declaration_list` requires ≥1 declaration → SyntaxError first), but a
   * fully-macro-guarded body can reduce to zero collected props; the check catches that shape rather
   * than the surface form.
   */
  private _checkStructSpecifier(node: ASTNode.StructSpecifier): void {
    const propList = node.propList;
    if (!propList || propList.length === 0) {
      const location = node.ident?.location ?? node.location;
      this._push("Struct declaration must contain at least one member.", location, DiagnosticType.EmptyStruct);
    }
  }

  /** float / vec2 / vec3 / vec4 — the `genType` family derivative builtins accept. */
  private static _isFloatOrFloatVector(t: unknown): boolean {
    return t === Keyword.FLOAT || t === Keyword.VEC2 || t === Keyword.VEC3 || t === Keyword.VEC4;
  }
}
