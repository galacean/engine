import { Ast2GLSLUtils } from "./Ast2GLSLUtils";
import {
  AstNode,
  DeclarationAstNode,
  FnArgAstNode,
  FnAstNode,
  PassPropertyAssignmentAstNode,
  RenderStateDeclarationAstNode,
  ReturnTypeAstNode,
  StructAstNode
} from "./ast-node/AstNode";

import { IPassAstContent, IShaderAstContent, ISubShaderAstContent, IPositionRange } from "./ast-node";
import { DiagnosticSeverity, FRAG_FN_NAME, VERT_FN_NAME } from "./Constants";
import { IShaderInfo, IShaderPassInfo, ISubShaderInfo } from "@galacean/engine-design";

export interface IDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /**
   * The token which caused the parser error.
   */
  token: IPositionRange;
}

interface IReference {
  referenced: boolean;
}

interface IGlobal extends IReference {
  ast: AstNode;
  name: string;
}

type GlobalMap = Map<string, IGlobal>;

interface IReferenceStructInfo {
  /** varying or attribute object name */
  objectName?: string;
  structAstNode?: StructAstNode;
  /** reference info */
  reference?: Array<{ property: DeclarationAstNode; referenced: boolean; text: string }>;
}

export default class RuntimeContext {
  shaderAst: AstNode<IShaderAstContent>;
  passAst: AstNode<IPassAstContent>;
  subShaderAst: AstNode<ISubShaderAstContent>;
  functionAstStack: { fnAst: FnAstNode; localDeclaration: DeclarationAstNode[] }[] = [];
  /** Diagnostic for linting service. */
  diagnostics: IDiagnostic[] = [];
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
  /** Current position */
  get serializingAstNode() {
    return this._serializingNodeStack[this._serializingNodeStack.length - 1];
  }
  /** serialize token stack */
  private _serializingNodeStack: AstNode[] = [];
  /** Custom payload */
  payload?: any;

  /** Global variables within scope of shader, e.g. Uniforms, RenderState, Struct. */
  private _shaderGlobalMap: GlobalMap = new Map();
  /** Global variables within scope of subShader, e.g. Uniforms, RenderState, Struct. */
  private _subShaderGlobalMap: GlobalMap = new Map();
  /** Global variables within scope of pass, e.g. Uniforms, RenderState, Struct. */
  private _passGlobalMap: GlobalMap = new Map();
  /** The main function */
  private _currentMainFnAst?: FnAstNode;

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
    this.passAst = undefined;
    this.varyingStructInfo = {};
  }

  private _initShaderGlobalList() {
    this.shaderAst.content.functions?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name })
    );
    this.shaderAst.content.structs?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name })
    );
    this.shaderAst.content.renderStates?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.variable, { ast: item, referenced: false, name: item.content.variable })
    );
    this.shaderAst.content.variables?.forEach((item) =>
      this._shaderGlobalMap.set(item.content.variable, { ast: item, referenced: false, name: item.content.variable })
    );
  }

  private _initSubShaderGlobalList() {
    this.subShaderAst.content.functions?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    this.subShaderAst.content.structs?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    this.subShaderAst.content.renderStates?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.variable, {
        ast: item,
        referenced: false,
        name: item.content.variable
      });
    });
    this.subShaderAst.content.variables?.forEach((item) => {
      this._subShaderGlobalMap.set(item.content.variable, {
        ast: item,
        referenced: false,
        name: item.content.variable
      });
    });
  }

  private _initPassGlobalList() {
    this.passAst.content.functions?.forEach((item) => {
      this._passGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    this.passAst.content.structs?.forEach((item) => {
      this._passGlobalMap.set(item.content.name, { ast: item, referenced: false, name: item.content.name });
    });
    this.passAst.content.variables?.forEach((item) => {
      this._passGlobalMap.set(item.content.variable, { ast: item, referenced: false, name: item.content.variable });
    });
    this.passAst.content.defines?.forEach((item) => {
      this._passGlobalMap.set(item.content.variable, { ast: item, referenced: false, name: item.content.variable });
    });
  }

  referenceGlobal(name: string): IGlobal | undefined {
    const globalV = this._passGlobalMap.get(name);
    if (globalV) {
      globalV.referenced = true;
    }
    return globalV;
  }

  parse(ast: AstNode<IShaderAstContent>): IShaderInfo {
    this._shaderReset();

    this.shaderAst = ast;
    this._initShaderGlobalList();
    const ret = {} as IShaderInfo;
    ret.name = ast.content.name;
    ret.subShaders = ast.content.subShader.map((ast) => this.parseSubShaderInfo(ast));

    return ret;
  }

  parseSubShaderInfo(ast: AstNode<ISubShaderAstContent>): ISubShaderInfo {
    this._subShaderReset();

    this.subShaderAst = ast;
    this._initSubShaderGlobalList();
    const ret = {} as ISubShaderInfo;
    ret.tags = ast.content.tags?.getContentValue();
    ret.passes = ast.content.pass.map((item) => this.parsePassInfo(item));
    return ret;
  }

  private _parsePassProperty(
    prop: PassPropertyAssignmentAstNode,
    ret: IShaderPassInfo,
    renderStates: RenderStateDeclarationAstNode[]
  ) {
    switch (prop.content.type) {
      case VERT_FN_NAME:
        if (ret.vertexSource) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple vertex main function found",
            token: prop.position
          });
          return;
        }
        ret.vertexSource = Ast2GLSLUtils.stringifyVertexFunction(prop, this);
        break;
      case FRAG_FN_NAME:
        if (ret.fragmentSource) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple fragment main function found",
            token: prop.position
          });
          return;
        }
        ret.fragmentSource = Ast2GLSLUtils.stringifyFragmentFunction(prop, this);
        break;
      default:
        // Render State
        const variable = prop.content.value;
        const astNode = this.findGlobal(variable)?.ast;
        if (!astNode) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "variable definition not found",
            token: prop.position
          });
        } else {
          renderStates.push(astNode);
        }
    }
  }

  parsePassInfo(ast: AstNode<IPassAstContent>): IShaderPassInfo {
    this._passReset();
    this.passAst = ast;
    this._initPassGlobalList();

    const ret = {} as IShaderPassInfo;
    ret.name = ast.content.name;
    ret.tags = ast.content.tags?.getContentValue();
    ret.renderStates = [{}, {}];
    const [constantProps, variableProps] = ret.renderStates;

    this.payload = { parsingRenderState: true };
    const tmpRenderStates = ast.content.renderStates;
    ast.content.properties.forEach((prop) => this._parsePassProperty(prop, ret, tmpRenderStates));
    for (const rs of tmpRenderStates) {
      const [constP, variableP] = rs.getContentValue(this).properties;
      Object.assign(constantProps, constP);
      Object.assign(variableProps, variableP);
    }
    this.payload = undefined;

    return ret;
  }

  findShaderGlobal(variable: string) {
    return this._shaderGlobalMap.get(variable);
  }

  findSubShaderGlobal(variable: string) {
    return this._subShaderGlobalMap.get(variable);
  }

  findPassGlobal(variable: string) {
    return this._passGlobalMap.get(variable);
  }

  findGlobal(variable: string): IGlobal | undefined {
    const passGlobal = this.findPassGlobal(variable);
    if (passGlobal) return passGlobal;
    const subShaderGlobal = this.findSubShaderGlobal(variable);
    if (subShaderGlobal) return subShaderGlobal;
    return this.findShaderGlobal(variable);
  }

  findLocal(variable: string): DeclarationAstNode | undefined {
    return this.currentFunctionInfo?.localDeclaration.find((declare) => declare.content.variable === variable);
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
      .filter((item) => item.referenced)
      .map((item) => `${item.text};`)
      .join("\n");
  }

  getPassGlobalText(): string {
    return Array.from(this._passGlobalMap.values())
      .filter((item) => item.referenced)
      .map((item) => item.ast.serialize(this, { global: true }))
      .join("\n");
  }
}
