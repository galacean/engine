// #if _EDITOR
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
// #endif
import { CodeGenVisitor } from "../codeGen";
import { ENonTerminal } from "./GrammarSymbol";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword, ETokenType, TokenType, ShaderRange, GalaceanDataType, TypeAny } from "../common";
import SematicAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, VarSymbol } from "./symbolTable";
import { ParserUtils } from "../Utils";
import { ASTNodeConstructor, IParamInfo, NodeChild, StructProp, SymbolType } from "./types";
import { AstNodePool, IInitializedPoolElement } from "../AstNodePool";
import { IPoolElement } from "@galacean/engine";

export abstract class TreeNode
  implements IPoolElement, IInitializedPoolElement<TreeNode, new (loc: ShaderRange, children: NodeChild[]) => TreeNode>
{
  /** The non-terminal in grammar. */
  readonly nt: ENonTerminal;
  private _children: NodeChild[];
  private _location: ShaderRange;

  get children() {
    return this._children;
  }

  get location() {
    return this._location;
  }

  constructor(nt: ENonTerminal, loc: ShaderRange, children: NodeChild[]) {
    this.nt = nt;
    this._location = loc;
    this._children = children;
  }

  init(loc: ShaderRange, children: NodeChild[]) {
    this._location = loc;
    this._children = children;
  }

  dispose(): void {}

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

  export function get(
    pool: AstNodePool<ASTNodeConstructor, TreeNode>,
    sa: SematicAnalyzer,
    loc: ShaderRange,
    children: NodeChild[]
  ) {
    const node = pool.get(loc, children);
    node.semanticAnalyze(sa);
    sa.semanticStack.push(node);
  }

  export class TrivialNode extends TreeNode {
    static pool = new AstNodePool(TrivialNode, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal._ignore, loc, children);
    }
  }

  export class ScopeBrace extends TreeNode {
    static pool = new AstNodePool(ScopeBrace, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.scope_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newScope();
    }
  }

  export class ScopeEndBrace extends TreeNode {
    static pool = new AstNodePool(ScopeEndBrace, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.scope_end_brace, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.dropScope();
    }
  }

  export class JumpStatement extends TreeNode {
    static pool = new AstNodePool(JumpStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.jump_statement, loc, children);
    }

    // #if _EDITOR
    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (ASTNode._unwrapToken(this.children![0]).type === EKeyword.RETURN) {
        // TODO: check the equality of function return type declared and this type.
      }
    }
    // #endif

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitJumpStatement(this);
    }
  }

  // #if _EDITOR
  export class ConditionOpt extends TreeNode {
    static pool = new AstNodePool(ConditionOpt, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.conditionopt, loc, children);
    }
  }

  export class ForRestStatement extends TreeNode {
    static pool = new AstNodePool(ForRestStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.for_rest_statement, loc, children);
    }
  }

  export class Condition extends TreeNode {
    static pool = new AstNodePool(Condition, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.condition, loc, children);
    }
  }

  export class ForInitStatement extends TreeNode {
    static pool = new AstNodePool(ForInitStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.for_init_statement, loc, children);
    }
  }

  export class IterationStatement extends TreeNode {
    static pool = new AstNodePool(IterationStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.iteration_statement, loc, children);
    }
  }

  export class SelectionStatement extends TreeNode {
    static pool = new AstNodePool(SelectionStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.selection_statement, loc, children);
    }
  }

  export class ExpressionStatement extends TreeNode {
    static pool = new AstNodePool(ExpressionStatement, 10);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.expression_statement, loc, children);
    }
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

    constructor(nt: ENonTerminal, loc: ShaderRange, children: NodeChild[]) {
      super(nt, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      this._type = undefined;
    }
  }

  // #if _EDITOR
  export class InitializerList extends ExpressionAstNode {
    static pool = new AstNodePool(InitializerList, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.initializer_list, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const init = this.children[0] as Initializer | InitializerList;
      this.type = init.type;
    }
  }

  export class Initializer extends ExpressionAstNode {
    static pool = new AstNodePool(Initializer, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  export class SingleDeclaration extends TreeNode {
    static pool = new AstNodePool(SingleDeclaration, 5);

    typeSpecifier: TypeSpecifier;
    arraySpecifier?: ArraySpecifier;

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.single_declaration, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      this.typeSpecifier = undefined;
      this.arraySpecifier = undefined;
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
      sa.symbolTable.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitSingleDeclaration(this);
    }
  }

  export class FullySpecifiedType extends TreeNode {
    static pool = new AstNodePool(FullySpecifiedType, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.fully_specified_type, loc, children);
    }
  }

  export class TypeQualifier extends TreeNode {
    static pool = new AstNodePool(TypeQualifier, 5);

    qualifierList: EKeyword[];

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    static pool = new AstNodePool(SingleTypeQualifier, 5);

    qualifier: EKeyword;
    lexeme: string;

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    get qualifier(): EKeyword {
      return (<Token>this.children[0]).type as EKeyword;
    }
    get lexeme(): string {
      return (<Token>this.children[0]).lexeme;
    }

    constructor(loc: ShaderRange, nt: ENonTerminal, children: NodeChild[]) {
      super(nt, loc, children);
    }
  }

  // #if _EDITOR
  export class StorageQualifier extends BasicTypeQualifier {
    static pool = new AstNodePool(StorageQualifier, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(loc, ENonTerminal.storage_qualifier, children);
    }
  }

  export class PrecisionQualifier extends BasicTypeQualifier {
    static pool = new AstNodePool(PrecisionQualifier, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(loc, ENonTerminal.precision_qualifier, children);
    }
  }

  export class InterpolationQualifier extends BasicTypeQualifier {
    static pool = new AstNodePool(InterpolationQualifier, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(loc, ENonTerminal.interpolation_qualifier, children);
    }
  }

  export class InvariantQualifier extends BasicTypeQualifier {
    static pool = new AstNodePool(InvariantQualifier, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(loc, ENonTerminal.invariant_qualifier, children);
    }
  }
  // #endif

  export class TypeSpecifier extends TreeNode {
    static pool = new AstNodePool(TypeSpecifier, 10);

    get type(): GalaceanDataType {
      return (this.children![0] as TypeSpecifierNonArray).type;
    }
    get lexeme(): string {
      return (this.children![0] as TypeSpecifierNonArray).lexeme;
    }
    get arraySize(): number {
      return (this.children?.[1] as ArraySpecifier)?.size;
    }

    get isCustom() {
      return typeof this.type === "string";
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.type_specifier, loc, children);
    }
  }

  export class ArraySpecifier extends TreeNode {
    static pool = new AstNodePool(ArraySpecifier, 5);

    get size(): number | undefined {
      const integerConstantExpr = this.children[1] as IntegerConstantExpression;
      return integerConstantExpr.value;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.array_specifier, loc, children);
    }
  }

  export class IntegerConstantExpressionOperator extends TreeNode {
    static pool = new AstNodePool(IntegerConstantExpressionOperator, 10);

    compute: (a: number, b: number) => number;
    get lexeme(): string {
      return (this.children[0] as Token).lexeme;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    static pool = new AstNodePool(IntegerConstantExpression, 5);

    value?: number;
    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.integer_constant_expression, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      this.value = undefined;
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const child = this.children[0];
        if (child instanceof Token) {
          this.value = Number(child.lexeme);
        }
        // #if _EDITOR
        else {
          const id = child as VariableIdentifier;
          if (!id.symbolInfo) {
            sa.error(id.location, "undeclared symbol:", id.lexeme);
          }
          if (!ParserUtils.typeCompatible(EKeyword.INT, id.typeInfo)) {
            sa.error(id.location, "invalid integer.");
            return;
          }
        }
        // #endif
      }
    }
  }

  export class TypeSpecifierNonArray extends TreeNode {
    static pool = new AstNodePool(TypeSpecifierNonArray, 5);

    type: GalaceanDataType;
    lexeme: string;
    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.type_specifier_nonarray, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      const tt = children[0];
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
    static pool = new AstNodePool(ExtBuiltinTypeSpecifierNonArray, 5);

    type: TokenType;
    lexeme: string;

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.ext_builtin_type_specifier_nonarray, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      const token = this.children[0] as Token;
      this.type = token.type;
      this.lexeme = token.lexeme;
    }
  }

  export class InitDeclaratorList extends TreeNode {
    static pool = new AstNodePool(InitDeclaratorList, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.init_declarator_list, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      let sm: VarSymbol;
      if (this.children.length === 3 || this.children.length === 5) {
        const id = this.children[2] as Token;
        sm = new VarSymbol(id.lexeme, this.typeInfo, false, this);
        sa.symbolTable.insert(sm);
      } else if (this.children.length === 4 || this.children.length === 6) {
        const typeInfo = this.typeInfo;
        const arraySpecifier = this.children[3] as ArraySpecifier;
        // #if _EDITOR
        if (typeInfo.arraySpecifier && arraySpecifier) {
          sa.error(arraySpecifier.location, "array of array is not supported.");
        }
        // #endif
        typeInfo.arraySpecifier = arraySpecifier;
        const id = this.children[2] as Token;
        sm = new VarSymbol(id.lexeme, typeInfo, false, this);
        sa.symbolTable.insert(sm);
      }
    }
  }

  export class IdentifierList extends TreeNode {
    static pool = new AstNodePool(IdentifierList, 5);

    get idList(): Token[] {
      if (this.children.length === 2) {
        return [this.children[1] as Token];
      }
      return [...(<IdentifierList>this.children[0]).idList, this.children[2] as Token];
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.identifier_list, loc, children);
    }
  }

  export class Declaration extends TreeNode {
    static pool = new AstNodePool(Declaration, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.declaration, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitDeclaration(this);
    }
  }

  export class FunctionProtoType extends TreeNode {
    static pool = new AstNodePool(FunctionProtoType, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_prototype, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionProtoType(this);
    }
  }

  export class FunctionDeclarator extends TreeNode {
    static pool = new AstNodePool(FunctionDeclarator, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_declarator, loc, children);
    }
  }

  export class FunctionHeader extends TreeNode {
    static pool = new AstNodePool(FunctionHeader, 5);

    get ident() {
      return this.children[1] as Token;
    }
    get returnType() {
      return this.children[0] as FullySpecifiedType;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    static pool = new AstNodePool(FunctionParameterList, 5);

    get parameterInfoList(): IParamInfo[] {
      if (this.children.length === 1) {
        const decl = this.children[0] as ParameterDeclaration;
        return [{ ident: decl.ident, typeInfo: decl.typeInfo, astNode: decl }];
      }
      const list = this.children[0] as FunctionParameterList;
      const decl = this.children[2] as ParameterDeclaration;
      return [...list.parameterInfoList, { ident: decl.ident, typeInfo: decl.typeInfo, astNode: decl }];
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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_parameter_list, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionParameterList(this);
    }
  }

  export class ParameterDeclaration extends TreeNode {
    static pool = new AstNodePool(ParameterDeclaration, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
      sa.symbolTable.insert(varSymbol);
    }
  }

  export class ParameterDeclarator extends TreeNode {
    static pool = new AstNodePool(ParameterDeclarator, 5);

    get ident() {
      return this.children[1] as Token;
    }

    get typeInfo(): SymbolType {
      const typeSpecifier = this.children[0] as TypeSpecifier;
      const arraySpecifier = this.children[2] as ArraySpecifier;
      return new SymbolType(typeSpecifier.type, typeSpecifier.lexeme, arraySpecifier);
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.parameter_declarator, loc, children);
    }
  }

  // #if _EDITOR
  export class SimpleStatement extends TreeNode {
    static pool = new AstNodePool(SimpleStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.simple_statement, loc, children);
    }
  }

  export class CompoundStatement extends TreeNode {
    static pool = new AstNodePool(CompoundStatement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.compound_statement, loc, children);
    }
  }
  // #endif

  export class CompoundStatementNoScope extends TreeNode {
    static pool = new AstNodePool(CompoundStatementNoScope, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.compound_statement_no_scope, loc, children);
    }
  }

  // #if _EDITOR
  export class Statement extends TreeNode {
    static pool = new AstNodePool(Statement, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.statement, loc, children);
    }
  }
  // #endif

  export class StatementList extends TreeNode {
    static pool = new AstNodePool(StatementList, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.statement_list, loc, children);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitStatementList(this);
    }
  }

  export class FunctionDefinition extends TreeNode {
    static pool = new AstNodePool(FunctionDefinition, 5);

    get protoType() {
      return this.children[0] as FunctionProtoType;
    }

    get statements() {
      return this.children[1] as CompoundStatementNoScope;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_definition, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.dropScope();
      const sm = new FnSymbol(this.protoType.ident.lexeme, this);
      sa.symbolTable.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionDefinition(this);
    }
  }

  export class FunctionCall extends ExpressionAstNode {
    static pool = new AstNodePool(FunctionCall, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    static pool = new AstNodePool(FunctionCallGeneric, 5);

    fnSymbol: FnSymbol | StructSymbol | undefined;

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_call_generic, loc, children);
    }

    override init(loc: ShaderRange, children: NodeChild[]): void {
      super.init(loc, children);
      this.fnSymbol = undefined;
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
        // #if _EDITOR
        const builtinFn = BuiltinFunction.getFn(fnIdent, ...(paramSig ?? []));
        if (builtinFn) {
          this.type = BuiltinFunction.getReturnType(builtinFn.fun, builtinFn.genType);
          return;
        }
        // #endif

        const fnSymbol = sa.symbolTable.lookup({ ident: fnIdent, symbolType: ESymbolType.FN, signature: paramSig });
        if (!fnSymbol) {
          // #if _EDITOR
          sa.error(this.location, "no overload function type found:", functionIdentifier.ident);
          // #endif
          return;
        }
        this.type = fnSymbol?.dataType?.type;
        this.fnSymbol = fnSymbol as FnSymbol;
      }
    }
  }

  export class FunctionCallParameterList extends TreeNode {
    static pool = new AstNodePool(FunctionCallParameterList, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_call_parameter_list, loc, children);
    }
  }

  export class PrecisionSpecifier extends TreeNode {
    static pool = new AstNodePool(PrecisionSpecifier, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.precision_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.shaderData.globalPrecisions.push(this);
    }
  }

  export class FunctionIdentifier extends TreeNode {
    static pool = new AstNodePool(FunctionIdentifier, 5);

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

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.function_identifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {}

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionIdentifier(this);
    }
  }

  export class AssignmentExpression extends ExpressionAstNode {
    static pool = new AstNodePool(AssignmentExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.assignment_expression, loc, children);
    }

    // #if _EDITOR
    override semanticAnalyze(sa: SematicAnalyzer): void {
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

  // #if _EDITOR
  export class AssignmentOperator extends TreeNode {
    static pool = new AstNodePool(AssignmentOperator, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.assignment_operator, loc, children);
    }
  }
  // #endif

  export class Expression extends ExpressionAstNode {
    static pool = new AstNodePool(Expression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.expression, loc, children);
    }

    // #if _EDITOR
    override semanticAnalyze(sa: SematicAnalyzer): void {
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

  export class PrimaryExpression extends ExpressionAstNode {
    static pool = new AstNodePool(PrimaryExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
    static pool = new AstNodePool(PostfixExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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

  // #if _EDITOR
  export class UnaryOperator extends TreeNode {
    static pool = new AstNodePool(UnaryOperator, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.unary_operator, loc, children);
    }
  }
  // #endif

  // #if _EDITOR
  export class UnaryExpression extends ExpressionAstNode {
    static pool = new AstNodePool(UnaryExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.unary_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.type = (this.children[0] as PostfixExpression).type;
    }
  }
  // #endif

  // #if _EDITOR
  export class MultiplicativeExpression extends ExpressionAstNode {
    static pool = new AstNodePool(MultiplicativeExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class AdditiveExpression extends ExpressionAstNode {
    static pool = new AstNodePool(AdditiveExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class ShiftExpression extends ExpressionAstNode {
    static pool = new AstNodePool(ShiftExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.shift_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
    }
  }
  // #endif

  // #if _EDITOR
  export class RelationalExpression extends ExpressionAstNode {
    static pool = new AstNodePool(RelationalExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class EqualityExpression extends ExpressionAstNode {
    static pool = new AstNodePool(EqualityExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class AndExpression extends ExpressionAstNode {
    static pool = new AstNodePool(AndExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class ExclusiveOrExpression extends ExpressionAstNode {
    static pool = new AstNodePool(ExclusiveOrExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class InclusiveOrExpression extends ExpressionAstNode {
    static pool = new AstNodePool(InclusiveOrExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class LogicalAndExpression extends ExpressionAstNode {
    static pool = new AstNodePool(LogicalAndExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class LogicalXorExpression extends ExpressionAstNode {
    static pool = new AstNodePool(LogicalXorExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class LogicalOrExpression extends ExpressionAstNode {
    static pool = new AstNodePool(LogicalOrExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
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
  // #endif

  // #if _EDITOR
  export class ConditionalExpression extends ExpressionAstNode {
    static pool = new AstNodePool(ConditionalExpression, 5);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.conditional_expression, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalOrExpression>this.children[0]).type;
      }
    }
  }
  // #endif

  export class StructSpecifier extends TreeNode {
    static pool = new AstNodePool(StructSpecifier, 5);

    ident?: Token;

    get propList(): StructProp[] {
      const declList = (this.children.length === 6 ? this.children[3] : this.children[2]) as StructDeclarationList;
      return declList.propList;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.struct_specifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 6) {
        this.ident = this.children[1] as Token;
        sa.symbolTable.insert(new StructSymbol(this.ident.lexeme, this));
      }
    }
  }

  export class StructDeclarationList extends TreeNode {
    static pool = new AstNodePool(StructDeclarationList, 5);

    get propList(): StructProp[] {
      if (this.children.length === 1) {
        return (<StructDeclaration>this.children[0]).propList;
      }
      const list = this.children[0] as StructDeclarationList;
      const decl = this.children[1] as StructDeclaration;
      return [list.propList, decl.propList].flat();
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declaration_list, loc, children);
    }
  }

  export class StructDeclaration extends TreeNode {
    static pool = new AstNodePool(StructDeclaration, 5);

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
      for (let i = 0; i < this.declaratorList.declaratorList.length; i++) {
        const declarator = this.declaratorList.declaratorList[i];
        const typeInfo = new SymbolType(this.typeSpecifier.type, this.typeSpecifier.lexeme, declarator.arraySpecifier);
        const prop = new StructProp(typeInfo, declarator.ident);
        ret.push(prop);
      }
      return ret;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declaration, loc, children);
    }
  }

  export class StructDeclaratorList extends TreeNode {
    static pool = new AstNodePool(StructDeclaratorList, 5);

    get declaratorList(): StructDeclarator[] {
      if (this.children.length === 1) {
        return [this.children[0] as StructDeclarator];
      } else {
        const list = this.children[0] as StructDeclaratorList;
        return [...list.declaratorList, <StructDeclarator>this.children[1]];
      }
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declarator_list, loc, children);
    }
  }

  export class StructDeclarator extends TreeNode {
    static pool = new AstNodePool(StructDeclarator, 5);

    get ident() {
      return this.children[0] as Token;
    }

    get arraySpecifier(): ArraySpecifier | undefined {
      return this.children[1] as ArraySpecifier;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.struct_declarator, loc, children);
    }
  }

  export class VariableDeclaration extends TreeNode {
    static pool = new AstNodePool(VariableDeclaration, 20);

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.variable_declaration, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const type = this.children[0] as FullySpecifiedType;
      const ident = this.children[1] as Token;
      let sm: VarSymbol;
      sm = new VarSymbol(ident.lexeme, new SymbolType(type.type, type.typeSpecifier.lexeme), true, this);

      sa.symbolTable.insert(sm);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitGlobalVariableDeclaration(this);
    }
  }

  export class VariableIdentifier extends TreeNode {
    static pool = new AstNodePool(VariableIdentifier, 20);

    symbolInfo:
      | VarSymbol
      // #if _EDITOR
      | BuiltinVariable
      // #endif
      | null;

    get lexeme(): string {
      return (<Token>this.children[0]).lexeme;
    }

    get typeInfo(): GalaceanDataType {
      if (this.symbolInfo instanceof VarSymbol) return this.symbolInfo.dataType.type;
      return this.symbolInfo?.type;
    }

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.variable_identifier, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const token = this.children[0] as Token;

      // #if _EDITOR
      const builtinVar = BuiltinVariable.getVar(token.lexeme);
      if (builtinVar) {
        this.symbolInfo = builtinVar;
        return;
      }
      // #endif

      this.symbolInfo = sa.symbolTable.lookup({ ident: token.lexeme, symbolType: ESymbolType.VAR }) as VarSymbol;
      // #if _EDITOR
      if (!this.symbolInfo) {
        sa.error(this.location, "undeclared identifier:", token.lexeme);
      }
      // #endif
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitVariableIdentifier(this);
    }
  }

  export class GLShaderProgram extends TreeNode {
    static pool = new AstNodePool(GLShaderProgram, 1);

    shaderData: ShaderData;

    constructor(loc: ShaderRange, children: NodeChild[]) {
      super(ENonTerminal.gs_shader_program, loc, children);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.shaderData = sa.shaderData;
      this.shaderData.symbolTable = sa.symbolTable._scope;
    }
  }
}
