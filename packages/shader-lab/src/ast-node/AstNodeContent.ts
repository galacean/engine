import {
  AstNode,
  PropertyItemAstNode,
  TagAstNode,
  PassPropertyAssignmentAstNode,
  StructAstNode,
  VariableDeclarationAstNode,
  FnAstNode,
  ReturnTypeAstNode,
  FnArgAstNode,
  AssignLoAstNode,
  FnVariableAstNode,
  AddOperatorAstNode,
  MultiplicationExprAstNode,
  MultiplicationOperatorAstNode,
  FnAtomicExprAstNode,
  ObjectAstNode,
  VariableTypeAstNode,
  DeclarationAstNode,
  TagAssignmentAstNode,
  RenderStatePropertyItemAstNode,
  RenderStateDeclarationAstNode,
  FnBodyAstNode,
  AddExprAstNode,
  RelationOperatorAstNode,
  RelationExprAstNode,
  FnBlockStatementAstNode,
  FnConditionStatementAstNode,
  FnMacroDefineAstNode,
  FnMacroConditionElifBranchAstNode,
  FnMacroConditionElseBranchAstNode
} from "./AstNode";

export interface IShaderAstContent {
  name: string;
  editorProperties?: AstNode<Array<PropertyItemAstNode>>;
  subShader: Array<AstNode<ISubShaderAstContent>>;
  functions?: Array<FnAstNode>;
  renderStates?: Array<RenderStateDeclarationAstNode>;
  structs?: Array<StructAstNode>;
  tags?: TagAstNode;
  variables?: Array<VariableDeclarationAstNode>;
}

export interface IPropertyItemAstContent {
  name: string;
  desc: string;
  type: string;
  default: Record<string, any>;
}

export interface ISubShaderAstContent {
  tags?: TagAstNode;
  pass: Array<AstNode<IPassAstContent>>;
  functions?: Array<FnAstNode>;
  renderStates?: Array<RenderStateDeclarationAstNode>;
  structs?: Array<StructAstNode>;
  variables?: Array<VariableDeclarationAstNode>;
}

export interface IFunctionAstContent {
  returnType: AstNode;
  name: string;
  args: Array<AstNode>;
  body: AstNode;
}

export interface IPassAstContent {
  name: string;
  tags?: TagAstNode;
  properties: Array<PassPropertyAssignmentAstNode>;
  structs?: Array<StructAstNode>;
  variables: Array<VariableDeclarationAstNode>;
  functions?: Array<FnAstNode>;
  renderStates?: Array<RenderStateDeclarationAstNode>;
  defines?: Array<FnMacroDefineAstNode>;
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

export interface IFnMacroUndefineAstContent {
  variable: string;
}

export interface IFnMacroIncludeAstContent {
  name: string;
}

export interface IFnMacroConditionAstContent {
  command: string;
  condition: RelationExprAstNode;
  body: FnBodyAstNode;
  elifBranch?: FnMacroConditionElifBranchAstNode;
  elseBranch?: FnMacroConditionElseBranchAstNode;
}

export interface IFnMacroConditionElifBranchAstContent {
  condition: RelationExprAstNode;
  body: FnBodyAstNode;
}

export interface IFnMacroConditionElseBranchAstContent {
  body: FnBodyAstNode;
}

export interface IFnCallAstContent {
  function: string;
  args: Array<AstNode>;
  isCustom: boolean;
}

export interface IFnConditionStatementAstContent {
  relation: AstNode;
  body: FnBlockStatementAstNode;
  elseBranch: FnBlockStatementAstNode;
  elseIfBranches: Array<FnConditionStatementAstNode>;
}

export interface IConditionExprAstContent {
  leftExpr: RelationExprAstNode;
  rightExpr?: RelationExprAstNode;
  operator?: RelationOperatorAstNode;
}

export interface IFnRelationExprAstContent {
  leftOperand: AddExprAstNode;
  rightOperand?: AddExprAstNode;
  operator?: RelationOperatorAstNode;
}

export type IFnBlockStatementAstContent = FnBodyAstNode;

export type IRelationOperatorAstContent = string;

export interface IFnAssignStatementAstContent {
  assignee: AssignLoAstNode | FnVariableAstNode;
  value: AstNode;
  operator: string;
}

export type IFnExpressionAstContent = AstNode<IFnAddExprAstContent>;

export type IFnAddExprAstContent = {
  operators: Array<AddOperatorAstNode>;
  operands: Array<MultiplicationExprAstNode>;
};

export interface IFnMultiplicationExprAstContent {
  operators: Array<MultiplicationOperatorAstNode>;
  operands: Array<FnAtomicExprAstNode>;
}

export type IMultiplicationOperatorAstContent = string;

export type IAddOperatorAstContent = string;

export interface IFnAtomicExprAstContent {
  sign?: AddOperatorAstNode;
  RuleFnAtomicExpr: AstNode;
}

export type INumberAstContent = {
  text: string;
  value: number;
};
export interface IBooleanAstContent {
  text: string;
  value: boolean;
}
export type IFnAssignLOAstContent = string;

export type IFnVariableAstContent = Array<string>;
export type IFnReturnStatementAstContent = ObjectAstNode;

export interface IFnArgAstContent {
  name: string;
  type: {
    isCustom: boolean;
    text: string;
  };
}

export interface IRenderStateDeclarationAstContent<T = any> {
  variable: string;
  renderStateType: string;
  properties: Array<RenderStatePropertyItemAstNode>;
}

export interface IRenderStatePropertyItemAstContent<T = any> {
  property: string;
  index?: number;
  value: AstNode;
}

export type IAssignableValueAstContent = string;

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
  value: TagAssignmentAstNode;
}

export type ITagAstContent = Array<TagAssignmentAstNode>;

export type IPropertyAstContent = Array<PropertyItemAstNode>;

export type ITupleNumber4 = [number, number, number, number];
export type ITupleNumber3 = [number, number, number];
export type ITupleNumber2 = [number, number];

export type IStencilOperationAstContent = string;
export type ICompareFunctionAstContent = string;
export type IBlendOperationAstContent = string;
export type IBlendFactorAstContent = string;
export type ICullModeAstContent = string;
