import type { CstNode, ICstVisitor, IToken } from "chevrotain";

export interface _ruleShaderCstNode extends CstNode {
  name: "_ruleShader";
  children: _ruleShaderCstChildren;
}

export type _ruleShaderCstChildren = {
  Shader: IToken[];
  ValueString: IToken[];
  LCurly: IToken[];
  _ruleProperty?: _rulePropertyCstNode[];
  _ruleSubShader?: _ruleSubShaderCstNode[];
  RCurly: IToken[];
};

export interface _ruleSubShaderCstNode extends CstNode {
  name: "_ruleSubShader";
  children: _ruleSubShaderCstChildren;
}

export type _ruleSubShaderCstChildren = {
  SubShader: IToken[];
  LCurly: IToken[];
  _ruleShaderPass?: _ruleShaderPassCstNode[];
  _ruleTag?: _ruleTagCstNode[];
  _ruleRenderStateDeclaration?: _ruleRenderStateDeclarationCstNode[];
  RCurly: IToken[];
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
  _ruleFnVariableDeclaration?: _ruleFnVariableDeclarationCstNode[];
  _ruleSubShaderPassPropertyAssignment?: _ruleSubShaderPassPropertyAssignmentCstNode[];
  _ruleRenderStateDeclaration?: _ruleRenderStateDeclarationCstNode[];
  _ruleFnMacroInclude?: _ruleFnMacroIncludeCstNode[];
  _ruleFnMacroDefine?: _ruleFnMacroDefineCstNode[];
  RCurly: IToken[];
};

export interface _ruleStructCstNode extends CstNode {
  name: "_ruleStruct";
  children: _ruleStructCstChildren;
}

export type _ruleStructCstChildren = {
  struct: IToken[];
  Identifier: IToken[];
  LCurly: IToken[];
  _ruleDeclaration?: _ruleDeclarationCstNode[];
  Semicolon?: IToken[];
  RCurly: IToken[];
};

export interface _ruleDeclarationCstNode extends CstNode {
  name: "_ruleDeclaration";
  children: _ruleDeclarationCstChildren;
}

export type _ruleDeclarationCstChildren = {
  _ruleVariableType: _ruleVariableTypeCstNode[];
  Identifier: IToken[];
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
  _ruleTagType: _ruleTagTypeCstNode[];
  SymbolEqual: IToken[];
  ValueString: IToken[];
};

export interface _ruleTagTypeCstNode extends CstNode {
  name: "_ruleTagType";
  children: _ruleTagTypeCstChildren;
}

export type _ruleTagTypeCstChildren = {
  ReplacementTag?: IToken[];
  PipelineStage?: IToken[];
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
  _ruleFnMacroInclude?: _ruleFnMacroIncludeCstNode[];
  _ruleFnMacroCondition?: _ruleFnMacroConditionCstNode[];
};

export interface _ruleFnMacroConditionCstNode extends CstNode {
  name: "_ruleFnMacroCondition";
  children: _ruleFnMacroConditionCstChildren;
}

export type _ruleFnMacroConditionCstChildren = {
  _ruleFnMacroConditionDeclare: _ruleFnMacroConditionDeclareCstNode[];
  Identifier: IToken[];
  _ruleFnBody: _ruleFnBodyCstNode[];
  _ruleFnMacroConditionBranch?: _ruleFnMacroConditionBranchCstNode[];
  m_endif: IToken[];
};

export interface _ruleFnMacroConditionDeclareCstNode extends CstNode {
  name: "_ruleFnMacroConditionDeclare";
  children: _ruleFnMacroConditionDeclareCstChildren;
}

export type _ruleFnMacroConditionDeclareCstChildren = {
  m_ifdef?: IToken[];
  m_ifndef?: IToken[];
};

export interface _ruleFnMacroConditionBranchCstNode extends CstNode {
  name: "_ruleFnMacroConditionBranch";
  children: _ruleFnMacroConditionBranchCstChildren;
}

export type _ruleFnMacroConditionBranchCstChildren = {
  _ruleFnMacroConditionBranchDeclare: _ruleFnMacroConditionBranchDeclareCstNode[];
  _ruleFnBody: _ruleFnBodyCstNode[];
};

export interface _ruleFnMacroConditionBranchDeclareCstNode extends CstNode {
  name: "_ruleFnMacroConditionBranchDeclare";
  children: _ruleFnMacroConditionBranchDeclareCstChildren;
}

export type _ruleFnMacroConditionBranchDeclareCstChildren = {
  m_else?: IToken[];
};

export interface _ruleFnMacroDefineCstNode extends CstNode {
  name: "_ruleFnMacroDefine";
  children: _ruleFnMacroDefineCstChildren;
}

export type _ruleFnMacroDefineCstChildren = {
  m_define: IToken[];
  Identifier: IToken[];
  _ruleAssignableValue?: _ruleAssignableValueCstNode[];
};

export interface _ruleAssignableValueCstNode extends CstNode {
  name: "_ruleAssignableValue";
  children: _ruleAssignableValueCstChildren;
}

export type _ruleAssignableValueCstChildren = {
  ValueTrue?: IToken[];
  ValueFalse?: IToken[];
  ValueString?: IToken[];
  _ruleFnAddExpr?: _ruleFnAddExprCstNode[];
  gl_FragColor?: IToken[];
  gl_Position?: IToken[];
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
  _ruleFnParenthesisExpr?: _ruleFnParenthesisExprCstNode[];
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
  _ruleFnAddExpr: _ruleFnAddExprCstNode[];
  RBracket: IToken[];
};

export interface _ruleNumberCstNode extends CstNode {
  name: "_ruleNumber";
  children: _ruleNumberCstChildren;
}

export type _ruleNumberCstChildren = {
  ValueInt?: IToken[];
  ValueFloat?: IToken[];
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
  glsl_sampler2D?: IToken[];
  pow?: IToken[];
  texture2D?: IToken[];
  Identifier?: IToken[];
};

export interface _ruleFnVariableCstNode extends CstNode {
  name: "_ruleFnVariable";
  children: _ruleFnVariableCstChildren;
}

export type _ruleFnVariableCstChildren = {
  Identifier: IToken[];
  Dot?: IToken[];
};

export interface _ruleMultiplicationOperatorCstNode extends CstNode {
  name: "_ruleMultiplicationOperator";
  children: _ruleMultiplicationOperatorCstChildren;
}

export type _ruleMultiplicationOperatorCstChildren = {
  SymbolMultiply?: IToken[];
  SymbolDivide?: IToken[];
};

export interface _ruleFnMacroIncludeCstNode extends CstNode {
  name: "_ruleFnMacroInclude";
  children: _ruleFnMacroIncludeCstChildren;
}

export type _ruleFnMacroIncludeCstChildren = {
  m_include: IToken[];
  ValueString: IToken[];
};

export interface _ruleFnStatementCstNode extends CstNode {
  name: "_ruleFnStatement";
  children: _ruleFnStatementCstChildren;
}

export type _ruleFnStatementCstChildren = {
  _ruleFnCall?: _ruleFnCallCstNode[];
  _ruleFnReturnStatement?: _ruleFnReturnStatementCstNode[];
  _ruleFnVariableDeclaration?: _ruleFnVariableDeclarationCstNode[];
  _ruleFnConditionStatement?: _ruleFnConditionStatementCstNode[];
  _ruleFnAssignStatement?: _ruleFnAssignStatementCstNode[];
  discard?: IToken[];
  Semicolon?: IToken[];
};

export interface _ruleFnReturnStatementCstNode extends CstNode {
  name: "_ruleFnReturnStatement";
  children: _ruleFnReturnStatementCstChildren;
}

export type _ruleFnReturnStatementCstChildren = {
  return: IToken[];
  _ruleFnExpression?: _ruleFnExpressionCstNode[];
  _ruleBoolean?: _ruleBooleanCstNode[];
  ValueString?: IToken[];
  Semicolon: IToken[];
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
  _ruleVariableType: _ruleVariableTypeCstNode[];
  Identifier: IToken[];
  SymbolEqual?: IToken[];
  _ruleFnExpression?: _ruleFnExpressionCstNode[];
  Semicolon: IToken[];
};

export interface _ruleFnConditionStatementCstNode extends CstNode {
  name: "_ruleFnConditionStatement";
  children: _ruleFnConditionStatementCstChildren;
}

export type _ruleFnConditionStatementCstChildren = {
  if: IToken[];
  LBracket: IToken[];
  _ruleFnRelationExpr: _ruleFnRelationExprCstNode[];
  RBracket: IToken[];
  _ruleFnBlockStatement: _ruleFnBlockStatementCstNode[];
  else?: IToken[];
  _ruleFnConditionStatement?: _ruleFnConditionStatementCstNode[];
};

export interface _ruleFnRelationExprCstNode extends CstNode {
  name: "_ruleFnRelationExpr";
  children: _ruleFnRelationExprCstChildren;
}

export type _ruleFnRelationExprCstChildren = {
  _ruleFnAddExpr: _ruleFnAddExprCstNode[];
  _ruleRelationOperator: _ruleRelationOperatorCstNode[];
};

export interface _ruleRelationOperatorCstNode extends CstNode {
  name: "_ruleRelationOperator";
  children: _ruleRelationOperatorCstChildren;
}

export type _ruleRelationOperatorCstChildren = {
  SymbolGreaterThan?: IToken[];
  SymbolLessThan?: IToken[];
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

export interface _ruleFnAssignStatementCstNode extends CstNode {
  name: "_ruleFnAssignStatement";
  children: _ruleFnAssignStatementCstChildren;
}

export type _ruleFnAssignStatementCstChildren = {
  _ruleFnAssignLO: _ruleFnAssignLOCstNode[];
  _ruleFnAssignmentOperator: _ruleFnAssignmentOperatorCstNode[];
  _ruleFnExpression: _ruleFnExpressionCstNode[];
  Semicolon: IToken[];
};

export interface _ruleFnAssignLOCstNode extends CstNode {
  name: "_ruleFnAssignLO";
  children: _ruleFnAssignLOCstChildren;
}

export type _ruleFnAssignLOCstChildren = {
  gl_FragColor?: IToken[];
  gl_Position?: IToken[];
  _ruleFnVariable?: _ruleFnVariableCstNode[];
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

export interface _ruleSubShaderPassPropertyAssignmentCstNode extends CstNode {
  name: "_ruleSubShaderPassPropertyAssignment";
  children: _ruleSubShaderPassPropertyAssignmentCstChildren;
}

export type _ruleSubShaderPassPropertyAssignmentCstChildren = {
  _ruleShaderPassPropertyType: _ruleShaderPassPropertyTypeCstNode[];
  SymbolEqual: IToken[];
  Identifier: IToken[];
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
};

export interface _ruleBlendStatePropertyCstNode extends CstNode {
  name: "_ruleBlendStateProperty";
  children: _ruleBlendStatePropertyCstChildren;
}

export type _ruleBlendStatePropertyCstChildren = {
  ColorBlendOperation?: IToken[];
  AlphaBlendOperation?: IToken[];
  SrcColorBlendFactor?: IToken[];
  SrcAlphaBlendFactor?: IToken[];
  DestColorBlendFactor?: IToken[];
  DestAlphaBlendFactor?: IToken[];
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
  "BlendFactor.Zero"?: IToken[];
  "BlendFactor.One"?: IToken[];
  "BlendFactor.SourceColor"?: IToken[];
  "BlendFactor.OneMinusSourceColor"?: IToken[];
  "BlendFactor.DestinationColor"?: IToken[];
  "BlendFactor.OneMinusDestinationColor"?: IToken[];
  "BlendFactor.SourceAlpha"?: IToken[];
  "BlendFactor.OneMinusSourceAlpha"?: IToken[];
  "BlendFactor.DestinationAlpha"?: IToken[];
  "BlendFactor.OneMinusDestinationAlpha"?: IToken[];
  "BlendFactor.SourceAlphaSaturate"?: IToken[];
  "BlendFactor.BlendColor"?: IToken[];
  "BlendFactor.OneMinusBlendColor"?: IToken[];
  "BlendOperation.Add"?: IToken[];
  "BlendOperation.Subtract"?: IToken[];
  "BlendOperation.ReverseSubtract"?: IToken[];
  "BlendOperation.Min"?: IToken[];
  "BlendOperation.Max"?: IToken[];
  _ruleAssignableValue?: _ruleAssignableValueCstNode[];
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
  Identifier: IToken[];
  LCurly: IToken[];
  _ruleBlendPropertyItem?: _ruleBlendPropertyItemCstNode[];
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
  "CompareFunction.Never"?: IToken[];
  "CompareFunction.Less"?: IToken[];
  "CompareFunction.Equal"?: IToken[];
  "CompareFunction.LessEqual"?: IToken[];
  "CompareFunction.Greater"?: IToken[];
  "CompareFunction.NotEqual"?: IToken[];
  "CompareFunction.GreaterEqual"?: IToken[];
  "CompareFunction.Always"?: IToken[];
  ValueTrue?: IToken[];
  ValueFalse?: IToken[];
};

export interface _ruleDepthStatePropertyItemCstNode extends CstNode {
  name: "_ruleDepthStatePropertyItem";
  children: _ruleDepthStatePropertyItemCstChildren;
}

export type _ruleDepthStatePropertyItemCstChildren = {
  _ruleDepthStateProperty: _ruleDepthStatePropertyCstNode[];
  LSquareBracket?: IToken[];
  ValueInt?: IToken[];
  RSquareBracket?: IToken[];
  SymbolEqual: IToken[];
  _ruleDepthStateValue: _ruleDepthStateValueCstNode[];
};

export interface _ruleDepthSatePropertyDeclarationCstNode extends CstNode {
  name: "_ruleDepthSatePropertyDeclaration";
  children: _ruleDepthSatePropertyDeclarationCstChildren;
}

export type _ruleDepthSatePropertyDeclarationCstChildren = {
  DepthState: IToken[];
  Identifier: IToken[];
  LCurly: IToken[];
  _ruleDepthStatePropertyItem?: _ruleDepthStatePropertyItemCstNode[];
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
  "CompareFunction.Never"?: IToken[];
  "CompareFunction.Less"?: IToken[];
  "CompareFunction.Equal"?: IToken[];
  "CompareFunction.LessEqual"?: IToken[];
  "CompareFunction.Greater"?: IToken[];
  "CompareFunction.NotEqual"?: IToken[];
  "CompareFunction.GreaterEqual"?: IToken[];
  "CompareFunction.Always"?: IToken[];
  "StencilOperation.Keep"?: IToken[];
  "StencilOperation.Zero"?: IToken[];
  "StencilOperation.Replace"?: IToken[];
  "StencilOperation.IncrementSaturate"?: IToken[];
  "StencilOperation.DecrementSaturate"?: IToken[];
  "StencilOperation.Invert"?: IToken[];
  "StencilOperation.IncrementWrap"?: IToken[];
  "StencilOperation.DecrementWrap"?: IToken[];
  _ruleAssignableValue?: _ruleAssignableValueCstNode[];
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
  Identifier: IToken[];
  LCurly: IToken[];
  _ruleStencilStatePropertyItem?: _ruleStencilStatePropertyItemCstNode[];
  RCurly: IToken[];
};

export interface _rulePropertyCstNode extends CstNode {
  name: "_ruleProperty";
  children: _rulePropertyCstChildren;
}

export type _rulePropertyCstChildren = {
  EditorProperties: IToken[];
  LCurly: IToken[];
  _rulePropertyItem?: _rulePropertyItemCstNode[];
  RCurly: IToken[];
};

export interface _rulePropertyItemCstNode extends CstNode {
  name: "_rulePropertyItem";
  children: _rulePropertyItemCstChildren;
}

export type _rulePropertyItemCstChildren = {
  Identifier: IToken[];
  LBracket: IToken[];
  ValueString: IToken[];
  Comma: IToken[];
  _rulePropertyItemType: _rulePropertyItemTypeCstNode[];
  RBracket: IToken[];
  SymbolEqual: IToken[];
  _rulePropertyItemValue: _rulePropertyItemValueCstNode[];
  Semicolon: IToken[];
};

export interface _rulePropertyItemTypeCstNode extends CstNode {
  name: "_rulePropertyItemType";
  children: _rulePropertyItemTypeCstChildren;
}

export type _rulePropertyItemTypeCstChildren = {
  TypeInteger?: IToken[];
  TypeString?: IToken[];
  TypeFloat?: IToken[];
  _ruleVariableType?: _ruleVariableTypeCstNode[];
  _ruleRange?: _ruleRangeCstNode[];
};

export interface _ruleRangeCstNode extends CstNode {
  name: "_ruleRange";
  children: _ruleRangeCstChildren;
}

export type _ruleRangeCstChildren = {
  Range: IToken[];
  LBracket: IToken[];
  ValueInt: IToken[];
  Comma: IToken[];
  RBracket: IToken[];
};

export interface _rulePropertyItemValueCstNode extends CstNode {
  name: "_rulePropertyItemValue";
  children: _rulePropertyItemValueCstChildren;
}

export type _rulePropertyItemValueCstChildren = {
  _ruleTupleFloat4?: _ruleTupleFloat4CstNode[];
  _ruleTupleFloat3?: _ruleTupleFloat3CstNode[];
  _ruleTupleFloat2?: _ruleTupleFloat2CstNode[];
  _ruleTupleInt4?: _ruleTupleInt4CstNode[];
  _ruleTupleInt3?: _ruleTupleInt3CstNode[];
  _ruleTupleInt2?: _ruleTupleInt2CstNode[];
  ValueTrue?: IToken[];
  ValueFalse?: IToken[];
  ValueInt?: IToken[];
  ValueString?: IToken[];
  ValueFloat?: IToken[];
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
  _ruleShaderPass(children: _ruleShaderPassCstChildren, param?: IN): OUT;
  _ruleStruct(children: _ruleStructCstChildren, param?: IN): OUT;
  _ruleDeclaration(children: _ruleDeclarationCstChildren, param?: IN): OUT;
  _ruleVariableType(children: _ruleVariableTypeCstChildren, param?: IN): OUT;
  _ruleTag(children: _ruleTagCstChildren, param?: IN): OUT;
  _ruleTagAssignment(children: _ruleTagAssignmentCstChildren, param?: IN): OUT;
  _ruleTagType(children: _ruleTagTypeCstChildren, param?: IN): OUT;
  _ruleFn(children: _ruleFnCstChildren, param?: IN): OUT;
  _ruleFnReturnType(children: _ruleFnReturnTypeCstChildren, param?: IN): OUT;
  _ruleFnArg(children: _ruleFnArgCstChildren, param?: IN): OUT;
  _ruleFnBody(children: _ruleFnBodyCstChildren, param?: IN): OUT;
  _ruleFnMacro(children: _ruleFnMacroCstChildren, param?: IN): OUT;
  _ruleFnMacroCondition(children: _ruleFnMacroConditionCstChildren, param?: IN): OUT;
  _ruleFnMacroConditionDeclare(children: _ruleFnMacroConditionDeclareCstChildren, param?: IN): OUT;
  _ruleFnMacroConditionBranch(children: _ruleFnMacroConditionBranchCstChildren, param?: IN): OUT;
  _ruleFnMacroConditionBranchDeclare(children: _ruleFnMacroConditionBranchDeclareCstChildren, param?: IN): OUT;
  _ruleFnMacroDefine(children: _ruleFnMacroDefineCstChildren, param?: IN): OUT;
  _ruleAssignableValue(children: _ruleAssignableValueCstChildren, param?: IN): OUT;
  _ruleFnAddExpr(children: _ruleFnAddExprCstChildren, param?: IN): OUT;
  _ruleFnMultiplicationExpr(children: _ruleFnMultiplicationExprCstChildren, param?: IN): OUT;
  _ruleFnAtomicExpr(children: _ruleFnAtomicExprCstChildren, param?: IN): OUT;
  _ruleAddOperator(children: _ruleAddOperatorCstChildren, param?: IN): OUT;
  _ruleFnParenthesisExpr(children: _ruleFnParenthesisExprCstChildren, param?: IN): OUT;
  _ruleNumber(children: _ruleNumberCstChildren, param?: IN): OUT;
  _ruleFnCall(children: _ruleFnCallCstChildren, param?: IN): OUT;
  _ruleFnCallVariable(children: _ruleFnCallVariableCstChildren, param?: IN): OUT;
  _ruleFnVariable(children: _ruleFnVariableCstChildren, param?: IN): OUT;
  _ruleMultiplicationOperator(children: _ruleMultiplicationOperatorCstChildren, param?: IN): OUT;
  _ruleFnMacroInclude(children: _ruleFnMacroIncludeCstChildren, param?: IN): OUT;
  _ruleFnStatement(children: _ruleFnStatementCstChildren, param?: IN): OUT;
  _ruleFnReturnStatement(children: _ruleFnReturnStatementCstChildren, param?: IN): OUT;
  _ruleFnExpression(children: _ruleFnExpressionCstChildren, param?: IN): OUT;
  _ruleBoolean(children: _ruleBooleanCstChildren, param?: IN): OUT;
  _ruleFnVariableDeclaration(children: _ruleFnVariableDeclarationCstChildren, param?: IN): OUT;
  _ruleFnConditionStatement(children: _ruleFnConditionStatementCstChildren, param?: IN): OUT;
  _ruleFnRelationExpr(children: _ruleFnRelationExprCstChildren, param?: IN): OUT;
  _ruleRelationOperator(children: _ruleRelationOperatorCstChildren, param?: IN): OUT;
  _ruleFnBlockStatement(children: _ruleFnBlockStatementCstChildren, param?: IN): OUT;
  _ruleFnAssignStatement(children: _ruleFnAssignStatementCstChildren, param?: IN): OUT;
  _ruleFnAssignLO(children: _ruleFnAssignLOCstChildren, param?: IN): OUT;
  _ruleFnAssignmentOperator(children: _ruleFnAssignmentOperatorCstChildren, param?: IN): OUT;
  _ruleSubShaderPassPropertyAssignment(children: _ruleSubShaderPassPropertyAssignmentCstChildren, param?: IN): OUT;
  _ruleShaderPassPropertyType(children: _ruleShaderPassPropertyTypeCstChildren, param?: IN): OUT;
  _ruleRenderStateType(children: _ruleRenderStateTypeCstChildren, param?: IN): OUT;
  _ruleRenderStateDeclaration(children: _ruleRenderStateDeclarationCstChildren, param?: IN): OUT;
  _ruleBlendStateProperty(children: _ruleBlendStatePropertyCstChildren, param?: IN): OUT;
  _ruleBlendStateValue(children: _ruleBlendStateValueCstChildren, param?: IN): OUT;
  _ruleBlendPropertyItem(children: _ruleBlendPropertyItemCstChildren, param?: IN): OUT;
  _ruleBlendStatePropertyDeclaration(children: _ruleBlendStatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleDepthStateProperty(children: _ruleDepthStatePropertyCstChildren, param?: IN): OUT;
  _ruleDepthStateValue(children: _ruleDepthStateValueCstChildren, param?: IN): OUT;
  _ruleDepthStatePropertyItem(children: _ruleDepthStatePropertyItemCstChildren, param?: IN): OUT;
  _ruleDepthSatePropertyDeclaration(children: _ruleDepthSatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleStencilStateProperty(children: _ruleStencilStatePropertyCstChildren, param?: IN): OUT;
  _ruleStencilStateValue(children: _ruleStencilStateValueCstChildren, param?: IN): OUT;
  _ruleStencilStatePropertyItem(children: _ruleStencilStatePropertyItemCstChildren, param?: IN): OUT;
  _ruleStencilStatePropertyDeclaration(children: _ruleStencilStatePropertyDeclarationCstChildren, param?: IN): OUT;
  _ruleProperty(children: _rulePropertyCstChildren, param?: IN): OUT;
  _rulePropertyItem(children: _rulePropertyItemCstChildren, param?: IN): OUT;
  _rulePropertyItemType(children: _rulePropertyItemTypeCstChildren, param?: IN): OUT;
  _ruleRange(children: _ruleRangeCstChildren, param?: IN): OUT;
  _rulePropertyItemValue(children: _rulePropertyItemValueCstChildren, param?: IN): OUT;
  _ruleTupleFloat4(children: _ruleTupleFloat4CstChildren, param?: IN): OUT;
  _ruleTupleFloat3(children: _ruleTupleFloat3CstChildren, param?: IN): OUT;
  _ruleTupleFloat2(children: _ruleTupleFloat2CstChildren, param?: IN): OUT;
  _ruleTupleInt4(children: _ruleTupleInt4CstChildren, param?: IN): OUT;
  _ruleTupleInt3(children: _ruleTupleInt3CstChildren, param?: IN): OUT;
  _ruleTupleInt2(children: _ruleTupleInt2CstChildren, param?: IN): OUT;
}
