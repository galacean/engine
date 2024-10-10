// #if _VERBOSE
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
// #endif
import { CodeGenVisitor } from "../codeGen";
import { ENonTerminal } from "./GrammarSymbol";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword, ETokenType, TokenType, ShaderRange, GalaceanDataType, TypeAny } from "../common";
import SematicAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, VarSymbol } from "./symbolTable";
import { ParserUtils } from "../ParserUtils";
import { IParamInfo, NodeChild, StructProp, SymbolType } from "./types";
import { ClearableObjectPool, IPoolElement } from "@galacean/engine";
import { ShaderLabUtils } from "../ShaderLabUtils";

export abstract class TreeNode implements IPoolElement {
  /** The non-terminal in grammar. */
  nt: ENonTerminal;
  private _children: NodeChild[];
  private _location: ShaderRange;

  get children() {
    return this._children;
  }

  get location() {
    return this._location;
  }

  set(loc: ShaderRange, children: NodeChild[], nt: ENonTerminal) {
    this.nt = nt;
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
  export type ASTNodePool = ClearableObjectPool<
    { set: (loc: ShaderRange, children: NodeChild[]) => void } & IPoolElement & TreeNode
  >;

  export function _unwrapToken(node: NodeChild) {
    if (node instanceof Token) {
      return node;
    }
    throw "not token";
  }

  export function get(pool: ASTNodePool, sa: SematicAnalyzer, loc: ShaderRange, children: NodeChild[]) {
    const node = pool.get();
    node.set(loc, children);
    node.semanticAnalyze(sa);
    sa.semanticStack.push(node);
  }

  export class TrivialNode extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(TrivialNode);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal._ignore);
    }
  }

  export class ScopeBrace extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ScopeBrace);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.scope_brace);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newScope();
    }
  }

  export class ScopeEndBrace extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ScopeEndBrace);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.scope_end_brace);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.dropScope();
    }
  }

  export class JumpStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(JumpStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.jump_statement);
    }

    // #if _VERBOSE
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

  // #if _VERBOSE
  export class ConditionOpt extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ConditionOpt);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.conditionopt);
    }
  }

  export class ForRestStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ForRestStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.for_rest_statement);
    }
  }

  export class Condition extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(Condition);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.condition);
    }
  }

  export class ForInitStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ForInitStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.for_init_statement);
    }
  }

  export class IterationStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(IterationStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.iteration_statement);
    }
  }

  export class SelectionStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(SelectionStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.selection_statement);
    }
  }

  export class ExpressionStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ExpressionStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.expression_statement);
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

    override set(loc: ShaderRange, children: NodeChild[], nt: ENonTerminal) {
      super.set(loc, children, nt);
      this._type = undefined;
    }
  }

  // #if _VERBOSE
  export class InitializerList extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(InitializerList);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.initializer_list);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const init = this.children[0] as Initializer | InitializerList;
      this.type = init.type;
    }
  }

  export class Initializer extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(Initializer);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.initializer);
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
    static pool = ShaderLabUtils.createObjectPool(SingleDeclaration);

    typeSpecifier: TypeSpecifier;
    arraySpecifier?: ArraySpecifier;

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.single_declaration);
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
    static pool = ShaderLabUtils.createObjectPool(FullySpecifiedType);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.fully_specified_type);
    }
  }

  export class TypeQualifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(TypeQualifier);

    qualifierList: EKeyword[];

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.type_qualifier);
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
    static pool = ShaderLabUtils.createObjectPool(SingleTypeQualifier);

    qualifier: EKeyword;
    lexeme: string;

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.single_type_qualifier);
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

    override set(loc: ShaderRange, children: NodeChild[], nt: ENonTerminal) {
      super.set(loc, children, nt);
    }
  }

  // #if _VERBOSE
  export class StorageQualifier extends BasicTypeQualifier {
    static pool = ShaderLabUtils.createObjectPool(StorageQualifier);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.storage_qualifier);
    }
  }

  export class PrecisionQualifier extends BasicTypeQualifier {
    static pool = ShaderLabUtils.createObjectPool(PrecisionQualifier);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.precision_qualifier);
    }
  }

  export class InterpolationQualifier extends BasicTypeQualifier {
    static pool = ShaderLabUtils.createObjectPool(InterpolationQualifier);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.interpolation_qualifier);
    }
  }

  export class InvariantQualifier extends BasicTypeQualifier {
    static pool = ShaderLabUtils.createObjectPool(InvariantQualifier);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.invariant_qualifier);
    }
  }
  // #endif

  export class TypeSpecifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(TypeSpecifier);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.type_specifier);
    }
  }

  export class ArraySpecifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ArraySpecifier);

    get size(): number | undefined {
      const integerConstantExpr = this.children[1] as IntegerConstantExpression;
      return integerConstantExpr.value;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.array_specifier);
    }
  }

  export class IntegerConstantExpressionOperator extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(IntegerConstantExpressionOperator);

    compute: (a: number, b: number) => number;
    get lexeme(): string {
      return (this.children[0] as Token).lexeme;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.integer_constant_expression_operator);
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
          sa.error(operator.location, `not implemented operator ${operator.lexeme}`);
      }
    }
  }

  export class IntegerConstantExpression extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(IntegerConstantExpression);

    value?: number;
    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.integer_constant_expression);
      this.value = undefined;
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        const child = this.children[0];
        if (child instanceof Token) {
          this.value = Number(child.lexeme);
        }
        // #if _VERBOSE
        else {
          const id = child as VariableIdentifier;
          if (!id.symbolInfo) {
            sa.error(id.location, "Undeclared symbol:", id.lexeme);
          }
          if (!ParserUtils.typeCompatible(EKeyword.INT, id.typeInfo)) {
            sa.error(id.location, "Invalid integer.");
            return;
          }
        }
        // #endif
      }
    }
  }

  export class TypeSpecifierNonArray extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(TypeSpecifierNonArray);

    type: GalaceanDataType;
    lexeme: string;
    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.type_specifier_nonarray);
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
    static pool = ShaderLabUtils.createObjectPool(ExtBuiltinTypeSpecifierNonArray);

    type: TokenType;
    lexeme: string;

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.ext_builtin_type_specifier_nonarray);
      const token = this.children[0] as Token;
      this.type = token.type;
      this.lexeme = token.lexeme;
    }
  }

  export class InitDeclaratorList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(InitDeclaratorList);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.init_declarator_list);
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
        // #if _VERBOSE
        if (typeInfo.arraySpecifier && arraySpecifier) {
          sa.error(arraySpecifier.location, "Array of array is not supported.");
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
    static pool = ShaderLabUtils.createObjectPool(IdentifierList);

    get idList(): Token[] {
      if (this.children.length === 2) {
        return [this.children[1] as Token];
      }
      return [...(<IdentifierList>this.children[0]).idList, this.children[2] as Token];
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.identifier_list);
    }
  }

  export class Declaration extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(Declaration);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.declaration);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitDeclaration(this);
    }
  }

  export class FunctionProtoType extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionProtoType);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_prototype);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionProtoType(this);
    }
  }

  export class FunctionDeclarator extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionDeclarator);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_declarator);
    }
  }

  export class FunctionHeader extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionHeader);

    get ident() {
      return this.children[1] as Token;
    }
    get returnType() {
      return this.children[0] as FullySpecifiedType;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_header);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.newScope();
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionHeader(this);
    }
  }

  export class FunctionParameterList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionParameterList);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_parameter_list);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionParameterList(this);
    }
  }

  export class ParameterDeclaration extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(ParameterDeclaration);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.parameter_declaration);
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
    static pool = ShaderLabUtils.createObjectPool(ParameterDeclarator);

    get ident() {
      return this.children[1] as Token;
    }

    get typeInfo(): SymbolType {
      const typeSpecifier = this.children[0] as TypeSpecifier;
      const arraySpecifier = this.children[2] as ArraySpecifier;
      return new SymbolType(typeSpecifier.type, typeSpecifier.lexeme, arraySpecifier);
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.parameter_declarator);
    }
  }

  // #if _VERBOSE
  export class SimpleStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(SimpleStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.simple_statement);
    }
  }

  export class CompoundStatement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(CompoundStatement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.compound_statement);
    }
  }
  // #endif

  export class CompoundStatementNoScope extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(CompoundStatementNoScope);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.compound_statement_no_scope);
    }
  }

  // #if _VERBOSE
  export class Statement extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(Statement);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.statement);
    }
  }
  // #endif

  export class StatementList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StatementList);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.statement_list);
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitStatementList(this);
    }
  }

  export class FunctionDefinition extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionDefinition);

    get protoType() {
      return this.children[0] as FunctionProtoType;
    }

    get statements() {
      return this.children[1] as CompoundStatementNoScope;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_definition);
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
    static pool = ShaderLabUtils.createObjectPool(FunctionCall);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_call);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionCall(this);
    }
  }

  export class FunctionCallGeneric extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionCallGeneric);

    fnSymbol: FnSymbol | StructSymbol | undefined;

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_call_generic);
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
        // #if _VERBOSE
        const builtinFn = BuiltinFunction.getFn(fnIdent, ...(paramSig ?? []));
        if (builtinFn) {
          this.type = BuiltinFunction.getReturnType(builtinFn.fun, builtinFn.genType);
          return;
        }
        // #endif

        const fnSymbol = sa.symbolTable.lookup({ ident: fnIdent, symbolType: ESymbolType.FN, signature: paramSig });
        if (!fnSymbol) {
          // #if _VERBOSE
          sa.error(this.location, "No overload function type found: ", functionIdentifier.ident);
          // #endif
          return;
        }
        this.type = fnSymbol?.dataType?.type;
        this.fnSymbol = fnSymbol as FnSymbol;
      }
    }
  }

  export class FunctionCallParameterList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionCallParameterList);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_call_parameter_list);
    }
  }

  export class PrecisionSpecifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(PrecisionSpecifier);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.precision_specifier);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      sa.shaderData.globalPrecisions.push(this);
    }
  }

  export class FunctionIdentifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(FunctionIdentifier);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.function_identifier);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {}

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitFunctionIdentifier(this);
    }
  }

  export class AssignmentExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(AssignmentExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.assignment_expression);
    }

    // #if _VERBOSE
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

  // #if _VERBOSE
  export class AssignmentOperator extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(AssignmentOperator);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.assignment_operator);
    }
  }
  // #endif

  export class Expression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(Expression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.expression);
    }

    // #if _VERBOSE
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
    static pool = ShaderLabUtils.createObjectPool(PrimaryExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.primary_expression);
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
    static pool = ShaderLabUtils.createObjectPool(PostfixExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.postfix_expression);
      if (this.children.length === 1) {
        const child = this.children[0] as PrimaryExpression | FunctionCall;
        this.type = child.type;
      }
    }

    override codeGen(visitor: CodeGenVisitor): string {
      return visitor.visitPostfixExpression(this);
    }
  }

  // #if _VERBOSE
  export class UnaryOperator extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(UnaryOperator);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.unary_operator);
    }
  }
  // #endif

  // #if _VERBOSE
  export class UnaryExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(UnaryExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.unary_expression);
      this.type = (this.children[0] as PostfixExpression).type;
    }
  }
  // #endif

  // #if _VERBOSE
  export class MultiplicativeExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(MultiplicativeExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.multiplicative_expression);
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

  // #if _VERBOSE
  export class AdditiveExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(AdditiveExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.additive_expression);
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

  // #if _VERBOSE
  export class ShiftExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(ShiftExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.shift_expression);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const expr = this.children[0] as ExpressionAstNode;
      this.type = expr.type;
    }
  }
  // #endif

  // #if _VERBOSE
  export class RelationalExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(RelationalExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.relational_expression);
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

  // #if _VERBOSE
  export class EqualityExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(EqualityExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.equality_expression);
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

  // #if _VERBOSE
  export class AndExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(AndExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.and_expression);
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

  // #if _VERBOSE
  export class ExclusiveOrExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(ExclusiveOrExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.exclusive_or_expression);
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

  // #if _VERBOSE
  export class InclusiveOrExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(InclusiveOrExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.inclusive_or_expression);
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

  // #if _VERBOSE
  export class LogicalAndExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(LogicalAndExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.logical_and_expression);
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

  // #if _VERBOSE
  export class LogicalXorExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(LogicalXorExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.logical_xor_expression);
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

  // #if _VERBOSE
  export class LogicalOrExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(LogicalOrExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.logical_or_expression);
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

  // #if _VERBOSE
  export class ConditionalExpression extends ExpressionAstNode {
    static pool = ShaderLabUtils.createObjectPool(ConditionalExpression);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.conditional_expression);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 1) {
        this.type = (<LogicalOrExpression>this.children[0]).type;
      }
    }
  }
  // #endif

  export class StructSpecifier extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StructSpecifier);

    ident?: Token;

    get propList(): StructProp[] {
      const declList = (this.children.length === 6 ? this.children[3] : this.children[2]) as StructDeclarationList;
      return declList.propList;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.struct_specifier);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      if (this.children.length === 6) {
        this.ident = this.children[1] as Token;
        sa.symbolTable.insert(new StructSymbol(this.ident.lexeme, this));
      }
    }
  }

  export class StructDeclarationList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StructDeclarationList);

    get propList(): StructProp[] {
      if (this.children.length === 1) {
        return (<StructDeclaration>this.children[0]).propList;
      }
      const list = this.children[0] as StructDeclarationList;
      const decl = this.children[1] as StructDeclaration;
      return [list.propList, decl.propList].flat();
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.struct_declaration_list);
    }
  }

  export class StructDeclaration extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StructDeclaration);

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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.struct_declaration);
    }
  }

  export class StructDeclaratorList extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StructDeclaratorList);

    get declaratorList(): StructDeclarator[] {
      if (this.children.length === 1) {
        return [this.children[0] as StructDeclarator];
      } else {
        const list = this.children[0] as StructDeclaratorList;
        return [...list.declaratorList, <StructDeclarator>this.children[1]];
      }
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.struct_declarator_list);
    }
  }

  export class StructDeclarator extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(StructDeclarator);

    get ident() {
      return this.children[0] as Token;
    }

    get arraySpecifier(): ArraySpecifier | undefined {
      return this.children[1] as ArraySpecifier;
    }

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.struct_declarator);
    }
  }

  export class VariableDeclaration extends TreeNode {
    static pool = ShaderLabUtils.createObjectPool(VariableDeclaration);

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.variable_declaration);
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
    static pool = ShaderLabUtils.createObjectPool(VariableIdentifier);

    symbolInfo:
      | VarSymbol
      // #if _VERBOSE
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

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.variable_identifier);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      const token = this.children[0] as Token;

      // #if _VERBOSE
      const builtinVar = BuiltinVariable.getVar(token.lexeme);
      if (builtinVar) {
        this.symbolInfo = builtinVar;
        return;
      }
      // #endif

      this.symbolInfo = sa.symbolTable.lookup({ ident: token.lexeme, symbolType: ESymbolType.VAR }) as VarSymbol;
      // #if _VERBOSE
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
    static pool = ShaderLabUtils.createObjectPool(GLShaderProgram);

    shaderData: ShaderData;

    override set(loc: ShaderRange, children: NodeChild[]) {
      super.set(loc, children, ENonTerminal.gs_shader_program);
    }

    override semanticAnalyze(sa: SematicAnalyzer): void {
      this.shaderData = sa.shaderData;
      this.shaderData.symbolTable = sa.symbolTable._scope;
    }
  }
}
