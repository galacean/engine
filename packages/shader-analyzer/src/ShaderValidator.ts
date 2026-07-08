import {
  ASTNode,
  BaseToken,
  DiagnosticType,
  ESymbolType,
  ETokenType,
  GSError,
  GSErrorName,
  Keyword,
  ParserUtils,
  ShaderCompilerUtils,
  ShaderRange,
  StructSymbol,
  SymbolInfo,
  TreeNode,
  TypeAny,
  TypeSystem
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
    return v._errors;
  }

  private _errors: GSError[] = [];
  /** name → set of names it directly calls. Populated during walk, used by mutual-recursion pass. */
  private _callGraph = new Map<string, Set<string>>();
  /** name → declaration ident location (for reporting on the outermost cycle participant). */
  private _fnLocations = new Map<string, ShaderRange>();

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
      if (!this._checkArithmeticOperands(node)) this._checkConstDivideByZero(node);
    } else if (node instanceof ASTNode.AdditiveExpression) {
      this._checkArithmeticOperands(node);
    } else if (node instanceof ASTNode.ShiftExpression) {
      this._checkShiftRange(node);
    } else if (node instanceof ASTNode.PostfixExpression) {
      this._checkPostfix(node);
    } else if (node instanceof ASTNode.FunctionDeclarator) {
      this._checkReturnType(node);
    } else if (node instanceof ASTNode.VariableIdentifier) {
      this._checkGlFragDataReference(node);
    } else if (node instanceof ASTNode.StructSpecifier) {
      this._checkStructSpecifier(node);
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
    const need =
      TypeSystem.vectorComponentCount(functionIdentifier.ident) ||
      TypeSystem.matrixComponentCount(functionIdentifier.ident);
    if (need <= 0) return;
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
   * `gl_FragData` referenced by name (bare, `.x` swizzle, non-index postfix) is removed in the IO
   * model; the postfix check already handles `gl_FragData[i]`. Skip when this identifier is the base
   * of an indexed PostfixExpression to avoid double-firing.
   */
  private _checkGlFragDataReference(node: ASTNode.VariableIdentifier): void {
    const child = node.children[0];
    if (!(child instanceof BaseToken) || child.lexeme !== "gl_FragData") return;
    // In `gl_FragData[i]` the identifier lives inside PrimaryExpression → PostfixExpression[len=4]
    // as `children[0]`. `_checkPostfix` reports that shape; skip here so we don't duplicate.
    const primary = node.parent;
    if (primary instanceof ASTNode.PrimaryExpression) {
      const postfix = primary.parent;
      if (
        postfix instanceof ASTNode.PostfixExpression &&
        postfix.children.length === 4 &&
        postfix.children[0] === primary
      ) {
        return;
      }
    }
    this._push("Please use MRT struct instead of gl_FragData.", node.location, DiagnosticType.GlFragData);
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
    // A block/statement wrapper: walk to the last real statement of a block and recurse.
    const last = ShaderValidator._lastStatementOf(node);
    if (last && last !== node) return ShaderValidator._blockGuaranteesReturn(last);
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
    // Record the call edge for the mutual-recursion post-pass (regardless of whether it's self-recursion).
    const caller = proto.ident.lexeme;
    let out = this._callGraph.get(caller);
    if (!out) {
      out = new Set();
      this._callGraph.set(caller, out);
    }
    out.add(fnIdent);
    if (!this._fnLocations.has(caller)) this._fnLocations.set(caller, proto.ident.location);
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
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const start of this._callGraph.keys()) {
      if (seen.has(start)) continue;
      const stack: string[] = [start];
      const onStack = new Set<string>([start]);
      const iters: Array<Iterator<string>> = [(this._callGraph.get(start) ?? new Set()).values()];
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
            const marker = [...cycle].sort()[0];
            if (!reported.has(marker)) {
              reported.add(marker);
              const loc = this._fnLocations.get(marker);
              if (loc) {
                this._push(
                  `Mutual recursion detected in call chain: ${cycle.join(" → ")} → ${next} (GLSL forbids recursion).`,
                  loc,
                  DiagnosticType.RecursiveFunction
                );
              }
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
