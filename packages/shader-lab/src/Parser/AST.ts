import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./Builtin";
import { CodeGenVisitor } from "../CodeGen";
import { ENonTerminal } from "./GrammarSymbol";
import Token from "../Token";
import { EKeyword, ETokenType, TokenType, LocRange } from "../common";
import SematicAnalyzer from "./SemanticAnalyzer";
import { EShaderDataType, GLPassShaderData, GLShaderData, GLSubShaderData, ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, VarSymbol } from "./SymbolTable";
import { ParserUtils } from "../Utils";
// import { EEnginePropType, EnginePropTypeList } from "./constants";
import { EngineFunctions, EngineType } from "../EngineType";
import {
  ASTNodeConstructor,
  GalaceanDataType,
  IParamInfo,
  NodeChild,
  RenderStateLabel,
  StructProp,
  SymbolType,
  TypeAny
} from "./types";
import { Logger } from "../Logger";

export class TreeNode {
  /** The non-terminal in grammar. */
  readonly nt: ENonTerminal;
  readonly children: NodeChild[];
  readonly location: LocRange;
  constructor(nt: ENonTerminal, loc: LocRange, children: NodeChild[]) {
    this.nt = nt;
    this.location = loc;
    this.children = children;
  }

  // Visitor pattern interface for code generation
  codeGen(visitor: CodeGenVisitor) {
    return visitor.defaultCodeGen(this.children);
  }

  semanticAnalyze(sa: SematicAnalyzer) {}
}

export namespace ASTNode {
  export function _unwrapToken(node: NodeChild) {
    if (node instanceof Token) {
      return node;
    }
    throw "not token";
  }

  export function create(target: ASTNodeConstructor, sa: SematicAnalyzer, loc: LocRange, children: NodeChild[]) {
    const node = Reflect.construct(target, [loc, children]);
    node.semanticAnalyze(sa);
    sa.semanticStack.push(node);
    return node;
  }

  export class SubShaderScopeBrace extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.subshader_scope_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newShaderData(EShaderDataType.SubShader);
    }
  }

  export class PassScopeBrace extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.pass_scope_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newShaderData(EShaderDataType.Pass);
    }
  }

  export class ScopeBrace extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.scope_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newScope();
    }
  }

  export class ScopeEndBrace extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.scope_end_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.dropScope();
    }
  }

  export class JumpStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.jump_statement, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (ASTNode._unwrapToken(this.children![0]).type === EKeyword.RETURN) {
        // TODO: check the equality of function return type declared and this type.
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitJumpStatement(this);
    }
  }

  export class ConditionOpt extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.conditionopt, loc, children);
    }
  }

  export class ForRestStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.for_rest_statement, loc, children);
    }
  }

  export class Condition extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.condition, loc, children);
    }
  }

  export class ForInitStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.for_init_statement, loc, children);
    }
  }

  export class IterationStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.iteration_statement, loc, children);
    }
  }

  export class SelectionStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.selection_statement, loc, children);
    }
  }

  export class ExpressionStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.expression_statement, loc, children);
    }
  }

  export abstract class ExpressionAstNode extends TreeNode {
    protected _type?: GalaceanDataType;
    set type(t: GalaceanDataType | undefined) {
      this._type = t;
    }
    get type() {
      return this._type ?? TypeAny;
    }

    constructor(nt: ENonTerminal, loc: LocRange, children: NodeChild[]) {
      super(nt, loc, children);
    }
  }

  export class InitializerList extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.initializer_list, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const init = this.children[0] as Initializer | InitializerList;
      this.type = init.type;
    }
  }

  export class Initializer extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.initializer, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AssignmentExpression>this.children[0]).type;
      } else {
        this.type = (<InitializerList>this.children[1]).type;
      }
    }
  }

  export class SingleDeclaration extends TreeNode {
    typeSpecifier: TypeSpecifier;
    arraySpecifier?: ArraySpecifier;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.single_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const fullyType = this.children[0] as FullySpecifiedType;
      const id = this.children[1] as Token;
      this.typeSpecifier = fullyType.typeSpecifier;

      let sm: VarSymbol;
      if (this.children.length === 2 || this.children.length === 4) {
        const symbolType = new SymbolType(fullyType.type, fullyType.typeSpecifier.lexeme);
        const initializer = this.children[3] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer);
      } else {
        const arraySpecifier = this.children[2] as ArraySpecifier;
        this.arraySpecifier = arraySpecifier;
        const symbolType = new SymbolType(fullyType.type, fullyType.typeSpecifier.lexeme, arraySpecifier);
        const initializer = this.children[4] as Initializer;

        sm = new VarSymbol(id.lexeme, symbolType, false, initializer);
      }
      sa.scope.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitSingleDeclaration(this);
    }
  }

  export class FullySpecifiedType extends TreeNode {
    get qualifierList() {
      if (this.children.length > 1) {
        return (<TypeQualifier>this.children[0]).qualifierList;
      }
    }

    get typeSpecifier() {
      return (this.children.length === 1 ? this.children[0] : this.children[1]) as TypeSpecifier;
    }

    get type() {
      return this.typeSpecifier.type;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.fully_specified_type, loc, children);
    }

    // equal(other: FullySpecifiedType) {
    //   return this.typeSpecifier.equal(other.typeSpecifier);
    // }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (typeof this.type === "string") {
        // Custom type, check declaration
        const decl = sa.scope.lookup(this.type, ESymbolType.STRUCT);
        if (!decl && EngineType[this.type] == undefined) {
          sa.error(this.location, "undeclared type:", this.type);
        }
      }
    }
  }

  export class TypeQualifier extends TreeNode {
    qualifierList: EKeyword[];

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.type_qualifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length > 1) {
        this.qualifierList = [
          ...(<TypeQualifier>this.children[0]).qualifierList,
          (<SingleTypeQualifier>this.children[1]).qualifier
        ];
      } else {
        this.qualifierList = [(<SingleTypeQualifier>this.children[0]).qualifier];
      }
    }
  }

  export class SingleTypeQualifier extends TreeNode {
    qualifier: EKeyword;
    lexeme: string;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.single_type_qualifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const child = this.children[0];
      if (child instanceof Token) {
        this.qualifier = child.type as EKeyword;
        this.lexeme = child.lexeme;
      } else {
        this.qualifier = (<BasicTypeQualifier>child).qualifier;
        this.lexeme = (<BasicTypeQualifier>child).lexeme;
      }
    }
  }

  abstract class BasicTypeQualifier extends TreeNode {
    qualifier: EKeyword;
    get lexeme(): string {
      return (<Token>this.children[0]).lexeme;
    }

    constructor(loc: LocRange, nt: ENonTerminal, children: NodeChild[]) {
      super(nt, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.qualifier = (<Token>this.children[0]).type as EKeyword;
    }
  }

  export class StorageQualifier extends BasicTypeQualifier {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(loc, ENonTerminal.storage_qualifier, children);
    }
  }

  export class PrecisionQualifier extends BasicTypeQualifier {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(loc, ENonTerminal.precision_qualifier, children);
    }
  }

  export class InterpolationQualifier extends BasicTypeQualifier {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(loc, ENonTerminal.interpolation_qualifier, children);
    }
  }

  export class InvariantQualifier extends BasicTypeQualifier {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(loc, ENonTerminal.invariant_qualifier, children);
    }
  }

  export class TypeSpecifier extends TreeNode {
    type: GalaceanDataType;
    lexeme: string;
    arraySize?: number;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.type_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.type = (this.children![0] as TypeSpecifierNonArray).type;
      this.arraySize = (this.children?.[1] as ArraySpecifier)?.size;
      this.lexeme = (this.children![0] as TypeSpecifierNonArray).lexeme;
    }

    equal(other: TypeSpecifier): boolean {
      const arraySpecifier = this.children[1] as ArraySpecifier;
      const otherArraySpecifier = other.children[1] as ArraySpecifier;
      return this.type === other.type && arraySpecifier?.size === otherArraySpecifier?.size;
    }
  }

  export class ArraySpecifier extends TreeNode {
    size?: number;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.array_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const integerConstantExpr = this.children[1] as IntegerConstantExpression;
      this.size = integerConstantExpr.value;
    }
  }

  export class IntegerConstantExpressionOperator extends TreeNode {
    compute: (a: number, b: number) => number;
    get lexeme(): string {
      return (this.children[0] as Token).lexeme;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.integer_constant_expression_operator, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const operator = this.children[0] as Token;
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
          throw `not implemented operator ${operator.lexeme}`;
      }
    }
  }

  export class IntegerConstantExpression extends TreeNode {
    value?: number;
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.integer_constant_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const child = this.children[0];
        if (child instanceof Token) {
          this.value = Number(child.lexeme);
        } else {
          const id = child as VariableIdentifier;
          if (!id.symbolInfo) {
            sa.error(id.location, "undeclared symbol:", id.lexeme);
          }
          if (!ParserUtils.typeCompatible(EKeyword.INT, id.typeInfo)) {
            sa.error(id.location, "invalid integer.");
            return;
          }
        }
      }
    }
  }

  export class TypeSpecifierNonArray extends TreeNode {
    type: GalaceanDataType;
    lexeme: string;
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.type_specifier_nonarray, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const tt = this.children[0];
      if (tt instanceof Token) {
        this.type = tt.lexeme;
        this.lexeme = tt.lexeme;
      } else {
        this.type = (tt as ExtBuiltinTypeSpecifierNonArray).type as GalaceanDataType;
        this.lexeme = (tt as ExtBuiltinTypeSpecifierNonArray).lexeme;
      }
    }
  }

  export class ExtBuiltinTypeSpecifierNonArray extends TreeNode {
    type: TokenType;
    lexeme: string;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.ext_builtin_type_specifier_nonarray, loc, children);
      const token = this.children[0] as Token;
      this.type = token.type;
      this.lexeme = token.lexeme;
    }
  }

  export class InitDeclaratorList extends TreeNode {
    get typeInfo(): SymbolType {
      if (this.children.length === 1) {
        const singleDecl = this.children[0] as SingleDeclaration;
        return new SymbolType(
          singleDecl.typeSpecifier.type,
          singleDecl.typeSpecifier.lexeme,
          singleDecl.arraySpecifier
        );
      }

      const initDeclList = this.children[0] as InitDeclaratorList;
      return initDeclList.typeInfo;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.init_declarator_list, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      let sm: VarSymbol;
      if (this.children.length === 3 || this.children.length === 5) {
        const id = this.children[2] as Token;
        sm = new VarSymbol(id.lexeme, this.typeInfo, false, this);
        sa.scope.insert(sm);
      } else if (this.children.length === 4 || this.children.length === 6) {
        const typeInfo = this.typeInfo;
        const arraySpecifier = this.children[3] as ArraySpecifier;
        if (typeInfo.arraySpecifier && arraySpecifier) {
          sa.error(arraySpecifier.location, "array of array is not supported.");
        }
        typeInfo.arraySpecifier = arraySpecifier;
        const id = this.children[2] as Token;
        sm = new VarSymbol(id.lexeme, typeInfo, false, this);
        sa.scope.insert(sm);
      }
    }
  }

  export class IdentifierList extends TreeNode {
    get idList(): Token[] {
      if (this.children.length === 2) {
        return [this.children[1] as Token];
      }
      return [...(<IdentifierList>this.children[0]).idList, this.children[2] as Token];
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.identifier_list, loc, children);
    }
  }

  export class Declaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.declaration, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitDeclaration(this);
    }
  }

  export class FunctionProtoType extends TreeNode {
    private get declarator() {
      return this.children[0] as FunctionDeclarator;
    }

    get ident() {
      return this.declarator.ident;
    }

    get returnType() {
      return this.declarator.returnType;
    }

    get parameterList() {
      return this.declarator.parameterInfoList;
    }

    get paramSig() {
      return this.declarator.paramSig;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_prototype, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionProtoType(this);
    }
  }

  export class FunctionDeclarator extends TreeNode {
    private get header() {
      return this.children[0] as FunctionHeader;
    }

    private get parameterList() {
      return this.children[1] as FunctionParameterList | undefined;
    }

    get ident() {
      return this.header.ident;
    }

    get returnType() {
      return this.header.returnType;
    }

    get parameterInfoList() {
      return this.parameterList?.parameterInfoList;
    }

    get paramSig() {
      return this.parameterList?.paramSig;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_declarator, loc, children);
    }
  }

  export class FunctionHeader extends TreeNode {
    get ident() {
      return this.children[1] as Token;
    }
    get returnType() {
      return this.children[0] as FullySpecifiedType;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_header, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newScope();
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionHeader(this);
    }
  }

  export class FunctionParameterList extends TreeNode {
    get parameterInfoList(): IParamInfo[] {
      if (this.children.length === 1) {
        const decl = this.children[0] as ParameterDeclaration;
        return [{ ident: decl.ident, typeInfo: decl.typeInfo }];
      }
      const list = this.children[0] as FunctionParameterList;
      const decl = this.children[2] as ParameterDeclaration;
      return [...list.parameterInfoList, { ident: decl.ident, typeInfo: decl.typeInfo }];
    }

    get paramSig(): GalaceanDataType[] {
      if (this.children.length === 1) {
        const decl = this.children[0] as ParameterDeclaration;
        return [decl.typeInfo.type];
      } else {
        const list = this.children[0] as FunctionParameterList;
        const decl = this.children[2] as ParameterDeclaration;
        return list.paramSig.concat([decl.typeInfo.type]);
      }
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_parameter_list, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionParameterList(this);
    }
  }

  export class ParameterDeclaration extends TreeNode {
    get typeQualifier() {
      if (this.children.length === 2) return this.children[0] as TypeQualifier;
    }

    private get parameterDeclarator() {
      if (this.children.length === 1) return this.children[0] as ParameterDeclarator;
      return this.children[1] as ParameterDeclarator;
    }

    get typeInfo() {
      return this.parameterDeclarator.typeInfo;
    }

    get ident() {
      return this.parameterDeclarator.ident;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.parameter_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      let declarator: ParameterDeclarator;
      if (this.children.length === 1) {
        declarator = this.children[0] as ParameterDeclarator;
      } else {
        declarator = this.children[1] as ParameterDeclarator;
      }
      const varSymbol = new VarSymbol(declarator.ident.lexeme, declarator.typeInfo, false, this);
      sa.scope.insert(varSymbol);
    }
  }

  export class ParameterDeclarator extends TreeNode {
    get ident() {
      return this.children[1] as Token;
    }

    get typeInfo(): SymbolType {
      const typeSpecifier = this.children[0] as TypeSpecifier;
      const arraySpecifier = this.children[2] as ArraySpecifier;
      return new SymbolType(typeSpecifier.type, typeSpecifier.lexeme, arraySpecifier);
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.parameter_declarator, loc, children);
    }
  }

  export class SimpleStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.simple_statement, loc, children);
    }
  }

  export class CompoundStatement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.compound_statement, loc, children);
    }
  }

  export class CompoundStatementNoScope extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.compound_statement_no_scope, loc, children);
    }
  }

  export class Statement extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.statement, loc, children);
    }
  }

  export class StatementList extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.statement_list, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitStatementList(this);
    }
  }

  export class FunctionDefinition extends TreeNode {
    get protoType() {
      return this.children[0] as FunctionProtoType;
    }

    get statements() {
      return this.children[1] as CompoundStatementNoScope;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_definition, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.dropScope();
      const sm = new FnSymbol(this.protoType.ident.lexeme, this);
      sa.scope.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionDefinition(this);
    }
  }

  export class FunctionCall extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_call, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionCall(this);
    }
  }

  export class FunctionCallGeneric extends ExpressionAstNode {
    fnSymbol: FnSymbol | undefined;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_call_generic, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
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
        const builtinFn = BuiltinFunction.getFn(fnIdent, ...(paramSig ?? []));
        if (builtinFn) {
          this.type = BuiltinFunction.getReturnType(builtinFn.fun, builtinFn.genType);
          return;
        }

        const fnSymbol = sa.scope.lookup(fnIdent, ESymbolType.FN, paramSig);
        if (!fnSymbol) {
          sa.error(this.location, "no overload function type found:", functionIdentifier.ident);
          return;
        }
        this.type = fnSymbol.symDataType?.type;
        this.fnSymbol = fnSymbol;
      }
    }
  }

  export class FunctionCallParameterList extends TreeNode {
    get paramSig(): GalaceanDataType[] | undefined {
      if (this.children.length === 1) {
        const expr = this.children[0] as AssignmentExpression;
        if (expr.type == undefined) return [TypeAny];
        return [expr.type];
      } else {
        const list = this.children[0] as FunctionCallParameterList;
        const decl = this.children[2] as AssignmentExpression;
        if (list.paramSig == undefined || decl.type == undefined) {
          return [TypeAny];
        } else {
          return list.paramSig.concat([decl.type]);
        }
      }
    }

    get paramNodes(): AssignmentExpression[] {
      if (this.children.length === 1) {
        return [this.children[0] as AssignmentExpression];
      } else {
        const list = this.children[0] as FunctionCallParameterList;
        const decl = this.children[2] as AssignmentExpression;

        return list.paramNodes.concat([decl]);
      }
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_call_parameter_list, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {}
  }

  export class PrecisionSpecifier extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.precision_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      (<GLPassShaderData>sa.shaderData).globalPrecisions.push(this);
    }
  }

  export class FunctionIdentifier extends TreeNode {
    get ident() {
      const ty = this.children[0] as TypeSpecifier;
      return ty.type;
    }

    get lexeme() {
      const ty = this.children[0] as TypeSpecifier;
      return ty.lexeme;
    }

    get isBuiltin() {
      return typeof this.ident !== "string";
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.function_identifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {}

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionIdentifier(this);
    }
  }

  export class AssignmentExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.assignment_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as ConditionalExpression;
        this.type = expr.type ?? TypeAny;
      } else {
        const expr = this.children[2] as AssignmentExpression;
        this.type = expr.type ?? TypeAny;
      }
    }
  }

  export class AssignmentOperator extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.assignment_operator, loc, children);
    }
  }

  export class Expression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
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
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.primary_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const id = this.children[0];
        if (id instanceof VariableIdentifier) {
          this.type = id.typeInfo ?? TypeAny;
        } else {
          switch ((<Token>id).type) {
            case ETokenType.INT_CONSTANT:
              this._type = EKeyword.INT;
              break;
            case ETokenType.FLOAT_CONSTANT:
              this.type = EKeyword.FLOAT;
              break;
            case EKeyword.TRUE:
            case EKeyword.FALSE:
              this.type = EKeyword.BOOL;
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
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.postfix_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const child = this.children[0] as PrimaryExpression | FunctionCall;
        this.type = child.type;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitPostfixExpression(this);
    }
  }

  export class UnaryOperator extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.unary_operator, loc, children);
    }
  }

  export class UnaryExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.unary_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.type = (this.children[0] as PostfixExpression).type;
    }
  }

  export class MultiplicativeExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.multiplicative_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (this.children[0] as UnaryExpression).type;
      } else {
        const exp1 = this.children[0] as MultiplicativeExpression;
        const exp2 = this.children[2] as UnaryExpression;
        if (exp1.type === exp2.type) {
          this.type = exp1.type;
        }
      }
    }
  }

  export class AdditiveExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.additive_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (this.children[0] as MultiplicativeExpression).type;
      } else {
        const exp1 = this.children[0] as AdditiveExpression;
        const exp2 = this.children[2] as MultiplicativeExpression;
        if (exp1.type === exp2.type) {
          this.type = exp1.type;
        }
      }
    }
  }

  export class ShiftExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.shift_expression, loc, children);
    }
    override semanticAnalyze(sa: SematicAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
    }
  }

  export class RelationalExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.relational_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ShiftExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.BOOL;
      }
    }
  }

  export class EqualityExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.equality_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<RelationalExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.BOOL;
      }
    }
  }

  export class AndExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.and_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.UINT;
      }
    }
  }

  export class ExclusiveOrExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.exclusive_or_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<AndExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.UINT;
      }
    }
  }

  export class InclusiveOrExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.inclusive_or_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<ExclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.UINT;
      }
    }
  }

  export class LogicalAndExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.logical_and_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<InclusiveOrExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.BOOL;
      }
    }
  }

  export class LogicalXorExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.logical_xor_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalAndExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.BOOL;
      }
    }
  }

  export class LogicalOrExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.logical_or_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalXorExpression>this.children[0]).type;
      } else {
        this.type = EKeyword.BOOL;
      }
    }
  }

  export class ConditionalExpression extends ExpressionAstNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.conditional_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalOrExpression>this.children[0]).type;
      }
    }
  }

  export class StructSpecifier extends TreeNode {
    ident?: Token;

    get propList(): StructProp[] {
      const declList = (this.children.length === 6 ? this.children[3] : this.children[2]) as StructDeclarationList;
      return declList.propList;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.struct_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 6) {
        this.ident = this.children[1] as Token;
        sa.scope.insert(new StructSymbol(this.ident.lexeme, this));
      }
    }
  }

  export class StructDeclarationList extends TreeNode {
    get propList(): StructProp[] {
      if (this.children.length === 1) {
        return (<StructDeclaration>this.children[0]).propList;
      }
      const list = this.children[0] as StructDeclarationList;
      const decl = this.children[1] as StructDeclaration;
      return [list.propList, decl.propList].flat();
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declaration_list, loc, children);
    }
  }

  export class StructDeclaration extends TreeNode {
    get typeSpecifier() {
      if (this.children.length === 3) {
        return this.children[0] as TypeSpecifier;
      }
      return this.children[1] as TypeSpecifier;
    }

    get declaratorList() {
      if (this.children.length === 3) {
        return this.children[1] as StructDeclaratorList;
      }
      return this.children[2] as StructDeclaratorList;
    }

    get propList(): StructProp[] {
      const ret: StructProp[] = [];
      for (const declarator of this.declaratorList.declaratorList) {
        const typeInfo = new SymbolType(this.typeSpecifier.type, this.typeSpecifier.lexeme, declarator.arraySpecifier);
        const prop = new StructProp(typeInfo, declarator.ident);
        ret.push(prop);
      }
      return ret;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declaration, loc, children);
    }
  }

  export class StructDeclaratorList extends TreeNode {
    get declaratorList(): StructDeclarator[] {
      if (this.children.length === 1) {
        return [this.children[0] as StructDeclarator];
      } else {
        const list = this.children[0] as StructDeclaratorList;
        return [...list.declaratorList, <StructDeclarator>this.children[1]];
      }
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declarator_list, loc, children);
    }
  }

  export class StructDeclarator extends TreeNode {
    get ident() {
      return this.children[0] as Token;
    }

    get arraySpecifier(): ArraySpecifier | undefined {
      return this.children[1] as ArraySpecifier;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declarator, loc, children);
    }
  }

  export class GLVariableDeclaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_variable_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const type = this.children[0] as FullySpecifiedType | Token;
      const ident = this.children[1] as Token;
      let sm: VarSymbol;
      if (type instanceof Token) {
        sm = new VarSymbol(ident.lexeme, new SymbolType(<EKeyword.GL_RenderQueueType>type.type, ""), false, this);
      } else {
        sm = new VarSymbol(ident.lexeme, new SymbolType(type.type, type.typeSpecifier.lexeme), true, this);
      }

      sa.scope.insert(sm);
    }
  }

  export class GLRenderQueueAssignment extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_queue_assignment, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const variable = this.children[2] as Token;
      const builtinType = EngineType.RenderQueueType[<any>variable.lexeme];
      const key = EngineType._RenderStateElementKey["RenderQueueType"];
      if (builtinType != undefined) {
        sa.shaderData.renderStates[0][key] = builtinType;
      } else {
        const varSymbol = sa.scope.lookup(variable.lexeme, ESymbolType.VAR);
        if (!varSymbol || varSymbol.symDataType?.type !== EKeyword.GL_RenderQueueType) {
          sa.error(variable.location, "invalid render queue variable:", variable.lexeme);
          return;
        }

        sa.shaderData.renderStates[1][key] = variable.lexeme;
      }
    }
  }

  export class VariableIdentifier extends TreeNode {
    symbolInfo: VarSymbol | BuiltinVariable | null;
    get lexeme(): string {
      return (<Token>this.children[0]).lexeme;
    }

    get typeInfo(): GalaceanDataType {
      if (this.symbolInfo instanceof VarSymbol) return this.symbolInfo?.symDataType.type;
      return this.symbolInfo?.type;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.variable_identifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const token = this.children[0] as Token;

      const builtinVar = BuiltinVariable.getVar(token.lexeme);
      if (builtinVar) {
        this.symbolInfo = builtinVar;
        return;
      }

      this.symbolInfo = sa.scope.lookup(token.lexeme, ESymbolType.VAR);
      if (!this.symbolInfo) {
        sa.error(this.location, "undeclared identifier:", token.lexeme);
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitVariableIdentifier(this);
    }
  }

  export class GLMainShaderEntry extends TreeNode {
    shaderType: EKeyword.GL_VertexShader | EKeyword.GL_FragmentShader;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_main_shader_entry, loc, children);
      this.shaderType = (<Token>children[0]).type as any;
    }
  }

  export class GLMainShaderAssignment extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_main_shader_assignment, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (sa.shaderData.dataType !== EShaderDataType.Pass) {
        sa.error(this.location, "main shader entry cannot be declared outside pass scope.");
      }

      const shaderData = sa.shaderData as GLPassShaderData;
      const variable = this.children[2] as Token;
      const fn = sa.scope.lookup(variable.lexeme, ESymbolType.FN);
      if (!fn) {
        sa.error(variable.location, "undeclared main function entry:", variable.lexeme);
        return;
      }
      const mainEntry = this.children[0] as GLMainShaderEntry;
      if (mainEntry.shaderType === EKeyword.GL_VertexShader) {
        shaderData.vertexMain = fn.astNode;
      } else {
        shaderData.fragmentMain = fn.astNode;
      }
    }
  }

  export class GLRenderStatePropAssignment extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_prop_assignment, loc, children);
    }

    getPropKey(declarator: GLRenderStateDeclarator) {
      const prop = this.children[0] as GLRenderStateProp;
      return GLRenderStatePropAssignment.getPropKey(declarator, prop);
    }

    getPropValue(reporter: Logger) {
      const valueToken = this.children[2] as Token;
      if (valueToken instanceof GLEngineTypeInit) {
        return valueToken.value;
      }
      switch (valueToken.type) {
        case ETokenType.ID:
          if (this.children.length === 4) {
            return valueToken.lexeme;
          } else {
            const engineType = EngineType[valueToken.lexeme];
            const prop = (this.children[4] as Token).lexeme;

            if (!engineType || engineType[prop] == undefined) {
              reporter.error(
                new LocRange(valueToken.location.start, this.location.end),
                `invalid engine type: ${valueToken.lexeme}.${prop}`
              );
              return;
            }

            return engineType[prop];
          }
        case EKeyword.TRUE:
          return true;
        case EKeyword.FALSE:
          return false;
        case ETokenType.INT_CONSTANT:
        case ETokenType.FLOAT_CONSTANT:
          return Number(valueToken.lexeme);
        default:
          reporter.error(this.location, "invalid property.");
          return;
      }
    }

    private static getPropKey(declarator: GLRenderStateDeclarator, prop: GLRenderStateProp): number | undefined {
      let k = declarator.ident + prop.key;
      const ret = EngineType._RenderStateElementKey[k];
      if (ret == undefined && declarator.ident === "BlendState") {
        k = declarator.ident + prop.key + (prop.index ?? "0");
        return EngineType._RenderStateElementKey[k];
      }

      return ret;
    }
  }

  export class GLEngineType extends TreeNode {
    engineType?: new (...args: number[]) => any;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_engine_type, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const typeToken = this.children[0] as Token;
      this.engineType = EngineFunctions[typeToken.lexeme];
      if (this.engineType == undefined) {
        sa.error(this.location, "invalid engine type:", typeToken.lexeme);
        return;
      }
    }
  }

  export class GLEngineTypeInit extends TreeNode {
    value?: any;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_engine_type_init, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const type = this.children[0] as GLEngineType;
      const paramList = this.children[2] as GLEngineTypeInitParamList;
      if (type.engineType) {
        this.value = Reflect.construct(type.engineType, paramList.params);
      }
    }
  }

  export class GLEngineTypeInitParamList extends TreeNode {
    get params(): number[] {
      if (this.children.length === 1) return [Number((this.children[0] as Token).lexeme)];
      const list = this.children[0] as GLEngineTypeInitParamList;
      const cur = this.children[2] as Token;
      return [...list.params, Number(cur.lexeme)];
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_engine_type_init_param_list, loc, children);
    }
  }

  export class GLRenderStateDeclarator extends TreeNode {
    get ident(): RenderStateLabel {
      const ident = this.children[0] as Token;
      return ident.lexeme as RenderStateLabel;
    }

    get type() {
      const ident = this.children[0] as Token;
      return ident.type as GalaceanDataType;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_declarator, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.shaderData.settingRenderState = this;
    }
  }

  export class GLRenderStateDeclaration extends TreeNode {
    type = TypeAny;

    get propListValue() {
      const list = this.children[3] as GLRenderStatePropList;
      return list.propList;
    }

    get propList() {
      return this.children[3] as GLRenderStatePropList;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.shaderData.settingRenderState = undefined;

      const declarator = this.children[0] as GLRenderStateDeclarator;
      const ident = this.children[1] as Token;

      const symbolType = new SymbolType(declarator.type, declarator.ident);
      const varSymbol = new VarSymbol(ident.lexeme, symbolType, false, this);
      sa.scope.insert(varSymbol);
    }
  }

  export class GLRenderStateProp extends TreeNode {
    get key(): string {
      const ident = this.children[0] as Token;
      return ident.lexeme;
    }

    get index(): string | undefined {
      if (this.children.length === 4) {
        return (this.children[2] as Token).lexeme;
      }
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_prop, loc, children);
    }
  }

  export class GLRenderStatePropList extends TreeNode {
    get propList(): GLRenderStatePropAssignment[] | undefined {
      if (this.children.length) {
        const assignment = this.children[0] as GLRenderStatePropAssignment;
        const list = this.children[1] as GLRenderStatePropList;
        return [assignment, ...(list?.propList ?? [])];
      }
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_prop_list, loc, children);
    }
  }

  export class GLRenderStateAssignment extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_render_state_assignment, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const child = this.children[2];
      const declarator = this.children[0] as GLRenderStateDeclarator;
      let propListNode: GLRenderStatePropList;
      if (child instanceof Token) {
        const sm = sa.scope.lookup(child.lexeme, ESymbolType.VAR);
        if (!sm || sm.symDataType?.type !== declarator.type) {
          sa.error(child.location, "invalid render state identifier:", child.lexeme);
          return;
        }
        propListNode = (sm.astNode as GLRenderStateDeclaration).propList;
      } else {
        propListNode = this.children[2] as GLRenderStatePropList;
      }
      for (const prop of propListNode.propList) {
        const key = prop.getPropKey(declarator);
        if (key == undefined) {
          sa.error(prop.location, "invalid render state key");
          continue;
        }
        const value = prop.getPropValue(sa.logger);
        if (value == undefined) continue;
        const idx = typeof value === "string" ? 1 : 0;
        sa.shaderData.renderStates[idx][key] = value;
      }
    }
  }

  export class GLUsePassDeclaration extends TreeNode {
    get passRef(): string {
      const token = this.children[1] as Token;
      return token.lexeme;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_use_pass_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const shaderData = sa.shaderData as GLSubShaderData;
      shaderData.passList.push(this);
    }
  }

  export class GLPassGlobalDeclaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_pass_global_declaration, loc, children);
    }
  }

  export class GLPassGlobalDeclarationList extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_pass_global_declaration_list, loc, children);
    }
  }

  abstract class GLProgram extends TreeNode {
    abstract shaderData: ShaderData;
    name: string;

    constructor(nt: ENonTerminal, loc: LocRange, children: NodeChild[]) {
      super(nt, loc, children);
      const ident = this.children[1] as Token;
      this.name = ident.lexeme;
    }
  }

  export class GLPassProgram extends GLProgram {
    shaderData: GLPassShaderData;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_pass_program, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.shaderData = sa.dropShaderData() as GLPassShaderData;

      const shaderData = sa.shaderData as GLSubShaderData;
      shaderData.passList.push(this);
    }
  }

  export class GLTagValue extends TreeNode {
    get value(): string | number | boolean {
      const token = this.children[0] as Token;
      if (token.type === ETokenType.INT_CONSTANT) {
        return Number(token.lexeme);
      } else if (token.type === ETokenType.STRING_CONST) {
        return token.lexeme;
      }
      return token.lexeme === "true";
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_tag_value, loc, children);
    }
  }

  export class GLTagId extends TreeNode {
    get tag(): string {
      const id = this.children[0] as Token;
      return id.lexeme;
    }

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_tag_id, loc, children);
    }
  }

  export class GLTagAssignment extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_tag_assignment, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const shaderData = sa.shaderData;
      const tagId = this.children[0] as GLTagId;
      const tagValue = this.children[2] as GLTagValue;

      shaderData.tags[tagId.tag] = tagValue.value;
    }
  }

  export class GLTagAssignmentList extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_tag_assignment_list, loc, children);
    }
  }

  export class GLTagSpecifier extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_tag_specifier, loc, children);
    }
  }

  export class GLCommonGlobalDeclaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_common_global_declaration, loc, children);
    }
  }

  export class GLSubShaderGlobalDeclaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_subshader_global_declaration, loc, children);
    }
  }

  export class GLSubShaderGlobalDeclarationList extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_subshader_global_declaration_list, loc, children);
    }
  }

  export class GLSubShaderProgram extends GLProgram {
    shaderData: GLSubShaderData;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_subshader_program, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.shaderData = sa.dropShaderData() as GLSubShaderData;

      const shaderData = sa.shaderData as GLShaderData;
      shaderData.subShaderList.push(this);
    }
  }

  export class GLShaderGlobalDeclarationList extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_shader_global_declaration_list, loc, children);
    }
  }

  export class GLShaderGlobalDeclaration extends TreeNode {
    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_shader_global_declaration, loc, children);
    }
  }

  export class GLShaderProgram extends GLProgram {
    shaderData: GLShaderData;

    constructor(loc: LocRange, children: NodeChild[]) {
      super(ENonTerminal.gl_shader_program, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.shaderData = sa.dropShaderData() as GLShaderData;
      this.shaderData.symbolTable = sa.scope;
    }
  }
}
