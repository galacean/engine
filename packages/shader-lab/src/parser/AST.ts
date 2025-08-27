import { ClearableObjectPool, IPoolElement } from "@galacean/engine";
import { CodeGenVisitor } from "../codeGen";
import { ETokenType, GalaceanDataType, ShaderRange, TokenType, TypeAny } from "../common";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { getReferenceSymbolNames } from "../MacroDefineInfo";
import { ParserUtils } from "../ParserUtils";
import { ShaderLabUtils } from "../ShaderLabUtils";
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
import { NoneTerminal } from "./GrammarSymbol";
import SemanticAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, VarSymbol } from "./symbolTable";
import { IParamInfo, NodeChild, StructProp, SymbolType } from "./types";

function ASTNodeDecorator(nonTerminal: NoneTerminal) {
  return function <T extends { new (): TreeNode }>(ASTNode: T) {
    ASTNode.prototype.nt = nonTerminal;
    (<any>ASTNode).pool = ShaderLabUtils.createObjectPool(ASTNode);
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
      if (ASTNode._unwrapToken(this.children![0]).type === Keyword.RETURN) {
        sa.curFunctionInfo.returnStatement = this;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitJumpStatement(this));
    }
  }

  // #if _VERBOSE
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
  export class SelectionStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.expression_statement)
  export class ExpressionStatement extends TreeNode {}
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
  // #endif

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

  @ASTNodeDecorator(NoneTerminal.fully_specified_type)
  export class FullySpecifiedType extends TreeNode {
    typeSpecifier: TypeSpecifier;
    type: GalaceanDataType;

    override semanticAnalyze(_: SemanticAnalyzer): void {
      const children = this.children;
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

  // #if _VERBOSE
  @ASTNodeDecorator(NoneTerminal.storage_qualifier)
  export class StorageQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.precision_qualifier)
  export class PrecisionQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.interpolation_qualifier)
  export class InterpolationQualifier extends BasicTypeQualifier {}

  @ASTNodeDecorator(NoneTerminal.invariant_qualifier)
  export class InvariantQualifier extends BasicTypeQualifier {}
  // #endif

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
      const integerConstantExpr = this.children[1] as IntegerConstantExpression;
      this.size = integerConstantExpr.value;
    }
  }

  @ASTNodeDecorator(NoneTerminal.integer_constant_expression_operator)
  export class IntegerConstantExpressionOperator extends TreeNode {
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

  @ASTNodeDecorator(NoneTerminal.type_specifier_nonarray)
  export class TypeSpecifierNonArray extends TreeNode {
    type: GalaceanDataType;
    lexeme: string;

    override init(): void {
      const tt = this.children[0];
      if (tt instanceof BaseToken) {
        this.type = tt.lexeme;
        this.lexeme = tt.lexeme;
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
    override codeGen(visitor: CodeGenVisitor): string {
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

    override codeGen(visitor: CodeGenVisitor): string {
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
      const childrenLength = children.length;
      const { parameterInfoList, paramSig } = this;
      if (childrenLength === 1) {
        const decl = children[0] as ParameterDeclaration;
        parameterInfoList.push({ ident: decl.ident, typeInfo: decl.typeInfo, astNode: decl });
        paramSig.push(decl.typeInfo.type);
      } else {
        const list = children[0] as FunctionParameterList;
        const decl = children[2] as ParameterDeclaration;
        const listParamLength = list.parameterInfoList.length;
        parameterInfoList.length = listParamLength + 1;
        paramSig.length = listParamLength + 1;

        for (let i = 0; i < listParamLength; i++) {
          parameterInfoList[i] = list.parameterInfoList[i];
          paramSig[i] = list.paramSig[i];
        }
        parameterInfoList[listParamLength] = { ident: decl.ident, typeInfo: decl.typeInfo, astNode: decl };
        paramSig[listParamLength] = decl.typeInfo.type;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionParameterList(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.parameter_declaration)
  export class ParameterDeclaration extends TreeNode {
    typeQualifier: TypeQualifier | undefined;
    typeInfo: SymbolType;
    ident: BaseToken;

    override init(): void {
      this.typeQualifier = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const childrenLength = children.length;
      let parameterDeclarator: ParameterDeclarator;
      if (childrenLength === 1) {
        parameterDeclarator = children[0] as ParameterDeclarator;
      } else {
        parameterDeclarator = children[1] as ParameterDeclarator;
      }
      if (childrenLength === 2) {
        this.typeQualifier = children[0] as TypeQualifier;
      }
      this.typeInfo = parameterDeclarator.typeInfo;
      this.ident = parameterDeclarator.ident;

      const varSymbol = new VarSymbol(parameterDeclarator.ident.lexeme, parameterDeclarator.typeInfo, false, this);
      sa.symbolTableStack.insert(varSymbol);
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

  // #if _VERBOSE
  @ASTNodeDecorator(NoneTerminal.simple_statement)
  export class SimpleStatement extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.compound_statement)
  export class CompoundStatement extends TreeNode {}
  // #endif

  @ASTNodeDecorator(NoneTerminal.compound_statement_no_scope)
  export class CompoundStatementNoScope extends TreeNode {}

  // #if _VERBOSE
  @ASTNodeDecorator(NoneTerminal.statement)
  export class Statement extends TreeNode {}
  // #endif

  @ASTNodeDecorator(NoneTerminal.statement_list)
  export class StatementList extends TreeNode {
    override codeGen(visitor: CodeGenVisitor): string {
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

  @ASTNodeDecorator(NoneTerminal.function_call)
  export class FunctionCall extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: CodeGenVisitor): string {
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
        const builtinFn = BuiltinFunction.getFn(fnIdent, paramSig);
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
          // sa.reportError(this.location, `No overload function type found: ${functionIdentifier.ident}`);
          // #endif
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
    paramNodes: AssignmentExpression[] = [];

    override init(): void {
      this.paramSig.length = 0;
      this.paramNodes.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, paramSig, paramNodes } = this;
      if (children.length === 1) {
        const expr = children[0] as AssignmentExpression;
        if (expr.type == undefined) {
          paramSig.push(TypeAny);
        } else {
          paramSig.push(expr.type);
        }

        this.paramNodes.push(expr);
      } else {
        const list = children[0] as FunctionCallParameterList;
        const decl = children[2] as AssignmentExpression;
        if (list.paramSig.length === 0 || decl.type == undefined) {
          this.paramSig.push(TypeAny);
        } else {
          const listParamLength = list.paramSig.length;
          paramSig.length = listParamLength + 1;
          paramNodes.length = listParamLength + 1;

          for (let i = 0; i < listParamLength; i++) {
            paramSig[i] = list.paramSig[i];
            paramNodes[i] = list.paramNodes[i];
          }
          paramSig[listParamLength] = decl.type;
          paramNodes[listParamLength] = decl;
        }
      }
    }
  }

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

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitFunctionIdentifier(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.assignment_expression)
  export class AssignmentExpression extends ExpressionAstNode {
    // #if _VERBOSE
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as ConditionalExpression;
        this.type = expr.type ?? TypeAny;
      } else {
        const expr = this.children[2] as AssignmentExpression;
        this.type = expr.type ?? TypeAny;
      }
    }
    // #endif
  }

  // #if _VERBOSE
  @ASTNodeDecorator(NoneTerminal.assignment_operator)
  export class AssignmentOperator extends TreeNode {}
  // #endif

  @ASTNodeDecorator(NoneTerminal.expression)
  export class Expression extends ExpressionAstNode {
    // #if _VERBOSE
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as AssignmentExpression;
        this.type = expr.type;
      } else {
        const expr = this.children[2] as AssignmentExpression;
        this.type = expr.type;
      }
    }
    // #endif
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
  @ASTNodeDecorator(NoneTerminal.unary_operator)
  export class UnaryOperator extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.unary_expression)
  export class UnaryExpression extends ExpressionAstNode {
    override init(): void {
      this.type = (this.children[0] as PostfixExpression).type;
    }
  }

  @ASTNodeDecorator(NoneTerminal.multiplicative_expression)
  export class MultiplicativeExpression extends ExpressionAstNode {
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

  @ASTNodeDecorator(NoneTerminal.additive_expression)
  export class AdditiveExpression extends ExpressionAstNode {
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

  @ASTNodeDecorator(NoneTerminal.shift_expression)
  export class ShiftExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
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
  // #endif

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

    override codeGen(visitor: CodeGenVisitor) {
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

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const type = children[0] as FullySpecifiedType;
      const ident = children[1] as BaseToken;
      this.type = type;
      const sm = new VarSymbol(ident.lexeme, new SymbolType(type.type, type.typeSpecifier.lexeme), true, this);

      sa.symbolTableStack.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return this.setCache(visitor.visitGlobalVariableDeclaration(this));
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
      const lookupSymbol = SemanticAnalyzer._lookupSymbol;
      let needFindNames: string[];

      if (child instanceof BaseToken) {
        needFindNames = [child.lexeme];
      } else {
        needFindNames = (child as MacroCallSymbol | MacroCallFunction).referenceSymbolNames;
      }

      for (let i = 0; i < needFindNames.length; i++) {
        const name = needFindNames[i];

        // only `macro_call` CFG can reference fnSymbols, others fnSymbols are referenced in `function_call_generic` CFG
        if (!(child instanceof BaseToken) && BuiltinFunction.isExist(name)) {
          continue;
        }

        const builtinVar = BuiltinVariable.getVar(name);
        if (builtinVar) {
          this.typeInfo = builtinVar.type;
          continue;
        }

        lookupSymbol.set(name, ESymbolType.Any);
        sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols);

        if (!symbols.length) {
          sa.reportError(this.location, `undeclared identifier: ${name}`);
        } else {
          this.typeInfo = symbols[0].dataType?.type;
          const currentScopeSymbol = <VarSymbol | FnSymbol>sa.symbolTableStack.scope.getSymbol(lookupSymbol, true);
          if (currentScopeSymbol) {
            if (
              (currentScopeSymbol instanceof FnSymbol || currentScopeSymbol.isGlobalVariable) &&
              referenceGlobalSymbolNames.indexOf(name) === -1
            ) {
              referenceGlobalSymbolNames.push(name);
            }
          } else if (
            symbols.some((s) => s instanceof FnSymbol || s.isGlobalVariable) &&
            referenceGlobalSymbolNames.indexOf(name) === -1
          ) {
            referenceGlobalSymbolNames.push(name);
          }
        }
      }
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

      if (child instanceof MacroUndef || child instanceof GlobalMacroIfStatement || child instanceof BaseToken) {
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
    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache(super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_push_context)
  export class MacroPushContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel++;
    }

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_pop_context)
  export class MacroPopContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel--;
    }

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_elif_expression)
  export class MacroElifExpression extends TreeNode {
    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache("\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_else_expression)
  export class MacroElseExpression extends TreeNode {
    override codeGen(visitor: CodeGenVisitor) {
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

    override codeGen(visitor: CodeGenVisitor) {
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

  @ASTNodeDecorator(NoneTerminal.macro_conditional_expression)
  export class MacroConditionalExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_logical_or_expression)
  export class MacroLogicalOrExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_logical_and_expression)
  export class MacroLogicalAndExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_equality_expression)
  export class MacroEqualityExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_relational_expression)
  export class MacroRelationalExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_shift_expression)
  export class MacroShiftExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_additive_expression)
  export class MacroAdditiveExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_multiplicative_expression)
  export class MacroMultiplicativeExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_unary_expression)
  export class MacroUnaryExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_primary_expression)
  export class MacroPrimaryExpression extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_constant)
  export class MacroConstant extends TreeNode {}

  @ASTNodeDecorator(NoneTerminal.macro_call_symbol)
  export class MacroCallSymbol extends TreeNode {
    referenceSymbolNames: string[] = [];

    override init(): void {
      this.referenceSymbolNames.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const macroName = (children[0] as BaseToken).lexeme;

      getReferenceSymbolNames(sa.macroDefineList, macroName, this.referenceSymbolNames);
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_call_parameter_list)
  export class MacroCallParameterList extends TreeNode {
    paramNodes: AssignmentExpression[] = [];

    override init(): void {
      this.paramNodes.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const { children, paramNodes } = this;
      if (children.length === 1) {
        const expr = children[0] as AssignmentExpression;
        paramNodes.push(expr);
      } else {
        paramNodes.push(...(children[0] as MacroCallParameterList).paramNodes);
        paramNodes.push(children[2] as AssignmentExpression);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_call_function)
  export class MacroCallFunction extends TreeNode {
    referenceSymbolNames: string[] = [];

    override init(): void {
      this.referenceSymbolNames.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const macroName = (children[0] as BaseToken).lexeme;

      getReferenceSymbolNames(sa.macroDefineList, macroName, this.referenceSymbolNames);
    }

    override codeGen(visitor: CodeGenVisitor) {
      return this.setCache(visitor.visitMacroCallFunction(this));
    }
  }
}
