export interface IShaderParser {
  TupleInt2: any;
  TupleInt3: any;
  TupleInt4: any;
  TupleFloat2: any;
  TupleFloat3: any;
  TupleFloat4: any;

  RuleRange: any;
  RulePropertyItem: any;
  RuleProperty: any;
  RulePropertyItemType: any;
  RulePropertyItemValue: any;

  RuleShader: any;
  RuleSubShader: any;
  RuleShaderPass: any;

  RuleTag: any;
  RuleTagAssignment: any;
  RuleTagType: any;

  SubShaderPassPropertyAssignment: any;
  RuleShaderPassPropertyType: any;
  RulePassUniform: any;

  RuleStruct: any;
  RuleDeclaration: any;
  RuleStateProperty: any;
  RuleAssignableValue: any;
  RuleRenderStateDeclaration: any;
  RuleStatePropertyAssign: any;
  RuleRenderStateType: any;
  RuleNumber: any;
  RuleBoolean: any;

  RuleMultiplicationOperator: any;
  RuleAddOperator: any;
  RuleRelationOperator: any;
  RuleVariableType: any;

  RuleFn: any;
  RuleFnReturnType: any;
  RuleFnArg: any;
  RuleFnAddExpr: any;
  RuleFnParenthesisExpr: any;
  RuleFnAtomicExpr: any;
  RuleFnMultiplicationExpr: any;
  RuleFnBody: any;
  RuleFnCall: any;
  RuleFnCallVariable: any;
  RuleFnReturnVariable: any;
  RuleFnExpression: any;
  RuleFnVariableDeclaration: any;
  RuleFnVariable: any;
  RuleFnReturnStatement: any;
  RuleFnStatement: any;
  RuleFnAssignStatement: any;
  RuleFnAssignmentOperator: any;
  RuleFnAssignLO: any;
  RuleFnBlockStatement: any;
  RuleFnRelationExpr: any;
  RuleFnConditionStatement: any;

  RuleFnMacro: any;
  RuleFnMacroCondition: any;
  RuleFnMacroDefine: any;
  RuleFnMacroInclude: any;
  RuleFnMacroConditionDeclare: any;
  RuleFnMacroConditionBranch: any;
  RuleFnMacroConditionBranchDeclare: any;
}
