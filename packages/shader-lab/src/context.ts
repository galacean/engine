import { stringifyVertexFunction, stringifyFragmentFunction } from "./ast2glsl";
import {
  AstNode,
  DeclarationAstNode,
  FnArgAstNode,
  FnAstNode,
  FnVariableAstNode,
  ReturnTypeAstNode,
  StructAstNode
} from "./astNode";
import { IPassAstContent, IShaderAstContent, ISubShaderAstContent } from "./astNode/types";
import { IShaderPass, SubShaderInfo, IDiagnostic, IGlobal, IShaderInfo } from "./interface";
import { DiagnosticSeverity, FRAG_FN_NAME, VERT_FN_NAME } from "./constants";

interface IReferenceStructInfo {
  /** varying or attribute object name */
  objectName?: string;
  structAstNode?: StructAstNode;
  /** reference info */
  reference?: Array<{ property: DeclarationAstNode; referenced: boolean; text: string }>;
}

export default class RuntimeContext {
  private shaderAst: AstNode<IShaderAstContent>;
  passAst: AstNode<IPassAstContent>;
  functionAstStack: Array<{ fnAst: FnAstNode; localDeclaration: DeclarationAstNode[] }> = [];
  /** Diagnostic for linting service */
  diagnostics: Array<IDiagnostic> = [];

  /** The main function */
  private _currentMainFnAst?: FnAstNode;

  /** Global variables e.g. Uniforms */
  globalList: Array<IGlobal> = [];
  /** global text */
  globalTextList: Array<string> = [];
  /** varying info */
  varyingTypeAstNode?: ReturnTypeAstNode;
  /** varying */
  varyingStructInfo: IReferenceStructInfo;
  /** attributes struct list */
  attributeStructListInfo: Array<IReferenceStructInfo> = [];
  /** attributes variable list */
  attributesVariableListInfo: Array<{
    name: string;
    astNode: FnArgAstNode;
    referenced: boolean;
    text: string;
  }> = [];
  /** current position */
  serializingAstNode?: AstNode;

  constructor() {}

  get currentFunctionInfo() {
    return this.functionAstStack[this.functionAstStack.length - 1];
  }

  subShaderReset() {
    this.passReset();
  }

  passReset() {
    this.globalList.length = 0;
    this.functionAstStack.length = 0;
    this.attributeStructListInfo.length = 0;
    this.attributesVariableListInfo.length = 0;
    this.varyingTypeAstNode = undefined;
    this._currentMainFnAst = undefined;
    this.passAst = undefined;
    this.serializingAstNode = undefined;
    this.varyingStructInfo = {};
  }

  get currentMainFnAst() {
    return this._currentMainFnAst;
  }

  setMainFnAst(ast: FnAstNode) {
    this.globalTextList.length = 0;
    this._currentMainFnAst = ast;
  }

  private _initGlobalList() {
    this.globalList = [
      ...this.passAst.content.functions.map((fn) => ({ referenced: false, ast: fn, name: fn.content.name })),
      ...this.passAst.content.structs.map((struct) => ({ referenced: false, ast: struct, name: struct.content.name })),
      ...this.passAst.content.variables.map((v) => ({ referenced: false, ast: v, name: v.content.variable }))
    ];
  }

  referenceGlobal(name: string): IGlobal | undefined {
    const globalV = this.globalList.find((global) => global.name === name);
    if (globalV) {
      this.globalTextList.push(globalV.ast.serialize(this, { global: true }));
      globalV.referenced = true;
    }
    return globalV;
  }

  parse(ast: AstNode<IShaderAstContent>): IShaderInfo {
    this.shaderAst = ast;
    const ret = {} as IShaderInfo;
    ret.ast = ast;
    ret.editorProperties = ast.content.editorProperties?.toJson();
    ret.name = ast.content.name;
    ret.subShaders = ast.content.subShader.map((ast) => this.parseSubShaderInfo(ast));

    return ret;
  }

  parseSubShaderInfo(ast: AstNode<ISubShaderAstContent>): SubShaderInfo {
    this.subShaderReset();

    const ret = {} as SubShaderInfo;
    ret.name = ast.content.name;
    ret.tags = ast.content.tags?.toObj();
    ret.passes = ast.content.pass.map((item) => this.parsePassInfo(item));
    return ret;
  }

  parsePassInfo(ast: AstNode<IPassAstContent>): IShaderPass {
    this.passReset();
    this.passAst = ast;
    this._initGlobalList();

    const ret = {} as IShaderPass;
    ret.name = ast.content.name;
    ret.tags = ast.content.tags?.toObj();
    ret.renderStates = {};
    ast.content.properties.forEach((prop) => {
      if (prop.content.type === VERT_FN_NAME) {
        if (ret.vert) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple vertex main function found",
            token: prop.position
          });
          return;
        }
        ret.vert = stringifyVertexFunction(prop, this);
      } else if (prop.content.type === FRAG_FN_NAME) {
        if (ret.frag) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "multiple fragment main function found",
            token: prop.position
          });
          return;
        }
        ret.frag = stringifyFragmentFunction(prop, this);
      }
    });

    return ret;
  }

  findGlobal(variable: string): StructAstNode | FnVariableAstNode | FnArgAstNode | undefined {
    let ret: any = this.passAst.content.structs.find((struct) => struct.content.name === variable);
    if (!ret) {
      ret = this.passAst.content.variables.find((v) => v.content.variable === variable);
    }
    if (!ret) {
      ret = this.passAst.content.functions.find((fn) => fn.content.name === variable);
    }
    return ret;
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
    return this.globalTextList.join("\n");
  }
}
