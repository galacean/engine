import {
  AddOperatorAstNode,
  AssignLoAstNode,
  AssignableValueAstNode,
  DeclarationAstNode,
  FnArgAstNode,
  FnAstNode,
  FnAtomicExprAstNode,
  FnVariableAstNode,
  MultiplcationOperatorAstNode,
  MutliplicationExprAstNode,
  ObjectAstNode,
  PassPropertyAssignmentAstNode,
  PropertyItemAstNode,
  ReturnTypeAstNode,
  StatePropertyAssignAstNode,
  StructAstNode,
  TagAssignmentAstNode,
  TagAstNode,
  VariableDeclarationAstNode,
  VariableTypeAstNode
} from ".";
import RuntimeContext from "../context";
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
  constructor(ast: IAstInfo<T>);
  _doSerialization(context: RuntimeContext, args?: any): string;
  _beforeSerialization(context: RuntimeContext, args?: any): void;
  serialize(context: RuntimeContext, args?: any): string;
  private _jsonifybject;
  toJson(includePos?: boolean, withClass?: boolean): any;
}
export interface IShaderAstContent {
  name: string;
  editorProperties?: AstNode<Array<PropertyItemAstNode>>;
  subShader: Array<AstNode<ISubShaderAstContent>>;
}
export interface IPropertyItemAstContent {
  name: string;
  desc: string;
  type: string;
  default: Record<string, any>;
}
export interface ISubShaderAstContent {
  name: string;
  tags: AstNode<Array<AstNode<ITagAstContent>>>;
  pass: Array<AstNode<IPassAstContent>>;
}
export interface ITagAssignmentAstContent {
  tag: string;
  value: string;
}
export interface IFunctionAstContent {
  returnType: AstNode;
  name: string;
  args: Array<AstNode>;
  body: AstNode;
}
export interface IPassAstContent {
  name: string;
  tags: AstNode<Array<TagAstNode>>;
  propterties: Array<PassPropertyAssignmentAstNode>;
  structs: Array<StructAstNode>;
  variables: Array<VariableDeclarationAstNode>;
  functions: Array<FnAstNode>;
}
export interface ITypeAstContent {
  text: string;
  isCustom: boolean;
}
export interface IFnReturnTypeAstContent {
  text: string;
  isCustom: boolean;
}
export interface IFnAstContent {
  returnType: ReturnTypeAstNode;
  name: string;
  args: Array<FnArgAstNode>;
  body: AstNode;
}
export interface IFnBodyAstContent {
  statements: Array<AstNode>;
  macros: Array<AstNode>;
}
export interface IFnMacroDefineAstContent {
  variable: string;
  value?: AstNode;
}
export interface IFnMacroIncludeAstContent {
  name: string;
}
export interface IFnMacroConditionAstContent {
  command: string;
  identifier: string;
  body: AstNode<IFnBodyAstContent>;
  branch?: AstNode;
}
export interface IFnMacroConditionBranchAstContent {
  declare: string;
  body: AstNode<IFnBodyAstContent>;
}
export interface IFnCallAstContent {
  function: string;
  args: Array<AstNode>;
  isCustom: boolean;
}
export interface IFnConditionStatementAstContent {
  relation: AstNode;
  body: AstNode<IFnBlockStatementAstContent>;
  elseBranch: AstNode<IFnBlockStatementAstContent>;
  elseIfBranches: Array<AstNode<IFnConditionStatementAstContent>>;
}
export interface IFnRelationExprAstContent {
  operands: Array<AstNode>;
  operator: AstNode<IRelationOperatorAstContent>;
}
export declare type IFnBlockStatementAstContent = AstNode<IFnBodyAstContent>;
export interface IRelationOperatorAstContent {
  text: string;
}
export interface IFnAssignStatementAstContent {
  assignee: AssignLoAstNode | FnVariableAstNode;
  value: AstNode;
  operator: string;
}
export declare type IFnExpressionAstContent = AstNode<IFnAddExprAstContent>;
export declare type IFnAddExprAstContent = {
  operators: Array<AddOperatorAstNode>;
  operands: Array<MutliplicationExprAstNode>;
};
export interface IFnMultiplicationExprAstContent {
  operators: Array<MultiplcationOperatorAstNode>;
  operands: Array<FnAtomicExprAstNode>;
}
export declare type IMultiplcationOperatorAstContent = string;
export declare type IAddOperatorAstContent = string;
export interface IFnAtomicExprAstContent {
  sign?: AddOperatorAstNode;
  RuleFnAtomicExpr: AstNode;
}
export declare type INumberAstContent = string;
export declare type IBooleanAstContent = string;
export declare type IFnAssignLOAstContent = string;
export declare type IFnVariableAstContent = Array<string>;
export declare type IFnReturnStatementAstContent = ObjectAstNode;
export interface IFnArgAstContent {
  name: string;
  type: {
    isCustom: boolean;
    text: string;
  };
}
export interface IRenderStateDeclarationAstContent {
  name: string;
  type: string;
  properties: Array<StatePropertyAssignAstNode>;
}
export interface IStatePropertyAssignAstContent {
  name: string;
  value: AssignableValueAstNode;
}
export declare type IAssignableValueAstContent = string;
export interface IVariableTypeAstContent {
  text: string;
  isCustom: boolean;
}
export interface IFnVariableDeclarationAstContent {
  type: VariableTypeAstNode;
  variable: string;
  default?: AstNode;
}
export interface IDeclarationAstContent {
  type: VariableTypeAstNode;
  variable: string;
}
export interface IStructAstContent {
  name: string;
  variables: Array<DeclarationAstNode>;
}
export interface IPassPropertyAssignmentAstContent {
  type: string;
  value: string;
}
export interface ITagAssignmentAstContent {
  tag: string;
  value: string;
}
export declare type ITagAstContent = Array<TagAssignmentAstNode>;
export declare type IPropertyAstContent = Array<PropertyItemAstNode>;
export declare type ITupleNumber4 = [number, number, number, number];
export declare type ITupleNumber3 = [number, number, number];
export declare type ITupleNumber2 = [number, number];
