import { Ast2GLSLUtils } from "./Ast2GLSLUtils";
import {
  AstNode,
  DeclarationWithoutAssignAstNode,
  FnArgAstNode,
  FnAstNode,
  FnMacroConditionAstNode,
  PassPropertyAssignmentAstNode,
  RenderStateDeclarationAstNode,
  ReturnTypeAstNode,
  StructAstNode,
  VariableDeclarationAstNode
} from "./ast-node/AstNode";

import { IShaderInfo, IShaderPassInfo, ISubShaderInfo } from "@galacean/engine-design";
import { DiagnosticSeverity, FRAG_FN_NAME, VERT_FN_NAME } from "./Constants";
import {
  FnMacroAstNode,
  IPassAstContent,
  IPositionRange,
  IShaderAstContent,
  ISubShaderAstContent,
  IUsePassAstContent
} from "./ast-node";
import { AstNodeUtils } from "./AstNodeUtils";
import { RenderStateDataKey } from "@galacean/engine";
import ParsingContext from "./ParsingContext";

export interface IDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** The token which caused the parser error. */
  token: IPositionRange;
}

interface IReference {
  referenced: boolean;
}

interface IGlobal extends IReference {
  ast: AstNode;
  name: string;
}

export enum EGlobalLevel {
  Pass = 0,
  SubShader = 1,
  Shader = 2
}

type GlobalMap = Map<string, IGlobal>;

interface IReferenceStructInfo {
  /** varying or attribute object name */
  objectName?: string;
  structAstNode?: StructAstNode;
  /** reference info */
  reference?: { property: DeclarationWithoutAssignAstNode; referenced: boolean; text: string }[];
}

export default class RuntimeContext {
  private _shaderAst: AstNode<IShaderAstContent>;

  get shaderAst() {
    return this._shaderAst;
  }

  functionAstStack: { fnAst: FnAstNode; localDeclaration: VariableDeclarationAstNode[] }[] = [];
  /** Diagnostic for linting service. */
  private _diagnostics: IDiagnostic[] = [];
  /** Varying info. */
  varyingTypeAstNode?: ReturnTypeAstNode;
  /** Varying. */
  varyingStructInfo: IReferenceStructInfo;
  /** Attributes struct list. */
  attributeStructListInfo: IReferenceStructInfo[] = [];
  /** Attributes variable list. */
  attributesVariableListInfo: {
    name: string;
    astNode: FnArgAstNode;
    referenced: boolean;
    text: string;
  }[] = [];

  /** Custom payload */
  payload?: any;

  /** serialize token stack */
  private _serializingNodeStack: AstNode[] = [];
  /** Global variables within scope of shader, e.g. Uniforms, RenderState, Struct. */
  private _shaderGlobalMap: GlobalMap = new Map();
  /** Global variables within scope of subShader, e.g. Uniforms, RenderState, Struct. */
  private _subShaderGlobalMap: GlobalMap = new Map();
  /** Global variables within scope of pass, e.g. Uniforms, RenderState, Struct. */
  private _passGlobalMap: GlobalMap = new Map();
  /** The main function */
  private _currentMainFnAst?: FnAstNode;
  private _parsingContext: ParsingContext;

  set parsingContext(context: ParsingContext) {
    this._parsingContext = context;
  }

  addDiagnostic(diagnostic: IDiagnostic) {
    let offset = this._parsingContext.getTextLineOffsetAt(diagnostic.token.start.index);
    if (offset) {
      diagnostic.token.start.line += offset;
      diagnostic.token.end.line += offset;
    }
    this._diagnostics.push(diagnostic);
  }

  /** Current position */
  get serializingAstNode() {
    return this._serializingNodeStack[this._serializingNodeStack.length - 1];
  }

  get currentFunctionInfo() {
    return this.functionAstStack[this.functionAstStack.length - 1];
  }

  get currentMainFnAst() {
    return this._currentMainFnAst;
  }

  setSerializingNode(node: AstNode) {
    this._serializingNodeStack.push(node);
  }

  unsetSerializingNode() {
    this._serializingNodeStack.pop();
  }

  setMainFnAst(ast: FnAstNode) {
    this._currentMainFnAst = ast;
  }

  referenceGlobal(name: string, scopeLevel = EGlobalLevel.Pass): IGlobal | undefined {
    const globalV = this.findGlobal(name, scopeLevel);
    if (globalV) {
      globalV.referenced = true;
    }
    return globalV;
  }

  parse(ast: AstNode<IShaderAstContent>): IShaderInfo {
    this._shaderAst = ast;
    this._shaderReset();

    this._initShaderGlobalList(ast);
    const ret = {} as IShaderInfo;
    ret.name = ast.content.name;
    ret.subShaders = ast.content.subShader.map((ast) => this.parseSubShaderInfo(ast));

    return ret;
  }

  parseSubShaderInfo(ast: AstNode<ISubShaderAstContent>): ISubShaderInfo {
    this._subShaderReset();

    this._initSubShaderGlobalList(ast);
    const ret = {} as ISubShaderInfo;
    ret.tags = ast.content.tags?.getContentValue();
    ret.passes = ast.content.pass.map((item) => this.parsePassInfo(item));
    ret.name = ast.content.name;
    return ret;
  }

  private _resetPassScopeGlobalReference() {
    for (const [_, g] of this._passGlobalMap) {
      g.referenced = false;
    }
  }

  private _parsePassProperty(
    passAst: AstNode<IPassAstContent>,
    prop: PassPropertyAssignmentAstNode,
    ret: IShaderPassInfo,
    renderStates: RenderStateDeclarationAstNode[]
  ) {
    switch (prop.content.type) {
      case VERT_FN_NAME:
        if (ret.vertexSource) {
          this.addDiagnostic({
            severity: DiagnosticSeverity.Error,
            message: "multiple vertex main function found",
            token: prop.position
          });
          return;
        }
        this._resetPassScopeGlobalReference();
        ret.vertexSource = Ast2GLSLUtils.stringifyVertexFunction(passAst, prop, this);
        break;
      case FRAG_FN_NAME:
        if (ret.fragmentSource) {
          this.addDiagnostic({
            severity: DiagnosticSeverity.Error,
            message: "multiple fragment main function found",
            token: prop.position
          });
          return;
        }
        this._resetPassScopeGlobalReference();
        ret.fragmentSource = Ast2GLSLUtils.stringifyFragmentFunction(passAst, prop, this);
        break;
      default:
        // Render State
        const variable = prop.content.value;
        const astNode = this.findGlobal(variable.content.variable)?.ast;
        if (!astNode) {
          this.addDiagnostic({
            severity: DiagnosticSeverity.Error,
            message: "variable definition not found",
            token: prop.position
          });
        } else {
          renderStates.push(astNode);
        }
    }
  }

  parsePassInfo(ast: AstNode<IPassAstContent | IUsePassAstContent>): IShaderPassInfo | string {
    if (typeof ast.content === "string") {
      // UsePass
      return ast.content;
    }

    this._passReset();
    this._initPassGlobalList(<AstNode<IPassAstContent>>ast);

    const ret = {} as IShaderPassInfo;
    ret.name = ast.content.name;
    ret.tags = ast.content.tags?.getContentValue();
    ret.renderStates = [{}, {}];
    const [constantProps, variableProps] = ret.renderStates;

    this.payload = { parsingRenderState: true };
    const tmpRenderStates = ast.content.renderStates ?? [];
    ast.content.properties?.forEach((prop) =>
      this._parsePassProperty(<AstNode<IPassAstContent>>ast, prop, ret, tmpRenderStates)
    );
    for (const rs of tmpRenderStates) {
      const [constP, variableP] = rs.getContentValue(this).properties;
      Object.assign(constantProps, constP);
      Object.assign(variableProps, variableP);
    }

    this.payload = undefined;

    const renderQueueNode = ast.content.renderQueue;
    if (renderQueueNode) {
      if (renderQueueNode.isVariable) {
        variableProps[RenderStateDataKey.RenderQueueType] = renderQueueNode.getContentValue();
      } else {
        constantProps[RenderStateDataKey.RenderQueueType] = renderQueueNode.getContentValue();
      }
    }

    return ret;
  }

  findGlobal(variable: string, globalLevel = EGlobalLevel.Pass): IGlobal | undefined {
    if (globalLevel === EGlobalLevel.Pass) {
      const passGlobal = this._findPassGlobal(variable);
      if (passGlobal) return passGlobal;
      globalLevel++;
    }
    if (globalLevel === EGlobalLevel.SubShader) {
      const subShaderGlobal = this._findSubShaderGlobal(variable);
      if (subShaderGlobal) return subShaderGlobal;
      globalLevel++;
    }
    if (globalLevel === EGlobalLevel.Shader) return this._findShaderGlobal(variable);
  }

  findLocal(variable: string): VariableDeclarationAstNode | undefined {
    return this.currentFunctionInfo?.localDeclaration.find((declare) =>
      declare.content.variableList.find((item) => item.getVariableName() === variable)
    );
  }

  getAttribText(): string {
    return this.attributeStructListInfo
      .map((struct) =>
        struct.reference
          .filter((item) => item.referenced)
          .map((item) => `${item.text};`)
          .join("\n")
      )
      .join("\n");
  }

  getVaryingText(): string {
    return this.varyingStructInfo.reference
      ?.filter((item) => item.referenced)
      .map((item) => `${item.text};`)
      .join("\n");
  }

  getMacroText(macros: (FnMacroAstNode | FnMacroConditionAstNode)[], needSort = false): string {
    const list = needSort ? macros.sort(AstNodeUtils.astSortAsc) : macros;
    return list?.map((item) => item.serialize(this)).join("\n");
  }

  getGlobalText(): string {
    let ret: (IGlobal & { str: string })[] = [];
    let cur: (IGlobal & { str: string })[];
    const allGlobals = [
      ...Array.from(this._passGlobalMap.values()),
      ...Array.from(this._subShaderGlobalMap.values()),
      ...Array.from(this._shaderGlobalMap.values())
    ];
    const getCurList = () => {
      cur = allGlobals.filter((item) => item.referenced) as any;

      cur.forEach((item) => {
        // @ts-ignore
        !item.str && (item.str = item.ast.serialize(this, { global: true }));
      });
    };

    getCurList();
    while (cur.length !== ret.length) {
      ret = cur;
      getCurList();
    }
    return ret
      .sort((a, b) => a.ast.position.start.line - b.ast.position.start.line)
      .map((item) => item.str)
      .join("\n");
  }

  private _shaderReset() {
    this._shaderGlobalMap.clear();
    this._serializingNodeStack.length = 0;
    this._subShaderReset();
  }

  private _subShaderReset() {
    this._subShaderGlobalMap.clear();
    this._passReset();
  }

  private _passReset() {
    this._passGlobalMap.clear();
    this.functionAstStack.length = 0;
    this.attributeStructListInfo.length = 0;
    this.attributesVariableListInfo.length = 0;
    this.varyingTypeAstNode = undefined;
    this._currentMainFnAst = undefined;
    this.varyingStructInfo = {};
  }

  private _initShaderGlobalList(shaderAst: AstNode<IShaderAstContent>) {
    shaderAst.content.functions?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name })
    );
    shaderAst.content.structs?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name })
    );
    shaderAst.content.renderStates?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.variable, { ast: item, referenced: false, name: item.content.variable })
    );
    shaderAst.content.variables?.forEach((item) =>
      this._shaderGlobalMap.set(item.getVariable(), {
        ast: item,
        referenced: false,
        name: item.getVariable()
      })
    );
  }

  private _initSubShaderGlobalList(subShaderAst: AstNode<ISubShaderAstContent>) {
    subShaderAst.content.functions?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    subShaderAst.content.structs?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    subShaderAst.content.renderStates?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.variable, {
        ast: item,
        referenced: false,
        name: item.content.variable
      });
    });
    subShaderAst.content.variables?.forEach((item) => {
      this._subShaderGlobalMap.set(item.getVariable(), {
        ast: item,
        referenced: false,
        name: item.getVariable()
      });
    });
  }

  private _initPassGlobalList(passAst: AstNode<IPassAstContent>) {
    const passGlobalMap = this._passGlobalMap;
    const content = passAst.content;

    content.functions?.forEach((item) => {
      passGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    content.structs?.forEach((item) => {
      passGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    content.variables?.forEach((item) => {
      passGlobalMap.set(item.getVariable(), {
        ast: item,
        referenced: false,
        name: item.getVariable()
      });
    });
  }

  private _findShaderGlobal(variable: string) {
    return this._shaderGlobalMap.get(variable);
  }

  private _findSubShaderGlobal(variable: string) {
    return this._subShaderGlobalMap.get(variable);
  }

  private _findPassGlobal(variable: string) {
    return this._passGlobalMap.get(variable);
  }
}
