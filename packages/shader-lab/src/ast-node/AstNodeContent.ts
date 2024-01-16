import { _ruleFnMacroCstChildren } from "../types";
import {
  AstNode,
  TagAstNode,
  PassPropertyAssignmentAstNode,
  StructAstNode,
  VariableDeclarationAstNode,
  FnAstNode,
  ReturnTypeAstNode,
  FnArgAstNode,
  FnVariableAstNode,
  AddOperatorAstNode,
  MultiplicationExprAstNode,
  MultiplicationOperatorAstNode,
  FnAtomicExprAstNode,
  ObjectAstNode,
  VariableTypeAstNode,
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
  FnMacroConditionElseBranchAstNode,
  FnArrayVariableAstNode,
  DeclarationWithoutAssignAstNode,
  ConditionExprAstNode,
  ArrayIndexAstNode,
  VariablePropertyAstNode,
  SelfAssignAstNode,
  SelfAssignOperatorAstNode,
  FnAssignExprAstNode,
  PrecisionAstNode,
  ShaderPropertyDeclareAstNode,
  FnCallAstNode,
  FnMacroDefineVariableAstNode,
  FnVariableDeclareUnitAstNode,
  FnMacroUndefineAstNode,
  FnMacroConditionAstNode,
  RenderQueueValueAstNode,
  FnReturnStatementAstNode
} from "./AstNode";

export interface IShaderAstContent {
  name: string;
  subShader: AstNode<ISubShaderAstContent>[];
  functions?: FnAstNode[];
  renderStates?: RenderStateDeclarationAstNode[];
  structs?: StructAstNode[];
  tags?: TagAstNode;
  variables?: ShaderPropertyDeclareAstNode[];
}

export interface IPropertyItemAstContent {
  name: string;
  desc: string;
  type: string;
  default: Record<string, any>;
}

export interface ISubShaderAstContent {
  tags?: TagAstNode;
  name: string;
  pass: AstNode<IPassAstContent | IUsePassAstContent>[];
  functions?: FnAstNode[];
  renderStates?: RenderStateDeclarationAstNode[];
  structs?: StructAstNode[];
  variables?: ShaderPropertyDeclareAstNode[];
}

export interface IFunctionAstContent {
  returnType: AstNode;
  name: string;
  args: AstNode[];
  body: AstNode;
}

export type FnMacroAstNode = FnMacroDefineAstNode | FnMacroUndefineAstNode;

export interface IPassAstContent {
  name: string;
  tags?: TagAstNode;
  properties: PassPropertyAssignmentAstNode[];
  structs?: StructAstNode[];
  variables: ShaderPropertyDeclareAstNode[];
  functions?: FnAstNode[];
  renderStates?: RenderStateDeclarationAstNode[];
  macros?: FnMacroAstNode[];
  conditionalMacros?: FnMacroConditionAstNode[];
  renderQueue?: RenderQueueValueAstNode;
}

export type IUsePassAstContent = string;

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
  args: FnArgAstNode[];
  body: AstNode;
  returnStatement?: FnReturnStatementAstNode;
}

export interface IFnBodyAstContent {
  statements: AstNode[];
  macros: AstNode[];
}

export interface IFnMacroDefineAstContent {
  variable: FnMacroDefineVariableAstNode;
  value?: AstNode;
}

export type IFnMacroDefineVariableAstContent = string | FnCallAstNode;

export interface IFnMacroUndefineAstContent {
  variable: string;
}

export interface IFnMacroConditionAstContent {
  command: string;
  condition: RelationExprAstNode;
  body: FnBodyAstNode | StructAstNode;
  elifBranch?: FnMacroConditionElifBranchAstNode;
  elseBranch?: FnMacroConditionElseBranchAstNode;
}

export type IFnMacroConditionBodyAstContent = Array<FnBodyAstNode | StructAstNode>;

export interface IFnMacroConditionElifBranchAstContent {
  condition: RelationExprAstNode;
  body: FnBodyAstNode;
}

export interface IFnMacroConditionElseBranchAstContent {
  body: FnBodyAstNode;
}

export interface IFnCallAstContent {
  function: string;
  args: AstNode[];
  isCustom: boolean;
}

export interface IFnConditionStatementAstContent {
  relation: ConditionExprAstNode;
  body: FnBlockStatementAstNode;
  elseBranch: FnBlockStatementAstNode;
  elseIfBranches: FnConditionStatementAstNode[];
}

export interface IConditionExprAstContent {
  expressionList: RelationExprAstNode[];
  operatorList?: RelationOperatorAstNode[];
}

export interface IFnRelationExprAstContent {
  leftOperand: AddExprAstNode;
  rightOperand?: AddExprAstNode;
  operator?: RelationOperatorAstNode;
}

export type IFnBlockStatementAstContent = FnBodyAstNode;

export type IRelationOperatorAstContent = string;

export interface IFnAssignExprAstContent {
  assignee: SelfAssignAstNode;
  value: AstNode;
  operator: string;
}

export type IFnAssignStatementAstContent = FnAssignExprAstNode;

export type IFnExpressionAstContent = AstNode<IFnAddExprAstContent>;

export type IFnAddExprAstContent = {
  operators: AddOperatorAstNode[];
  operands: MultiplicationExprAstNode[];
};

export interface IFnMultiplicationExprAstContent {
  operators: MultiplicationOperatorAstNode[];
  operands: FnAtomicExprAstNode[];
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

export type IFnVariableAstContent = {
  variable: string;
  indexes?: ArrayIndexAstNode[];
  properties?: VariablePropertyAstNode[];
};

export type IArrayIndexAstContent = FnAtomicExprAstNode;

export type IVariablePropertyAstContent = string;

export interface IFnReturnStatementAstContent {
  prefix: string;
  body: ObjectAstNode;
}

export type IFnCallStatementAstContent = FnCallAstNode;

export interface IFnArgAstContent {
  name: string;
  type: {
    isCustom: boolean;
    text: string;
  };
}

export interface IRenderStateDeclarationAstContent {
  variable: string;
  renderStateType: string;
  properties: RenderStatePropertyItemAstNode[];
}

export interface IRenderStatePropertyItemAstContent {
  property: string;
  index?: number;
  value: AstNode;
}

export interface IForLoopAstContent {
  init: VariableDeclarationAstNode;
  condition: ConditionExprAstNode;
  update: AstNode;
  body: FnBlockStatementAstNode;
}

export interface IParenthesisAtomicAstContent {
  parenthesisNode: ConditionExprAstNode;
  property?: FnVariableAstNode;
}

export type IAssignableValueAstContent = string;

export interface IVariableTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnVariableDeclarationAstContent {
  precision?: PrecisionAstNode;
  type: VariableTypeAstNode;
  variableList: FnVariableDeclareUnitAstNode[];
}

export interface IShaderPropertyDeclareAstContent {
  prefix?: PrecisionAstNode;
  declare: DeclarationWithoutAssignAstNode;
}

export type IPrecisionAstContent = string;

export interface IFnArrayVariableAstContent {
  variable: string;
  indexes?: (number | string)[];
}

export interface IFnVariableDeclareUnitAstContent {
  variable: FnArrayVariableAstNode;
  default?: AddExprAstNode;
}

export interface IDeclarationWithoutAssignAstContent {
  type: VariableTypeAstNode;
  variableNode: FnVariableAstNode;
}

export interface IStructAstContent {
  name: string;
  variables: DeclarationWithoutAssignAstNode[];
}

export interface IPassPropertyAssignmentAstContent {
  type: string;
  value: FnArrayVariableAstNode;
}

export interface ITagAssignmentAstContent {
  tag: string;
  value: TagAssignmentAstNode;
}

export type ITagAstContent = TagAssignmentAstNode[];

export type ITupleNumber4 = [number, number, number, number];
export type ITupleNumber3 = [number, number, number];
export type ITupleNumber2 = [number, number];

export type IStencilOperationAstContent = string;
export type ICompareFunctionAstContent = string;
export type IBlendOperationAstContent = string;
export type IBlendFactorAstContent = string;
export type ICullModeAstContent = string;

export type IRuleRenderQueueAssignmentAstContent = RenderQueueValueAstNode;

export type IRenderQueueAstContent = string;

export interface ISelfAssignAstContent {
  operator: SelfAssignOperatorAstNode;
  variable: FnVariableAstNode;
}

export type ISelfAssignOperatorAstContent = string;
