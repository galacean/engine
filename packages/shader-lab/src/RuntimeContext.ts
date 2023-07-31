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
  functionAstStack: Array<{ fnAst: FnAstNode; localDeclaration: DeclarationAstNode[] }> = [];
  /** Diagnostic for linting service */
  diagnostics: Array<IDiagnostic> = [];
  /**
   * The string list will be integrated into the glsl code
   */
  globalText: Array<string> = [];
  /** Varying info */
  varyingTypeAstNode?: ReturnTypeAstNode;
  /** Varying */
  varyingStructInfo: IReferenceStructInfo;
  /** Attributes struct list */
  attributeStructListInfo: Array<IReferenceStructInfo> = [];
  /** Attributes variable list */
  attributesVariableListInfo: Array<{
    name: string;
    astNode: FnArgAstNode;
    referenced: boolean;
    text: string;
  }> = [];
  /** Current position */
  serializingAstNode?: AstNode;
  /** Custom payload */
  payload?: any;
  /**
   * Global variables within scope of shader, e.g. Uniforms, RenderState, Struct
   */
  private _shaderGlobalList: Array<IGlobal> = [];
  /**
   * Global variables within scope of subShader, e.g. Uniforms, RenderState, Struct
   */
  private _subShaderGlobalList: Array<IGlobal> = [];
  /**
   * Global variables within scope of pass, e.g. Uniforms, RenderState, Struct
   */
  private _passGlobalList: Array<IGlobal> = [];
  /** The main function */
  private _currentMainFnAst?: FnAstNode;

  constructor() {}

  get currentFunctionInfo() {
    return this.functionAstStack[this.functionAstStack.length - 1];
  }

  get currentMainFnAst() {
    return this._currentMainFnAst;
  }

  setMainFnAst(ast: FnAstNode) {
    this.globalText.length = 0;
    this._currentMainFnAst = ast;
  }

  private _shaderReset() {
    this._shaderGlobalList.length = 0;
    this._subShaderReset();
  }

  private _subShaderReset() {
    this._subShaderGlobalList.length = 0;
    this._passReset();
  }

  private _passReset() {
    this._passGlobalList.length = 0;
    this.functionAstStack.length = 0;
    this.attributeStructListInfo.length = 0;
    this.attributesVariableListInfo.length = 0;
    this.varyingTypeAstNode = undefined;
    this._currentMainFnAst = undefined;
    this.passAst = undefined;
    this.serializingAstNode = undefined;
    this.varyingStructInfo = {};
  }

  private _initShaderGlobalList() {
    this._shaderGlobalList = [
      ...(this.shaderAst.content.functions?.map((fn) => ({ referenced: false, ast: fn, name: fn.content.name })) ?? []),
      ...(this.shaderAst.content.structs?.map((struct) => ({
        referenced: false,
        ast: struct,
        name: struct.content.name
      })) ?? []),
      ...(this.shaderAst.content.renderStates?.map((v) => ({ referenced: false, ast: v, name: v.content.variable })) ??
        []),
      ...(this.shaderAst.content.variables?.map((item) => ({
        referenced: false,
        ast: item,
        name: item.content.variable
      })) ?? [])
    ];
  }

  private _initSubShaderGlobalList() {
    this._subShaderGlobalList = [
      ...(this.subShaderAst.content.functions?.map((fn) => ({ referenced: false, ast: fn, name: fn.content.name })) ??
        []),
      ...(this.subShaderAst.content.structs?.map((struct) => ({
        referenced: false,
        ast: struct,
        name: struct.content.name
      })) ?? []),
      ...(this.subShaderAst.content.renderStates?.map((v) => ({
        referenced: false,
        ast: v,
        name: v.content.variable
      })) ?? []),
      ...(this.subShaderAst.content.variables?.map((item) => ({
        referenced: false,
        ast: item,
        name: item.content.variable
      })) ?? [])
    ];
  }

  private _initPassGlobalList() {
    this._passGlobalList = [
      ...(this.passAst.content.functions.map((fn) => ({ referenced: false, ast: fn, name: fn.content.name })) ?? []),
      ...(this.passAst.content.structs.map((struct) => ({
        referenced: false,
        ast: struct,
        name: struct.content.name
      })) ?? []),
      ...(this.passAst.content.variables.map((v) => ({ referenced: false, ast: v, name: v.content.variable })) ?? [])
    ];
  }

  referenceGlobal(name: string): IGlobal | undefined {
    const globalV = this._passGlobalList.find((global) => global.name === name);
    if (globalV) {
      this.globalText.push(globalV.ast.serialize(this, { global: true }));
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
    ret.tags = ast.content.tags?.toObj();
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
        if (ret.vert) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple vertex main function found",
            token: prop.position
          });
          return;
        }
        ret.vert = Ast2GLSLUtils.stringifyVertexFunction(prop, this);
        break;
      case FRAG_FN_NAME:
        if (ret.frag) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple fragment main function found",
            token: prop.position
          });
          return;
        }
        ret.frag = Ast2GLSLUtils.stringifyFragmentFunction(prop, this);
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
    ret.tags = ast.content.tags?.toObj();
    ret.renderStates = [{}, {}];
    const [constantProps, variableProps] = ret.renderStates;

    this.payload = { parsingRenderState: true };
    const tmpRenderStates = ast.content.renderStates?.map((state) => state);
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
    return this._shaderGlobalList.find((item) => item.name === variable);
  }

  findSubShaderGlobal(variable: string) {
    return this._subShaderGlobalList.find((item) => item.name === variable);
  }

  findPassGlobal(variable: string) {
    return this._passGlobalList.find((item) => item.name === variable);
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

  getGlobalText(): string {
    return this.globalText.join("\n");
  }
}
