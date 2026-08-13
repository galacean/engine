import { ClearableObjectPool, type IPoolElement } from "@galacean/engine-core";
import { CodeGenVisitor } from "../codeGen";
import { ETokenType, GalaceanDataType, ShaderRange, TokenType, TypeAny } from "../common";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ParserUtils } from "../ParserUtils";
import { Lexer } from "../lexer/Lexer";
import { MacroDefineInfo } from "../Preprocessor";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
import { NoneTerminal } from "./GrammarSymbol";
import SemanticAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, VarSymbol } from "./symbolTable";
import { IParamInfo, NodeChild, StructProp, SymbolType } from "./types";

export abstract class TreeNode implements IPoolElement {
  private static _pools = new WeakMap<object, ClearableObjectPool<TreeNode>>();

  /** The non-terminal in grammar. */
  get nt(): NoneTerminal {
    return (<typeof TreeNode & { readonly nonTerminal: NoneTerminal }>this.constructor).nonTerminal;
  }

  static get pool(): ClearableObjectPool<TreeNode> {
    let pool = TreeNode._pools.get(this);
    if (!pool) {
      pool = ShaderCompilerUtils.createObjectPool(<new () => TreeNode>(<unknown>this));
      TreeNode._pools.set(this, pool);
    }
    return pool;
  }

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
  codeGen(visitor: CodeGenVisitor) {
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

  export class TrivialNode extends TreeNode {
    static readonly nonTerminal = NoneTerminal._ignore;
  }

  export class ScopeBrace extends TreeNode {
    static readonly nonTerminal = NoneTerminal.scope_brace;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.pushScope();
    }
  }

  export class ScopeEndBrace extends TreeNode {
    static readonly nonTerminal = NoneTerminal.scope_end_brace;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.popScope();
    }
  }

  export class JumpStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.jump_statement;
    isFragReturnStatement: boolean;

    override init(): void {
      this.isFragReturnStatement = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (ASTNode._unwrapToken(this.children![0]).type === Keyword.RETURN) {
        sa.curFunctionInfo.returnStatement = this;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitJumpStatement(this));
    }
  }

  // #if _VERBOSE
  export class ConditionOpt extends TreeNode {
    static readonly nonTerminal = NoneTerminal.conditionopt;
  }

  export class ForRestStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.for_rest_statement;
  }

  export class Condition extends TreeNode {
    static readonly nonTerminal = NoneTerminal.condition;
  }

  export class ForInitStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.for_init_statement;
  }

  export class IterationStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.iteration_statement;
  }

  export class SelectionStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.selection_statement;
  }

  export class ExpressionStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.expression_statement;
  }
  // #endif

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

  // #if _VERBOSE
  export class InitializerList extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.initializer_list;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const init = this.children[0] as Initializer | InitializerList;
      this.type = init.type;
    }
  }

  export class Initializer extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.initializer;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AssignmentExpression>this.children[0]).type;
      } else {
        this.type = (<InitializerList>this.children[1]).type;
      }
    }
  }
  // #endif

  export class SingleDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.single_declaration;
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

      let sm: VarSymbol;
      if (childrenLen === 2 || childrenLen === 4) {
        const symbolType = new SymbolType(fullyType.type, typeSpecifier.lexeme, this.arraySpecifier);
        const initializer = children[3] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer);
      } else {
        const arraySpecifier = children[2] as ArraySpecifier;
        // #if _VERBOSE
        if (arraySpecifier && this.arraySpecifier) {
          sa.reportError(arraySpecifier.location, "Array of array is not supported.");
        }
        // #endif
        this.arraySpecifier = arraySpecifier;
        const symbolType = new SymbolType(fullyType.type, typeSpecifier.lexeme, this.arraySpecifier);
        const initializer = children[4] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer);
      }
      sa.symbolTableStack.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitSingleDeclaration(this));
    }
  }

  export class FullySpecifiedType extends TreeNode {
    static readonly nonTerminal = NoneTerminal.fully_specified_type;
    typeSpecifier: TypeSpecifier;
    type: GalaceanDataType;

    override semanticAnalyze(_: SemanticAnalyzer): void {
      const children = this.children;
      this.typeSpecifier = (children.length === 1 ? children[0] : children[1]) as TypeSpecifier;
      this.type = this.typeSpecifier.type;
    }
  }

  export class TypeQualifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.type_qualifier;
  }

  export class SingleTypeQualifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.single_type_qualifier;
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

  // #if _VERBOSE
  export class StorageQualifier extends BasicTypeQualifier {
    static readonly nonTerminal = NoneTerminal.storage_qualifier;
  }

  export class PrecisionQualifier extends BasicTypeQualifier {
    static readonly nonTerminal = NoneTerminal.precision_qualifier;
  }

  export class InterpolationQualifier extends BasicTypeQualifier {
    static readonly nonTerminal = NoneTerminal.interpolation_qualifier;
  }

  export class InvariantQualifier extends BasicTypeQualifier {
    static readonly nonTerminal = NoneTerminal.invariant_qualifier;
  }
  // #endif

  export class TypeSpecifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.type_specifier;
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

  export class ArraySpecifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.array_specifier;
    size: number | undefined;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const integerConstantExpr = this.children[1] as IntegerConstantExpression;
      this.size = integerConstantExpr.value;
    }
  }

  export class IntegerConstantExpressionOperator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.integer_constant_expression_operator;
    compute: (a: number, b: number) => number;
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
        default:
          sa.reportError(operator.location, `not implemented operator ${operator.lexeme}`);
      }
    }
  }

  export class IntegerConstantExpression extends TreeNode {
    static readonly nonTerminal = NoneTerminal.integer_constant_expression;
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
        // #if _VERBOSE
        else {
          const id = child as VariableIdentifier;
          if (!ParserUtils.typeCompatible(Keyword.INT, id.typeInfo)) {
            sa.reportError(id.location, "Invalid integer.");
            return;
          }
        }
        // #endif
      }
    }
  }

  export class TypeSpecifierNonArray extends TreeNode {
    static readonly nonTerminal = NoneTerminal.type_specifier_nonarray;
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

  export class ExtBuiltinTypeSpecifierNonArray extends TreeNode {
    static readonly nonTerminal = NoneTerminal.ext_builtin_type_specifier_nonarray;
    type: TokenType;
    lexeme: string;

    override init(): void {
      const token = this.children[0] as BaseToken;
      this.type = token.type;
      this.lexeme = token.lexeme;
    }
  }

  export class InitDeclaratorList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.init_declarator_list;
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
        sa.symbolTableStack.insert(sm);
      } else if (childrenLength === 4 || childrenLength === 6) {
        const typeInfo = this.typeInfo;
        const arraySpecifier = this.children[3] as ArraySpecifier;
        // #if _VERBOSE
        if (typeInfo.arraySpecifier && arraySpecifier) {
          sa.reportError(arraySpecifier.location, "Array of array is not supported.");
        }
        // #endif
        typeInfo.arraySpecifier = arraySpecifier;
        const id = children[2] as BaseToken;
        sm = new VarSymbol(id.lexeme, typeInfo, false, this);
        sa.symbolTableStack.insert(sm);
      }
    }
  }

  export class IdentifierList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.identifier_list;
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

  export class Declaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.declaration;
    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitDeclaration(this));
    }
  }

  export class FunctionProtoType extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_prototype;
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

  export class FunctionDeclarator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_declarator;
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
    }
  }

  export class FunctionHeader extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_header;
    ident: BaseToken;
    returnType: FullySpecifiedType;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.pushScope();
      const children = this.children;
      this.ident = children[1] as BaseToken;
      this.returnType = children[0] as FullySpecifiedType;
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionHeader(this));
    }
  }

  export class FunctionParameterList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_parameter_list;
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

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionParameterList(this));
    }
  }

  export class MacroParamCaseList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_param_case_list;
  }

  export class MacroParamBlock extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_param_block;
  }

  export class MacroParameterBranch extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_parameter_branch;
  }

  export class ParameterDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.parameter_declaration;
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

  export class ParameterDeclarator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.parameter_declarator;
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

  // #if _VERBOSE
  export class SimpleStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.simple_statement;
  }

  export class CompoundStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.compound_statement;
  }
  // #endif

  export class CompoundStatementNoScope extends TreeNode {
    static readonly nonTerminal = NoneTerminal.compound_statement_no_scope;
  }

  // #if _VERBOSE
  export class Statement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.statement;
  }
  // #endif

  export class StatementList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.statement_list;
    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitStatementList(this));
    }
  }

  export class FunctionDefinition extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_definition;
    returnStatement?: ASTNode.JumpStatement;
    protoType: FunctionProtoType;
    statements: CompoundStatementNoScope;
    isInMacroBranch: boolean;

    override init(): void {
      this.returnStatement = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.protoType = children[0] as FunctionProtoType;
      this.statements = children[1] as CompoundStatementNoScope;

      sa.popScope();
      const sm = new FnSymbol(this.protoType.ident.lexeme, this);
      sa.symbolTableStack.insert(sm);
      this.isInMacroBranch = sa.symbolTableStack.isInMacroBranch;

      const { curFunctionInfo } = sa;
      const { header, returnStatement } = curFunctionInfo;
      if (header.returnType.type === Keyword.VOID) {
        if (returnStatement) {
          sa.reportError(header.returnType.location, "Return in void function.");
        }
      } else {
        if (!returnStatement) {
          sa.reportError(header.returnType.location, `No return statement found.`);
        } else {
          this.returnStatement = returnStatement;
        }
      }
      curFunctionInfo.header = undefined;
      curFunctionInfo.returnStatement = undefined;
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionDefinition(this));
    }
  }

  export class FunctionCall extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.function_call;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionCall(this));
    }
  }

  export class FunctionCallGeneric extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.function_call_generic;
    fnSymbol: FnSymbol | StructSymbol | undefined;

    override init(): void {
      super.init();
      this.fnSymbol = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const functionIdentifier = this.children[0] as FunctionIdentifier;
      if (functionIdentifier.isBuiltin) {
        this.type = functionIdentifier.ident;
      } else {
        const fnIdent = <string>functionIdentifier.ident;

        let paramSig: NonGenericGalaceanType[] | undefined;
        if (this.children.length === 4) {
          const paramList = this.children[2];
          if (paramList instanceof FunctionCallParameterList) {
            paramSig = paramList.paramSig as any;
          }
        }
        // #if _VERBOSE
        const builtinFn = BuiltinFunction.resolveOverload(fnIdent, paramSig);
        if (builtinFn) {
          this.type = builtinFn.realReturnType;
          return;
        }
        // #endif

        const lookupSymbol = SemanticAnalyzer._lookupSymbol;
        lookupSymbol.set(fnIdent, ESymbolType.FN, undefined, undefined, paramSig);

        const fnSymbol = sa.symbolTableStack.lookup(lookupSymbol, true) as FnSymbol;

        if (!fnSymbol) {
          // #if _VERBOSE
          sa.reportError(this.location, `No overload function type found: ${functionIdentifier.ident}`);
          // #endif
          return;
        }
        this.type = fnSymbol?.dataType?.type;
        this.fnSymbol = fnSymbol;
      }
    }
  }

  export class FunctionCallParameterList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_call_parameter_list;
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

  export class MacroCallArgCaseList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_call_arg_case_list;
  }
  export class MacroCallArgBlock extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_call_arg_block;
  }
  export class MacroCallArgBranch extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_call_arg_branch;
  }

  export class PrecisionSpecifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.precision_specifier;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (!sa.symbolTableStack.isInMacroBranch) {
        sa.shaderData.globalPrecisions.push(this);
      }
    }
  }

  export class FunctionIdentifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.function_identifier;
    ident: GalaceanDataType;
    lexeme: string;
    isBuiltin: boolean;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const typeSpecifier = this.children[0] as TypeSpecifier;

      this.ident = typeSpecifier.type;
      this.lexeme = typeSpecifier.lexeme;
      this.isBuiltin = typeof this.ident !== "string";
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionIdentifier(this));
    }
  }

  export class AssignmentExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.assignment_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as ConditionalExpression;
        this.type = expr.type ?? TypeAny;
      } else {
        const expr = this.children[2] as AssignmentExpression;
        this.type = expr.type ?? TypeAny;
      }
    }
  }

  // #if _VERBOSE
  export class AssignmentOperator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.assignment_operator;
  }
  // #endif

  export class Expression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.expression;
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

  export class PrimaryExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.primary_expression;
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

  export class PostfixExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.postfix_expression;
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        const child = this.children[0] as PrimaryExpression | FunctionCall;
        this.type = child.type;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitPostfixExpression(this));
    }
  }

  // #if _VERBOSE
  export class UnaryOperator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.unary_operator;
  }

  export class UnaryExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.unary_expression;
    override init(): void {
      this.type = (this.children[0] as PostfixExpression).type;
    }
  }

  export class MultiplicativeExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.multiplicative_expression;
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        this.type = (this.children[0] as UnaryExpression).type;
        // TODO: Temporarily remove type deduce due to generic function type issue.
        // } else {
        //   const exp1 = this.children[0] as MultiplicativeExpression;
        //   const exp2 = this.children[2] as UnaryExpression;
        //   if (exp1.type === exp2.type) {
        //     this.type = exp1.type;
        //   }
      }
    }
  }

  export class AdditiveExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.additive_expression;
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        this.type = (this.children[0] as MultiplicativeExpression).type;
        // TODO: Temporarily remove type deduce due to generic function type issue.
        // } else {
        //   const exp1 = this.children[0] as AdditiveExpression;
        //   const exp2 = this.children[2] as MultiplicativeExpression;
        //   if (exp1.type === exp2.type) {
        //     this.type = exp1.type;
        //   }
      }
    }
  }

  export class ShiftExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.shift_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
    }
  }

  export class RelationalExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.relational_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ShiftExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  export class EqualityExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.equality_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<RelationalExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  export class AndExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.and_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  export class ExclusiveOrExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.exclusive_or_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  export class InclusiveOrExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.inclusive_or_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ExclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = Keyword.UINT;
      }
    }
  }

  export class LogicalAndExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.logical_and_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<InclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  export class LogicalXorExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.logical_xor_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalAndExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  export class LogicalOrExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.logical_or_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalXorExpression>this.children[0]).type;
      } else {
        this.type = Keyword.BOOL;
      }
    }
  }

  export class ConditionalExpression extends ExpressionAstNode {
    static readonly nonTerminal = NoneTerminal.conditional_expression;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalOrExpression>this.children[0]).type;
      }
    }
  }
  // #endif

  export class StructSpecifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.struct_specifier;
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

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache(visitor.visitStructSpecifier(this));
    }
  }

  export class StructDeclarationList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.struct_declaration_list;
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

  export class StructDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.struct_declaration;
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
        const declaratorList = this._declaratorList.declaratorList;
        const declaratorListLength = declaratorList.length;
        props.length = declaratorListLength;
        for (let i = 0; i < declaratorListLength; i++) {
          const declarator = declaratorList[i];
          const typeInfo = new SymbolType(type, lexeme, declarator.arraySpecifier);
          const prop = new StructProp(typeInfo, declarator.ident, undefined, isInMacroBranch);
          props[i] = prop;
        }
      }
    }
  }

  export class MacroStructDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_struct_declaration;
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

  export class MacroStructBranch extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_struct_branch;
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

  export class LayoutQualifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.layout_qualifier;
    index: number;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.index = Number((<BaseToken>this.children[4]).lexeme);
    }
  }

  export class StructDeclaratorList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.struct_declarator_list;
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

  export class StructDeclarator extends TreeNode {
    static readonly nonTerminal = NoneTerminal.struct_declarator;
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

  export class VariableDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.variable_declaration;
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

      sa.symbolTableStack.insert(sm);

      if (children.length === 4) {
        this.isStatic = true;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      if (this.isStatic) {
        return super.codeGen(visitor);
      } else {
        return this.setCache(visitor.visitGlobalVariableDeclaration(this));
      }
    }
  }

  export class VariableDeclarationList extends TreeNode {
    static readonly nonTerminal = NoneTerminal.variable_declaration_list;
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

  export class VariableIdentifier extends TreeNode {
    static readonly nonTerminal = NoneTerminal.variable_identifier;
    // @todo: typeInfo may be multiple types
    typeInfo: GalaceanDataType;
    referenceGlobalSymbolNames: string[] = [];

    private _symbols: Array<VarSymbol | FnSymbol> = [];

    override init(): void {
      this.typeInfo = TypeAny;
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
     *  the lookup hit (caller can then derive type info). When `missWarnLoc`
     *  is non-null, a miss reports a "declared before used" warning; pass
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
      missWarnLoc: ShaderRange | null
    ): boolean {
      const lookupSymbol = SemanticAnalyzer._lookupSymbol;
      lookupSymbol.set(name, ESymbolType.Any);
      sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols);

      if (!symbols.length) {
        // #if _VERBOSE
        if (missWarnLoc) {
          sa.reportWarning(missWarnLoc, `Please sure the identifier "${name}" will be declared before used.`);
        }
        // #endif
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

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitVariableIdentifier(this));
    }

    getLexeme(visitor: CodeGenVisitor): string {
      const child = this.children[0] as BaseToken | MacroCallSymbol | MacroCallFunction;
      if (child instanceof BaseToken) {
        return child.lexeme;
      } else {
        return child.codeGen(visitor);
      }
    }
  }

  export class GLShaderProgram extends TreeNode {
    static readonly nonTerminal = NoneTerminal.gs_shader_program;
    shaderData: ShaderData;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.shaderData = sa.shaderData;
      this.shaderData.symbolTable = sa.symbolTableStack.scope;
    }
  }

  export class GlobalDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.global_declaration;
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

  export class MacroUndef extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_undef;
    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache(super.codeGen(visitor) + "\n");
    }
  }

  export class MacroPushContext extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_push_context;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel++;
    }

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  export class MacroPopContext extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_pop_context;
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel--;
    }

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  export class MacroElifExpression extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_elif_expression;
    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  export class MacroElseExpression extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_else_expression;
    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  export class GlobalMacroDeclaration extends TreeNode {
    static readonly nonTerminal = NoneTerminal.global_macro_declaration;
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

    override codeGen(visitor: CodeGenVisitor) {
      const children = this.children as TreeNode[];
      if (children.length === 1) {
        return this.setCache(children[0].codeGen(visitor));
      } else {
        return this.setCache(`${children[0].codeGen(visitor)}\n${children[1].codeGen(visitor)}`);
      }
    }
  }

  export class GlobalMacroIfStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.global_macro_if_statement;
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

  export class GlobalMacroBranch extends TreeNode {
    static readonly nonTerminal = NoneTerminal.global_macro_branch;
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

  export class MacroIfStatement extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_if_statement;
  }

  export class MacroBranch extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_branch;
  }

  export class MacroCallSymbol extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_call_symbol;
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

  export class MacroCallFunction extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_call_function;
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

    override codeGen(visitor: CodeGenVisitor) {
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
  export class MacroDefine extends TreeNode {
    static readonly nonTerminal = NoneTerminal.macro_define;
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

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitMacroDefine(this));
    }
  }
}
