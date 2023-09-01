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
  FnVariableDeclareUnitAstNode
} from "./AstNode";

export interface IShaderAstContent {
  name: string;
  editorProperties?: AstNode<Array<PropertyItemAstNode>>;
  subShader: Array<AstNode<ISubShaderAstContent>>;
  functions?: Array<FnAstNode>;
  renderStates?: Array<RenderStateDeclarationAstNode>;
  structs?: Array<StructAstNode>;
  tags?: TagAstNode;
  variables?: Array<ShaderPropertyDeclareAstNode>;
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
  variables?: Array<ShaderPropertyDeclareAstNode>;
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
  variables: Array<ShaderPropertyDeclareAstNode>;
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

export interface IFnAssignExprAstContent {
  assignee: SelfAssignAstNode;
  value: AstNode;
  operator: string;
}

export type IFnAssignStatementAstContent = FnAssignExprAstNode;

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

export type IFnVariableAstContent = {
  variable: string;
  indexes?: ArrayIndexAstNode[];
  properties?: VariablePropertyAstNode[];
};

export type IArrayIndexAstContent = string | number;

export type IVariablePropertyAstContent = string;

export type IFnReturnStatementAstContent = ObjectAstNode;

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
  properties: Array<RenderStatePropertyItemAstNode>;
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

export type IAssignableValueAstContent = string;

export interface IVariableTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnVariableDeclarationAstContent {
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
  variables: Array<DeclarationWithoutAssignAstNode>;
}

export interface IPassPropertyAssignmentAstContent {
  type: string;
  value: FnArrayVariableAstNode;
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

export interface ISelfAssignAstContent {
  operator: SelfAssignOperatorAstNode;
  variable: FnVariableAstNode;
}

export type ISelfAssignOperatorAstContent = string;
