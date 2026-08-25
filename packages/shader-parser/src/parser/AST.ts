import type { ICodeGenVisitor } from "./ICodeGenVisitor";
import { ETokenType, GalaceanDataType, ShaderRange, TokenType, TypeAny } from "../common";
import { BaseToken, BranchSignature, EMPTY_BRANCH, sameBranch } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ParserUtils } from "../ParserUtils";
import { TypeSystem } from "./TypeSystem";
import { MacroDefineInfo } from "../Preprocessor";
import { BuiltinFunction, BuiltinVariable, NonGenericGalaceanType } from "./builtin";
import { NoneTerminal } from "./GrammarSymbol";
import SemanticAnalyzer from "./SemanticAnalyzer";
import { ShaderData } from "./ShaderInfo";
import { ShaderBuiltinSemantic } from "../ir/ShaderBuiltinSemantic";
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

const EMPTY_FN_SYMBOLS: readonly FnSymbol[] = Object.freeze([]);
const EMPTY_STRUCT_DECLARATIONS: readonly ASTNode.StructSpecifier[] = Object.freeze([]);
const EMPTY_VALUE_SYMBOLS: readonly (VarSymbol | FnSymbol)[] = Object.freeze([]);

function ASTNodeDecorator(nonTerminal: NoneTerminal) {
  return function <T extends { new (): TreeNode }>(ASTNode: T) {
    ASTNode.prototype.nt = nonTerminal;
  };
}

export abstract class TreeNode {
  /** The non-terminal in grammar. */
  nt: NoneTerminal;
  private _children: NodeChild[];
  private _parent: TreeNode | undefined;
  private _location: ShaderRange;

  /**
   * Snapshot of the `#ifdef` stack at this node's source position, inherited from its first
   * terminal descendant (tokens carry `.branch` from the Lexer). Empty = unconditional. Used as
   * the callsite branch for `symbolTableStack.lookup/insert` so a reference inside `#ifdef X`
   * resolves against declarations visible from that branch, and a declaration inside `#ifdef X`
   * is stamped with that branch. Mirrors codegen's per-branch visibility model.
   */
  _branch: BranchSignature = EMPTY_BRANCH;
  _inMacroDefinition = false;

  /**
   * Parent pointer for AST traversal.
   * @remarks
   * The parent pointer is only reliable after the entire AST has been constructed.
   * DO NOT rely on `parent` during the `semanticAnalyze` phase, as the AST may still be under construction.
   * It is safe to use `parent` during code generation or any phase after AST construction.
   */
  get parent(): TreeNode | undefined {
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
    this._parent = undefined;
    let branch: BranchSignature = EMPTY_BRANCH;
    let inheritedBranch = false;
    let inMacroDefinition = false;
    for (const child of children) {
      if (child instanceof TreeNode) {
        child._parent = this;
        if (!inheritedBranch) {
          branch = child._branch;
          inMacroDefinition = child._inMacroDefinition;
          inheritedBranch = true;
        }
      } else if (!inheritedBranch && child instanceof BaseToken) {
        branch = child.branch;
        inMacroDefinition = child.inMacroDefinition;
        inheritedBranch = true;
      }
    }
    this._branch = branch;
    this._inMacroDefinition = inMacroDefinition;

    this.init();
  }

  init() {}

  // Visitor pattern interface for code generation
  codeGen(visitor: ICodeGenVisitor) {
    return visitor.cache(this, visitor.defaultCodeGen(this.children));
  }

  /**
   * Do semantic analyze right after the ast node is generated.
   */
  semanticAnalyze(sa: SemanticAnalyzer) {}
}

namespace ASTNodes {
  interface MacroReference {
    name: string;
    branch: BranchSignature;
  }

  type MacroExpression =
    | MacroPushContext
    | MacroPopContext
    | MacroElseExpression
    | MacroElifExpression
    | MacroUndef
    | MacroDefine
    | BaseToken;

  export type ASTNodeConstructor = new () => TreeNode;

  export function _unwrapToken(node: NodeChild) {
    if (node instanceof BaseToken) {
      return node;
    }
    throw "not token";
  }

  export function get(type: ASTNodeConstructor, sa: SemanticAnalyzer, loc: ShaderRange, children: NodeChild[]) {
    const node = sa.objectPool ? sa.objectPool.createNode(type) : new type();
    node.set(loc, children);
    if (!sa.diagnosticsEnabled) {
      node.semanticAnalyze(sa);
      sa.semanticStack.push(node);
      return;
    }

    const prev = sa.symbolTableStack._currentBranch;
    const previousMacroDefinition = sa.inMacroDefinition;
    sa.symbolTableStack._currentBranch = node._branch;
    sa.inMacroDefinition = node._inMacroDefinition;
    node.semanticAnalyze(sa);
    sa.symbolTableStack._currentBranch = prev;
    sa.inMacroDefinition = previousMacroDefinition;
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
    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitJumpStatement(this));
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
  export class IterationStatement extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (sa.diagnosticsEnabled) sa.popScope();
    }
  }

  @ASTNodeDecorator(NoneTerminal.selection_statement)
  export class SelectionStatement extends TreeNode {}

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

  /**
   * Canonical semantic description of one variable declarator.
   *
   * A comma-separated declaration owns one instance per identifier so array and initializer state
   * cannot leak between siblings. Parser symbol registration and analyzer validation consume this
   * same description instead of decoding grammar child counts independently.
   */
  export interface VariableDeclaratorInfo {
    /** Identifier introduced by this declarator. */
    identifier: BaseToken;
    /** Fully resolved base and array type for this identifier. */
    typeInfo: SymbolType;
    /** Initializer attached to this identifier, when present. */
    initializer?: Initializer;
    /** Whether the shared declaration type is `const`-qualified. */
    isConst: boolean;
    /** Whether the declaration belongs to shader-global scope. */
    isGlobal: boolean;
    /** Exact variable symbol inserted for this declarator. @internal */
    symbol: VarSymbol;
  }

  @ASTNodeDecorator(NoneTerminal.single_declaration)
  export class SingleDeclaration extends TreeNode {
    typeSpecifier: TypeSpecifier;
    arraySpecifier?: ArraySpecifier;
    isConst: boolean;
    /** Canonical information for the first declarator in a declaration list. */
    declarator: VariableDeclaratorInfo;

    override init(): void {
      this.typeSpecifier = undefined;
      this.arraySpecifier = undefined;
      this.isConst = false;
      this.declarator = undefined;
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
      this.isConst = isConst;

      let symbolType: SymbolType;
      let initializer: Initializer | undefined;
      if (childrenLen === 2 || childrenLen === 4) {
        symbolType = new SymbolType(
          fullyType.type,
          typeSpecifier.lexeme,
          this.arraySpecifier,
          typeSpecifier.structDeclarations
        );
        initializer = children[3] as Initializer;
      } else {
        // Array-of-array is target-divergent (GLSL ES 3.00 / WGSL allow it, ES 1.00 doesn't) and the
        // backend can always emit it, so it's left to codegen/driver — not flagged here. The nested
        // array structure stays as the neutral clue.
        const arraySpecifier = children[2] as ArraySpecifier;
        this.arraySpecifier = arraySpecifier;
        symbolType = new SymbolType(
          fullyType.type,
          typeSpecifier.lexeme,
          this.arraySpecifier,
          typeSpecifier.structDeclarations
        );
        initializer = children[4] as Initializer;
      }
      const sm = sa.assignSourceScope(new VarSymbol(id.lexeme, symbolType, false, initializer, isConst), id.location);
      this.declarator = { identifier: id, typeInfo: symbolType, initializer, isConst, isGlobal: false, symbol: sm };
      sa.recordFunctionVariable(sm);
      // Equal declarations that can coexist are errors. Macro-branch alternatives remain registered
      // so codegen can preserve every arm; unconditional collisions retain the legacy replacement behavior.
      const insertResult = sa.symbolTableStack.insert(sm, id.branch);
      sa.reportRedefinition(id.location, id.lexeme, insertResult, id.branch);
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitSingleDeclaration(this));
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
    /** Exact custom-struct declarations visible at this type occurrence. @internal */
    structDeclarations: readonly StructSpecifier[];

    override init(): void {
      this.arraySize = undefined;
      this.structDeclarations = EMPTY_STRUCT_DECLARATIONS;
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
      if (this.isCustom) {
        const lookup = sa.lookupSymbol;
        lookup.set(this.lexeme, ESymbolType.STRUCT);
        const structs = sa.symbolTableStack.lookupAll(lookup, true, sa.structScratch, this._branch);
        this.structDeclarations = structs.length
          ? structs.map((symbol) => (symbol as StructSymbol).astNode)
          : EMPTY_STRUCT_DECLARATIONS;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.array_specifier)
  export class ArraySpecifier extends TreeNode {
    size: number | undefined;

    override init(): void {
      this.size = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const integerConstantExpr = this.children[1];
      if (!(integerConstantExpr instanceof IntegerConstantExpression)) return; // `[ ]` — unsized
      this.size = integerConstantExpr.value;
      // A non-literal size must be a constant. Only a single bare `variable_identifier` is checked, and
      // only when it resolves to a known non-const var. Unknown identifiers may be runtime macros.
      const exprChildren = integerConstantExpr.children;
      if (this.size === undefined && exprChildren.length === 1 && exprChildren[0] instanceof VariableIdentifier) {
        const bare = exprChildren[0].children[0];
        if (bare instanceof BaseToken && !sa.macroDefineList[bare.lexeme]) {
          const lookup = sa.lookupSymbol;
          lookup.set(bare.lexeme, ESymbolType.VAR);
          const symbols = sa.symbolTableStack.lookupAll(lookup, true, sa.arraySymbolScratch, this._branch);
          if (!symbols.length) return;
          const firstIsConst = (symbols[0] as VarSymbol).isConst;
          const divergent = symbols.some((symbol) => (symbol as VarSymbol).isConst !== firstIsConst);
          if (divergent) {
            sa.reportBranchAmbiguity(exprChildren[0].location, bare.lexeme, "const-qualification", bare.lexeme);
          } else if (!firstIsConst) {
            sa.reportNonConstArraySize(exprChildren[0].location);
          }
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
    isConst: boolean;
    /** Canonical information for the declarator appended by this list node. */
    declarator?: VariableDeclaratorInfo;

    override init(): void {
      this.isConst = false;
      this.declarator = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      let sm: VarSymbol;
      const children = this.children;
      const childrenLength = children.length;
      if (childrenLength === 1) {
        const { typeSpecifier, arraySpecifier, isConst } = children[0] as SingleDeclaration;
        this.typeInfo = new SymbolType(
          typeSpecifier.type,
          typeSpecifier.lexeme,
          arraySpecifier,
          typeSpecifier.structDeclarations
        );
        this.isConst = isConst;
      } else {
        const initDeclList = children[0] as InitDeclaratorList;
        this.typeInfo = initDeclList.typeInfo;
        this.isConst = initDeclList.isConst;
      }

      if (childrenLength === 3 || childrenLength === 5) {
        const id = children[2] as BaseToken;
        const initializer = childrenLength === 5 ? (children[4] as Initializer) : undefined;
        const typeInfo = new SymbolType(
          this.typeInfo.type,
          this.typeInfo.typeLexeme,
          undefined,
          this.typeInfo.structDeclarations
        );
        sm = sa.assignSourceScope(new VarSymbol(id.lexeme, typeInfo, false, this, this.isConst), id.location);
        this.declarator = {
          identifier: id,
          typeInfo,
          initializer,
          isConst: this.isConst,
          isGlobal: false,
          symbol: sm
        };
        sa.recordFunctionVariable(sm);
        const insertResult = sa.symbolTableStack.insert(sm, id.branch);
        sa.reportRedefinition(id.location, id.lexeme, insertResult, id.branch);
      } else if (childrenLength === 4 || childrenLength === 6) {
        // Array-of-array is target-divergent — left to codegen/driver, not flagged here (see SingleDeclaration).
        const typeInfo = new SymbolType(
          this.typeInfo.type,
          this.typeInfo.typeLexeme,
          undefined,
          this.typeInfo.structDeclarations
        );
        const arraySpecifier = this.children[3] as ArraySpecifier;
        typeInfo.arraySpecifier = arraySpecifier;
        const id = children[2] as BaseToken;
        const initializer = childrenLength === 6 ? (children[5] as Initializer) : undefined;
        sm = sa.assignSourceScope(new VarSymbol(id.lexeme, typeInfo, false, this, this.isConst), id.location);
        this.declarator = {
          identifier: id,
          typeInfo,
          initializer,
          isConst: this.isConst,
          isGlobal: false,
          symbol: sm
        };
        sa.recordFunctionVariable(sm);
        const insertResult = sa.symbolTableStack.insert(sm, id.branch);
        sa.reportRedefinition(id.location, id.lexeme, insertResult, id.branch);
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
      return visitor.cache(this, visitor.visitDeclaration(this));
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
      sa.beginFunction(this);

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

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitFunctionHeader(this));
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
      return visitor.cache(this, visitor.visitFunctionParameterList(this));
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
    /** Exact variable symbol inserted for this parameter. @internal */
    symbol?: VarSymbol;

    override init(): void {
      this.typeInfo = undefined;
      this.ident = undefined;
      this.symbol = undefined;
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
        this.symbol = varSymbol;
        sa.symbolTableStack.insert(varSymbol, parameterDeclarator.ident.branch);
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
      this.typeInfo = new SymbolType(
        typeSpecifier.type,
        typeSpecifier.lexeme,
        arraySpecifier,
        typeSpecifier.structDeclarations
      );
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
    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitStatementList(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_definition)
  export class FunctionDefinition extends TreeNode {
    protoType: FunctionProtoType;
    statements: CompoundStatementNoScope;
    isInMacroBranch: boolean;

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      this.protoType = children[0] as FunctionProtoType;
      this.statements = children[1] as CompoundStatementNoScope;

      sa.popScope();
      const sm = sa.assignSourceScope(
        new FnSymbol(
          this.protoType.ident.lexeme,
          this,
          sa.curFunctionInfo.localVariables,
          sa.curFunctionInfo.calledFunctions
        ),
        this.protoType.ident.location
      );
      // Preserve the legacy keep-first behavior for unconditional duplicates. Branch declarations
      // must all be inserted even when they conflict: codegen needs every macro arm to reproduce
      // the source, while `insert` independently reports whether two declarations can coexist.
      const existing = this.protoType.ident.branch.length === 0 ? sa.symbolTableStack.lookup(sm) : undefined;
      const unconditionalDuplicate = existing && existing.sourceScope === sm.sourceScope;
      const conflict = unconditionalDuplicate ? "coexist" : sa.symbolTableStack.insert(sm, this.protoType.ident.branch);
      sa.reportRedefinition(
        this.protoType.ident.location,
        this.protoType.ident.lexeme,
        conflict,
        this.protoType.ident.branch
      );
      this.isInMacroBranch = sa.symbolTableStack.isInMacroBranch;

      sa.curFunctionInfo.header = undefined;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitFunctionDefinition(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_call)
  export class FunctionCall extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      this.type = (this.children[0] as FunctionCallGeneric).type;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitFunctionCall(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.function_call_generic)
  export class FunctionCallGeneric extends ExpressionAstNode {
    fnSymbol: FnSymbol | StructSymbol | undefined;
    /**
     * Matching user-function declarations retained across macro alternatives. An empty list means
     * `TypeAny` matched different overload signatures, so no concrete call edge is proven.
     * @internal
     */
    fnSymbols: readonly FnSymbol[] | undefined;

    override init(): void {
      super.init();
      this.fnSymbol = undefined;
      this.fnSymbols = undefined;
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
        if (sa.diagnosticsEnabled) {
          // GLSL forbids recursion. A self-call — same name AND same parameter signature as the
          // enclosing function (i.e. the same overload) — is short-circuited here: the function symbol
          // isn't inserted until after its body, so the lookup below would otherwise mis-report it as
          // Undefined / NoMatchingOverload. The validator reports RecursiveFunction; the exact-signature
          // match avoids short-circuiting a call to a *different* overload of the same name.
          const header = sa.curFunctionInfo.header;
          if (header?.ident?.lexeme === fnIdent) {
            const hSig = header.paramSig ?? [];
            const cSig = paramSig ?? [];
            if (hSig.length === cSig.length && hSig.every((t, i) => t === cSig[i])) {
              return;
            }
          }
          // A texture-sampling builtin's first argument must be a sampler. Flag a known non-sampler arg0
          // here (specific) rather than letting it fall through to the generic NoMatchingOverload below.
          if (TEXTURE_SAMPLING_BUILTINS.has(fnIdent)) {
            const arg0 = paramSig?.[0];
            if (arg0 !== undefined && arg0 !== TypeAny && !TypeSystem.isSamplerType(arg0)) {
              sa.reportExpectedSampler(this.location, fnIdent, arg0);
              return;
            }
          }
          const builtinFn = BuiltinFunction.resolveOverload(fnIdent, paramSig);
          if (builtinFn) {
            this.type = builtinFn.realReturnType;
            return;
          }

          const lookupSymbol = sa.lookupSymbol;
          lookupSymbol.set(fnIdent, ESymbolType.FN, undefined, undefined, paramSig);

          // Keep every macro-compatible overload, then require one declaration to be guaranteed or
          // matching declarations in every arm of a complete conditional chain. This is the same
          // contract as variable lookup: a helper hidden behind only `#ifdef X` cannot satisfy an
          // unconditional call.
          const allMatches = sa.overloadScratch;
          sa.symbolTableStack.lookupAll(lookupSymbol, true, allMatches, this._branch);
          const branchCoverage = sa.getBranchCoverage(
            allMatches.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
            this._branch
          );
          const branchCovered =
            branchCoverage === "covered" || FunctionCallGeneric._hasConflictingBranches(sa, allMatches);
          const fnSymbol = branchCovered ? (allMatches[0] as FnSymbol | undefined) : undefined;

          // Ambiguity guard: when the call has TypeAny args, `SymbolInfo.equal` treats them as
          // wildcards, so the first overload in reverse-insertion order wins and fixes a specific
          // return type from what may be several equally-valid candidates (e.g. `permute` ships as
          // `float`/`vec3`/`vec4` overloads; a TypeAny-typed arg matched all three but committed
          // to the last-inserted return type). If multiple overloads match and their return types
          // diverge, keep the reference resolved (`fnSymbol` stays set) but drop the call's type
          // to TypeAny — the caller's downstream inference stays open instead of committing.
          let overloadTypeAmbiguous = false;
          if (fnSymbol && paramSig?.some((t) => t === TypeAny)) {
            if (allMatches.length > 1) {
              const firstType = (allMatches[0] as FnSymbol).dataType?.type;
              overloadTypeAmbiguous = allMatches.some((s) => (s as FnSymbol).dataType?.type !== firstType);
            }
          }

          if (!fnSymbol) {
            const codegenFn = sa.symbolTableStack.lookup(lookupSymbol, true) as FnSymbol | undefined;
            if (codegenFn) {
              this.fnSymbol = codegenFn;
              sa.recordFunctionCall(codegenFn);
            }
            if (allMatches.length) {
              sa.reportBranchAvailability(this.location, "Function", fnIdent, branchCoverage);
              return;
            }
            // The lookup above is keyed by argument signature, so a miss conflates an unknown
            // name with a known function called with the wrong arguments; re-probe by name
            // alone (and the builtin registry) to report whichever it actually is.
            lookupSymbol.set(fnIdent, ESymbolType.FN);
            const nameDeclared =
              sa.symbolTableStack.lookupAll(lookupSymbol, true, allMatches, this._branch).length > 0 ||
              BuiltinFunction.isExist(fnIdent);
            // A known function with incompatible arguments is proven invalid. An unknown function may
            // still be supplied by a runtime macro, so analysis leaves that type unresolved without a diagnostic.
            if (nameDeclared) {
              sa.reportNoMatchingOverload(this.location, fnIdent);
            }
            return;
          }
          this.type = overloadTypeAmbiguous ? TypeAny : fnSymbol?.dataType?.type;
          this.fnSymbol = fnSymbol;
          if (allMatches.length > 1) {
            const first = allMatches[0] as FnSymbol;
            this.fnSymbols = allMatches.every((candidate) =>
              FunctionCallGeneric._hasSameParameterSignature(first, candidate as FnSymbol)
            )
              ? (allMatches.slice() as FnSymbol[])
              : EMPTY_FN_SYMBOLS;
          }
          if (this.fnSymbols !== undefined) {
            for (const candidate of this.fnSymbols) sa.recordFunctionCall(candidate);
          } else if (fnSymbol instanceof FnSymbol) {
            sa.recordFunctionCall(fnSymbol);
          }
          return;
        }

        const lookupSymbol = sa.lookupSymbol;
        lookupSymbol.set(fnIdent, ESymbolType.FN, undefined, undefined, paramSig);
        const fnSymbol = sa.symbolTableStack.lookup(lookupSymbol, true) as FnSymbol | undefined;
        if (!fnSymbol) return;
        this.type = fnSymbol.dataType?.type;
        this.fnSymbol = fnSymbol;
        if (fnSymbol instanceof FnSymbol) sa.recordFunctionCall(fnSymbol);
      }
    }

    private static _hasConflictingBranches(sa: SemanticAnalyzer, symbols: readonly SymbolInfo[]): boolean {
      for (let i = 0, n = symbols.length; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const left = symbols[i] as FnSymbol;
          const right = symbols[j] as FnSymbol;
          if (
            FunctionCallGeneric._hasSameParameterSignature(left, right) &&
            sa.canDeclarationsCoexist(left.branchSignature ?? EMPTY_BRANCH, right.branchSignature ?? EMPTY_BRANCH)
          ) {
            return true;
          }
        }
      }
      return false;
    }

    private static _hasSameParameterSignature(left: FnSymbol, right: FnSymbol): boolean {
      const leftSignature = left.astNode.protoType.paramSig ?? [];
      const rightSignature = right.astNode.protoType.paramSig ?? [];
      return (
        leftSignature.length === rightSignature.length &&
        leftSignature.every((type, index) => type === rightSignature[index])
      );
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
      return visitor.cache(this, visitor.visitFunctionIdentifier(this));
    }
  }

  @ASTNodeDecorator(NoneTerminal.assignment_expression)
  export class AssignmentExpression extends ExpressionAstNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (this.children.length === 1) {
        const expr = this.children[0] as ConditionalExpression;
        this.type = expr.type ?? TypeAny;
      } else {
        const rhs = this.children[2] as AssignmentExpression;
        this.type = rhs.type ?? TypeAny;
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.assignment_operator)
  /** Assignment operator syntax retained for post-parse validation. @internal */
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
    override init(): void {
      super.init();
      if (this.children.length === 1) {
        const child = this.children[0] as PrimaryExpression | FunctionCall;
        this.type = child.type;
      }
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      // `struct.field` reads the symbol table, so it stays inline; the stateless swizzle/index checks
      // (InvalidSwizzle, GlFragData, NonIndexableType, NonIntegerIndex, IndexOutOfBounds) moved to ShaderValidator.
      const children = this.children;
      if (children.length === 3 && children[2] instanceof BaseToken) {
        const base = children[0] as ExpressionAstNode;
        if (typeof base.type === "string") {
          PostfixExpression._checkStructField(sa, base.type, children[2], this._branch);
        }
      }
    }

    /** A `struct.field` access where the struct type is resolvable: the field must be a declared member. */
    private static _checkStructField(
      sa: SemanticAnalyzer,
      structName: string,
      field: BaseToken,
      callsiteBranch: BranchSignature
    ): void {
      const lookup = sa.lookupSymbol;
      lookup.set(structName, ESymbolType.STRUCT);
      const structs = sa.symbolTableStack.lookupAll(lookup, true, sa.structScratch, callsiteBranch);
      // Unresolved struct (e.g. a built-in or out-of-scope type) — skip rather than risk a false positive.
      if (!structs.length) return;
      const coverage = sa.getBranchCoverage(
        structs.map((struct) => struct.branchSignature ?? EMPTY_BRANCH),
        callsiteBranch
      );
      if (coverage !== "covered") {
        sa.reportBranchAvailability(field.location, "Struct", structName, coverage);
        return;
      }
      const firstProp = (structs[0] as StructSymbol).astNode.propList.find(
        (prop) => prop.ident.lexeme === field.lexeme
      );
      let memberPresenceDivergent = false;
      let memberTypeDivergent = false;
      for (let i = 1; i < structs.length; i++) {
        const prop = (structs[i] as StructSymbol).astNode.propList.find((item) => item.ident.lexeme === field.lexeme);
        if (!!prop !== !!firstProp) {
          memberPresenceDivergent = true;
          break;
        }
        if (prop && firstProp) {
          const firstArray = firstProp.typeInfo.arraySpecifier;
          const array = prop.typeInfo.arraySpecifier;
          if (
            prop.typeInfo.type !== firstProp.typeInfo.type ||
            !!array !== !!firstArray ||
            array?.size !== firstArray?.size
          ) {
            memberTypeDivergent = true;
            break;
          }
        }
      }
      if (memberPresenceDivergent) {
        sa.reportBranchAmbiguity(
          field.location,
          `${structName}.${field.lexeme}`,
          "struct-member-presence",
          field.lexeme,
          structName
        );
        return;
      }
      if (memberTypeDivergent) {
        return;
      }
      if (firstProp) return;
      sa.reportUndeclaredStructMember(field.location, structName, field.lexeme);
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitPostfixExpression(this));
    }
  }

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
      } else {
        this.type = TypeSystem.arithmeticResultType(
          (this.children[0] as ExpressionAstNode).type,
          (this.children[2] as ExpressionAstNode).type,
          (this.children[1] as BaseToken).lexeme
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
        this.type = TypeSystem.arithmeticResultType(
          (this.children[0] as ExpressionAstNode).type,
          (this.children[2] as ExpressionAstNode).type,
          (this.children[1] as BaseToken).lexeme
        );
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
        const insertResult = sa.symbolTableStack.insert(
          sa.assignSourceScope(new StructSymbol(this.ident.lexeme, this), this.ident.location),
          this.ident.branch
        );
        sa.reportRedefinition(this.ident.location, this.ident.lexeme, insertResult, this.ident.branch);

        this.propList = (children[3] as StructDeclarationList).propList;
        this.macroExpressions = (children[3] as StructDeclarationList).macroExpressions;
      } else {
        this.propList = (children[2] as StructDeclarationList).propList;
        this.macroExpressions = (children[2] as StructDeclarationList).macroExpressions;
      }
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, visitor.visitStructSpecifier(this));
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
        const typeInfo = new SymbolType(type, lexeme, undefined, this._typeSpecifier.structDeclarations);
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
          const typeInfo = new SymbolType(
            type,
            lexeme,
            declarator.arraySpecifier,
            this._typeSpecifier.structDeclarations
          );
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
    /** Canonical information for this shader-global declarator. */
    declarator: VariableDeclaratorInfo;

    override init(): void {
      this.isStatic = false;
      this.declarator = undefined;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const children = this.children;
      const type = children[0] as FullySpecifiedType;
      const ident = children[1] as BaseToken;
      this.type = type;
      // A global variable without an initializer is Galacean's implicit uniform (bound at runtime
      // by the material system). With an initializer, `this.isStatic` becomes true — it's a
      // compile-time value, not a uniform. `const`-qualified is a separate read-only path.
      const hasInitializer = children.length === 4;
      // Grammar `fully_specified_type ID array_specifier` — children[2] is the array specifier.
      // Without it, `float arr[3]` at global scope stored as scalar `float`, then every `arr[i]`
      // ref misfires `NonIndexableType`. Recover the array-ness at symbol level.
      const arraySpecifier = children.length === 3 ? (children[2] as ArraySpecifier) : undefined;
      const initializer = hasInitializer ? (children[3] as Initializer) : undefined;
      const typeInfo = new SymbolType(
        type.type,
        type.typeSpecifier.lexeme,
        arraySpecifier,
        type.typeSpecifier.structDeclarations
      );
      const sm = sa.assignSourceScope(
        new VarSymbol(ident.lexeme, typeInfo, true, this, type.isConst, !hasInitializer && !type.isConst),
        ident.location
      );
      this.declarator = {
        identifier: ident,
        typeInfo,
        initializer,
        isConst: type.isConst,
        isGlobal: true,
        symbol: sm
      };

      const insertResult = sa.symbolTableStack.insert(sm, ident.branch);
      sa.reportRedefinition(ident.location, ident.lexeme, insertResult, ident.branch);

      if (children.length === 4) {
        this.isStatic = true;
      }
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      if (this.isStatic) {
        return super.codeGen(visitor);
      } else {
        return visitor.cache(this, visitor.visitGlobalVariableDeclaration(this));
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

        const newVariable = sa.objectPool ? sa.objectPool.createNode(VariableDeclaration) : new VariableDeclaration();
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
    typeInfo: GalaceanDataType;
    /** Backend-neutral meaning when this is a direct stage-IO builtin reference. */
    builtinSemantic?: ShaderBuiltinSemantic;
    /** Whether the resolved symbol is an array — `typeInfo` alone drops array-ness, but indexing rules need it. */
    isArray: boolean;
    /** A fixed array's element count, for constant index bounds-checking; `undefined` if unsized/unknown. */
    arraySize?: number;
    referenceGlobalSymbolNames: string[] = [];

    private _symbols: Array<VarSymbol | FnSymbol> = [];

    /**
     * Returns the symbols retained when this reference was resolved.
     * @returns Branch-visible variable or function candidates for the reference.
     * @internal
     */
    resolvedSymbols(): readonly (VarSymbol | FnSymbol)[] {
      return this._symbols;
    }

    /**
     * Returns symbols that represent this expression's value identity.
     *
     * AST-backed macro calls retain their replacement dependencies in `resolvedSymbols()`, but the
     * macro result is not the referenced root variable itself (`#define POS v.position`). Backends
     * must therefore avoid treating `POS.field` as `v.field`.
     * @returns Direct value symbols, or an empty list for AST-backed macro results.
     * @internal
     */
    resolvedValueSymbols(): readonly (VarSymbol | FnSymbol)[] {
      const child = this.children[0];
      if ((child instanceof MacroCallSymbol || child instanceof MacroCallFunction) && child.hasAstValue) {
        return EMPTY_VALUE_SYMBOLS;
      }
      return this._symbols;
    }

    override init(): void {
      this.typeInfo = TypeAny;
      this.builtinSemantic = undefined;
      this.isArray = false;
      this.arraySize = undefined;
      this.referenceGlobalSymbolNames.length = 0;
      this._symbols.length = 0;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      if (sa.diagnosticsEnabled) {
        const child = this.children[0] as BaseToken | MacroCallSymbol | MacroCallFunction;
        const referenceGlobalSymbolNames = this.referenceGlobalSymbolNames;
        const symbols = this._symbols;

        // Real references — every name must resolve; miss is an authoring error.
        const references: readonly MacroReference[] =
          child instanceof BaseToken ? [{ name: child.lexeme, branch: this._branch }] : child.referenceSymbols;
        const needFindNames = references.map((reference) => reference.name);

        for (let i = 0; i < references.length; i++) {
          const { name, branch } = references[i];

          if (sa.macroDefineList[name]) continue;

          // only `macro_call` CFG can reference fnSymbols, others fnSymbols are referenced in `function_call_generic` CFG
          if (!(child instanceof BaseToken) && BuiltinFunction.isExist(name)) {
            continue;
          }

          const builtinVar = BuiltinVariable.getVar(name);
          if (builtinVar) {
            this.typeInfo = builtinVar.type;
            if (child instanceof BaseToken) this.builtinSemantic = builtinVar.semantic;
            continue;
          }

          const hit = VariableIdentifier._lookupAndMarkGlobalReference(
            sa,
            name,
            symbols,
            referenceGlobalSymbolNames,
            this.location,
            branch
          );
          // Expression-style macros have their own value AST; its real type isn't
          // the type of any single `referenceSymbolNames` entry (`v` in `v.v_uv`
          // is a `Varyings` struct but the macro call site's type should be the
          // member type). Skip type inference for those and keep TypeAny.
          if (hit && (child instanceof BaseToken || !child.visibleHasAstValue)) {
            // Divergence guard: lookupAll returns every branch-visible decl; if their type identity
            // (base type + isArray + arraySize) diverges, we can't confidently pick one — commit to
            // TypeAny + isArray=false + arraySize=undefined so downstream checks self-disable rather
            // than acting on an arbitrary last-inserted decl. Symmetric with FunctionCallGeneric's
            // `overloadTypeAmbiguous` guard.
            const first = symbols[0];
            const firstType = first.dataType?.type;
            const firstIsArray = !!first.dataType?.arraySpecifier;
            const firstArraySize = first.dataType?.arraySpecifier?.size;
            let divergent = false;
            let arraySizeDivergent = false;
            if (symbols.length > 1) {
              for (let s = 1; s < symbols.length; s++) {
                const d = symbols[s].dataType;
                if (d?.type !== firstType || !!d?.arraySpecifier !== firstIsArray) {
                  divergent = true;
                  break;
                }
                if (d?.arraySpecifier?.size !== firstArraySize) arraySizeDivergent = true;
              }
            }
            if (divergent) {
              this.typeInfo = TypeAny;
              this.isArray = false;
              this.arraySize = undefined;
            } else {
              this.typeInfo = firstType;
              this.isArray = firstIsArray;
              this.arraySize = arraySizeDivergent ? undefined : firstArraySize;
            }
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
        return;
      }

      this._semanticAnalyzeForCodegen(sa);
    }

    private _semanticAnalyzeForCodegen(sa: SemanticAnalyzer): void {
      const child = this.children[0] as BaseToken | MacroCallSymbol | MacroCallFunction;
      if (child instanceof BaseToken) {
        const name = child.lexeme;
        if (sa.macroDefineList[name]) return;
        const builtinVar = BuiltinVariable.getVar(name);
        if (builtinVar) {
          this.typeInfo = builtinVar.type;
          this.builtinSemantic = builtinVar.semantic;
          return;
        }
        this._resolveCodegenReference(sa, name, true);
        return;
      }

      const references = child.referenceSymbolNames;
      for (let i = 0; i < references.length; i++) {
        const name = references[i];
        if (sa.macroDefineList[name] || BuiltinFunction.isExist(name)) continue;

        const builtinVar = BuiltinVariable.getVar(name);
        if (builtinVar) {
          this.typeInfo = builtinVar.type;
          continue;
        }
        this._resolveCodegenReference(sa, name, !child.hasAstValue);
      }

      const macroName = child.macroName;
      if (!macroName || BuiltinFunction.isExist(macroName) || BuiltinVariable.getVar(macroName)) return;
      for (let i = 0; i < references.length; i++) {
        if (references[i] === macroName) return;
      }
      const lookupSymbol = sa.lookupSymbol;
      lookupSymbol.set(macroName, ESymbolType.Any);
      const symbol = sa.symbolTableStack.lookup(lookupSymbol, true) as VarSymbol | FnSymbol | undefined;
      if (
        symbol &&
        (symbol instanceof FnSymbol || symbol.isGlobalVariable) &&
        this.referenceGlobalSymbolNames.indexOf(macroName) === -1
      ) {
        this.referenceGlobalSymbolNames.push(macroName);
      }
    }

    private _resolveCodegenReference(sa: SemanticAnalyzer, name: string, inferType: boolean): void {
      const lookupSymbol = sa.lookupSymbol;
      lookupSymbol.set(name, ESymbolType.Any);
      const symbols = this._symbols;
      sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols);
      if (!symbols.length) return;

      const currentScopeSymbol = sa.symbolTableStack.scope.getSymbol(lookupSymbol, true) as
        | VarSymbol
        | FnSymbol
        | undefined;
      if (currentScopeSymbol) {
        this._markCodegenReference(name, currentScopeSymbol);
      } else {
        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];
          if (symbol instanceof FnSymbol || symbol.isGlobalVariable) {
            this._markCodegenReference(name, symbol);
            break;
          }
        }
      }
      if (!inferType) return;

      const first = symbols[0].dataType;
      let arraySizeDivergent = false;
      for (let i = 1; i < symbols.length; i++) {
        const current = symbols[i].dataType;
        if (current?.type !== first?.type || !!current?.arraySpecifier !== !!first?.arraySpecifier) return;
        if (current?.arraySpecifier?.size !== first?.arraySpecifier?.size) arraySizeDivergent = true;
      }
      this._setCodegenType(first, arraySizeDivergent);
    }

    private _markCodegenReference(name: string, symbol: VarSymbol | FnSymbol): void {
      if (
        (symbol instanceof FnSymbol || symbol.isGlobalVariable) &&
        this.referenceGlobalSymbolNames.indexOf(name) === -1
      ) {
        this.referenceGlobalSymbolNames.push(name);
      }
    }

    private _setCodegenType(dataType: SymbolType | undefined, arraySizeDivergent = false): void {
      this.typeInfo = dataType?.type;
      this.isArray = !!dataType?.arraySpecifier;
      this.arraySize = arraySizeDivergent ? undefined : dataType?.arraySpecifier?.size;
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
      // Cross-arm probes intentionally collect candidates from every compatible branch. They are
      // only used to retain declarations for codegen, never for author-facing type resolution.
      VariableIdentifier._lookupAndMarkGlobalReference(
        sa,
        macroName,
        symbols,
        referenceGlobalSymbolNames,
        null,
        EMPTY_BRANCH,
        true
      );
    }

    /** Look up `name` in the symbol stack and, if a global var/fn declaration
     *  exists, push it into `referenceGlobalSymbolNames`. Returns `true` iff
     *  the lookup hit (caller can then derive type info). When `missErrorLoc`
     *  is non-null, a miss reports an "undeclared identifier" error; pass
     *  `null` for silent probes (e.g. FXAA-style cross-arm shadowing).
     * `retainPartialBranchCandidates` is reserved for codegen-only probes: they retain every
     * branch-local declaration even though none is guaranteed at the probe's synthetic call site.
     *
     *  Mutation contract: `symbols` is used as scratch storage — `lookupAll`
     *  clears and refills it. On hit, the caller may read `symbols[0]` for
     *  type info before the next call overwrites the contents. */
    private static _lookupAndMarkGlobalReference(
      sa: SemanticAnalyzer,
      name: string,
      symbols: (VarSymbol | FnSymbol)[],
      referenceGlobalSymbolNames: string[],
      missErrorLoc: ShaderRange | null,
      callsiteBranch: BranchSignature,
      retainPartialBranchCandidates = false
    ): boolean {
      const lookupSymbol = sa.lookupSymbol;
      lookupSymbol.set(name, ESymbolType.Any);
      // Branch-aware: filter to declarations visible from the reference's own `#ifdef` branch.
      // A `float u_a` inside `#ifdef X` is invisible to a reference in `#else` (as it should be)
      // and visible to a reference in the same branch (so type inference recovers).
      sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols, callsiteBranch);
      let directlyVisibleCount = 0;
      for (let i = 0, n = symbols.length; i < n; i++) {
        const symbol = symbols[i];
        if (sa.isBranchVisibleFrom(symbol.branchSignature ?? EMPTY_BRANCH, callsiteBranch)) {
          symbols[directlyVisibleCount++] = symbol;
        }
      }
      if (directlyVisibleCount) symbols.length = directlyVisibleCount;

      if (!symbols.length) {
        if (missErrorLoc) {
          if (sa.symbolTableStack.hasSymbol(lookupSymbol)) {
            sa.symbolTableStack.lookupAll(lookupSymbol, true, symbols);
            sa.reportBranchAvailability(
              missErrorLoc,
              "Identifier",
              name,
              sa.getBranchCoverage(
                symbols.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
                callsiteBranch
              )
            );
            symbols.length = 0;
            return false;
          }
          // Runtime macros may still provide this identifier, so its type remains unresolved without
          // a diagnostic. Rules that require a concrete type must self-disable for this reference.
        }
        return false;
      }
      const coverage = sa.getBranchCoverage(
        symbols.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
        callsiteBranch
      );
      const currentScopeSymbol = <VarSymbol | FnSymbol>(
        sa.symbolTableStack.scope.getSymbol(lookupSymbol, true, callsiteBranch, sa.branchSemantics)
      );
      const isGlobal = currentScopeSymbol
        ? currentScopeSymbol instanceof FnSymbol || currentScopeSymbol.isGlobalVariable
        : symbols.some((symbol) => symbol instanceof FnSymbol || symbol.isGlobalVariable);
      // Coverage controls diagnostics and type inference, not backend reachability. Keep compatible
      // global declarations under their original runtime macro guards even when coverage is unproven.
      if (isGlobal && referenceGlobalSymbolNames.indexOf(name) === -1) {
        referenceGlobalSymbolNames.push(name);
      }
      if (
        !retainPartialBranchCandidates &&
        coverage !== "covered" &&
        !VariableIdentifier._hasConflictingGlobalBranches(sa, symbols)
      ) {
        if (missErrorLoc) {
          sa.reportBranchAvailability(missErrorLoc, "Identifier", name, coverage);
        }
        return false;
      }
      return true;
    }

    private static _hasConflictingGlobalBranches(
      sa: SemanticAnalyzer,
      symbols: readonly (VarSymbol | FnSymbol)[]
    ): boolean {
      for (let i = 0, n = symbols.length; i < n; i++) {
        const left = symbols[i];
        if (!(left instanceof FnSymbol) && !left.isGlobalVariable) continue;
        for (let j = i + 1; j < n; j++) {
          const right = symbols[j];
          if (!(right instanceof FnSymbol) && !right.isGlobalVariable) continue;
          if (sa.canDeclarationsCoexist(left.branchSignature ?? EMPTY_BRANCH, right.branchSignature ?? EMPTY_BRANCH))
            return true;
        }
      }
      return false;
    }

    override codeGen(visitor: ICodeGenVisitor): string {
      return visitor.cache(this, visitor.visitVariableIdentifier(this));
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
      return visitor.cache(this, super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_push_context)
  export class MacroPushContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel++;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, "\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_pop_context)
  export class MacroPopContext extends TreeNode {
    override semanticAnalyze(sa: SemanticAnalyzer): void {
      sa.symbolTableStack._macroLevel--;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, "\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_elif_expression)
  export class MacroElifExpression extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, "\n" + super.codeGen(visitor) + "\n");
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_else_expression)
  export class MacroElseExpression extends TreeNode {
    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, "\n" + super.codeGen(visitor) + "\n");
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
        return visitor.cache(this, children[0].codeGen(visitor));
      } else {
        return visitor.cache(this, `${children[0].codeGen(visitor)}\n${children[1].codeGen(visitor)}`);
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
    referenceSymbols: MacroReference[] = [];
    macroName: string;
    /** True iff every `MacroDefineInfo` visible from this call site's branch
     *  has a `valueAst` (i.e. was parsed via the `macro_define` CFG rule).
     *  Call sites use this to skip naive type inference: an AST-form macro
     *  drives the call site's type through its own value subtree, not through
     *  a root of `referenceSymbolNames`. Mixed forms across branches → false,
     *  fall back to legacy inference. */
    hasAstValue: boolean = false;
    /** Whether every branch-visible replacement has an expression AST. */
    visibleHasAstValue: boolean = false;
    /** `#define NAME(params) …` form — drives function-like vs object-like codegen. */
    isFunctionLikeMacro: boolean = false;
    /** Every visible replacement is a non-builtin identifier — assume user fn alias. */
    aliasesNonBuiltinIdent: boolean = false;

    override init(): void {
      this.referenceSymbolNames.length = 0;
      this.referenceSymbols.length = 0;
      this.hasAstValue = false;
      this.visibleHasAstValue = false;
      this.isFunctionLikeMacro = false;
      this.aliasesNonBuiltinIdent = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const nameToken = this.children[0] as BaseToken;
      const macroName = nameToken.lexeme;
      this.macroName = macroName;

      const defList = sa.macroDefineList[macroName];
      const refs = this.referenceSymbolNames;
      refs.length = 0;
      this.referenceSymbols.length = 0;
      if (sa.diagnosticsEnabled) {
        this._analyzeForCodegen(defList, refs);
        // Filter `defList` to only entries reachable from this call site's
        // `#ifdef` branch. Without filtering, definitions
        // in disjoint branches conflate at the call site and pollute type
        // inference; with it, what remains is exactly what could substitute at
        // this position.
        const callSiteBranch = nameToken.branch;
        const referenceSymbols = this.referenceSymbols;
        const visibleRefs: string[] = [];
        let visibleCount = 0;
        let allAst = true;
        if (defList) {
          for (let i = 0, n = defList.length; i < n; i++) {
            const info = defList[i];
            if (!sa.canBranchesOverlap(info.branch, callSiteBranch)) continue;
            visibleCount++;
            if (info.valueAst == null) allAst = false;
            // Harvest references from the value AST. Legacy-form macros (no
            // `valueAst`) hold non-expression token sequences with no user
            // identifiers, so nothing to collect.
            if (info.valueAst) {
              MacroCallSymbol._collectIdentifierRefs(
                info.valueAst,
                info.params,
                visibleRefs,
                referenceSymbols,
                callSiteBranch
              );
            }
          }
        }
        // Require *every* visible entry to be AST-form before taking the AST
        // shortcut: residual ambiguity (e.g. unmodeled `#if expr` letting both
        // forms through) falls back to legacy `referenceSymbolNames` inference
        // instead of polluting the call site with TypeAny.
        this.visibleHasAstValue = visibleCount > 0 && allAst;
        return;
      }

      this._analyzeForCodegen(defList, refs);
    }

    private _analyzeForCodegen(defList: MacroDefineInfo[] | undefined, refs: string[]): void {
      let allAst = true;
      let isFunctionLike = false;
      let allAliasNonBuiltinIdent = true;
      const count = defList?.length ?? 0;
      for (let i = 0; i < count; i++) {
        const info = defList![i];
        if (!info.valueAst) allAst = false;
        if (info.isFunction) isFunctionLike = true;
        if (info.valueAst) MacroCallSymbol._collectIdentifierRefs(info.valueAst, info.params, refs);

        if (info.isFunction || !info.valueAst) {
          allAliasNonBuiltinIdent = false;
        } else {
          const leadingIdent = ParserUtils.unwrapBareIdentifier(info.valueAst, { allowParens: false });
          const leadingChild = leadingIdent?.children[0];
          const leadingId = leadingChild instanceof BaseToken ? leadingChild.lexeme : undefined;
          if (!leadingId || BuiltinFunction.isExist(leadingId)) allAliasNonBuiltinIdent = false;
        }
      }
      this.hasAstValue = count > 0 && allAst;
      this.isFunctionLikeMacro = isFunctionLike;
      this.aliasesNonBuiltinIdent = count > 0 && allAliasNonBuiltinIdent;
    }

    /** Push every leaf `VariableIdentifier`'s lexeme into `out`, skipping
     *  function-like parameter names (local to the macro, not call-site refs)
     *  and duplicates. */
    private static _collectIdentifierRefs(
      node: TreeNode,
      params: string[],
      out: string[],
      references?: MacroReference[],
      callSiteBranch: BranchSignature = EMPTY_BRANCH
    ): void {
      if (node instanceof VariableIdentifier) {
        const child = node.children[0];
        if (child instanceof BaseToken) {
          const name = child.lexeme;
          if (params.indexOf(name) === -1) {
            if (out.indexOf(name) === -1) out.push(name);
            if (references) {
              const branch = [...callSiteBranch, ...node._branch];
              if (!references.some((reference) => reference.name === name && sameBranch(reference.branch, branch))) {
                references.push({ name, branch });
              }
            }
          }
        }
        return;
      }
      const children = node.children;
      if (!children) return;
      for (let i = 0, n = children.length; i < n; i++) {
        const c = children[i];
        if (c instanceof TreeNode) MacroCallSymbol._collectIdentifierRefs(c, params, out, references, callSiteBranch);
      }
    }
  }

  @ASTNodeDecorator(NoneTerminal.macro_call_function)
  export class MacroCallFunction extends TreeNode {
    referenceSymbolNames: string[] = [];
    referenceSymbols: MacroReference[] = [];
    macroName: string = "";
    hasAstValue: boolean = false;
    visibleHasAstValue: boolean = false;
    isFunctionLikeMacro: boolean = false;
    aliasesNonBuiltinIdent: boolean = false;

    override init(): void {
      this.referenceSymbolNames.length = 0;
      this.referenceSymbols.length = 0;
      this.macroName = "";
      this.hasAstValue = false;
      this.visibleHasAstValue = false;
      this.isFunctionLikeMacro = false;
      this.aliasesNonBuiltinIdent = false;
    }

    override semanticAnalyze(sa: SemanticAnalyzer): void {
      const child = this.children[0] as MacroCallSymbol;

      this.referenceSymbolNames.push(...child.referenceSymbolNames);
      this.referenceSymbols.push(...child.referenceSymbols);
      this.macroName = child.macroName;
      this.hasAstValue = child.hasAstValue;
      this.visibleHasAstValue = child.visibleHasAstValue;
      this.isFunctionLikeMacro = child.isFunctionLikeMacro;
      this.aliasesNonBuiltinIdent = child.aliasesNonBuiltinIdent;
    }

    override codeGen(visitor: ICodeGenVisitor) {
      return visitor.cache(this, visitor.visitMacroCallFunction(this));
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
        (info) => !info.valueAst && sameArity(info) && sameBranch(info.branch, definingBranch)
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
      return visitor.cache(this, visitor.visitMacroDefine(this));
    }
  }
}

export import ASTNode = ASTNodes;
