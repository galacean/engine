export type DiagnosticSeverity = number;

/**
 * Shader lab interface
 */
export interface IShaderLab {
  /**  */
  initialize(): void;
  /**
   * parse galacean shader
   */
  parseShader(shaderCode: string): ShaderInfo;
}
export interface IDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /**
   * The token which caused the parser error.
   */
  token: IPositionRange;
}
export interface IShaderMainFunction {
  type: "vert" | "frag";
  functionAst: IAstInfo;
}
interface IReference {
  referenced: boolean;
}
export interface IGlobal extends IReference {
  ast: AstNode;
  name: string;
}
export interface ShaderInfo {
  ast: AstNode<IShaderAstContent>;
  name: string;
  subShaders: Array<SubShaderInfo>;
  editorProperties: Record<string, any>;
  diagnostics: Array<IDiagnostic>;
}
export interface SubShaderInfo {
  name: string;
  passes: Array<ShaderPassInfo>;
  tags?: Record<string, any>;
}
export interface ShaderPassInfo {
  name: string;
  vert: string;
  frag: string;
  tags?: Record<string, any>;
  renderStates: IRenderState;
}
export declare type IRenderState = Record<string, any>;

export interface IShaderAstContent {
  name: string;
  editorProperties?: AstNode<Array<PropertyItemAstNode>>;
  subShader: Array<AstNode<ISubShaderAstContent>>;
}

export declare type IPropertyAstContent = Array<PropertyItemAstNode>;
export declare class PropertyItemAstNode extends AstNode<IPropertyItemAstContent> {}
export interface IPropertyItemAstContent {
  name: string;
  desc: string;
  type: string;
  default: Record<string, any>;
}

export interface ISubShaderAstContent {
  name: string;
  tags?: TagAstNode;
  pass: Array<AstNode<IPassAstContent>>;
}

export class TagAstNode extends AstNode<ITagAstContent> {}

export declare type ITagAstContent = Array<AstNode<ITagAssignmentAstContent>>;
export interface ITagAssignmentAstContent {
  tag: string;
  value: string;
}

export interface IPassAstContent {
  name: string;
  tags: AstNode<Array<AstNode<ITagAstContent>>>;
  properties: Array<AstNode<IPassPropertyAssignmentAstContent>>;
  structs: Array<AstNode<IStructAstContent>>;
  variables: Array<AstNode<IFnVariableDeclarationAstContent>>;
  functions: Array<AstNode<IFnAstContent>>;
}

export interface IPassPropertyAssignmentAstContent {
  type: string;
  value: string;
}

export interface IStructAstContent {
  name: string;
  variables: Array<AstNode<IDeclarationAstContent>>;
}

export interface IDeclarationAstContent {
  type: AstNode<IVariableTypeAstContent>;
  variable: string;
}

export interface IVariableTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnVariableDeclarationAstContent {
  type: AstNode<IVariableTypeAstContent>;
  variable: string;
  default?: AstNode;
}

export interface IFnAstContent {
  returnType: AstNode<IFnReturnTypeAstContent>;
  name: string;
  args: Array<AstNode<IFnArgAstContent>>;
  body: AstNode;
}

export interface IFnReturnTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnArgAstContent {
  name: string;
  type: {
    isCustom: boolean;
    text: string;
  };
}

export interface IPosition {
  line: number;
  offset: number;
}

export interface IPositionRange {
  start: IPosition;
  end: IPosition;
}

export interface IAstInfo<T = any> {
  position: IPositionRange;
  content: T;
}

export declare class AstNode<T = any> implements IAstInfo<T> {
  position: IPositionRange;
  content: T;
  toJson(includePos?: boolean, withClass?: boolean): any;
}
