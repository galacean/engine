import {
  ASTNode,
  BaseToken,
  ESymbolType,
  ETokenType,
  GSError,
  GSErrorName,
  isBranchReachable,
  Keyword,
  NodeChild,
  ParserUtils,
  ShaderCompilerUtils,
  ShaderBuiltinSemantic,
  ShaderRange,
  StructSymbol,
  SymbolInfo,
  TreeNode,
  TypeAny,
  TypeSystem,
  FnSymbol
} from "@galacean/engine-shader-parser/internal/analyzer";
import { getBranchCoverage } from "@galacean/engine-shader-parser/internal/analyzer";
import { DiagnosticType } from "./DiagnosticType";
import type { ShaderAnalysisInfo } from "./ShaderAnalysisInfo";

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
 * inferred `.type` inline; only validation moved here) and collects diagnostics. The parsed pass
 * source is retained by the neutral IR and attached to diagnostics emitted by this pass.
 */
export class ShaderValidator {
  /**
   * Validate an already-parsed program and return collected diagnostics.
   * @param analysis neutral IR plus analyzer-only graph information
   * @returns diagnostics as `GSError[]`
   */
  static validate(analysis: ShaderAnalysisInfo): GSError[] {
    const v = new ShaderValidator(analysis);
    v._walk(analysis.ir.program, { currentFunction: null, loopDepth: 0, currentStage: null });
    v._reportMutualRecursion();
    v._reportDerivativeReachableFromVertex();
    v._reportBareGlFragData();
    return v._errors;
  }

  /** Scratch symbol and output reused while resolving custom type references. */
  private readonly _typeLookup = new SymbolInfo("", ESymbolType.STRUCT);
  private readonly _typeStructScratch: SymbolInfo[] = [];

  private _errors: GSError[] = [];
  /**
   * Start indices of `gl_FragData` reference locations that appear as the base of a
   * `PostfixExpression[base [ index ]]` — the legal `gl_FragData[i]` shape. Collected by
   * `_checkPostfix` during the walk, then used by `_reportBareGlFragData` to strike these off the
   * `shaderData.glFragDataReferences` list; the residue is bare use.
   */
  private _indexedGlFragDataStarts = new Set<number>();
  /** Function definition → derivative call sites inside its body. Post-walk pass reports the ones
   *  reachable from the vertex entry via the call graph. */
  private _derivativeSites = new Map<
    ASTNode.FunctionDefinition,
    { name: string; location: ShaderRange; branch: ASTNode.FunctionCallGeneric["_branch"] }[]
  >();

  private readonly _source: string;
  private readonly _vertexEntry: string;
  private readonly _fragmentEntry: string;
  private readonly _shaderData: ASTNode.GLShaderProgram["shaderData"];

  private constructor(private readonly _analysis: ShaderAnalysisInfo) {
    this._source = _analysis.ir.source;
    this._vertexEntry = _analysis.coreInfo.vertexEntry.name;
    this._fragmentEntry = _analysis.coreInfo.fragmentEntry.name;
    this._shaderData = _analysis.ir.shaderData;
  }

  private _walk(node: TreeNode, ctx: WalkContext): void {
    if (!isBranchReachable(node._branch)) return;
    if (node instanceof ASTNode.MacroDefine) return;
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
      childCtx = {
        currentFunction: ctx.currentFunction,
        loopDepth: ctx.loopDepth + 1,
        currentStage: ctx.currentStage
      };
    } else if (node instanceof ASTNode.JumpStatement) {
      this._checkJump(node, ctx);
    } else if (node instanceof ASTNode.FunctionCallGeneric) {
      this._checkRecursiveCall(node, ctx);
      this._checkDerivativeCall(node, ctx);
    } else if (node instanceof ASTNode.UnaryExpression) {
      this._checkUnaryOperand(node);
    } else if (node instanceof ASTNode.MultiplicativeExpression) {
      if (!this._checkArithmeticOperation(node)) {
        this._checkConstDivideByZero(node);
      }
    } else if (node instanceof ASTNode.AdditiveExpression) {
      this._checkArithmeticOperation(node);
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
    } else if (node instanceof ASTNode.FunctionProtoType) {
      this._checkLocalFunctionPrototype(node, ctx);
    } else if (node instanceof ASTNode.StructSpecifier) {
      this._checkStructSpecifier(node);
    } else if (node instanceof ASTNode.TypeSpecifier && !(node.parent instanceof ASTNode.FunctionIdentifier)) {
      this._checkCustomTypeReference(node);
    } else if (node instanceof ASTNode.SingleDeclaration || node instanceof ASTNode.VariableDeclaration) {
      this._checkVariableDeclarator(node.declarator);
    } else if (node instanceof ASTNode.InitDeclaratorList && node.declarator) {
      this._checkVariableDeclarator(node.declarator);
    } else if (node instanceof ASTNode.ArraySpecifier) {
      this._checkArraySpecifier(node);
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
   * A bare reference (r-value, l-value, swizzle, function arg) is invalid GLSL. `ShaderAnalysisInfo`
   * collects every `gl_FragData` location; `_checkPostfix`
   * records the base of every `gl_FragData[i]` shape in `_indexedGlFragDataStarts`. Anything left
   * over — first occurrence only — is reported here.
   */
  private _reportBareGlFragData(): void {
    for (const loc of this._analysis.glFragDataReferences) {
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

  private _checkCustomTypeReference(node: ASTNode.TypeSpecifier): void {
    if (!node.isCustom) return;
    const typeName = (node.children[0] as ASTNode.TypeSpecifierNonArray).children[0];
    if (!(typeName instanceof BaseToken)) return;

    const lookup = this._typeLookup;
    lookup.set(typeName.lexeme, ESymbolType.STRUCT);
    const symbolTable = this._shaderData.symbolTable;
    const structs = symbolTable.getSymbols(lookup, true, this._typeStructScratch);
    const referenceIndex = typeName.location.start.index;
    let priorStructCount = 0;
    for (let i = 0, n = structs.length; i < n; i++) {
      const struct = structs[i] as StructSymbol;
      if (struct.astNode.ident && struct.astNode.ident.location.start.index < referenceIndex) {
        structs[priorStructCount++] = struct;
      }
    }
    structs.length = priorStructCount;

    if (!structs.length) {
      if (symbolTable.hasSymbol(lookup)) {
        this._push(
          `Type '${typeName.lexeme}' is declared only after this reference or in an unavailable macro branch.`,
          typeName.location,
          DiagnosticType.UseBeforeDeclaration
        );
      }
      return;
    }

    const coverage = getBranchCoverage(
      structs.map((struct) => struct.branchSignature ?? []),
      node._branch
    );
    if (coverage === "uncovered") {
      this._push(
        `Type '${typeName.lexeme}' is unavailable under at least one macro configuration reaching this reference.`,
        typeName.location,
        DiagnosticType.UseBeforeDeclaration
      );
    }
  }

  private _checkVariableDeclarator(declarator: ASTNode.VariableDeclaratorInfo): void {
    const { identifier, initializer, isConst, typeInfo } = declarator;
    if (typeInfo.type === Keyword.VOID) {
      this._push(
        `Illegal use of type 'void' — '${identifier.lexeme}' cannot be declared as void.`,
        identifier.location,
        DiagnosticType.InvalidVoidVariable
      );
    }
    if (initializer && !typeInfo.arraySpecifier && !TypeSystem.isAssignable(typeInfo.type, initializer.type)) {
      this._push(
        `Cannot initialize '${identifier.lexeme}' of type '${TypeSystem.typeName(
          typeInfo.type
        )}' from '${TypeSystem.typeName(initializer.type)}'.`,
        initializer.location,
        DiagnosticType.AssignTypeMismatch
      );
    }
    if (initializer && isConst && !ParserUtils.isConstExpr(initializer)) {
      this._push(
        `'${identifier.lexeme}': const initializer must be a constant expression.`,
        initializer.location,
        DiagnosticType.NonConstInitializer
      );
    }
  }

  private _checkArraySpecifier(node: ASTNode.ArraySpecifier): void {
    if (typeof node.size !== "number" || node.size > 0) return;
    const expression = node.children[1];
    if (!(expression instanceof TreeNode)) return;
    this._push(
      `Array size ${node.size} must be greater than zero.`,
      expression.location,
      DiagnosticType.InvalidArraySize
    );
  }

  /**
   * Unary operand-type rules: `!` needs bool, `~` needs integer, `-`/`+` need numeric. The operand
   * type is read directly (not the deduced result), so this fires for known operands and skips
   * TypeAny (continue-with-unknown); `++`/`--` reduce with a raw token child and are not handled here.
   */
  private _checkUnaryOperand(node: ASTNode.UnaryExpression): void {
    if (node.children.length !== 2) return;
    const firstChild = node.children[0];
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

  /** Validate and infer arithmetic from the same TypeSystem operation result used by the parser. */
  private _checkArithmeticOperation(node: ASTNode.MultiplicativeExpression | ASTNode.AdditiveExpression): boolean {
    if (node.children.length !== 3) return false;
    const left = node.children[0];
    const right = node.children[2];
    const operator = node.children[1];
    if (!(left instanceof ASTNode.ExpressionAstNode) || !(right instanceof ASTNode.ExpressionAstNode)) return false;
    const operatorLexeme = operator instanceof BaseToken ? operator.lexeme : "op";
    const result = TypeSystem.arithmeticOperation(left.type, right.type, operatorLexeme);
    if (result.valid !== false) return false;
    this._push(
      `Operator '${operatorLexeme}' cannot combine '${TypeSystem.typeName(left.type)}' and '${TypeSystem.typeName(right.type)}'.`,
      node.location,
      DiagnosticType.InvalidBinaryOperands
    );
    return true;
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
    if (children.length === 2) return;
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
      const isFragmentOutputArray =
        ParserUtils.unwrapBareIdentifier(base, { allowParens: true })?.builtinSemantic ===
        ShaderBuiltinSemantic.FragmentOutputArray;
      if (isFragmentOutputArray) {
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
      if (isFragmentOutputArray && !ParserUtils.isConstExpr(index)) {
        this._push(
          "Fragment output array index must be a constant integral expression.",
          index.location,
          DiagnosticType.NonConstFragmentOutputIndex
        );
      }
      if (isFragmentOutputArray) {
        const outputIndex = ParserUtils.constIntegerValue(index);
        if (outputIndex !== undefined && outputIndex < 0) {
          this._push(
            `Fragment output index ${outputIndex} is out of bounds.`,
            index.location,
            DiagnosticType.IndexOutOfBounds
          );
        }
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
   * Function-level MissingReturn: a non-void function whose body does not guarantee a return on
   * every control-flow path. A simple per-path CFG: a block guarantees return if its last executed
   * statement is either a `return value;` or an `if/else` where both arms guarantee. Loops / macros
   * / switch are conservatively treated as "may not return" — a `for {…return…}` doesn't count
   * because the loop might not execute. The void-with-value case is reported per-jump in
   * `_checkJump`.
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
    const callees = node.fnSymbols ?? (node.fnSymbol instanceof FnSymbol ? [node.fnSymbol] : []);
    if (callees.length) {
      if (!callees.some((callee) => callee.astNode === currentFunction)) return;
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
    const reported = new Set<ASTNode.FunctionDefinition>();
    for (const cycle of this._analysis.mutualRecursionCycles()) {
      const marker = cycle.reduce((first, candidate) =>
        candidate.protoType.ident.lexeme < first.protoType.ident.lexeme ? candidate : first
      );
      if (reported.has(marker)) continue;
      reported.add(marker);
      this._push(
        `Mutual recursion detected in call chain: ${cycle
          .map((fn) => fn.protoType.ident.lexeme)
          .join(" → ")} → ${cycle[0].protoType.ident.lexeme} (GLSL forbids recursion).`,
        marker.protoType.ident.location,
        DiagnosticType.RecursiveFunction
      );
    }
  }

  /**
   * Post-walk pass: transitively reach from the vertex entry via the call graph, and report any
   * derivative call site inside a reachable helper. Helpers called only from the fragment entry
   * are silent; helpers on both paths get flagged (the vertex path evaluates them illegally).
   */
  private _reportDerivativeReachableFromVertex(): void {
    const vertexEntry = this._analysis.coreInfo.vertexEntry;
    if (!vertexEntry.name) return;
    const reachable = new Set(this._analysis.reachableFunctions(vertexEntry));
    // Vertex entry itself is handled inline in `_checkDerivativeCall`; skip it here.
    for (const entry of vertexEntry.functions) reachable.delete(entry.astNode);
    for (const fn of reachable) {
      const sites = this._derivativeSites.get(fn);
      if (!sites) continue;
      for (const s of sites) {
        if (!this._analysis.isFunctionBranchReachable(vertexEntry, fn, s.branch)) continue;
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
      sites.push({ name, location: node.location, branch: node._branch });
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
