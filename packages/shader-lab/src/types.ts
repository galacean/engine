import type { CstNode, ICstVisitor, IToken } from "chevrotain";

export interface _ruleShaderCstNode extends CstNode {
  name: "_ruleShader";
  children: _ruleShaderCstChildren;
}

export type _ruleShaderCstChildren = {
  Shader: IToken[];
  ValueString: IToken[];
  LCurly: IToken[];
  _ruleSubShader?: _ruleSubShaderCstNode[];
  _ruleRenderStateDeclaration?: _ruleRenderStateDeclarationCstNode[];
  _ruleTag?: _ruleTagCstNode[];
  _ruleStruct?: _ruleStructCstNode[];
  _ruleFn?: _ruleFnCstNode[];
  _ruleShaderPropertyDeclare?: _ruleShaderPropertyDeclareCstNode[];
  RCurly: IToken[];
};

export interface _ruleSubShaderCstNode extends CstNode {
  name: "_ruleSubShader";
  children: _ruleSubShaderCstChildren;
}

export type _ruleSubShaderCstChildren = {
  SubShader: IToken[];
  ValueString: IToken[];
  LCurly: IToken[];
  _ruleShaderPass?: _ruleShaderPassCstNode[];
  _ruleUsePass?: _ruleUsePassCstNode[];
  _ruleTag?: _ruleTagCstNode[];
  _ruleRenderStateDeclaration?: _ruleRenderStateDeclarationCstNode[];
  _ruleStruct?: _ruleStructCstNode[];
  _ruleFn?: _ruleFnCstNode[];
  _ruleShaderPropertyDeclare?: _ruleShaderPropertyDeclareCstNode[];
  RCurly: IToken[];
};

export interface _ruleUsePassCstNode extends CstNode {
  name: "_ruleUsePass";
  children: _ruleUsePassCstChildren;
}

export type _ruleUsePassCstChildren = {
  UsePass: IToken[];
  ValueString: IToken[];
};

export interface _ruleShaderPassCstNode extends CstNode {
  name: "_ruleShaderPass";
  children: _ruleShaderPassCstChildren;
}

export type _ruleShaderPassCstChildren = {
  Pass: IToken[];
  ValueString: IToken[];
  LCurly: IToken[];
  _ruleTag?: _ruleTagCstNode[];
  _ruleStruct?: _ruleStructCstNode[];
  _ruleFn?: _ruleFnCstNode[];
  _ruleShaderPropertyDeclare?: _ruleShaderPropertyDeclareCstNode[];
  _rulePassPropertyAssignment?: _rulePassPropertyAssignmentCstNode[];
  _ruleRenderQueueAssignment?: _ruleRenderQueueAssignmentCstNode[];
  _ruleRenderStateDeclaration?: _ruleRenderStateDeclarationCstNode[];
  _ruleFnMacro?: _ruleFnMacroCstNode[];
  RCurly: IToken[];
};

export interface _ruleShaderPropertyDeclareCstNode extends CstNode {
  name: "_ruleShaderPropertyDeclare";
  children: _ruleShaderPropertyDeclareCstChildren;
}

export type _ruleShaderPropertyDeclareCstChildren = {
  _rulePrecisionPrefix?: _rulePrecisionPrefixCstNode[];
  _ruleDeclarationWithoutAssign: _ruleDeclarationWithoutAssignCstNode[];
  Semicolon: IToken[];
};

export interface _rulePrecisionPrefixCstNode extends CstNode {
  name: "_rulePrecisionPrefix";
  children: _rulePrecisionPrefixCstChildren;
}

export type _rulePrecisionPrefixCstChildren = {
  glsl_highp?: IToken[];
  glsl_mediump?: IToken[];
  glsl_lowp?: IToken[];
};

export interface _ruleStructCstNode extends CstNode {
  name: "_ruleStruct";
  children: _ruleStructCstChildren;
}

export type _ruleStructCstChildren = {
  struct: IToken[];
  Identifier: IToken[];
  LCurly: IToken[];
  _ruleDeclarationWithoutAssign?: _ruleDeclarationWithoutAssignCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleDeclarationWithoutAssignCstNode extends CstNode {
  name: "_ruleDeclarationWithoutAssign";
  children: _ruleDeclarationWithoutAssignCstChildren;
}

export type _ruleDeclarationWithoutAssignCstChildren = {
  _ruleVariableType: _ruleVariableTypeCstNode[];
  _ruleFnVariable: _ruleFnVariableCstNode[];
};

export interface _ruleVariableTypeCstNode extends CstNode {
  name: "_ruleVariableType";
  children: _ruleVariableTypeCstChildren;
}

export type _ruleVariableTypeCstChildren = {
  glsl_ivec2?: IToken[];
  glsl_ivec3?: IToken[];
  glsl_ivec4?: IToken[];
  glsl_mat2?: IToken[];
  glsl_mat3?: IToken[];
  glsl_mat4?: IToken[];
  glsl_vec2?: IToken[];
  glsl_vec3?: IToken[];
  glsl_vec4?: IToken[];
  glsl_float?: IToken[];
  glsl_int?: IToken[];
  sampler2DArray?: IToken[];
  glsl_sampler2D?: IToken[];
  Identifier?: IToken[];
};

export interface _ruleTagCstNode extends CstNode {
  name: "_ruleTag";
  children: _ruleTagCstChildren;
}

export type _ruleTagCstChildren = {
  Tags: IToken[];
  LCurly: IToken[];
  _ruleTagAssignment?: _ruleTagAssignmentCstNode[];
  Comma?: IToken[];
  RCurly: IToken[];
};

export interface _ruleTagAssignmentCstNode extends CstNode {
  name: "_ruleTagAssignment";
  children: _ruleTagAssignmentCstChildren;
}

export type _ruleTagAssignmentCstChildren = {
  Identifier: IToken[];
  SymbolEqual: IToken[];
  _ruleTagAssignableValue: _ruleTagAssignableValueCstNode[];
};

export interface _ruleTagAssignableValueCstNode extends CstNode {
  name: "_ruleTagAssignableValue";
  children: _ruleTagAssignableValueCstChildren;
}

export type _ruleTagAssignableValueCstChildren = {
  _ruleNumber?: _ruleNumberCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  ValueString?: IToken[];
};

export interface _ruleFnCstNode extends CstNode {
  name: "_ruleFn";
  children: _ruleFnCstChildren;
}

export type _ruleFnCstChildren = {
  _ruleFnReturnType: _ruleFnReturnTypeCstNode[];
  Identifier: IToken[];
  LBracket: IToken[];
  _ruleFnArg?: _ruleFnArgCstNode[];
  Comma?: IToken[];
  RBracket: IToken[];
  LCurly: IToken[];
  _ruleFnBody: _ruleFnBodyCstNode[];
  RCurly: IToken[];
};

export interface _ruleFnReturnTypeCstNode extends CstNode {
  name: "_ruleFnReturnType";
  children: _ruleFnReturnTypeCstChildren;
}

export type _ruleFnReturnTypeCstChildren = {
  _ruleVariableType?: _ruleVariableTypeCstNode[];
  void?: IToken[];
};

export interface _ruleFnArgCstNode extends CstNode {
  name: "_ruleFnArg";
  children: _ruleFnArgCstChildren;
}

export type _ruleFnArgCstChildren = {
  _ruleVariableType: _ruleVariableTypeCstNode[];
  Identifier: IToken[];
};

export interface _ruleFnBodyCstNode extends CstNode {
  name: "_ruleFnBody";
  children: _ruleFnBodyCstChildren;
}

export type _ruleFnBodyCstChildren = {
  _ruleFnMacro?: _ruleFnMacroCstNode[];
  _ruleFnStatement?: _ruleFnStatementCstNode[];
};

export interface _ruleFnMacroCstNode extends CstNode {
  name: "_ruleFnMacro";
  children: _ruleFnMacroCstChildren;
}

export type _ruleFnMacroCstChildren = {
  _ruleFnMacroDefine?: _ruleFnMacroDefineCstNode[];
  _ruleFnMacroCondition?: _ruleFnMacroConditionCstNode[];
  _ruleFnMacroUndefine?: _ruleFnMacroUndefineCstNode[];
};

export interface _ruleFnMacroConditionCstNode extends CstNode {
  name: "_ruleFnMacroCondition";
  children: _ruleFnMacroConditionCstChildren;
}

export type _ruleFnMacroConditionCstChildren = {
  _ruleFnMacroConditionDeclare: _ruleFnMacroConditionDeclareCstNode[];
  _ruleConditionExpr: _ruleConditionExprCstNode[];
  _ruleFnBody: _ruleFnBodyCstNode[];
  _ruleMacroConditionElifBranch?: _ruleMacroConditionElifBranchCstNode[];
  _ruleFnMacroConditionElseBranch?: _ruleFnMacroConditionElseBranchCstNode[];
  m_endif: IToken[];
};

export interface _ruleFnMacroConditionDeclareCstNode extends CstNode {
  name: "_ruleFnMacroConditionDeclare";
  children: _ruleFnMacroConditionDeclareCstChildren;
}

export type _ruleFnMacroConditionDeclareCstChildren = {
  m_ifdef?: IToken[];
  m_ifndef?: IToken[];
  m_if?: IToken[];
};

export interface _ruleFnMacroConditionElseBranchCstNode extends CstNode {
  name: "_ruleFnMacroConditionElseBranch";
  children: _ruleFnMacroConditionElseBranchCstChildren;
}

export type _ruleFnMacroConditionElseBranchCstChildren = {
  m_else: IToken[];
  _ruleFnBody: _ruleFnBodyCstNode[];
};

export interface _ruleMacroConditionElifBranchCstNode extends CstNode {
  name: "_ruleMacroConditionElifBranch";
  children: _ruleMacroConditionElifBranchCstChildren;
}

export type _ruleMacroConditionElifBranchCstChildren = {
  m_elif: IToken[];
  _ruleConditionExpr: _ruleConditionExprCstNode[];
  _ruleFnBody: _ruleFnBodyCstNode[];
};

export interface _ruleFnMacroDefineCstNode extends CstNode {
  name: "_ruleFnMacroDefine";
  children: _ruleFnMacroDefineCstChildren;
}

export type _ruleFnMacroDefineCstChildren = {
  m_define: IToken[];
  _ruleMacroDefineVariable: _ruleMacroDefineVariableCstNode[];
  _ruleAssignableValue?: _ruleAssignableValueCstNode[];
};

export interface _ruleMacroDefineVariableCstNode extends CstNode {
  name: "_ruleMacroDefineVariable";
  children: _ruleMacroDefineVariableCstChildren;
}

export type _ruleMacroDefineVariableCstChildren = {
  _ruleFnCall?: _ruleFnCallCstNode[];
  Identifier?: IToken[];
};

export interface _ruleFnMacroUndefineCstNode extends CstNode {
  name: "_ruleFnMacroUndefine";
  children: _ruleFnMacroUndefineCstChildren;
}

export type _ruleFnMacroUndefineCstChildren = {
  m_undefine: IToken[];
  Identifier: IToken[];
};

export interface _ruleAssignableValueCstNode extends CstNode {
  name: "_ruleAssignableValue";
  children: _ruleAssignableValueCstChildren;
}

export type _ruleAssignableValueCstChildren = {
  _ruleBoolean?: _ruleBooleanCstNode[];
  ValueString?: IToken[];
  _ruleFnAddExpr?: _ruleFnAddExprCstNode[];
};

export interface _ruleFnAddExprCstNode extends CstNode {
  name: "_ruleFnAddExpr";
  children: _ruleFnAddExprCstChildren;
}

export type _ruleFnAddExprCstChildren = {
  _ruleFnMultiplicationExpr: _ruleFnMultiplicationExprCstNode[];
  _ruleAddOperator?: _ruleAddOperatorCstNode[];
};

export interface _ruleFnMultiplicationExprCstNode extends CstNode {
  name: "_ruleFnMultiplicationExpr";
  children: _ruleFnMultiplicationExprCstChildren;
}

export type _ruleFnMultiplicationExprCstChildren = {
  _ruleFnAtomicExpr: _ruleFnAtomicExprCstNode[];
  _ruleMultiplicationOperator?: _ruleMultiplicationOperatorCstNode[];
};

export interface _ruleFnAtomicExprCstNode extends CstNode {
  name: "_ruleFnAtomicExpr";
  children: _ruleFnAtomicExprCstChildren;
}

export type _ruleFnAtomicExprCstChildren = {
  _ruleAddOperator?: _ruleAddOperatorCstNode[];
  _ruleFnParenthesisAtomicExpr?: _ruleFnParenthesisAtomicExprCstNode[];
  _ruleNumber?: _ruleNumberCstNode[];
  _ruleFnCall?: _ruleFnCallCstNode[];
  _ruleFnVariable?: _ruleFnVariableCstNode[];
};

export interface _ruleAddOperatorCstNode extends CstNode {
  name: "_ruleAddOperator";
  children: _ruleAddOperatorCstChildren;
}

export type _ruleAddOperatorCstChildren = {
  SymbolAdd?: IToken[];
  SymbolMinus?: IToken[];
};

export interface _ruleFnParenthesisExprCstNode extends CstNode {
  name: "_ruleFnParenthesisExpr";
  children: _ruleFnParenthesisExprCstChildren;
}

export type _ruleFnParenthesisExprCstChildren = {
  LBracket: IToken[];
  _ruleConditionExpr: _ruleConditionExprCstNode[];
  RBracket: IToken[];
};

export interface _ruleFnParenthesisAtomicExprCstNode extends CstNode {
  name: "_ruleFnParenthesisAtomicExpr";
  children: _ruleFnParenthesisAtomicExprCstChildren;
}

export type _ruleFnParenthesisAtomicExprCstChildren = {
  _ruleFnParenthesisExpr: _ruleFnParenthesisExprCstNode[];
  Dot?: IToken[];
  _ruleFnVariable?: _ruleFnVariableCstNode[];
};

export interface _ruleNumberCstNode extends CstNode {
  name: "_ruleNumber";
  children: _ruleNumberCstChildren;
}

export type _ruleNumberCstChildren = {
  ValueInt?: IToken[];
  ValueFloat?: IToken[];
  Expo?: IToken[];
};

export interface _ruleFnCallCstNode extends CstNode {
  name: "_ruleFnCall";
  children: _ruleFnCallCstChildren;
}

export type _ruleFnCallCstChildren = {
  _ruleFnCallVariable: _ruleFnCallVariableCstNode[];
  LBracket: IToken[];
  _ruleAssignableValue?: _ruleAssignableValueCstNode[];
  Comma?: IToken[];
  RBracket: IToken[];
};

export interface _ruleFnCallVariableCstNode extends CstNode {
  name: "_ruleFnCallVariable";
  children: _ruleFnCallVariableCstChildren;
}

export type _ruleFnCallVariableCstChildren = {
  glsl_ivec2?: IToken[];
  glsl_ivec3?: IToken[];
  glsl_ivec4?: IToken[];
  glsl_mat2?: IToken[];
  glsl_mat3?: IToken[];
  glsl_mat4?: IToken[];
  glsl_vec2?: IToken[];
  glsl_vec3?: IToken[];
  glsl_vec4?: IToken[];
  glsl_float?: IToken[];
  glsl_int?: IToken[];
  sampler2DArray?: IToken[];
  glsl_sampler2D?: IToken[];
  texture2D?: IToken[];
  Identifier?: IToken[];
};

export interface _ruleFnVariableCstNode extends CstNode {
  name: "_ruleFnVariable";
  children: _ruleFnVariableCstChildren;
}

export type _ruleFnVariableCstChildren = {
  Identifier: IToken[];
  _ruleFnVariableProperty?: _ruleFnVariablePropertyCstNode[];
  _ruleArrayIndex?: _ruleArrayIndexCstNode[];
};

export interface _ruleFnVariablePropertyCstNode extends CstNode {
  name: "_ruleFnVariableProperty";
  children: _ruleFnVariablePropertyCstChildren;
}

export type _ruleFnVariablePropertyCstChildren = {
  Dot: IToken[];
  Identifier: IToken[];
};

export interface _ruleArrayIndexCstNode extends CstNode {
  name: "_ruleArrayIndex";
  children: _ruleArrayIndexCstChildren;
}

export type _ruleArrayIndexCstChildren = {
  LSquareBracket: IToken[];
  _ruleFnAtomicExpr: _ruleFnAtomicExprCstNode[];
  RSquareBracket: IToken[];
};

export interface _ruleMultiplicationOperatorCstNode extends CstNode {
  name: "_ruleMultiplicationOperator";
  children: _ruleMultiplicationOperatorCstChildren;
}

export type _ruleMultiplicationOperatorCstChildren = {
  SymbolMultiply?: IToken[];
  SymbolDivide?: IToken[];
};

export interface _ruleDiscardStatementCstNode extends CstNode {
  name: "_ruleDiscardStatement";
  children: _ruleDiscardStatementCstChildren;
}

export type _ruleDiscardStatementCstChildren = {
  discard: IToken[];
  Semicolon: IToken[];
};

export interface _ruleBreakStatementCstNode extends CstNode {
  name: "_ruleBreakStatement";
  children: _ruleBreakStatementCstChildren;
}

export type _ruleBreakStatementCstChildren = {
  break: IToken[];
  Semicolon: IToken[];
};

export interface _ruleContinueStatementCstNode extends CstNode {
  name: "_ruleContinueStatement";
  children: _ruleContinueStatementCstChildren;
}

export type _ruleContinueStatementCstChildren = {
  continue: IToken[];
  Semicolon: IToken[];
};

export interface _ruleFnCallStatementCstNode extends CstNode {
  name: "_ruleFnCallStatement";
  children: _ruleFnCallStatementCstChildren;
}

export type _ruleFnCallStatementCstChildren = {
  _ruleFnCall: _ruleFnCallCstNode[];
  Semicolon: IToken[];
};

export interface _ruleFnStatementCstNode extends CstNode {
  name: "_ruleFnStatement";
  children: _ruleFnStatementCstChildren;
}

export type _ruleFnStatementCstChildren = {
  _ruleFnCallStatement?: _ruleFnCallStatementCstNode[];
  _ruleFnReturnStatement?: _ruleFnReturnStatementCstNode[];
  _ruleFnAssignStatement?: _ruleFnAssignStatementCstNode[];
  _ruleFnVariableDeclaration?: _ruleFnVariableDeclarationCstNode[];
  _ruleFnConditionStatement?: _ruleFnConditionStatementCstNode[];
  _ruleDiscardStatement?: _ruleDiscardStatementCstNode[];
  _ruleBreakStatement?: _ruleBreakStatementCstNode[];
  _ruleContinueStatement?: _ruleContinueStatementCstNode[];
  _ruleForLoopStatement?: _ruleForLoopStatementCstNode[];
  _ruleFn?: _ruleFnCstNode[];
};

export interface _ruleFnAssignStatementCstNode extends CstNode {
  name: "_ruleFnAssignStatement";
  children: _ruleFnAssignStatementCstChildren;
}

export type _ruleFnAssignStatementCstChildren = {
  _ruleFnAssignExpr: _ruleFnAssignExprCstNode[];
  Semicolon: IToken[];
};

export interface _ruleForLoopStatementCstNode extends CstNode {
  name: "_ruleForLoopStatement";
  children: _ruleForLoopStatementCstChildren;
}

export type _ruleForLoopStatementCstChildren = {
  for: IToken[];
  LBracket: IToken[];
  _ruleFnVariableDeclaration: _ruleFnVariableDeclarationCstNode[];
  _ruleConditionExpr: _ruleConditionExprCstNode[];
  Semicolon: IToken[];
  _ruleFnAssignExpr: _ruleFnAssignExprCstNode[];
  RBracket: IToken[];
  _ruleFnBlockStatement: _ruleFnBlockStatementCstNode[];
};

export interface _ruleFnReturnStatementCstNode extends CstNode {
  name: "_ruleFnReturnStatement";
  children: _ruleFnReturnStatementCstChildren;
}

export type _ruleFnReturnStatementCstChildren = {
  return: IToken[];
  _ruleReturnBody: _ruleReturnBodyCstNode[];
  Semicolon: IToken[];
};

export interface _ruleReturnBodyCstNode extends CstNode {
  name: "_ruleReturnBody";
  children: _ruleReturnBodyCstChildren;
}

export type _ruleReturnBodyCstChildren = {
  _ruleFnExpression?: _ruleFnExpressionCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  ValueString?: IToken[];
};

export interface _ruleFnExpressionCstNode extends CstNode {
  name: "_ruleFnExpression";
  children: _ruleFnExpressionCstChildren;
}

export type _ruleFnExpressionCstChildren = {
  _ruleFnAddExpr: _ruleFnAddExprCstNode[];
};

export interface _ruleBooleanCstNode extends CstNode {
  name: "_ruleBoolean";
  children: _ruleBooleanCstChildren;
}

export type _ruleBooleanCstChildren = {
  ValueTrue?: IToken[];
  ValueFalse?: IToken[];
};

export interface _ruleFnVariableDeclarationCstNode extends CstNode {
  name: "_ruleFnVariableDeclaration";
  children: _ruleFnVariableDeclarationCstChildren;
}

export type _ruleFnVariableDeclarationCstChildren = {
  _rulePrecisionPrefix?: _rulePrecisionPrefixCstNode[];
  _ruleVariableType: _ruleVariableTypeCstNode[];
  _ruleFnVariableDeclareUnit: _ruleFnVariableDeclareUnitCstNode[];
  Comma?: IToken[];
  Semicolon: IToken[];
};

export interface _ruleFnVariableDeclareUnitCstNode extends CstNode {
  name: "_ruleFnVariableDeclareUnit";
  children: _ruleFnVariableDeclareUnitCstChildren;
}

export type _ruleFnVariableDeclareUnitCstChildren = {
  _ruleFnVariable: _ruleFnVariableCstNode[];
  SymbolEqual?: IToken[];
  _ruleFnExpression?: _ruleFnExpressionCstNode[];
};

export interface _ruleFnConditionStatementCstNode extends CstNode {
  name: "_ruleFnConditionStatement";
  children: _ruleFnConditionStatementCstChildren;
}

export type _ruleFnConditionStatementCstChildren = {
  if: IToken[];
  LBracket: IToken[];
  _ruleConditionExpr: _ruleConditionExprCstNode[];
  RBracket: IToken[];
  _ruleFnBlockStatement: _ruleFnBlockStatementCstNode[];
  else?: IToken[];
  _ruleFnConditionStatement?: _ruleFnConditionStatementCstNode[];
};

export interface _ruleConditionExprCstNode extends CstNode {
  name: "_ruleConditionExpr";
  children: _ruleConditionExprCstChildren;
}

export type _ruleConditionExprCstChildren = {
  _ruleFnRelationExpr: _ruleFnRelationExprCstNode[];
  _ruleRelationOperator?: _ruleRelationOperatorCstNode[];
};

export interface _ruleFnRelationExprCstNode extends CstNode {
  name: "_ruleFnRelationExpr";
  children: _ruleFnRelationExprCstChildren;
}

export type _ruleFnRelationExprCstChildren = {
  _ruleFnAddExpr: _ruleFnAddExprCstNode[];
  _ruleRelationOperator?: _ruleRelationOperatorCstNode[];
};

export interface _ruleRelationOperatorCstNode extends CstNode {
  name: "_ruleRelationOperator";
  children: _ruleRelationOperatorCstChildren;
}

export type _ruleRelationOperatorCstChildren = {
  SymbolGreaterEqual?: IToken[];
  SymbolGreaterThan?: IToken[];
  SymbolLessEqual?: IToken[];
  SymbolLessThan?: IToken[];
  SymbolEqualThan?: IToken[];
  SymbolNotEqual?: IToken[];
  AND?: IToken[];
  OR?: IToken[];
};

export interface _ruleFnBlockStatementCstNode extends CstNode {
  name: "_ruleFnBlockStatement";
  children: _ruleFnBlockStatementCstChildren;
}

export type _ruleFnBlockStatementCstChildren = {
  LCurly: IToken[];
  _ruleFnBody: _ruleFnBodyCstNode[];
  RCurly: IToken[];
};

export interface _ruleFnAssignExprCstNode extends CstNode {
  name: "_ruleFnAssignExpr";
  children: _ruleFnAssignExprCstChildren;
}

export type _ruleFnAssignExprCstChildren = {
  _ruleFnSelfAssignExpr: _ruleFnSelfAssignExprCstNode[];
  _ruleFnAssignmentOperator?: _ruleFnAssignmentOperatorCstNode[];
  _ruleFnExpression?: _ruleFnExpressionCstNode[];
};

export interface _ruleFnSelfAssignExprCstNode extends CstNode {
  name: "_ruleFnSelfAssignExpr";
  children: _ruleFnSelfAssignExprCstChildren;
}

export type _ruleFnSelfAssignExprCstChildren = {
  _ruleFnSelfOperator?: _ruleFnSelfOperatorCstNode[];
  _ruleFnVariable: _ruleFnVariableCstNode[];
};

export interface _ruleFnSelfOperatorCstNode extends CstNode {
  name: "_ruleFnSelfOperator";
  children: _ruleFnSelfOperatorCstChildren;
}

export type _ruleFnSelfOperatorCstChildren = {
  SelfAdd?: IToken[];
  SelfMinus?: IToken[];
};

export interface _ruleFnAssignmentOperatorCstNode extends CstNode {
  name: "_ruleFnAssignmentOperator";
  children: _ruleFnAssignmentOperatorCstChildren;
}

export type _ruleFnAssignmentOperatorCstChildren = {
  SymbolEqual?: IToken[];
  SymbolMultiEqual?: IToken[];
  SymbolDivideEqual?: IToken[];
  SymbolAddEqual?: IToken[];
  SymbolMinusEqual?: IToken[];
};

export interface _rulePassPropertyAssignmentCstNode extends CstNode {
  name: "_rulePassPropertyAssignment";
  children: _rulePassPropertyAssignmentCstChildren;
}

export type _rulePassPropertyAssignmentCstChildren = {
  _ruleShaderPassPropertyType: _ruleShaderPassPropertyTypeCstNode[];
  SymbolEqual: IToken[];
  _ruleFnVariable: _ruleFnVariableCstNode[];
  Semicolon: IToken[];
};

export interface _ruleShaderPassPropertyTypeCstNode extends CstNode {
  name: "_ruleShaderPassPropertyType";
  children: _ruleShaderPassPropertyTypeCstChildren;
}

export type _ruleShaderPassPropertyTypeCstChildren = {
  _ruleRenderStateType?: _ruleRenderStateTypeCstNode[];
  VertexShader?: IToken[];
  FragmentShader?: IToken[];
};

export interface _ruleRenderStateTypeCstNode extends CstNode {
  name: "_ruleRenderStateType";
  children: _ruleRenderStateTypeCstChildren;
}

export type _ruleRenderStateTypeCstChildren = {
  BlendState?: IToken[];
  DepthState?: IToken[];
  StencilState?: IToken[];
  RasterState?: IToken[];
};

export interface _ruleRenderStateDeclarationCstNode extends CstNode {
  name: "_ruleRenderStateDeclaration";
  children: _ruleRenderStateDeclarationCstChildren;
}

export type _ruleRenderStateDeclarationCstChildren = {
  _ruleBlendStatePropertyDeclaration?: _ruleBlendStatePropertyDeclarationCstNode[];
  _ruleDepthSatePropertyDeclaration?: _ruleDepthSatePropertyDeclarationCstNode[];
  _ruleStencilStatePropertyDeclaration?: _ruleStencilStatePropertyDeclarationCstNode[];
  _ruleRasterStatePropertyDeclaration?: _ruleRasterStatePropertyDeclarationCstNode[];
};

export interface _ruleRenderQueueAssignmentCstNode extends CstNode {
  name: "_ruleRenderQueueAssignment";
  children: _ruleRenderQueueAssignmentCstChildren;
}

export type _ruleRenderQueueAssignmentCstChildren = {
  RenderQueueType: IToken[];
  SymbolEqual: IToken[];
  _ruleRenderQueueValue: _ruleRenderQueueValueCstNode[];
  Semicolon: IToken[];
};

export interface _ruleRenderQueueValueCstNode extends CstNode {
  name: "_ruleRenderQueueValue";
  children: _ruleRenderQueueValueCstChildren;
}

export type _ruleRenderQueueValueCstChildren = {
  "RenderQueueType.Transparent"?: IToken[];
  "RenderQueueType.AlphaTest"?: IToken[];
  "RenderQueueType.Opaque"?: IToken[];
  Identifier?: IToken[];
};

export interface _ruleBlendStatePropertyCstNode extends CstNode {
  name: "_ruleBlendStateProperty";
  children: _ruleBlendStatePropertyCstChildren;
}

export type _ruleBlendStatePropertyCstChildren = {
  ColorBlendOperation?: IToken[];
  AlphaBlendOperation?: IToken[];
  SourceColorBlendFactor?: IToken[];
  SourceAlphaBlendFactor?: IToken[];
  DestinationColorBlendFactor?: IToken[];
  DestinationAlphaBlendFactor?: IToken[];
  ColorWriteMask?: IToken[];
  BlendColor?: IToken[];
  AlphaToCoverage?: IToken[];
  Enabled?: IToken[];
};

export interface _ruleBlendStateValueCstNode extends CstNode {
  name: "_ruleBlendStateValue";
  children: _ruleBlendStateValueCstChildren;
}

export type _ruleBlendStateValueCstChildren = {
  _ruleBlendFactor?: _ruleBlendFactorCstNode[];
  _ruleBlendOperation?: _ruleBlendOperationCstNode[];
  _ruleFnCall?: _ruleFnCallCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  _ruleNumber?: _ruleNumberCstNode[];
  Identifier?: IToken[];
};

export interface _ruleBlendFactorCstNode extends CstNode {
  name: "_ruleBlendFactor";
  children: _ruleBlendFactorCstChildren;
}

export type _ruleBlendFactorCstChildren = {
  "BlendFactor.OneMinusDestinationColor"?: IToken[];
  "BlendFactor.OneMinusDestinationAlpha"?: IToken[];
  "BlendFactor.OneMinusSourceColor"?: IToken[];
  "BlendFactor.OneMinusSourceAlpha"?: IToken[];
  "BlendFactor.SourceAlphaSaturate"?: IToken[];
  "BlendFactor.OneMinusBlendColor"?: IToken[];
  "BlendFactor.DestinationColor"?: IToken[];
  "BlendFactor.DestinationAlpha"?: IToken[];
  "BlendFactor.SourceColor"?: IToken[];
  "BlendFactor.SourceAlpha"?: IToken[];
  "BlendFactor.BlendColor"?: IToken[];
  "BlendFactor.Zero"?: IToken[];
  "BlendFactor.One"?: IToken[];
};

export interface _ruleBlendOperationCstNode extends CstNode {
  name: "_ruleBlendOperation";
  children: _ruleBlendOperationCstChildren;
}

export type _ruleBlendOperationCstChildren = {
  "BlendOperation.ReverseSubtract"?: IToken[];
  "BlendOperation.Subtract"?: IToken[];
  "BlendOperation.Add"?: IToken[];
  "BlendOperation.Min"?: IToken[];
  "BlendOperation.Max"?: IToken[];
};

export interface _ruleBlendPropertyItemCstNode extends CstNode {
  name: "_ruleBlendPropertyItem";
  children: _ruleBlendPropertyItemCstChildren;
}

export type _ruleBlendPropertyItemCstChildren = {
  _ruleBlendStateProperty: _ruleBlendStatePropertyCstNode[];
  LSquareBracket?: IToken[];
  ValueInt?: IToken[];
  RSquareBracket?: IToken[];
  SymbolEqual: IToken[];
  _ruleBlendStateValue: _ruleBlendStateValueCstNode[];
};

export interface _ruleBlendStatePropertyDeclarationCstNode extends CstNode {
  name: "_ruleBlendStatePropertyDeclaration";
  children: _ruleBlendStatePropertyDeclarationCstChildren;
}

export type _ruleBlendStatePropertyDeclarationCstChildren = {
  BlendState: IToken[];
  Identifier?: IToken[];
  LCurly: IToken[];
  _ruleBlendPropertyItem?: _ruleBlendPropertyItemCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleDepthStatePropertyCstNode extends CstNode {
  name: "_ruleDepthStateProperty";
  children: _ruleDepthStatePropertyCstChildren;
}

export type _ruleDepthStatePropertyCstChildren = {
  WriteEnabled?: IToken[];
  CompareFunction?: IToken[];
  Enabled?: IToken[];
};

export interface _ruleDepthStateValueCstNode extends CstNode {
  name: "_ruleDepthStateValue";
  children: _ruleDepthStateValueCstChildren;
}

export type _ruleDepthStateValueCstChildren = {
  _ruleCompareFunction?: _ruleCompareFunctionCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  Identifier?: IToken[];
};

export interface _ruleCompareFunctionCstNode extends CstNode {
  name: "_ruleCompareFunction";
  children: _ruleCompareFunctionCstChildren;
}

export type _ruleCompareFunctionCstChildren = {
  "CompareFunction.GreaterEqual"?: IToken[];
  "CompareFunction.LessEqual"?: IToken[];
  "CompareFunction.NotEqual"?: IToken[];
  "CompareFunction.Greater"?: IToken[];
  "CompareFunction.Always"?: IToken[];
  "CompareFunction.Never"?: IToken[];
  "CompareFunction.Equal"?: IToken[];
  "CompareFunction.Less"?: IToken[];
};

export interface _ruleDepthStatePropertyItemCstNode extends CstNode {
  name: "_ruleDepthStatePropertyItem";
  children: _ruleDepthStatePropertyItemCstChildren;
}

export type _ruleDepthStatePropertyItemCstChildren = {
  _ruleDepthStateProperty: _ruleDepthStatePropertyCstNode[];
  SymbolEqual: IToken[];
  _ruleDepthStateValue: _ruleDepthStateValueCstNode[];
};

export interface _ruleDepthSatePropertyDeclarationCstNode extends CstNode {
  name: "_ruleDepthSatePropertyDeclaration";
  children: _ruleDepthSatePropertyDeclarationCstChildren;
}

export type _ruleDepthSatePropertyDeclarationCstChildren = {
  DepthState: IToken[];
  Identifier?: IToken[];
  LCurly: IToken[];
  _ruleDepthStatePropertyItem?: _ruleDepthStatePropertyItemCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleStencilStatePropertyCstNode extends CstNode {
  name: "_ruleStencilStateProperty";
  children: _ruleStencilStatePropertyCstChildren;
}

export type _ruleStencilStatePropertyCstChildren = {
  ReferenceValue?: IToken[];
  Mask?: IToken[];
  WriteMask?: IToken[];
  CompareFunctionFront?: IToken[];
  CompareFunctionBack?: IToken[];
  PassOperationFront?: IToken[];
  PassOperationBack?: IToken[];
  FailOperationFront?: IToken[];
  FailOperationBack?: IToken[];
  ZFailOperationFront?: IToken[];
  ZFailOperationBack?: IToken[];
  Enabled?: IToken[];
};

export interface _ruleStencilStateValueCstNode extends CstNode {
  name: "_ruleStencilStateValue";
  children: _ruleStencilStateValueCstChildren;
}

export type _ruleStencilStateValueCstChildren = {
  _ruleCompareFunction?: _ruleCompareFunctionCstNode[];
  _ruleStencilOperation?: _ruleStencilOperationCstNode[];
  _ruleNumber?: _ruleNumberCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  Identifier?: IToken[];
};

export interface _ruleStencilOperationCstNode extends CstNode {
  name: "_ruleStencilOperation";
  children: _ruleStencilOperationCstChildren;
}

export type _ruleStencilOperationCstChildren = {
  "StencilOperation.IncrementSaturate"?: IToken[];
  "StencilOperation.DecrementSaturate"?: IToken[];
  "StencilOperation.IncrementWrap"?: IToken[];
  "StencilOperation.DecrementWrap"?: IToken[];
  "StencilOperation.Replace"?: IToken[];
  "StencilOperation.Invert"?: IToken[];
  "StencilOperation.Keep"?: IToken[];
  "StencilOperation.Zero"?: IToken[];
};

export interface _ruleStencilStatePropertyItemCstNode extends CstNode {
  name: "_ruleStencilStatePropertyItem";
  children: _ruleStencilStatePropertyItemCstChildren;
}

export type _ruleStencilStatePropertyItemCstChildren = {
  _ruleStencilStateProperty: _ruleStencilStatePropertyCstNode[];
  SymbolEqual: IToken[];
  _ruleStencilStateValue: _ruleStencilStateValueCstNode[];
};

export interface _ruleStencilStatePropertyDeclarationCstNode extends CstNode {
  name: "_ruleStencilStatePropertyDeclaration";
  children: _ruleStencilStatePropertyDeclarationCstChildren;
}

export type _ruleStencilStatePropertyDeclarationCstChildren = {
  StencilState: IToken[];
  Identifier?: IToken[];
  LCurly: IToken[];
  _ruleStencilStatePropertyItem?: _ruleStencilStatePropertyItemCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleRasterStatePropertyCstNode extends CstNode {
  name: "_ruleRasterStateProperty";
  children: _ruleRasterStatePropertyCstChildren;
}

export type _ruleRasterStatePropertyCstChildren = {
  CullMode?: IToken[];
  DepthBias?: IToken[];
  SlopeScaledDepthBias?: IToken[];
  Enabled?: IToken[];
};

export interface _ruleRasterStateValueCstNode extends CstNode {
  name: "_ruleRasterStateValue";
  children: _ruleRasterStateValueCstChildren;
}

export type _ruleRasterStateValueCstChildren = {
  _ruleNumber?: _ruleNumberCstNode[];
  _ruleCullMode?: _ruleCullModeCstNode[];
  Identifier?: IToken[];
};

export interface _ruleCullModeCstNode extends CstNode {
  name: "_ruleCullMode";
  children: _ruleCullModeCstChildren;
}

export type _ruleCullModeCstChildren = {
  "CullMode.Front"?: IToken[];
  "CullMode.Back"?: IToken[];
  "CullMode.Off"?: IToken[];
};

export interface _ruleRasterStatePropertyItemCstNode extends CstNode {
  name: "_ruleRasterStatePropertyItem";
  children: _ruleRasterStatePropertyItemCstChildren;
}

export type _ruleRasterStatePropertyItemCstChildren = {
  _ruleRasterStateProperty: _ruleRasterStatePropertyCstNode[];
  SymbolEqual: IToken[];
  _ruleRasterStateValue: _ruleRasterStateValueCstNode[];
};

export interface _ruleRasterStatePropertyDeclarationCstNode extends CstNode {
  name: "_ruleRasterStatePropertyDeclaration";
  children: _ruleRasterStatePropertyDeclarationCstChildren;
}

export type _ruleRasterStatePropertyDeclarationCstChildren = {
  RasterState: IToken[];
  Identifier?: IToken[];
  LCurly: IToken[];
  _ruleRasterStatePropertyItem?: _ruleRasterStatePropertyItemCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleTupleFloat4CstNode extends CstNode {
  name: "_ruleTupleFloat4";
  children: _ruleTupleFloat4CstChildren;
}

export type _ruleTupleFloat4CstChildren = {
  LBracket: IToken[];
  ValueFloat: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _ruleTupleFloat3CstNode extends CstNode {
  name: "_ruleTupleFloat3";
  children: _ruleTupleFloat3CstChildren;
}

export type _ruleTupleFloat3CstChildren = {
  LBracket: IToken[];
  ValueFloat: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _ruleTupleFloat2CstNode extends CstNode {
  name: "_ruleTupleFloat2";
  children: _ruleTupleFloat2CstChildren;
}

export type _ruleTupleFloat2CstChildren = {
  LBracket: IToken[];
  ValueFloat: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _ruleTupleInt4CstNode extends CstNode {
  name: "_ruleTupleInt4";
  children: _ruleTupleInt4CstChildren;
}

export type _ruleTupleInt4CstChildren = {
  LBracket: IToken[];
  ValueInt: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _ruleTupleInt3CstNode extends CstNode {
  name: "_ruleTupleInt3";
  children: _ruleTupleInt3CstChildren;
}

export type _ruleTupleInt3CstChildren = {
  LBracket: IToken[];
  ValueInt: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _ruleTupleInt2CstNode extends CstNode {
  name: "_ruleTupleInt2";
  children: _ruleTupleInt2CstChildren;
}

export type _ruleTupleInt2CstChildren = {
  LBracket: IToken[];
  ValueInt: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface ICstNodeVisitor<IN, OUT> extends ICstVisitor<IN, OUT> {
  _ruleShader(children: _ruleShaderCstChildren, param?: IN): OUT;
  _ruleSubShader(children: _ruleSubShaderCstChildren, param?: IN): OUT;
  _ruleUsePass(children: _ruleUsePassCstChildren, param?: IN): OUT;
  _ruleShaderPass(children: _ruleShaderPassCstChildren, param?: IN): OUT;
  _ruleShaderPropertyDeclare(children: _ruleShaderPropertyDeclareCstChildren, param?: IN): OUT;
  _rulePrecisionPrefix(children: _rulePrecisionPrefixCstChildren, param?: IN): OUT;
  _ruleStruct(children: _ruleStructCstChildren, param?: IN): OUT;
  _ruleDeclarationWithoutAssign(children: _ruleDeclarationWithoutAssignCstChildren, param?: IN): OUT;
  _ruleVariableType(children: _ruleVariableTypeCstChildren, param?: IN): OUT;
  _ruleTag(children: _ruleTagCstChildren, param?: IN): OUT;
  _ruleTagAssignment(children: _ruleTagAssignmentCstChildren, param?: IN): OUT;
  _ruleTagAssignableValue(children: _ruleTagAssignableValueCstChildren, param?: IN): OUT;
  _ruleFn(children: _ruleFnCstChildren, param?: IN): OUT;
  _ruleFnReturnType(children: _ruleFnReturnTypeCstChildren, param?: IN): OUT;
  _ruleFnArg(children: _ruleFnArgCstChildren, param?: IN): OUT;
  _ruleFnBody(children: _ruleFnBodyCstChildren, param?: IN): OUT;
  _ruleFnMacro(children: _ruleFnMacroCstChildren, param?: IN): OUT;
  _ruleFnMacroCondition(children: _ruleFnMacroConditionCstChildren, param?: IN): OUT;
  _ruleFnMacroConditionDeclare(children: _ruleFnMacroConditionDeclareCstChildren, param?: IN): OUT;
  _ruleFnMacroConditionElseBranch(children: _ruleFnMacroConditionElseBranchCstChildren, param?: IN): OUT;
  _ruleMacroConditionElifBranch(children: _ruleMacroConditionElifBranchCstChildren, param?: IN): OUT;
  _ruleFnMacroDefine(children: _ruleFnMacroDefineCstChildren, param?: IN): OUT;
  _ruleMacroDefineVariable(children: _ruleMacroDefineVariableCstChildren, param?: IN): OUT;
  _ruleFnMacroUndefine(children: _ruleFnMacroUndefineCstChildren, param?: IN): OUT;
  _ruleAssignableValue(children: _ruleAssignableValueCstChildren, param?: IN): OUT;
  _ruleFnAddExpr(children: _ruleFnAddExprCstChildren, param?: IN): OUT;
  _ruleFnMultiplicationExpr(children: _ruleFnMultiplicationExprCstChildren, param?: IN): OUT;
  _ruleFnAtomicExpr(children: _ruleFnAtomicExprCstChildren, param?: IN): OUT;
  _ruleAddOperator(children: _ruleAddOperatorCstChildren, param?: IN): OUT;
  _ruleFnParenthesisExpr(children: _ruleFnParenthesisExprCstChildren, param?: IN): OUT;
  _ruleFnParenthesisAtomicExpr(children: _ruleFnParenthesisAtomicExprCstChildren, param?: IN): OUT;
  _ruleNumber(children: _ruleNumberCstChildren, param?: IN): OUT;
  _ruleFnCall(children: _ruleFnCallCstChildren, param?: IN): OUT;
  _ruleFnCallVariable(children: _ruleFnCallVariableCstChildren, param?: IN): OUT;
  _ruleFnVariable(children: _ruleFnVariableCstChildren, param?: IN): OUT;
  _ruleFnVariableProperty(children: _ruleFnVariablePropertyCstChildren, param?: IN): OUT;
  _ruleArrayIndex(children: _ruleArrayIndexCstChildren, param?: IN): OUT;
  _ruleMultiplicationOperator(children: _ruleMultiplicationOperatorCstChildren, param?: IN): OUT;
  _ruleDiscardStatement(children: _ruleDiscardStatementCstChildren, param?: IN): OUT;
  _ruleBreakStatement(children: _ruleBreakStatementCstChildren, param?: IN): OUT;
  _ruleContinueStatement(children: _ruleContinueStatementCstChildren, param?: IN): OUT;
  _ruleFnCallStatement(children: _ruleFnCallStatementCstChildren, param?: IN): OUT;
  _ruleFnStatement(children: _ruleFnStatementCstChildren, param?: IN): OUT;
  _ruleFnAssignStatement(children: _ruleFnAssignStatementCstChildren, param?: IN): OUT;
  _ruleForLoopStatement(children: _ruleForLoopStatementCstChildren, param?: IN): OUT;
  _ruleFnReturnStatement(children: _ruleFnReturnStatementCstChildren, param?: IN): OUT;
  _ruleReturnBody(children: _ruleReturnBodyCstChildren, param?: IN): OUT;
  _ruleFnExpression(children: _ruleFnExpressionCstChildren, param?: IN): OUT;
  _ruleBoolean(children: _ruleBooleanCstChildren, param?: IN): OUT;
  _ruleFnVariableDeclaration(children: _ruleFnVariableDeclarationCstChildren, param?: IN): OUT;
  _ruleFnVariableDeclareUnit(children: _ruleFnVariableDeclareUnitCstChildren, param?: IN): OUT;
  _ruleFnConditionStatement(children: _ruleFnConditionStatementCstChildren, param?: IN): OUT;
  _ruleConditionExpr(children: _ruleConditionExprCstChildren, param?: IN): OUT;
  _ruleFnRelationExpr(children: _ruleFnRelationExprCstChildren, param?: IN): OUT;
  _ruleRelationOperator(children: _ruleRelationOperatorCstChildren, param?: IN): OUT;
  _ruleFnBlockStatement(children: _ruleFnBlockStatementCstChildren, param?: IN): OUT;
  _ruleFnAssignExpr(children: _ruleFnAssignExprCstChildren, param?: IN): OUT;
  _ruleFnSelfAssignExpr(children: _ruleFnSelfAssignExprCstChildren, param?: IN): OUT;
  _ruleFnSelfOperator(children: _ruleFnSelfOperatorCstChildren, param?: IN): OUT;
  _ruleFnAssignmentOperator(children: _ruleFnAssignmentOperatorCstChildren, param?: IN): OUT;
  _rulePassPropertyAssignment(children: _rulePassPropertyAssignmentCstChildren, param?: IN): OUT;
  _ruleShaderPassPropertyType(children: _ruleShaderPassPropertyTypeCstChildren, param?: IN): OUT;
  _ruleRenderStateType(children: _ruleRenderStateTypeCstChildren, param?: IN): OUT;
  _ruleRenderStateDeclaration(children: _ruleRenderStateDeclarationCstChildren, param?: IN): OUT;
  _ruleRenderQueueAssignment(children: _ruleRenderQueueAssignmentCstChildren, param?: IN): OUT;
  _ruleRenderQueueValue(children: _ruleRenderQueueValueCstChildren, param?: IN): OUT;
  _ruleBlendStateProperty(children: _ruleBlendStatePropertyCstChildren, param?: IN): OUT;
  _ruleBlendStateValue(children: _ruleBlendStateValueCstChildren, param?: IN): OUT;
  _ruleBlendFactor(children: _ruleBlendFactorCstChildren, param?: IN): OUT;
  _ruleBlendOperation(children: _ruleBlendOperationCstChildren, param?: IN): OUT;
  _ruleBlendPropertyItem(children: _ruleBlendPropertyItemCstChildren, param?: IN): OUT;
  _ruleBlendStatePropertyDeclaration(children: _ruleBlendStatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleDepthStateProperty(children: _ruleDepthStatePropertyCstChildren, param?: IN): OUT;
  _ruleDepthStateValue(children: _ruleDepthStateValueCstChildren, param?: IN): OUT;
  _ruleCompareFunction(children: _ruleCompareFunctionCstChildren, param?: IN): OUT;
  _ruleDepthStatePropertyItem(children: _ruleDepthStatePropertyItemCstChildren, param?: IN): OUT;
  _ruleDepthSatePropertyDeclaration(children: _ruleDepthSatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleStencilStateProperty(children: _ruleStencilStatePropertyCstChildren, param?: IN): OUT;
  _ruleStencilStateValue(children: _ruleStencilStateValueCstChildren, param?: IN): OUT;
  _ruleStencilOperation(children: _ruleStencilOperationCstChildren, param?: IN): OUT;
  _ruleStencilStatePropertyItem(children: _ruleStencilStatePropertyItemCstChildren, param?: IN): OUT;
  _ruleStencilStatePropertyDeclaration(children: _ruleStencilStatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleRasterStateProperty(children: _ruleRasterStatePropertyCstChildren, param?: IN): OUT;
  _ruleRasterStateValue(children: _ruleRasterStateValueCstChildren, param?: IN): OUT;
  _ruleCullMode(children: _ruleCullModeCstChildren, param?: IN): OUT;
  _ruleRasterStatePropertyItem(children: _ruleRasterStatePropertyItemCstChildren, param?: IN): OUT;
  _ruleRasterStatePropertyDeclaration(children: _ruleRasterStatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleTupleFloat4(children: _ruleTupleFloat4CstChildren, param?: IN): OUT;
  _ruleTupleFloat3(children: _ruleTupleFloat3CstChildren, param?: IN): OUT;
  _ruleTupleFloat2(children: _ruleTupleFloat2CstChildren, param?: IN): OUT;
  _ruleTupleInt4(children: _ruleTupleInt4CstChildren, param?: IN): OUT;
  _ruleTupleInt3(children: _ruleTupleInt3CstChildren, param?: IN): OUT;
  _ruleTupleInt2(children: _ruleTupleInt2CstChildren, param?: IN): OUT;
}
