import { ClearableObjectPool, type IPoolElement } from "@galacean/engine-core";
import type { ICodeGenVisitor } from "./ICodeGenVisitor";
import { ETokenType, GalaceanDataType, ShaderRange, TokenType, TypeAny } from "../common";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ParserUtils } from "../ParserUtils";
import { DiagnosticType } from "../DiagnosticType";
import { Lexer } from "../lexer/Lexer";
import { MacroDefineInfo } from "../Preprocessor";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
import { NoneTerminal } from "./GrammarSymbol";
import SemanticAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo, VarSymbol } from "./symbolTable";
import { IParamInfo, NodeChild, StructProp, SymbolType } from "./types";

/** Texture-sampling builtins whose first argument is a sampler — used to flag a non-sampler arg0. */
const TEXTURE_SAMPLING_BUILTINS = new Set([
  "texture",
  "texture2D",
  "texture2DLod",
  "texture2DLodEXT",
  "textureCube",
  "textureCubeLod",
  "textureCubeLodEXT",
  "textureLod",
  "textureOffset",
  "textureProj",
  "textureProjLod",
  "textureProjOffset",
  "textureSize",
  "texelFetch"
]);

function ASTNodeDecorator(nonTerminal: NoneTerminal) {
  return function <T extends { new (): TreeNode }>(ASTNode: T) {
    ASTNode.prototype.nt = nonTerminal;
    (<any>ASTNode).pool = ShaderCompilerUtils.createObjectPool(ASTNode);
  };
}

export abstract class TreeNode implements IPoolElement {
  static pool: ClearableObjectPool<TreeNode & { set: (loc: ShaderRange, children: NodeChild[]) => void }>;

  /** The non-terminal in grammar. */
  nt: NoneTerminal;
  private _children: NodeChild[];
  private _parent: TreeNode;
  private _location: ShaderRange;
  private _codeCache: string;

  /**
   * Parent pointer for AST traversal.
   * @remarks
   * The parent pointer is only reliable after the entire AST has been constructed.
   * DO NOT rely on `parent` during the `semanticAnalyze` phase, as the AST may still be under construction.
   * It is safe to use `parent` during code generation or any phase after AST construction.
   */
  get parent(): TreeNode {
    return this._parent;
  }

  get children() {
    return this._children;
  }

  get location() {
    return this._location;
  }

  set(loc: ShaderRange, children: NodeChild[]): void {
    this._location = loc;
    this._children = children;
    for (const child of children) {
      if (child instanceof TreeNode) {
        child._parent = this;
      }
    }

    this.init();
  }

  init() {}

  dispose(): void {}

  setCache(code: string): string {
    this._codeCache = code;
    return code;
  }

  getCache(): string {
    return this._codeCache;
  }

  // Visitor pattern interface for code generation
  codeGen(visitor: ICodeGenVisitor) {
    const code = visitor.defaultCodeGen(this.children);
    this.setCache(code);
    return code;
  }

  /**
   * Do semantic analyze right after the ast node is generated.
   */
  semanticAnalyze(sa: SemanticAnalyzer) {}
}

export namespace ASTNode {
  type MacroExpression =
    | MacroPushContext
    | MacroPopContext
    | MacroElseExpression
    | MacroElifExpression
    | MacroUndef
    | MacroDefine
    | BaseToken;

  export type ASTNodePool = ClearableObjectPool<
    { set: (loc: ShaderRange, children: NodeChild[]) => void } & IPoolElement & TreeNode
  >;

  export function _unwrapToken(node: NodeChild) {
    if (node instanceof BaseToken) {
      return node;
    }
    throw "not token";
  }

  export function get(pool: ASTNodePool, sa: SemanticAnalyzer, loc: ShaderRange, children: NodeChild[]) {
    const node = pool.get();
    node.set(loc, children);
    node.semanticAnalyze(sa);
    sa.semanticStack.push(node);
  }

  @ASTNodeDecorator(NoneTerminal._ignore)
  export class TrivialNode extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.scope_brace)
  export class ScopeBrace extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.pushScope();
    }
  }

  @ASTNodeDecorator(NoneTerminal.scope_end_brace)
  export class ScopeEndBrace extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.popScope();
    }
  }

  @ASTNodeDecorator(NoneTerminal.jump_statement)
  export class JumpStatement extends TreeNode {
    isFragReturnStatement: boolean;

    override init(): void {
      this.isFragReturnStatement = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children!;
      if (ASTNode._unwrapToken(children[0]).type === Keyword.RETURN) {
        sa.curFunctionInfo.returnStatement = this;
        // A returned value must be assignable to the declared return type (the void case is ReturnInVoidFunction's job).
        if (children.length === 3) {
          const declared = sa.curFunctionInfo.header?.returnType?.type;
          const returned = (children[1] as ExpressionAstNode).type;
          if (declared != undefined && declared !== Keyword.VOID && !ParserUtils.isAssignable(declared, returned)) {
            sa.reportError(
              children[1].location,
              `Cannot return a value of type '${ParserUtils.typeName(returned)}' from a function returning '${ParserUtils.typeName(declared)}'.`,
              DiagnosticType.ReturnTypeMismatch
            );
          }
        }
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitJumpStatement(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.conditionopt)
  export class ConditionOpt extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.for_rest_statement)
  export class ForRestStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.condition)
  export class Condition extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.for_init_statement)
  export class ForInitStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.iteration_statement)
  export class IterationStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.selection_statement)
  export class SelectionStatement extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      // `if (cond)` — cond must be a bool. GLSL ES has no implicit scalar→bool, so a float/int
      // condition is an error. Skip TypeAny (unknown) to avoid false positives (continue-with-unknown).
      const condition = this.children.find((c) => c instanceof ExpressionAstNode) as ExpressionAstNode | undefined;
      if (!condition) return;
      const t = condition.type;
      if (t !== TypeAny && t !== Keyword.BOOL) {
        sa.reportError(
          condition.location,
          `Condition of 'if' must be a bool, got '${ParserUtils.typeName(t)}'.`,
          DiagnosticType.NonBoolCondition
        );
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.expression_statement)
  export class ExpressionStatement extends TreeNode {}

  export abstract class ExpressionAstNode extends TreeNode {
    protected _type?: GalaceanDataType;
    set type(t: GalaceanDataType | undefined) {
      this._type = t;
    }
    get type() {
      return this._type ?? TypeAny;
    }

    override init(): void {
      this._type = undefined;
    }
  }

  @ASTNodeDecorator(NoneTerminal.initializer_list)
  export class InitializerList extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const init = this.children[0] as Initializer | InitializerList;
      this.type = init.type;
    }
  }

  @ASTNodeDecorator(NoneTerminal.initializer)
  export class Initializer extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AssignmentExpression>this.children[0]).type;
      } else {
        this.type = (<InitializerList>this.children[1]).type;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.single_declaration)
  export class SingleDeclaration extends TreeNode {
    typeSpecifier: TypeSpecifier;
    arraySpecifier?: ArraySpecifier;

    override init(): void {
      this.typeSpecifier = undefined;
      this.arraySpecifier = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const childrenLen = children.length;
      const fullyType = children[0] as FullySpecifiedType;
      const typeSpecifier = fullyType.typeSpecifier;
      this.typeSpecifier = typeSpecifier;
      this.arraySpecifier = typeSpecifier.arraySpecifier;

      const id = children[1] as BaseToken;
      const isConst = fullyType.isConst;

      let sm: VarSymbol;
      let initializer: Initializer | undefined;
      if (childrenLen === 2 || childrenLen === 4) {
        const symbolType = new SymbolType(fullyType.type, typeSpecifier.lexeme, this.arraySpecifier);
        initializer = children[3] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer, isConst);
      } else {
        // Array-of-array is target-divergent (GLSL ES 3.00 / WGSL allow it, ES 1.00 doesn't) and the
        // backend can always emit it, so it's left to codegen/driver — not flagged here. The nested
        // array structure stays as the neutral clue.
        const arraySpecifier = children[2] as ArraySpecifier;
        this.arraySpecifier = arraySpecifier;
        const symbolType = new SymbolType(fullyType.type, typeSpecifier.lexeme, this.arraySpecifier);
        initializer = children[4] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer, isConst);
      }
      if (sa.symbolTableStack.insert(sm)) {
        sa.reportWarning(id.location, `Redefinition of '${id.lexeme}'.`, DiagnosticType.Redefinition);
      }
      // A `const`-qualified variable's initializer must be a compile-time constant.
      if (isConst && initializer && !ParserUtils.isConstExpr(initializer, sa)) {
        sa.reportError(
          initializer.location,
          `'${id.lexeme}': const initializer must be a constant expression.`,
          DiagnosticType.NonConstInitializer
        );
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitSingleDeclaration(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.fully_specified_type)
  export class FullySpecifiedType extends TreeNode {
    typeSpecifier: TypeSpecifier;
    type: GalaceanDataType;
    /** Whether the declaration is `const`-qualified — drives the const-initializer / array-size checks. */
    isConst: boolean;

    override semanticAnalyze(_: SemanticAnalyzer): void {
      const children = this.children;
      this.isConst = children.length === 2 && ParserUtils.hasQualifier(children[0] as TreeNode, Keyword.CONST);
      this.typeSpecifier = (children.length === 1 ? children[0] : children[1]) as TypeSpecifier;
      this.type = this.typeSpecifier.type;
    }
  }

  @ASTNodeDecorator(NoneTerminal.type_qualifier)
  export class TypeQualifier extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.single_type_qualifier)
  export class SingleTypeQualifier extends TreeNode {
    qualifier: Keyword;
    lexeme: string;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const child = this.children[0];
      if (child instanceof BaseToken) {
        this.qualifier = child.type as Keyword;
        this.lexeme = child.lexeme;
      } else {
        this.qualifier = (<BasicTypeQualifier>child).qualifier;
        this.lexeme = (<BasicTypeQualifier>child).lexeme;
      }
    }
  }

  abstract class BasicTypeQualifier extends TreeNode {
    qualifier: Keyword;
    lexeme: string;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const token = this.children[0] as BaseToken;
      this.qualifier = token.type as Keyword;
      this.lexeme = token.lexeme;
    }
  }

  @ASTNodeDecorator(NoneTerminal.storage_qualifier)
  export class StorageQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.precision_qualifier)
  export class PrecisionQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.interpolation_qualifier)
  export class InterpolationQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.invariant_qualifier)
  export class InvariantQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.type_specifier)
  export class TypeSpecifier extends TreeNode {
    type: GalaceanDataType;
    lexeme: string;
    arraySize?: number;
    isCustom: boolean;

    override init(): void {
      this.arraySize = undefined;
    }
    get arraySpecifier(): ArraySpecifier {
      return this.children[1] as ArraySpecifier;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const firstChild = children[0] as TypeSpecifierNonArray;
      this.type = firstChild.type;
      this.lexeme = firstChild.lexeme;
      this.arraySize = (children?.[1] as ArraySpecifier)?.size;
      this.isCustom = typeof this.type === "string";
    }
  }

  @ASTNodeDecorator(NoneTerminal.array_specifier)
  export class ArraySpecifier extends TreeNode {
    size: number | undefined;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const integerConstantExpr = this.children[1];
      if (!(integerConstantExpr instanceof IntegerConstantExpression)) return; // `[ ]` — unsized
      this.size = integerConstantExpr.value;
      // A non-literal size must be a constant. Only a single bare `variable_identifier` is checked: a
      // const symbol is valid GLSL, a non-const isn't. Literals (value set) and compound arithmetic
      // expressions (operands left to the type system) are not flagged — no false positive on macros.
      const exprChildren = integerConstantExpr.children;
      if (this.size === undefined && exprChildren.length === 1 && exprChildren[0] instanceof VariableIdentifier) {
        if (!ParserUtils.isConstExpr(exprChildren[0], sa)) {
          sa.reportError(
            exprChildren[0].location,
            "Array size must be a constant expression.",
            DiagnosticType.NonConstArraySize
          );
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.integer_constant_expression_operator)
  export class IntegerConstantExpressionOperator extends TreeNode {
    compute?: (a: number, b: number) => number;
    lexeme: string;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const operator = this.children[0] as BaseToken;
      this.lexeme = operator.lexeme;
      switch (operator.type) {
        case ETokenType.PLUS:
          this.compute = (a, b) => a + b;
          break;
        case ETokenType.DASH:
          this.compute = (a, b) => a - b;
          break;
        case ETokenType.STAR:
          this.compute = (a, b) => a * b;
          break;
        case ETokenType.SLASH:
          this.compute = (a, b) => a / b;
          break;
        case ETokenType.PERCENT:
          this.compute = (a, b) => a % b;
          break;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.integer_constant_expression)
  export class IntegerConstantExpression extends TreeNode {
    value?: number;

    override init(): void {
      this.value = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const child = this.children[0];
        if (child instanceof BaseToken) {
          this.value = Number(child.lexeme);
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.type_specifier_nonarray)
  export class TypeSpecifierNonArray extends TreeNode {
    type: GalaceanDataType;
    lexeme: string;

    override init(): void {
      const tt = this.children[0];
      if (tt instanceof BaseToken) {
        // ID — user-defined struct identifier; the lexeme is the type name.
        this.type = tt.lexeme;
        this.lexeme = tt.lexeme;
      } else if (tt instanceof MacroCallSymbol) {
        // Macro-as-type-alias — value resolved at variant codegen, type is `TypeAny` here.
        this.type = TypeAny;
        this.lexeme = tt.macroName;
      } else {
        this.type = (tt as ExtBuiltinTypeSpecifierNonArray).type as GalaceanDataType;
        this.lexeme = (tt as ExtBuiltinTypeSpecifierNonArray).lexeme;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.ext_builtin_type_specifier_nonarray)
  export class ExtBuiltinTypeSpecifierNonArray extends TreeNode {
    type: TokenType;
    lexeme: string;

    override init(): void {
      const token = this.children[0] as BaseToken;
      this.type = token.type;
      this.lexeme = token.lexeme;
    }
  }

  @ASTNodeDecorator(NoneTerminal.init_declarator_list)
  export class InitDeclaratorList extends TreeNode {
    typeInfo: SymbolType;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      let sm: VarSymbol;
      const children = this.children;
      const childrenLength = children.length;
      if (childrenLength === 1) {
        const { typeSpecifier, arraySpecifier } = children[0] as SingleDeclaration;
        this.typeInfo = new SymbolType(typeSpecifier.type, typeSpecifier.lexeme, arraySpecifier);
      } else {
        const initDeclList = children[0] as InitDeclaratorList;
        this.typeInfo = initDeclList.typeInfo;
      }

      if (childrenLength === 3 || childrenLength === 5) {
        const id = children[2] as BaseToken;
        sm = new VarSymbol(id.lexeme, this.typeInfo, false, this);
        if (sa.symbolTableStack.insert(sm)) {
          sa.reportWarning(id.location, `Redefinition of '${id.lexeme}'.`, DiagnosticType.Redefinition);
        }
      } else if (childrenLength === 4 || childrenLength === 6) {
        // Array-of-array is target-divergent — left to codegen/driver, not flagged here (see SingleDeclaration).
        const typeInfo = this.typeInfo;
        const arraySpecifier = this.children[3] as ArraySpecifier;
        typeInfo.arraySpecifier = arraySpecifier;
        const id = children[2] as BaseToken;
        sm = new VarSymbol(id.lexeme, typeInfo, false, this);
        if (sa.symbolTableStack.insert(sm)) {
          sa.reportWarning(id.location, `Redefinition of '${id.lexeme}'.`, DiagnosticType.Redefinition);
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.identifier_list)
  export class IdentifierList extends TreeNode {
    idList: BaseToken[] = [];

    override init(): void {
      this.idList.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, idList: curIdList } = this;
      if (children.length === 2) {
        curIdList.push(children[1] as BaseToken);
      } else {
        const list = children[0] as IdentifierList;
        const id = children[2] as BaseToken;
        const listIdLength = list.idList.length;
        curIdList.length = listIdLength + 1;

        for (let i = 0; i < listIdLength; i++) {
          curIdList[i] = list.idList[i];
        }
        curIdList[listIdLength] = id;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.declaration)
  export class Declaration extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitDeclaration(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_prototype)
  export class FunctionProtoType extends TreeNode {
    ident: BaseToken;
    returnType: FullySpecifiedType;
    parameterList: IParamInfo[];
    paramSig: GalaceanDataType[] | undefined;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const declarator = this.children[0] as FunctionDeclarator;
      this.ident = declarator.ident;
      this.returnType = declarator.returnType;
      this.parameterList = declarator.parameterInfoList;
      this.paramSig = declarator.paramSig;
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_declarator)
  export class FunctionDeclarator extends TreeNode {
    ident: BaseToken;
    returnType: FullySpecifiedType;
    parameterInfoList: IParamInfo[] | undefined;
    paramSig: GalaceanDataType[] | undefined;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.curFunctionInfo.returnStatement = null;
      sa.curFunctionInfo.header = this;

      const children = this.children;
      const header = children[0] as FunctionHeader;
      const parameterList = children[1] as FunctionParameterList | undefined;
      this.ident = header.ident;
      this.returnType = header.returnType;
      this.parameterInfoList = parameterList?.parameterInfoList;
      this.paramSig = parameterList?.paramSig;

      // A sampler (opaque) type cannot be returned by value — GLSL forbids it.
      if (ParserUtils.isSamplerType(this.returnType.type)) {
        sa.reportError(
          this.returnType.location,
          `Function return type '${ParserUtils.typeName(this.returnType.type)}' is not constructible; samplers cannot be returned.`,
          DiagnosticType.NonConstructibleReturnType
        );
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_header)
  export class FunctionHeader extends TreeNode {
    ident: BaseToken;
    returnType: FullySpecifiedType;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.pushScope();
      const children = this.children;
      this.ident = children[1] as BaseToken;
      this.returnType = children[0] as FullySpecifiedType;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionHeader(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_parameter_list)
  export class FunctionParameterList extends TreeNode {
    parameterInfoList: IParamInfo[] = [];
    paramSig: GalaceanDataType[] = [];

    override init(): void {
      this.parameterInfoList.length = 0;
      this.paramSig.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const { parameterInfoList, paramSig } = this;

      if (children[0] instanceof ParameterDeclaration) {
        const decl = children[0];
        parameterInfoList.push({ ident: decl.ident, typeInfo: decl.typeInfo, astNode: decl });
        paramSig.push(decl.typeInfo?.type ?? TypeAny);
      } else if (children[2] instanceof ParameterDeclaration) {
        const list = children[0] as FunctionParameterList;
        const decl = children[2];

        parameterInfoList.push(...list.parameterInfoList, {
          ident: decl.ident,
          typeInfo: decl.typeInfo,
          astNode: decl
        });
        paramSig.push(...list.paramSig, decl.typeInfo?.type ?? TypeAny);
      } else if (children[0] instanceof FunctionParameterList && children[1] instanceof MacroParamBlock) {
        parameterInfoList.push(...children[0].parameterInfoList, { astNode: children[1] });
        paramSig.push(...children[0].paramSig, TypeAny);
      } else if (children[0] instanceof MacroParamBlock) {
        parameterInfoList.push({ astNode: children[0] });
        paramSig.push(TypeAny);
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionParameterList(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_param_case_list)
  export class MacroParamCaseList extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_param_block)
  export class MacroParamBlock extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_parameter_branch)
  export class MacroParameterBranch extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.parameter_declaration)
  export class ParameterDeclaration extends TreeNode {
    // Some syntax is not recognized, eg.
    // `#define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2D shadowMap`
    typeInfo?: SymbolType;
    ident?: BaseToken;

    override init(): void {
      this.typeInfo = undefined;
      this.ident = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      let parameterDeclarator: ParameterDeclarator | undefined;

      if (children[0] instanceof ParameterDeclarator) {
        parameterDeclarator = children[0];
      } else if (children[1] instanceof ParameterDeclarator) {
        parameterDeclarator = children[1];
      }

      if (parameterDeclarator) {
        this.typeInfo = parameterDeclarator.typeInfo;
        this.ident = parameterDeclarator.ident;
        const varSymbol = new VarSymbol(
          parameterDeclarator.ident.lexeme,
          parameterDeclarator.typeInfo,
          false,
          parameterDeclarator
        );
        sa.symbolTableStack.insert(varSymbol);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.parameter_declarator)
  export class ParameterDeclarator extends TreeNode {
    ident: BaseToken;
    typeInfo: SymbolType;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.ident = children[1] as BaseToken;
      const typeSpecifier = children[0] as TypeSpecifier;
      const arraySpecifier = children[2] as ArraySpecifier;
      this.typeInfo = new SymbolType(typeSpecifier.type, typeSpecifier.lexeme, arraySpecifier);
    }
  }

  @ASTNodeDecorator(NoneTerminal.simple_statement)
  export class SimpleStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.compound_statement)
  export class CompoundStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.compound_statement_no_scope)
  export class CompoundStatementNoScope extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.statement)
  export class Statement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.statement_list)
  export class StatementList extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      // Left-recursive list `[rest, lastStmt]`: if the statement right before `lastStmt` is a terminal
      // jump (return/break/continue/discard), `lastStmt` is unreachable. A nested block / if / loop is
      // not a direct jump, so `if (c) { return; } a;` does not flag `a` (no false positive).
      if (this.children.length !== 2) return;
      const rest = this.children[0];
      const lastStmt = this.children[1];
      if (!(rest instanceof StatementList) || !(lastStmt instanceof TreeNode)) return;
      const prevStmt = rest.children[rest.children.length - 1];
      if (prevStmt instanceof TreeNode && StatementList._isTerminalJump(prevStmt)) {
        sa.reportError(
          lastStmt.location,
          "Unreachable code: this statement follows a return / break / continue / discard.",
          DiagnosticType.UnreachableCode
        );
      }
    }

    /** Walk single-child statement wrappers down to a JumpStatement (a non-wrapper node aborts). */
    private static _isTerminalJump(stmt: TreeNode): boolean {
      let cur: TreeNode = stmt;
      while (true) {
        if (cur instanceof JumpStatement) return true;
        if (cur.children.length !== 1) return false;
        const child = cur.children[0];
        if (!(child instanceof TreeNode)) return false;
        cur = child;
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitStatementList(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_definition)
  export class FunctionDefinition extends TreeNode {
    returnStatement?: ASTNode.JumpStatement;
    protoType: FunctionProtoType;
    statements: CompoundStatementNoScope;
    isInMacroBranch: boolean;

    override init(): void {
      this.returnStatement = undefined;
    }

    /**
     * `break` / `continue` are only valid inside a loop. Post-order reduction means a jump reduces
     * before its enclosing loop, so the context can't be read at the JumpStatement; instead walk the
     * body once here tracking loop depth (GLSL has no nested functions, so a single walk suffices).
     */
    private static _checkControlFlow(sa: SemanticAnalyzer, node: TreeNode, loopDepth: number): void {
      if (node instanceof IterationStatement) {
        for (const c of node.children)
          if (c instanceof TreeNode) FunctionDefinition._checkControlFlow(sa, c, loopDepth + 1);
        return;
      }
      if (node instanceof JumpStatement) {
        const kw = ASTNode._unwrapToken(node.children[0]).type;
        if (loopDepth === 0 && (kw === Keyword.BREAK || kw === Keyword.CONTINUE)) {
          sa.reportError(
            node.location,
            `'${kw === Keyword.BREAK ? "break" : "continue"}' is only allowed inside a loop.`,
            DiagnosticType.MisplacedControlFlow
          );
        }
        return;
      }
      for (const c of node.children) if (c instanceof TreeNode) FunctionDefinition._checkControlFlow(sa, c, loopDepth);
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.protoType = children[0] as FunctionProtoType;
      this.statements = children[1] as CompoundStatementNoScope;
      FunctionDefinition._checkControlFlow(sa, this.statements, 0);

      sa.popScope();
      const sm = new FnSymbol(this.protoType.ident.lexeme, this);
      sa.symbolTableStack.insert(sm);
      this.isInMacroBranch = sa.symbolTableStack.isInMacroBranch;

      const { curFunctionInfo } = sa;
      const { header, returnStatement } = curFunctionInfo;
      if (header.returnType.type === Keyword.VOID) {
        if (returnStatement) {
          sa.reportError(header.returnType.location, "Return in void function.", DiagnosticType.ReturnInVoidFunction);
        }
      } else {
        if (!returnStatement) {
          sa.reportError(header.returnType.location, `No return statement found.`, DiagnosticType.MissingReturn);
        } else {
          this.returnStatement = returnStatement;
        }
      }
      curFunctionInfo.header = undefined;
      curFunctionInfo.returnStatement = undefined;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionDefinition(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_call)
  export class FunctionCall extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionCall(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_call_generic)
  export class FunctionCallGeneric extends ExpressionAstNode {
    fnSymbol: FnSymbol | StructSymbol | undefined;

    override init(): void {
      super.init();
      this.fnSymbol = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const functionIdentifier = this.children[0] as FunctionIdentifier;
      if (functionIdentifier.isBuiltin) {
        this.type = functionIdentifier.ident;
        // A builtin numeric constructor cannot take a sampler or struct argument.
        if (this.children.length === 4 && this.children[2] instanceof FunctionCallParameterList) {
          const list = this.children[2] as FunctionCallParameterList;
          const badIndex = list.paramSig.findIndex((t) => ParserUtils.isSamplerType(t) || typeof t === "string");
          if (badIndex >= 0) {
            const argNode = list.paramNodes[badIndex] as TreeNode | undefined;
            sa.reportError(
              argNode?.location ?? list.location,
              `Cannot construct '${ParserUtils.typeName(functionIdentifier.ident)}' from a '${ParserUtils.typeName(
                list.paramSig[badIndex]
              )}' argument.`,
              list.paramSig.length === 1 ? DiagnosticType.InvalidConversion : DiagnosticType.ConstructorArgType
            );
          } else {
            // A vecN constructor needs exactly N components from its arguments — too few is an error.
            // A single scalar is a valid splat; matrices/unknown args can't be counted, so skip those.
            const need = ParserUtils.vectorComponentCount(functionIdentifier.ident);
            if (need > 0) {
              let total = 0;
              let countable = list.paramSig.length > 0;
              for (const t of list.paramSig) {
                const c = ParserUtils.isScalarType(t) ? 1 : ParserUtils.vectorComponentCount(t);
                if (c === 0) {
                  countable = false;
                  break;
                }
                total += c;
              }
              const singleScalar = list.paramSig.length === 1 && ParserUtils.isScalarType(list.paramSig[0]);
              if (countable && !singleScalar && total < need) {
                sa.reportError(
                  list.location,
                  `Constructor '${ParserUtils.typeName(
                    functionIdentifier.ident
                  )}' needs ${need} components but the arguments provide ${total}.`,
                  DiagnosticType.ConstructorArgCount
                );
              }
            }
          }
        }
      } else {
        const fnIdent = <string>functionIdentifier.ident;

        let paramSig: NonGenericGalaceanType[] | undefined;
        if (this.children.length === 4) {
          const paramList = this.children[2];
          if (paramList instanceof FunctionCallParameterList) {
            paramSig = paramList.paramSig as any;
          }
        }

        // GLSL forbids recursion. A self-call — same name AND same parameter signature as the
        // enclosing function (i.e. the same overload) — is reported here and short-circuited: the
        // function symbol isn't inserted until after its body, so the lookup below would otherwise
        // mis-report it as Undefined / NoMatchingOverload. The exact-signature match avoids flagging
        // a call to a *different* overload of the same name.
        const header = sa.curFunctionInfo.header;
        if (header?.ident?.lexeme === fnIdent) {
          const hSig = header.paramSig ?? [];
          const cSig = paramSig ?? [];
          if (hSig.length === cSig.length && hSig.every((t, i) => t === cSig[i])) {
            sa.reportError(
              this.location,
              `Recursive call to '${fnIdent}' is not allowed (GLSL forbids recursion).`,
              DiagnosticType.RecursiveFunction
            );
            return;
          }
        }
        // A texture-sampling builtin's first argument must be a sampler. Flag a known non-sampler arg0
        // here (specific) rather than letting it fall through to the generic NoMatchingOverload below.
        if (TEXTURE_SAMPLING_BUILTINS.has(fnIdent)) {
          const arg0 = paramSig?.[0];
          if (arg0 !== undefined && arg0 !== TypeAny && !ParserUtils.isSamplerType(arg0)) {
            sa.reportError(
              this.location,
              `'${fnIdent}' expects a sampler as its first argument, got '${ParserUtils.typeName(arg0)}'.`,
              DiagnosticType.ExpectedSampler
            );
            return;
          }
        }

        const builtinFn = BuiltinFunction.resolveOverload(fnIdent, paramSig);
        if (builtinFn) {
          this.type = builtinFn.realReturnType;
          return;
        }

        const lookupSymbol = SemanticAnalyzer._lookupSymbol;
        lookupSymbol.set(fnIdent, ESymbolType.FN, undefined, undefined, paramSig);

        const fnSymbol = sa.symbolTableStack.lookup(lookupSymbol, true) as FnSymbol;

        if (!fnSymbol) {
          // The lookup above is keyed by argument signature, so a miss conflates an unknown
          // name with a known function called with the wrong arguments; re-probe by name
          // alone (and the builtin registry) to report whichever it actually is.
          lookupSymbol.set(fnIdent, ESymbolType.FN);
          const nameDeclared = !!sa.symbolTableStack.lookup(lookupSymbol, true) || BuiltinFunction.isExist(fnIdent);
          sa.reportError(
            this.location,
            nameDeclared ? `No overload function type found: ${fnIdent}` : `Undefined function: ${fnIdent}`,
            nameDeclared ? DiagnosticType.NoMatchingOverload : DiagnosticType.UndefinedFunction
          );
          return;
        }
        this.type = fnSymbol?.dataType?.type;
        this.fnSymbol = fnSymbol;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_call_parameter_list)
  export class FunctionCallParameterList extends TreeNode {
    paramSig: GalaceanDataType[] = [];
    paramNodes: Array<AssignmentExpression | MacroCallArgBlock> = [];

    override init(): void {
      this.paramSig.length = 0;
      this.paramNodes.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, paramSig, paramNodes } = this;
      if (children[0] instanceof AssignmentExpression) {
        const expr = children[0];
        paramSig.push(expr.type);
        paramNodes.push(expr);
      } else if (children[2] instanceof AssignmentExpression) {
        const list = children[0] as FunctionCallParameterList;
        const decl = children[2] as AssignmentExpression;
        paramSig.push(...list.paramSig, decl.type);
        paramNodes.push(...list.paramNodes, decl);
      } else if (children[0] instanceof FunctionCallParameterList && children[1] instanceof MacroCallArgBlock) {
        paramSig.push(...children[0].paramSig, TypeAny);
        paramNodes.push(...children[0].paramNodes, children[1]);
      } else if (children[0] instanceof MacroCallArgBlock) {
        paramSig.push(TypeAny);
        paramNodes.push(children[0]);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_call_arg_case_list)
  export class MacroCallArgCaseList extends TreeNode {}
  @ASTNodeDecorator(NoneTerminal.macro_call_arg_block)
  export class MacroCallArgBlock extends TreeNode {}
  @ASTNodeDecorator(NoneTerminal.macro_call_arg_branch)
  export class MacroCallArgBranch extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.precision_specifier)
  export class PrecisionSpecifier extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (!sa.symbolTableStack.isInMacroBranch) {
        sa.shaderData.globalPrecisions.push(this);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_identifier)
  export class FunctionIdentifier extends TreeNode {
    ident: GalaceanDataType;
    lexeme: string;
    isBuiltin: boolean;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const typeSpecifier = this.children[0] as TypeSpecifier;

      this.ident = typeSpecifier.type;
      this.lexeme = typeSpecifier.lexeme;
      this.isBuiltin = typeof this.ident !== "string";
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionIdentifier(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.assignment_expression)
  export class AssignmentExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as ConditionalExpression;
        this.type = expr.type ?? TypeAny;
      } else {
        const lhs = this.children[0] as ExpressionAstNode;
        const rhs = this.children[2] as AssignmentExpression;
        this.type = rhs.type ?? TypeAny;
        if (!ParserUtils.isAssignable(lhs.type, rhs.type)) {
          sa.reportError(
            this.location,
            `Cannot assign a value of type '${ParserUtils.typeName(rhs.type)}' to '${ParserUtils.typeName(lhs.type)}'.`,
            DiagnosticType.AssignTypeMismatch
          );
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.assignment_operator)
  export class AssignmentOperator extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.expression)
  export class Expression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as AssignmentExpression;
        this.type = expr.type;
      } else {
        const expr = this.children[2] as AssignmentExpression;
        this.type = expr.type;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.primary_expression)
  export class PrimaryExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const id = this.children[0];
        if (id instanceof VariableIdentifier) {
          this.type = id.typeInfo ?? TypeAny;
        } else {
          switch ((<BaseToken>id).type) {
            case ETokenType.INT_CONSTANT:
              this._type = Keyword.INT;
              break;
            case ETokenType.FLOAT_CONSTANT:
              this.type = Keyword.FLOAT;
              break;
            case Keyword.True:
            case Keyword.False:
              this.type = Keyword.BOOL;
              break;
          }
        }
      } else {
        const expression = this.children[1] as Expression;
        this.type = expression.type;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.postfix_expression)
  export class PostfixExpression extends ExpressionAstNode {
    private static _structScratch: SymbolInfo[] = [];

    override init(): void {
      super.init();
      if (this.children.length === 1) {
        const child = this.children[0] as PrimaryExpression | FunctionCall;
        this.type = child.type;
      }
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      // 3-child postfix is `base . field`: a vector base means swizzle, a struct base means field selection.
      const children = this.children;
      if (children.length === 3 && children[2] instanceof BaseToken) {
        const base = children[0] as ExpressionAstNode;
        const field = children[2];
        const swizzleError = ParserUtils.swizzleError(base.type, field.lexeme);
        if (swizzleError) {
          sa.reportError(field.location, swizzleError, DiagnosticType.InvalidSwizzle);
        } else if (typeof base.type === "string") {
          PostfixExpression._checkStructField(sa, base.type, field);
        }
      } else if (children.length === 4) {
        // `base [ index ]`.
        if (ParserUtils.extractDirectIdentLexeme(children[0] as TreeNode) === "gl_FragData") {
          // `gl_FragData[i]` is removed in the IO model — flag regardless of stage, independent of struct roles.
          sa.reportError(
            children[0].location,
            "Please use MRT struct instead of gl_FragData.",
            DiagnosticType.GlFragData
          );
          return;
        }
        const base = children[0] as ExpressionAstNode;
        const index = children[2];
        // A scalar (non-array) base can't be indexed at all. Resolve the base to a bare variable so an
        // array (`a[3]`) or a vector (`v[0]`) is excluded; non-variable/compound bases stay unknown.
        if (ParserUtils.isScalarType(base.type)) {
          const baseIdent = ParserUtils.unwrapBareIdentifier(base, { allowParens: true });
          if (baseIdent && !baseIdent.isArray) {
            const m = `Type '${ParserUtils.typeName(base.type)}' is not indexable.`;
            sa.reportError(base.location, m, DiagnosticType.NonIndexableType);
          }
        }
        if (!(index instanceof ExpressionAstNode)) return;
        // The index must be an integer; a constant integer index past a known vector's size is out of bounds.
        const indexType = index.type;
        if (indexType !== TypeAny && !ParserUtils.isIntegerType(indexType)) {
          const m = `Index must be an integer, got '${ParserUtils.typeName(indexType)}'.`;
          sa.reportError(index.location, m, DiagnosticType.NonIntegerIndex);
          return;
        }
        const size = ParserUtils.vectorComponentCount(base.type);
        if (size > 0) {
          const n = ParserUtils.constNumericValue(index);
          if (n !== undefined && (n < 0 || n >= size)) {
            const m = `Index ${n} is out of bounds for a ${size}-component vector.`;
            sa.reportError(index.location, m, DiagnosticType.IndexOutOfBounds);
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
              sa.reportError(index.location, m, DiagnosticType.IndexOutOfBounds);
            }
          }
        }
      }
    }

    /** A `struct.field` access where the struct type is resolvable: the field must be a declared member. */
    private static _checkStructField(sa: SemanticAnalyzer, structName: string, field: BaseToken): void {
      const lookup = SemanticAnalyzer._lookupSymbol;
      lookup.set(structName, ESymbolType.STRUCT);
      const structs = sa.symbolTableStack.lookupAll(lookup, true, PostfixExpression._structScratch);
      // Unresolved struct (e.g. a built-in or out-of-scope type) — skip rather than risk a false positive.
      if (!structs.length) return;
      for (let i = 0; i < structs.length; i++) {
        if ((structs[i] as StructSymbol).astNode.propList.some((prop) => prop.ident.lexeme === field.lexeme)) return;
      }
      sa.reportError(
        field.location,
        `'${field.lexeme}' : no such field in '${structName}'`,
        DiagnosticType.UndeclaredStructMember
      );
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitPostfixExpression(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.unary_operator)
  export class UnaryOperator extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.unary_expression)
  export class UnaryExpression extends ExpressionAstNode {
    override init(): void {
      this.type = (this.children[0] as PostfixExpression).type;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      // Unary operand-type rules: `!` needs bool, `~` needs integer, `-`/`+` need numeric. The operand
      // type is read directly (not the deduced result), so this fires for known operands and skips
      // TypeAny (continue-with-unknown); `++`/`--` reduce with a raw token child and are not handled here.
      if (this.children.length !== 2 || !(this.children[0] instanceof UnaryOperator)) return;
      const opToken = (this.children[0] as UnaryOperator).children[0];
      const operand = this.children[1] as ExpressionAstNode;
      const t = operand.type;
      if (!(opToken instanceof BaseToken) || t === TypeAny) return;
      let bad = false;
      switch (opToken.type) {
        case ETokenType.BANG:
          bad = !ParserUtils.isBoolType(t);
          break;
        case ETokenType.TILDE:
          bad = !ParserUtils.isIntegerType(t);
          break;
        case ETokenType.DASH:
        case ETokenType.PLUS:
          bad = ParserUtils.isBoolType(t) || ParserUtils.isSamplerType(t) || typeof t === "string";
          break;
      }
      if (bad) {
        sa.reportError(
          this.location,
          `Operator '${opToken.lexeme}' cannot be applied to operand of type '${ParserUtils.typeName(t)}'.`,
          DiagnosticType.InvalidUnaryOperand
        );
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.multiplicative_expression)
  export class MultiplicativeExpression extends ExpressionAstNode {
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        this.type = (this.children[0] as UnaryExpression).type;
      } else {
        this.type = ParserUtils.arithmeticResultType(
          (this.children[0] as ExpressionAstNode).type,
          (this.children[2] as ExpressionAstNode).type
        );
      }
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length !== 3) return;
      const op = this.children[1];
      const divisor = this.children[2];
      // Operands of `*` `/` `%` must be arithmetic (numeric scalar/vector/matrix), not bool/sampler/struct.
      const bad = ParserUtils.firstNonArithmeticOperand(this.children[0], divisor);
      if (bad) {
        sa.reportError(
          bad.location,
          `Type '${ParserUtils.typeName(bad.type)}' is not a valid operand for an arithmetic operator.`,
          DiagnosticType.InvalidBinaryOperands
        );
        return;
      }
      // Integer division/modulo by a compile-time constant zero is an error; float `1.0/0.0` yields Inf
      // (unspecified, not an error). `%` is integer-only in GLSL ES; `/` qualifies only when the result
      // type deduced to an integer (int/int) — FLOAT or TypeAny don't flag.
      if (
        op instanceof BaseToken &&
        divisor instanceof TreeNode &&
        ParserUtils.constNumericValue(divisor) === 0 &&
        (op.type === ETokenType.PERCENT || (op.type === ETokenType.SLASH && ParserUtils.isIntegerType(this.type)))
      ) {
        sa.reportError(
          divisor.location,
          op.type === ETokenType.PERCENT ? "Modulo by constant zero." : "Division by constant zero.",
          DiagnosticType.ConstDivideByZero
        );
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.additive_expression)
  export class AdditiveExpression extends ExpressionAstNode {
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        this.type = (this.children[0] as MultiplicativeExpression).type;
      } else {
        this.type = ParserUtils.arithmeticResultType(
          (this.children[0] as ExpressionAstNode).type,
          (this.children[2] as ExpressionAstNode).type
        );
      }
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length !== 3) return;
      // Operands of `+` `-` must be arithmetic (numeric scalar/vector/matrix), not bool/sampler/struct.
      const bad = ParserUtils.firstNonArithmeticOperand(this.children[0], this.children[2]);
      if (bad) {
        sa.reportError(
          bad.location,
          `Type '${ParserUtils.typeName(bad.type)}' is not a valid operand for an arithmetic operator.`,
          DiagnosticType.InvalidBinaryOperands
        );
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.shift_expression)
  export class ShiftExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
      // A shift by a constant amount outside [0, 32) is out of range — GLSL ES int/uint are 32-bit.
      if (this.children.length === 3) {
        const amount = this.children[2];
        if (amount instanceof TreeNode) {
          const n = ParserUtils.constNumericValue(amount);
          if (n !== undefined && (n < 0 || n >= 32)) {
            sa.reportError(
              amount.location,
              `Shift amount ${n} is out of range; must be in [0, 32).`,
              DiagnosticType.ShiftOutOfRange
            );
          }
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.relational_expression)
  export class RelationalExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ShiftExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.equality_expression)
  export class EqualityExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<RelationalExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.and_expression)
  export class AndExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.exclusive_or_expression)
  export class ExclusiveOrExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.inclusive_or_expression)
  export class InclusiveOrExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ExclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.logical_and_expression)
  export class LogicalAndExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<InclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.logical_xor_expression)
  export class LogicalXorExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalAndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.logical_or_expression)
  export class LogicalOrExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalXorExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.conditional_expression)
  export class ConditionalExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalOrExpression>this.children[0]).type;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.struct_specifier)
  export class StructSpecifier extends TreeNode {
    ident?: BaseToken;
    propList: StructProp[];
    macroExpressions: MacroExpression[];
    isInMacroBranch: boolean;

    override init(): void {
      this.ident = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.isInMacroBranch = sa.symbolTableStack.isInMacroBranch;
      if (children.length === 6) {
        this.ident = children[1] as BaseToken;
        sa.symbolTableStack.insert(new StructSymbol(this.ident.lexeme, this));

        this.propList = (children[3] as StructDeclarationList).propList;
        this.macroExpressions = (children[3] as StructDeclarationList).macroExpressions;
      } else {
        this.propList = (children[2] as StructDeclarationList).propList;
        this.macroExpressions = (children[2] as StructDeclarationList).macroExpressions;
      }
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache(visitor.visitStructSpecifier(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.struct_declaration_list)
  export class StructDeclarationList extends TreeNode {
    propList: StructProp[] = [];
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.propList.length = 0;
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, propList, macroExpressions } = this;

      if (children.length === 1) {
        propList.push(...(children[0] as StructDeclaration).props);
        macroExpressions.push(...(children[0] as StructDeclaration).macroExpressions);
      } else {
        propList.push(...(children[0] as StructDeclarationList).propList);
        propList.push(...(children[1] as StructDeclaration).props);
        macroExpressions.push(...(children[0] as StructDeclarationList).macroExpressions);
        macroExpressions.push(...(children[1] as StructDeclaration).macroExpressions);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.struct_declaration)
  export class StructDeclaration extends TreeNode {
    props: StructProp[] = [];
    macroExpressions: MacroExpression[] = [];

    private _typeSpecifier?: TypeSpecifier;
    private _declaratorList?: StructDeclaratorList;

    override init(): void {
      this._typeSpecifier = undefined;
      this._declaratorList = undefined;
      this.props.length = 0;
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, props, macroExpressions } = this;

      if (children.length === 1) {
        const macroStructDeclaration = children[0] as MacroStructDeclaration;
        const macroProps = macroStructDeclaration.props;

        for (let i = 0, length = macroProps.length; i < length; i++) {
          macroProps[i].isInMacroBranch = true;
          props.push(macroProps[i]);
        }

        macroExpressions.push(...macroStructDeclaration.macroExpressions);

        return;
      }

      if (children.length === 3) {
        this._typeSpecifier = children[0] as TypeSpecifier;
        this._declaratorList = children[1] as StructDeclaratorList;
      } else {
        this._typeSpecifier = children[1] as TypeSpecifier;
        this._declaratorList = children[2] as StructDeclaratorList;
      }

      const firstChild = children[0];
      const { type, lexeme } = this._typeSpecifier;
      const isInMacroBranch = sa.symbolTableStack.isInMacroBranch;
      if (firstChild instanceof LayoutQualifier) {
        const declarator = children[2] as StructDeclarator;
        const typeInfo = new SymbolType(type, lexeme);
        const prop = new StructProp(typeInfo, declarator.ident, firstChild.index, isInMacroBranch);
        props.push(prop);
      } else {
        // `type_qualifier type_specifier struct_declarator_list ;` — the qualifier (children[0]) may carry
        // `flat`, which integer varyings need; the 3-child form has no qualifier so it can't be flat.
        const isFlat = children.length === 4 && ParserUtils.hasQualifier(children[0] as TreeNode, Keyword.FLAT);
        const declaratorList = this._declaratorList.declaratorList;
        const declaratorListLength = declaratorList.length;
        props.length = declaratorListLength;
        for (let i = 0; i < declaratorListLength; i++) {
          const declarator = declaratorList[i];
          const typeInfo = new SymbolType(type, lexeme, declarator.arraySpecifier);
          const prop = new StructProp(typeInfo, declarator.ident, undefined, isInMacroBranch, isFlat);
          props[i] = prop;
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_struct_declaration)
  export class MacroStructDeclaration extends TreeNode {
    props: StructProp[] = [];
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.props.length = 0;
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(): void {
      const children = this.children;

      this.macroExpressions.push(children[0] as MacroPushContext);

      if (children.length === 3) {
        this.props.push(...(children[1] as StructDeclarationList).propList);
        this.props.push(...(children[2] as MacroStructBranch).props);
        this.macroExpressions.push(...(children[1] as StructDeclarationList).macroExpressions);
        this.macroExpressions.push(...(children[2] as MacroStructBranch).macroExpressions);
      } else {
        this.props.push(...(children[1] as MacroStructBranch).props);
        this.macroExpressions.push(...(children[1] as MacroStructBranch).macroExpressions);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_struct_branch)
  export class MacroStructBranch extends TreeNode {
    props: StructProp[] = [];
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.props.length = 0;
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(): void {
      const children = this.children;
      const lastNode = children[children.length - 1];

      this.macroExpressions.push(children[0] as MacroPopContext | MacroElseExpression | MacroElifExpression);

      if (children[1] instanceof StructDeclarationList) {
        this.props.push(...children[1].propList);
        this.macroExpressions.push(...children[1].macroExpressions);
      }

      if (lastNode instanceof MacroStructBranch) {
        this.props.push(...lastNode.props);
        this.macroExpressions.push(...lastNode.macroExpressions);
      }

      if (children.length > 1 && lastNode instanceof MacroPopContext) {
        this.macroExpressions.push(lastNode);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.layout_qualifier)
  export class LayoutQualifier extends TreeNode {
    index: number;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.index = Number((<BaseToken>this.children[4]).lexeme);
    }
  }

  @ASTNodeDecorator(NoneTerminal.struct_declarator_list)
  export class StructDeclaratorList extends TreeNode {
    declaratorList: StructDeclarator[] = [];

    override init(): void {
      this.declaratorList.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, declaratorList } = this;
      if (children.length === 1) {
        declaratorList.push(children[0] as StructDeclarator);
      } else {
        const list = children[0] as StructDeclaratorList;
        const declarator = children[1] as StructDeclarator;
        const listLength = list.declaratorList.length;
        declaratorList.length = listLength + 1;
        for (let i = 0; i < listLength; i++) {
          declaratorList[i] = list.declaratorList[i];
        }
        declaratorList[listLength] = declarator;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.struct_declarator)
  export class StructDeclarator extends TreeNode {
    ident: BaseToken;
    arraySpecifier: ArraySpecifier | undefined;

    override init(): void {
      this.arraySpecifier = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.ident = children[0] as BaseToken;
      this.arraySpecifier = children[1] as ArraySpecifier;
    }
  }

  @ASTNodeDecorator(NoneTerminal.variable_declaration)
  export class VariableDeclaration extends TreeNode {
    type: FullySpecifiedType;
    isStatic: boolean;

    override init(): void {
      this.isStatic = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const type = children[0] as FullySpecifiedType;
      const ident = children[1] as BaseToken;
      this.type = type;
      const sm = new VarSymbol(ident.lexeme, new SymbolType(type.type, type.typeSpecifier.lexeme), true, this);

      if (sa.symbolTableStack.insert(sm)) {
        sa.reportWarning(ident.location, `Redefinition of '${ident.lexeme}'.`, DiagnosticType.Redefinition);
      }

      if (children.length === 4) {
        this.isStatic = true;
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      if (this.isStatic) {
        return super.codeGen(visitor);
      } else {
        return this.setCache(visitor.visitGlobalVariableDeclaration(this));
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.variable_declaration_list)
  export class VariableDeclarationList extends TreeNode {
    type: FullySpecifiedType;
    variableDeclarations: VariableDeclaration[] = [];

    override init(): void {
      this.variableDeclarations.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children } = this;
      const length = children.length;
      const child = children[0] as VariableDeclaration | VariableDeclarationList;
      const type = child.type;
      this.type = type;

      if (child instanceof VariableDeclaration) {
        this.variableDeclarations.push(child);
      } else {
        this.variableDeclarations.push(...child.variableDeclarations);

        const ident = children[2] as BaseToken;

        const newVariable = VariableDeclaration.pool.get() as VariableDeclaration;
        if (length === 3) {
          // variable_declaration_list ',' id
          newVariable.set(ident.location, [type, ident]);
        } else {
          // variable_declaration_list ',' id array_specifier
          newVariable.set(ident.location, [type, ident, children[3] as ArraySpecifier]);
        }
        newVariable.semanticAnalyze(sa);
        this.variableDeclarations.push(newVariable);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.variable_identifier)
  export class VariableIdentifier extends TreeNode {
    // @todo: typeInfo may be multiple types
    typeInfo: GalaceanDataType;
    /** Whether the resolved symbol is an array — `typeInfo` alone drops array-ness, but indexing rules need it. */
    isArray: boolean;
    /** A fixed array's element count, for constant index bounds-checking; `undefined` if unsized/unknown. */
    arraySize?: number;
    referenceGlobalSymbolNames: string[] = [];

    private _symbols: Array<VarSymbol | FnSymbol> = [];

    override init(): void {
      this.typeInfo = TypeAny;
      this.isArray = false;
      this.arraySize = undefined;
      this.referenceGlobalSymbolNames.length = 0;
      this._symbols.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const child = this.children[0] as BaseToken | MacroCallSymbol | MacroCallFunction;
      const referenceGlobalSymbolNames = this.referenceGlobalSymbolNames;
      const symbols = this._symbols;

      // Real references — every name must resolve; miss is an authoring error.
      const needFindNames = child instanceof BaseToken ? [child.lexeme] : child.referenceSymbolNames;

      for (let i = 0; i < needFindNames.length; i++) {
        const name = needFindNames[i];

        if (sa.macroDefineList[name]) continue;

        // only `macro_call` CFG can reference fnSymbols, others fnSymbols are referenced in `function_call_generic` CFG
        if (!(child instanceof BaseToken) && BuiltinFunction.isExist(name)) {
          continue;
        }

        const builtinVar = BuiltinVariable.getVar(name);
        if (builtinVar) {
          this.typeInfo = builtinVar.type;
          if (name === "gl_FragColor") sa.shaderData.glFragColorReferences.push(this.location);
          else if (name === "gl_Position") sa.shaderData.glPositionReferences.push(this.location);
          continue;
        }

        const hit = VariableIdentifier._lookupAndMarkGlobalReference(
          sa,
          name,
          symbols,
          referenceGlobalSymbolNames,
          this.location
        );
        // Expression-style macros have their own value AST; its real type isn't
        // the type of any single `referenceSymbolNames` entry (`v` in `v.v_uv`
        // is a `Varyings` struct but the macro call site's type should be the
        // member type). Skip type inference for those and keep TypeAny.
        if (hit && (child instanceof BaseToken || !child.hasAstValue)) {
          this.typeInfo = symbols[0].dataType?.type;
          this.isArray = !!symbols[0].dataType?.arraySpecifier;
          this.arraySize = symbols[0].dataType?.arraySpecifier?.size;
        }
      }

      // FXAA-style cross-arm shadowing: at a MACRO_CALL use site, silently
      // probe the macro name itself so any sibling-arm `var` declaration is
      // marked as referenced and codegen keeps it. Miss is the common
      // single-arm case — no warning, no type inference. Grammar half of the
      // cross-arm fix is in 87cb2b5f0.
      if (!(child instanceof BaseToken)) {
        VariableIdentifier._probeCrossArmShadowing(sa, child, needFindNames, symbols, referenceGlobalSymbolNames);
      }
    }

    /** Run the cross-arm shadowing probe for a MACRO_CALL site. No-op when the
     *  probe isn't meaningful: no macro name, name already resolved as a real
     *  reference, or name is a builtin (builtins can't be shadowed by a
     *  sibling-arm decl). */
    private static _probeCrossArmShadowing(
      sa: SemanticAnalyzer,
      child: MacroCallSymbol | MacroCallFunction,
      needFindNames: string[],
      symbols: (VarSymbol | FnSymbol)[],
      referenceGlobalSymbolNames: string[]
    ): void {
      const macroName = child.macroName;
      if (!macroName) return;
      if (needFindNames.indexOf(macroName) !== -1) return; // already looked up as a real reference
      if (BuiltinFunction.isExist(macroName) || BuiltinVariable.getVar(macroName)) return; // builtins can't be shadowed
      VariableIdentifier._lookupAndMarkGlobalReference(sa, macroName, symbols, referenceGlobalSymbolNames, null);
    }

    /** Look up `name` in the symbol stack and, if a global var/fn declaration
     *  exists, push it into `referenceGlobalSymbolNames`. Returns `true` iff
     *  the lookup hit (caller can then derive type info). When `missErrorLoc`
     *  is non-null, a miss reports an "undeclared identifier" error; pass
     *  `null` for silent probes (e.g. FXAA-style cross-arm shadowing).
     *
     *  Mutation contract: `symbols` is used as scratch storage — `lookupAll`
     *  clears and refills it. On hit, the caller may read `symbols[0]` for
     *  type info before the next call overwrites the contents. */
    private static _lookupAndMarkGlobalReference(
      sa: SemanticAnalyzer,
      name: string,
      symbols: (VarSymbol | FnSymbol)[],
      referenceGlobalSymbolNames: string[],
      missErrorLoc: ShaderRange | null
    ): boolean {
      const lookupSymbol = SemanticAnalyzer._lookupSymbol;
      lookupSymbol.set(name, ESymbolType.Any);
      sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols);

      if (!symbols.length) {
        if (missErrorLoc) {
          sa.reportError(missErrorLoc, `'${name}' : undeclared identifier`, DiagnosticType.UseBeforeDeclaration);
        }
        return false;
      }
      const currentScopeSymbol = <VarSymbol | FnSymbol>sa.symbolTableStack.scope.getSymbol(lookupSymbol, true);
      const isGlobal = currentScopeSymbol
        ? currentScopeSymbol instanceof FnSymbol || currentScopeSymbol.isGlobalVariable
        : symbols.some((s) => s instanceof FnSymbol || s.isGlobalVariable);
      if (isGlobal && referenceGlobalSymbolNames.indexOf(name) === -1) {
        referenceGlobalSymbolNames.push(name);
      }
      return true;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitVariableIdentifier(this));
    }

    getLexeme(visitor: ICodeGenVisitor): string {
      const child = this.children[0] as BaseToken | MacroCallSymbol | MacroCallFunction;
      if (child instanceof BaseToken) {
        return child.lexeme;
      } else {
        return child.codeGen(visitor);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.gs_shader_program)
  export class GLShaderProgram extends TreeNode {
    shaderData: ShaderData;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.shaderData = sa.shaderData;
      this.shaderData.symbolTable = sa.symbolTableStack.scope;
    }
  }

  @ASTNodeDecorator(NoneTerminal.global_declaration)
  export class GlobalDeclaration extends TreeNode {
    macroExpressions: Array<MacroExpression | MacroUndef | BaseToken> = [];

    override init(): void {
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const child = this.children[0];

      if (
        child instanceof MacroUndef ||
        child instanceof GlobalMacroIfStatement ||
        child instanceof MacroDefine ||
        child instanceof BaseToken
      ) {
        sa.shaderData.globalMacroDeclarations.push(this);

        if (child instanceof GlobalMacroIfStatement) {
          this.macroExpressions.push(...child.macroExpressions);
        } else {
          this.macroExpressions.push(child);
        }
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_undef)
  export class MacroUndef extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache(super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_push_context)
  export class MacroPushContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel++;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_pop_context)
  export class MacroPopContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel--;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_elif_expression)
  export class MacroElifExpression extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_else_expression)
  export class MacroElseExpression extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.global_macro_declaration)
  export class GlobalMacroDeclaration extends TreeNode {
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const macroExpressions = this.macroExpressions;

      if (children.length === 1) {
        macroExpressions.push(...(children[0] as GlobalDeclaration).macroExpressions);
      } else {
        macroExpressions.push(...(children[0] as GlobalMacroDeclaration).macroExpressions);
        macroExpressions.push(...(children[1] as GlobalDeclaration).macroExpressions);
      }
    }

    override codeGen(visitor: ICodeGenVisitor) {
      const children = this.children as TreeNode[];
      if (children.length === 1) {
        return this.setCache(children[0].codeGen(visitor));
      } else {
        return this.setCache(`${children[0].codeGen(visitor)}\n${children[1].codeGen(visitor)}`);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.global_macro_if_statement)
  export class GlobalMacroIfStatement extends TreeNode {
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const macroExpressions = this.macroExpressions;

      if (children.length === 3) {
        macroExpressions.push(children[0] as MacroPushContext);
        macroExpressions.push(...(children[1] as GlobalMacroDeclaration).macroExpressions);
        macroExpressions.push(...(children[2] as GlobalMacroBranch).macroExpressions);
      } else {
        macroExpressions.push(children[0] as MacroPushContext);
        macroExpressions.push(...(children[1] as GlobalMacroBranch).macroExpressions);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.global_macro_branch)
  export class GlobalMacroBranch extends TreeNode {
    macroExpressions: MacroExpression[] = [];

    override init(): void {
      this.macroExpressions.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const lastNode = children[children.length - 1];

      const macroExpressions = this.macroExpressions;
      macroExpressions.push(children[0] as MacroPopContext | MacroElseExpression | MacroElifExpression);

      if (children[1] instanceof GlobalMacroDeclaration) {
        macroExpressions.push(...children[1].macroExpressions);
      }

      if (lastNode instanceof GlobalMacroBranch) {
        macroExpressions.push(...lastNode.macroExpressions);
      }

      if (children.length > 1 && lastNode instanceof MacroPopContext) {
        macroExpressions.push(lastNode);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_if_statement)
  export class MacroIfStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_branch)
  export class MacroBranch extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_call_symbol)
  export class MacroCallSymbol extends TreeNode {
    referenceSymbolNames: string[] = [];
    macroName: string;
    /** True iff every `MacroDefineInfo` visible from this call site's branch
     *  has a `valueAst` (i.e. was parsed via the `macro_define` CFG rule).
     *  Call sites use this to skip naive type inference: an AST-form macro
     *  drives the call site's type through its own value subtree, not through
     *  a root of `referenceSymbolNames`. Mixed forms across branches → false,
     *  fall back to legacy inference. */
    hasAstValue: boolean = false;
    /** `#define NAME(params) …` form — drives function-like vs object-like codegen. */
    isFunctionLikeMacro: boolean = false;
    /** Every visible replacement is a non-builtin identifier — assume user fn alias. */
    aliasesNonBuiltinIdent: boolean = false;

    override init(): void {
      this.referenceSymbolNames.length = 0;
      this.hasAstValue = false;
      this.isFunctionLikeMacro = false;
      this.aliasesNonBuiltinIdent = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const nameToken = this.children[0] as BaseToken;
      const macroName = nameToken.lexeme;
      this.macroName = macroName;

      // Filter `defList` to only entries reachable from this call site's
      // `#ifdef` branch (Issue #2980 nit fix). Without filtering, definitions
      // in disjoint branches conflate at the call site and pollute type
      // inference; with it, what remains is exactly what could substitute at
      // this position.
      const callSiteBranch = nameToken.branch;
      const defList = sa.macroDefineList[macroName];
      const refs = this.referenceSymbolNames;
      refs.length = 0;
      let visibleCount = 0;
      let allAst = true;
      let isFn = false;
      let allAliasNonBuiltinIdent = true;
      if (defList) {
        for (let i = 0, n = defList.length; i < n; i++) {
          const info = defList[i];
          if (!Lexer.isVisibleFrom(info.branch, callSiteBranch)) continue;
          visibleCount++;
          if (info.valueAst == null) allAst = false;
          if (info.isFunction) isFn = true;
          // Harvest references from the value AST. Legacy-form macros (no
          // `valueAst`) hold non-expression token sequences with no user
          // identifiers, so nothing to collect.
          if (info.valueAst) {
            MacroCallSymbol._collectIdentifierRefs(info.valueAst, info.params, refs);
          }
          // aliasesNonBuiltinIdent: macro replacement is a single non-builtin
          // identifier — best-effort proxy for "this macro call site aliases a
          // user fn", since uniform/const aliases would surface as a GLSL
          // compile error later anyway. Keyword replacements (`vec3`, `mat4`)
          // reach here with `valueAst === undefined` (opaque path), so they
          // automatically fail without an explicit keyword guard.
          if (info.isFunction || !info.valueAst) {
            allAliasNonBuiltinIdent = false;
          } else {
            const leadingIdent = ParserUtils.unwrapBareIdentifier(info.valueAst, { allowParens: false });
            const leadingChild = leadingIdent?.children[0];
            const leadingId = leadingChild instanceof BaseToken ? leadingChild.lexeme : undefined;
            if (!leadingId || BuiltinFunction.isExist(leadingId)) {
              allAliasNonBuiltinIdent = false;
            }
          }
        }
      }
      // Require *every* visible entry to be AST-form before taking the AST
      // shortcut: residual ambiguity (e.g. unmodeled `#if expr` letting both
      // forms through) falls back to legacy `referenceSymbolNames` inference
      // instead of polluting the call site with TypeAny.
      this.hasAstValue = visibleCount > 0 && allAst;
      this.isFunctionLikeMacro = isFn;
      this.aliasesNonBuiltinIdent = visibleCount > 0 && allAliasNonBuiltinIdent;
    }

    /** Push every leaf `VariableIdentifier`'s lexeme into `out`, skipping
     *  function-like parameter names (local to the macro, not call-site refs)
     *  and duplicates. */
    private static _collectIdentifierRefs(node: TreeNode, params: string[], out: string[]): void {
      if (node instanceof VariableIdentifier) {
        const child = node.children[0];
        if (child instanceof BaseToken) {
          const name = child.lexeme;
          if (params.indexOf(name) === -1 && out.indexOf(name) === -1) out.push(name);
        }
        return;
      }
      const children = node.children;
      if (!children) return;
      for (let i = 0, n = children.length; i < n; i++) {
        const c = children[i];
        if (c instanceof TreeNode) MacroCallSymbol._collectIdentifierRefs(c, params, out);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_call_function)
  export class MacroCallFunction extends TreeNode {
    referenceSymbolNames: string[] = [];
    macroName: string = "";
    hasAstValue: boolean = false;
    isFunctionLikeMacro: boolean = false;
    aliasesNonBuiltinIdent: boolean = false;

    override init(): void {
      this.referenceSymbolNames = [];
      this.macroName = "";
      this.hasAstValue = false;
      this.isFunctionLikeMacro = false;
      this.aliasesNonBuiltinIdent = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const child = this.children[0] as MacroCallSymbol;

      this.referenceSymbolNames = child.referenceSymbolNames;
      this.macroName = child.macroName;
      this.hasAstValue = child.hasAstValue;
      this.isFunctionLikeMacro = child.isFunctionLikeMacro;
      this.aliasesNonBuiltinIdent = child.aliasesNonBuiltinIdent;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return this.setCache(visitor.visitMacroCallFunction(this));
    }
  }

  /**
   * `#define NAME [(params)] [value]` — expression-style macro.
   *
   * Expression-form macros are parsed into AST rather than kept as raw lexemes. The
   * optional `valueExpression` is an `AssignmentExpression` subtree that participates
   * in normal codegen — so `v.v_normal.xyz` inside a `#define` flows through
   * `visitPostfixExpression` just like an inline expression would, and varying
   * flattening/type inference/reference tracking all come for free.
   *
   * Semantic analysis does not resolve symbols inside the value (the definition-site
   * scope is not the call-site scope). Lookup happens lazily during codegen.
   */
  @ASTNodeDecorator(NoneTerminal.macro_define)
  export class MacroDefine extends TreeNode {
    macroName: string;
    isFunction: boolean;
    valueExpression?: Expression;

    override init(): void {
      this.macroName = "";
      this.isFunction = false;
      this.valueExpression = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      // children[0] is MACRO_DEFINE head token, children[1] is ID.
      this.macroName = (children[1] as BaseToken).lexeme;

      // If children[2] is a MACRO_DEFINE_PARAMS token, the macro is function-like
      // and its parameter list lives in that token's lexeme (e.g. "(a, b, c)").
      let params: string[] = [];
      let valueIdx = 2;
      if (children[2] instanceof BaseToken && (children[2] as BaseToken).type === Keyword.MACRO_DEFINE_PARAMS) {
        this.isFunction = true;
        params = ParserUtils.parseMacroParamList((children[2] as BaseToken).lexeme);
        valueIdx = 3;
      }

      // Grammar's macro_define value is `expression` (not `assignment_expression`),
      // so the value child is always an `Expression` wrapper — even for a single
      // assignment-expression value, which appears as `Expression > AssignmentExpression`.
      if (children[valueIdx] instanceof Expression) {
        this.valueExpression = children[valueIdx] as Expression;
      }

      // The Lexer already registered a regex-derived entry for this directive.
      // Upgrade that entry in place by attaching the AST subtree, rather than
      // pushing a duplicate. Match must be branch-aware: `#define X` in
      // `#ifdef A` and another `#define X` in `#else` are separate entries
      // with disjoint branch signatures, and `valueExpression` belongs to
      // whichever branch actually parsed it.
      const definingBranch = (children[1] as BaseToken).branch;
      const list = sa.macroDefineList;
      const entries = list[this.macroName];
      const sameArity = (info: MacroDefineInfo) =>
        info.isFunction === this.isFunction &&
        info.params.length === params.length &&
        info.params.every((p, i) => p === params[i]);
      const upgradable = entries?.find(
        (info) => !info.valueAst && sameArity(info) && Lexer.sameBranch(info.branch, definingBranch)
      );
      if (upgradable) {
        upgradable.valueAst = this.valueExpression;
      } else {
        // No matching preprocessor entry (lexer fed directly, no
        // `Preprocessor.parse` pass). Synthetic key based on shape is enough
        // — this path's only dedup unit is this AST-direct registration.
        const info: MacroDefineInfo = {
          isFunction: this.isFunction,
          params,
          valueAst: this.valueExpression,
          dedupKey: `${this.macroName}#ast/${this.isFunction ? params.join(",") : ""}`,
          branch: definingBranch
        };
        if (entries) entries.push(info);
        else list[this.macroName] = [info];
      }

      // Close the form-param scope pushed at `MACRO_DEFINE_PARAMS` shift. By
      // the time this reduce fires, every `VariableIdentifier` inside the
      // value expression has already resolved against the params. Object-like
      // macros never pushed a scope, so nothing to pop.
      if (this.isFunction) {
        sa.popScope();
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return this.setCache(visitor.visitMacroDefine(this));
    }
  }
}
