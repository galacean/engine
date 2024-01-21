import { CstParser, Lexer, TokenType } from "chevrotain";
import { Others, Symbols, Types, Keywords, Values, GLKeywords, RenderState, _allTokens } from "./tokens";
import { ValueFalse, ValueFloat, ValueInt, ValueTrue } from "./tokens/Value";
import { Identifier } from "./tokens/Other";
import { ShaderFactory } from "@galacean/engine";

export class ShaderParser extends CstParser {
  lexer: Lexer;
  // TODO: delete
  extendedSource: string;

  constructor() {
    super(_allTokens, { maxLookahead: 7 });
    this.lexer = new Lexer(_allTokens, { ensureOptimizations: true });

    this.performSelfAnalysis();
  }

  parse(text: string) {
    const source = ShaderFactory.parseIncludes(text, /^[ \t]*#include +"([\w\d.]+)"/gm);
    this.extendedSource = source;

    const lexingResult = this.lexer.tokenize(source);
    this.input = lexingResult.tokens;
  }

  public ruleShader = this.RULE("_ruleShader", () => {
    this.CONSUME(Keywords.Shader);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleSubShader) },
        { ALT: () => this.SUBRULE(this._ruleRenderStateDeclaration) },
        { ALT: () => this.SUBRULE(this._ruleTag) },
        { ALT: () => this.SUBRULE(this._ruleStruct) },
        { ALT: () => this.SUBRULE(this._ruleFn) },
        { ALT: () => this.SUBRULE(this._ruleShaderPropertyDeclare) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleSubShader = this.RULE("_ruleSubShader", () => {
    this.CONSUME(Keywords.SubShader);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleShaderPass) },
        { ALT: () => this.SUBRULE(this._ruleUsePass) },
        { ALT: () => this.SUBRULE(this._ruleTag) },
        { ALT: () => this.SUBRULE(this._ruleRenderStateDeclaration) },
        { ALT: () => this.SUBRULE(this._ruleStruct) },
        { ALT: () => this.SUBRULE(this._ruleFn) },
        { ALT: () => this.SUBRULE(this._ruleShaderPropertyDeclare) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleUsePass = this.RULE("_ruleUsePass", () => {
    this.CONSUME(Keywords.UsePass);
    this.CONSUME(Values.ValueString);
  });

  private _ruleShaderPass = this.RULE("_ruleShaderPass", () => {
    this.CONSUME(Keywords.Pass);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleTag) },
        { ALT: () => this.SUBRULE(this._ruleStruct) },
        { ALT: () => this.SUBRULE(this._ruleFn) },
        { ALT: () => this.SUBRULE(this._ruleShaderPropertyDeclare) },
        { ALT: () => this.SUBRULE(this._rulePassPropertyAssignment) },
        { ALT: () => this.SUBRULE(this._ruleRenderQueueAssignment) },
        { ALT: () => this.SUBRULE(this._ruleRenderStateDeclaration) },
        { ALT: () => this.SUBRULE(this._ruleFnMacro) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleShaderPropertyDeclare = this.RULE("_ruleShaderPropertyDeclare", () => {
    this.OPTION(() => this.SUBRULE(this._rulePrecisionPrefix));
    this.SUBRULE(this._ruleDeclarationWithoutAssign);
  });

  private _rulePrecisionPrefix = this.RULE("_rulePrecisionPrefix", () => {
    this.OR(Types.precisionTokenList.map((token) => ({ ALT: () => this.CONSUME(token) })));
  });

  private _ruleStruct = this.RULE("_ruleStruct", () => {
    this.CONSUME(GLKeywords.Struct);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => this.SUBRULE(this._ruleDeclarationWithoutAssign)
        },
        { ALT: () => this.SUBRULE(this._ruleStructMacroConditionalField) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleDeclarationWithoutAssign = this.RULE("_ruleDeclarationWithoutAssign", () => {
    this.SUBRULE(this._ruleVariableType);
    this.SUBRULE(this._ruleFnVariable);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleVariableType = this.RULE("_ruleVariableType", () => {
    const types = Types.tokenList.map((item) => ({
      ALT: () => this.CONSUME(item)
    }));

    this.OR([...types, { ALT: () => this.CONSUME(Others.Identifier) }]);
  });

  private _ruleTag = this.RULE("_ruleTag", () => {
    this.CONSUME(Keywords.Tags);
    this.CONSUME(Symbols.LCurly);
    this.MANY_SEP({
      DEF: () => {
        this.SUBRULE(this._ruleTagAssignment);
      },
      SEP: Symbols.Comma
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleTagAssignment = this.RULE("_ruleTagAssignment", () => {
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleTagAssignableValue);
  });

  private _ruleTagAssignableValue = this.RULE("_ruleTagAssignableValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Values.ValueString) }
    ]);
  });

  private _ruleFn = this.RULE("_ruleFn", () => {
    this.OPTION(() => this.SUBRULE(this._rulePrecisionPrefix));
    this.SUBRULE(this._ruleFnReturnType);
    this.CONSUME1(Others.Identifier);
    this.CONSUME1(Symbols.LBracket);
    this.MANY_SEP({
      SEP: Symbols.Comma,
      DEF: () => this.SUBRULE(this._ruleFnArg)
    });
    this.CONSUME(Symbols.RBracket);
    this.CONSUME(Symbols.LCurly);
    this.SUBRULE(this._ruleFnBody);
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleFnReturnType = this.RULE("_ruleFnReturnType", () => {
    this.OR([{ ALT: () => this.SUBRULE(this._ruleVariableType) }, { ALT: () => this.CONSUME(GLKeywords.Void) }]);
  });

  private _ruleFnArgDecorator = this.RULE("_ruleFnArgDecorator", () => {
    this.OR([
      { ALT: () => this.CONSUME(Keywords.ArgDecoInOut) },
      { ALT: () => this.CONSUME(Keywords.ArgDecoIn) },
      { ALT: () => this.CONSUME(Keywords.ArgDecoOut) }
    ]);
  });

  private _ruleFnArg = this.RULE("_ruleFnArg", () => {
    this.OR([
      {
        ALT: () => {
          this.OPTION(() => this.SUBRULE(this._ruleFnArgDecorator));
          this.SUBRULE(this._ruleVariableType);
          this.CONSUME2(Others.Identifier);
          this.OPTION1(() => this.SUBRULE(this._ruleArrayIndex));
        }
      },
      { ALT: () => this.SUBRULE(this._ruleUseMacro) }
    ]);
  });

  private _ruleUseMacro = this.RULE("_ruleUseMacro", () => {
    this.OR([{ ALT: () => this.SUBRULE(this._ruleFnCall) }, { ALT: () => this.CONSUME(Others.Identifier) }]);
  });

  private _ruleFnBody = this.RULE("_ruleFnBody", () => {
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this._ruleFnMacro) }, { ALT: () => this.SUBRULE(this._ruleFnStatement) }]);
    });
  });

  private _ruleFnMacro = this.RULE("_ruleFnMacro", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnMacroDefine) },
      { ALT: () => this.SUBRULE(this._ruleFnMacroCondition) },
      { ALT: () => this.SUBRULE(this._ruleFnMacroUndefine) }
    ]);
  });

  private _ruleFnMacroConditionBody = this.RULE("_ruleFnMacroConditionBody", () => {
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this._ruleStruct) }, { ALT: () => this.SUBRULE(this._ruleFnBody) }]);
    });
  });

  private _ruleStructMacroConditionBody = this.RULE("_ruleStructMacroConditionBody", () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleDeclarationWithoutAssign) },
        { ALT: () => this.SUBRULE(this._ruleStructMacroConditionalField) }
      ]);
    });
  });

  private _ruleStructMacroConditionalField = this.RULE("_ruleStructMacroConditionalField", () => {
    this.SUBRULE(this._ruleFnMacroConditionDeclare);
    this.SUBRULE(this._ruleConditionExpr);
    this.SUBRULE(this._ruleStructMacroConditionBody);

    this.OPTION(() => {
      this.SUBRULE(this._ruleStructMacroElifBranch);
    });
    this.OPTION1(() => {
      this.SUBRULE(this._ruleStructMacroConditionElseBranch);
    });
    this.CONSUME(GLKeywords.M_ENDIF);
  });

  private _ruleFnMacroCondition = this.RULE("_ruleFnMacroCondition", () => {
    this.SUBRULE(this._ruleFnMacroConditionDeclare);
    this.SUBRULE(this._ruleConditionExpr);
    this.SUBRULE(this._ruleFnMacroConditionBody);

    this.MANY(() => {
      this.SUBRULE(this._ruleMacroConditionElifBranch);
    });
    this.OPTION1(() => {
      this.SUBRULE(this._ruleFnMacroConditionElseBranch);
    });
    this.CONSUME(GLKeywords.M_ENDIF);
  });

  private _ruleFnMacroConditionDeclare = this.RULE("_ruleFnMacroConditionDeclare", () => {
    this.OR([
      { ALT: () => this.CONSUME(GLKeywords.M_IFDEF) },
      { ALT: () => this.CONSUME(GLKeywords.M_IFNDEF) },
      { ALT: () => this.CONSUME(GLKeywords.M_IF) }
    ]);
  });

  private _ruleStructMacroConditionElseBranch = this.RULE("_ruleStructMacroConditionElseBranch", () => {
    this.CONSUME(GLKeywords.M_ELSE);
    this.SUBRULE(this._ruleStructMacroConditionBody);
  });

  private _ruleFnMacroConditionElseBranch = this.RULE("_ruleFnMacroConditionElseBranch", () => {
    this.CONSUME(GLKeywords.M_ELSE);
    this.SUBRULE(this._ruleFnMacroConditionBody);
  });

  private _ruleStructMacroElifBranch = this.RULE("_ruleStructMacroElifBranch", () => {
    this.CONSUME(GLKeywords.M_ELIF);
    this.SUBRULE(this._ruleConditionExpr);
    this.SUBRULE(this._ruleStructMacroConditionBody);
  });

  private _ruleMacroConditionElifBranch = this.RULE("_ruleMacroConditionElifBranch", () => {
    this.CONSUME(GLKeywords.M_ELIF);
    this.SUBRULE(this._ruleConditionExpr);
    this.SUBRULE(this._ruleFnMacroConditionBody);
  });

  private _ruleFnMacroDefine = this.RULE("_ruleFnMacroDefine", () => {
    this.CONSUME(GLKeywords.M_DEFINE);
    this.SUBRULE(this._ruleMacroDefineVariable);
    this.OPTION(() => {
      this.SUBRULE(this._ruleMacroDefineValue);
    });
  });

  private _ruleMacroDefineVariable = this.RULE("_ruleMacroDefineVariable", () => {
    this.OR([{ ALT: () => this.SUBRULE(this._ruleFnCall) }, { ALT: () => this.CONSUME(Others.Identifier) }]);
  });

  private _ruleMacroDefineValue = this.RULE("_ruleMacroDefineValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnVariableDeclaration) },
      { ALT: () => this.SUBRULE(this._ruleAssignableValue) }
    ]);
  });

  private _ruleFnMacroUndefine = this.RULE("_ruleFnMacroUndefine", () => {
    this.CONSUME(GLKeywords.M_UNDEFINE);
    this.CONSUME(Others.Identifier);
  });

  private _ruleAssignableValue = this.RULE("_ruleAssignableValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Values.ValueString) },
      { ALT: () => this.SUBRULE(this._ruleFnExpression) }
    ]);
  });

  private _ruleFnAddExpr = this.RULE("_ruleFnAddExpr", () => {
    this.SUBRULE(this._ruleFnMultiplicationExpr);
    this.MANY(() => {
      this.SUBRULE(this._ruleAddOperator);
      this.SUBRULE2(this._ruleFnMultiplicationExpr);
    });
  });

  private _ruleFnMultiplicationExpr = this.RULE("_ruleFnMultiplicationExpr", () => {
    this.SUBRULE(this._ruleFnAtomicExpr);
    this.MANY(() => {
      this.SUBRULE(this._ruleMultiplicationOperator);
      this.SUBRULE2(this._ruleFnAtomicExpr);
    });
  });

  private _ruleFnAtomicExpr = this.RULE("_ruleFnAtomicExpr", () => {
    this.OPTION(() => this.SUBRULE(this._ruleAddOperator));
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnParenthesisAtomicExpr) },
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.SUBRULE(this._ruleFnCall) },
      { ALT: () => this.SUBRULE(this._ruleFnVariable) }
    ]);
  });

  private _ruleAddOperator = this.RULE("_ruleAddOperator", () => {
    this.OR([
      { ALT: () => this.CONSUME(Symbols.Add) },
      { ALT: () => this.CONSUME(Symbols.Minus) },
      { ALT: () => this.CONSUME(Symbols.Negative) }
    ]);
  });

  private _ruleFnParenthesisExpr = this.RULE("_ruleFnParenthesisExpr", () => {
    this.CONSUME(Symbols.LBracket);
    this.SUBRULE(this._ruleConditionExpr);
    this.CONSUME(Symbols.RBracket);
  });

  private _ruleFnParenthesisAtomicExpr = this.RULE("_ruleFnParenthesisAtomicExpr", () => {
    this.SUBRULE(this._ruleFnParenthesisExpr);
    this.OPTION(() => {
      this.CONSUME(Symbols.Dot);
      this.SUBRULE(this._ruleFnVariable);
    });
  });

  private _ruleNumber = this.RULE("_ruleNumber", () => {
    this.OR([{ ALT: () => this.CONSUME1(ValueInt) }, { ALT: () => this.CONSUME(ValueFloat) }]);
    this.OPTION(() => this.CONSUME(Symbols.Exp));
  });

  private _ruleFnCall = this.RULE("_ruleFnCall", () => {
    this.SUBRULE(this._ruleFnCallVariable);
    this.CONSUME1(Symbols.LBracket);
    this.MANY_SEP({
      SEP: Symbols.Comma,
      DEF: () => {
        this.SUBRULE(this._ruleAssignableValue);
      }
    });
    this.CONSUME(Symbols.RBracket);
  });

  private _ruleFnCallVariable = this.RULE("_ruleFnCallVariable", () => {
    this.OR([
      ...Types.tokenList.map((item) => ({ ALT: () => this.CONSUME(item) })),
      { ALT: () => this.CONSUME(GLKeywords.Texture2D) },
      { ALT: () => this.CONSUME(Others.Identifier) }
    ]);
  });

  private _ruleFnVariable = this.RULE("_ruleFnVariable", () => {
    this.CONSUME(Others.Identifier);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleFnVariableProperty) },
        { ALT: () => this.SUBRULE(this._ruleArrayIndex) }
      ]);
    });
  });

  private _ruleFnVariableProperty = this.RULE("_ruleFnVariableProperty", () => {
    this.CONSUME(Symbols.Dot);
    this.CONSUME1(Others.Identifier);
  });

  private _ruleArrayIndex = this.RULE("_ruleArrayIndex", () => {
    this.CONSUME(Symbols.LSquareBracket);
    this.OPTION(() => this.SUBRULE(this._ruleFnAddExpr));
    this.CONSUME(Symbols.RSquareBracket);
  });

  private _ruleMultiplicationOperator = this.RULE("_ruleMultiplicationOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.Multiply) }, { ALT: () => this.CONSUME(Symbols.Divide) }]);
  });

  private _ruleDiscardStatement = this.RULE("_ruleDiscardStatement", () => {
    this.CONSUME(GLKeywords.Discard);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleBreakStatement = this.RULE("_ruleBreakStatement", () => {
    this.CONSUME(GLKeywords.Break);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleContinueStatement = this.RULE("_ruleContinueStatement", () => {
    this.CONSUME(GLKeywords.Continue);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnCallStatement = this.RULE("_ruleFnCallStatement", () => {
    this.SUBRULE(this._ruleFnCall);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnStatement = this.RULE("_ruleFnStatement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnCallStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnReturnStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnAssignStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnVariableDeclarationStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnConditionStatement) },
      { ALT: () => this.SUBRULE(this._ruleDiscardStatement) },
      { ALT: () => this.SUBRULE(this._ruleBreakStatement) },
      { ALT: () => this.SUBRULE(this._ruleContinueStatement) },
      { ALT: () => this.SUBRULE(this._ruleForLoopStatement) },
      { ALT: () => this.SUBRULE(this._ruleFn) },
      { ALT: () => this.SUBRULE(this._ruleFnBlockStatement) }
    ]);
  });

  private _ruleFnVariableDeclarationStatement = this.RULE("_ruleFnVariableDeclarationStatement", () => {
    this.SUBRULE(this._ruleFnVariableDeclaration);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnAssignStatement = this.RULE("_ruleFnAssignStatement", () => {
    this.SUBRULE(this._ruleFnAssignExpr);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleForLoopStatement = this.RULE("_ruleForLoopStatement", () => {
    this.CONSUME(GLKeywords.For);
    this.CONSUME(Symbols.LBracket);
    this.SUBRULE(this._ruleFnVariableDeclaration);
    this.CONSUME1(Symbols.Semicolon);
    this.SUBRULE(this._ruleConditionExpr);
    this.CONSUME2(Symbols.Semicolon);
    this.SUBRULE(this._ruleFnAssignExpr);
    this.CONSUME(Symbols.RBracket);
    this.SUBRULE(this._ruleFnBlockStatement);
  });

  private _ruleFnReturnStatement = this.RULE("_ruleFnReturnStatement", () => {
    this.CONSUME(GLKeywords.Return);
    this.OPTION(() => {
      this.MANY(() => this.CONSUME(Symbols.Negative));
    });
    this.SUBRULE(this._ruleReturnBody);

    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleReturnBody = this.RULE("_ruleReturnBody", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleConditionExpr) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Values.ValueString) }
    ]);
  });

  private _ruleTernaryExpressionSuffix = this.RULE("_ruleTernaryExpressionSuffix", () => {
    this.CONSUME(Symbols.Query);
    this.SUBRULE1(this._ruleFnAddExpr);
    this.CONSUME(Symbols.Colon);
    this.SUBRULE2(this._ruleFnAddExpr);
  });

  private _ruleFnExpression = this.RULE("_ruleFnExpression", () => {
    this.SUBRULE(this._ruleFnAddExpr);
    this.OPTION(() => {
      this.SUBRULE(this._ruleTernaryExpressionSuffix);
    });
  });

  private _ruleBoolean = this.RULE("_ruleBoolean", () => {
    this.OR([{ ALT: () => this.CONSUME(ValueTrue) }, { ALT: () => this.CONSUME(ValueFalse) }]);
  });

  private _ruleFnVariableDeclaration = this.RULE("_ruleFnVariableDeclaration", () => {
    this.OPTION(() => this.SUBRULE(this._rulePrecisionPrefix));
    this.OPTION1(() => this.SUBRULE(this._ruleFnVariableTypeQualifier));
    this.SUBRULE(this._ruleVariableType);
    this.SUBRULE(this._ruleFnVariableDeclareUnit);
    this.MANY(() => {
      this.CONSUME(Symbols.Comma);
      this.SUBRULE1(this._ruleFnVariableDeclareUnit);
    });
  });

  private _ruleFnVariableTypeQualifier = this.RULE("_ruleFnVariableTypeQualifier", () => {
    this.OR([{ ALT: () => this.CONSUME(Keywords.ConstQualifier) }]);
  });

  private _ruleFnVariableDeclareUnit = this.RULE("_ruleFnVariableDeclareUnit", () => {
    this.SUBRULE(this._ruleFnVariable);
    this.OPTION(() => {
      this.CONSUME(Symbols.Equal);
      this.SUBRULE(this._ruleFnExpression);
    });
  });

  private _ruleFnConditionStatement = this.RULE("_ruleFnConditionStatement", () => {
    this.CONSUME(GLKeywords.If);
    this.CONSUME1(Symbols.LBracket);
    this.SUBRULE(this._ruleConditionExpr);
    this.CONSUME(Symbols.RBracket);
    this.SUBRULE(this._ruleFnBlockStatement);
    this.MANY(() => {
      this.CONSUME(GLKeywords.Else);
      this.SUBRULE(this._ruleFnConditionStatement);
    });
    this.OPTION(() => {
      this.CONSUME1(GLKeywords.Else);
      this.SUBRULE1(this._ruleFnBlockStatement);
    });
  });

  private _ruleConditionExpr = this.RULE("_ruleConditionExpr", () => {
    this.SUBRULE(this._ruleFnRelationExpr);
    this.MANY(() => {
      this.SUBRULE(this._ruleRelationOperator);
      this.SUBRULE1(this._ruleFnRelationExpr);
    });
    this.OPTION(() => {
      this.SUBRULE(this._ruleTernaryExpressionSuffix);
    });
  });

  private _ruleFnRelationExpr = this.RULE("_ruleFnRelationExpr", () => {
    this.SUBRULE(this._ruleFnAddExpr);
    this.OPTION(() => {
      this.SUBRULE(this._ruleRelationOperator);
      this.SUBRULE1(this._ruleFnAddExpr);
    });
  });

  private _ruleRelationOperator = this.RULE("_ruleRelationOperator", () => {
    this.OR(Symbols.RelationTokenList.map((item) => ({ ALT: () => this.CONSUME(item) })));
  });

  private _ruleFnBlockStatement = this.RULE("_ruleFnBlockStatement", () => {
    this.CONSUME(Symbols.LCurly);
    this.SUBRULE(this._ruleFnBody);
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleFnAssignExpr = this.RULE("_ruleFnAssignExpr", () => {
    this.SUBRULE(this._ruleFnSelfAssignExpr);
    this.MANY(() => {
      this.SUBRULE(this._ruleFnAssignmentOperator);
      this.SUBRULE(this._ruleFnExpression);
    });
  });

  private _ruleFnSelfAssignExpr = this.RULE("_ruleFnSelfAssignExpr", () => {
    this.OPTION(() => this.SUBRULE(this._ruleFnSelfOperator));
    this.SUBRULE(this._ruleFnVariable);
    this.OPTION1(() => this.SUBRULE1(this._ruleFnSelfOperator));
  });

  private _ruleFnSelfOperator = this.RULE("_ruleFnSelfOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.SelfAdd) }, { ALT: () => this.CONSUME(Symbols.SelfMinus) }]);
  });

  private _ruleFnAssignmentOperator = this.RULE("_ruleFnAssignmentOperator", () => {
    this.OR([
      { ALT: () => this.CONSUME(Symbols.Equal) },
      { ALT: () => this.CONSUME(Symbols.MultiEqual) },
      { ALT: () => this.CONSUME(Symbols.DivideEqual) },
      { ALT: () => this.CONSUME(Symbols.AddEqual) },
      { ALT: () => this.CONSUME(Symbols.MinusEqual) }
    ]);
  });

  private _rulePassPropertyAssignment = this.RULE("_rulePassPropertyAssignment", () => {
    this.SUBRULE(this._ruleShaderPassPropertyType);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleFnVariable);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleShaderPassPropertyType = this.RULE("_ruleShaderPassPropertyType", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleRenderStateType) },
      { ALT: () => this.CONSUME(Keywords.VertexShader) },
      { ALT: () => this.CONSUME(Keywords.FragmentShader) }
    ]);
  });

  private _ruleRenderStateType = this.RULE("_ruleRenderStateType", () => {
    this.OR(Object.values(RenderState.RenderStateTypeTokens).map((item) => ({ ALT: () => this.CONSUME(item) })));
  });

  private _ruleRenderStateDeclaration = this.RULE("_ruleRenderStateDeclaration", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleBlendStatePropertyDeclaration) },
      { ALT: () => this.SUBRULE(this._ruleDepthSatePropertyDeclaration) },
      { ALT: () => this.SUBRULE(this._ruleStencilStatePropertyDeclaration) },
      { ALT: () => this.SUBRULE(this._ruleRasterStatePropertyDeclaration) }
    ]);
  });

  private _ruleRenderQueueAssignment = this.RULE("_ruleRenderQueueAssignment", () => {
    this.CONSUME(RenderState.RenderQueueType);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleRenderQueueValue);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleRenderQueueValue = this.RULE("_ruleRenderQueueValue", () => {
    this.OR(
      [...RenderState.RenderQueueTypeTokenList, Others.Identifier].map((token) => ({ ALT: () => this.CONSUME(token) }))
    );
  });

  private _ruleBlendStateProperty = this.RULE("_ruleBlendStateProperty", () => {
    this.OR(
      [
        ...Object.values(RenderState.BlendStatePropertyTokens),
        ...Object.values(RenderState.BlendStatePropertyTokensWithoutIndex),
        RenderState.Enabled
      ].map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleBlendStateValue = this.RULE("_ruleBlendStateValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleBlendFactor) },
      { ALT: () => this.SUBRULE(this._ruleBlendOperation) },
      { ALT: () => this.SUBRULE(this._ruleFnCall) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.CONSUME(Identifier) }
    ]);
  });

  private _ruleBlendFactor = this.RULE("_ruleBlendFactor", () => {
    this.OR(
      RenderState.BlendFactorTokenList.map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleBlendOperation = this.RULE("_ruleBlendOperation", () => {
    this.OR(
      RenderState.BlendOperationTokenList.map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleBlendPropertyItem = this.RULE("_ruleBlendPropertyItem", () => {
    this.SUBRULE(this._ruleBlendStateProperty);
    this.OPTION(() => {
      this.CONSUME(Symbols.LSquareBracket);
      this.CONSUME(ValueInt);
      this.CONSUME(Symbols.RSquareBracket);
    });
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleBlendStateValue);
  });

  private _ruleBlendStatePropertyDeclaration = this.RULE("_ruleBlendStatePropertyDeclaration", () => {
    this.CONSUME(RenderState.RenderStateTypeTokens.BlendState);
    this.OPTION(() => this.CONSUME(Others.Identifier));
    this.CONSUME(Symbols.LCurly);

    this.MANY(() => {
      this.SUBRULE(this._ruleBlendPropertyItem);
      this.CONSUME(Symbols.Semicolon);
    });

    this.CONSUME(Symbols.RCurly);
  });

  private _ruleDepthStateProperty = this.RULE("_ruleDepthStateProperty", () => {
    this.OR(
      [...Object.values(RenderState.DepthStatePropertyTokens), RenderState.Enabled].map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleDepthStateValue = this.RULE("_ruleDepthStateValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleCompareFunction) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Identifier) }
    ]);
  });

  private _ruleCompareFunction = this.RULE("_ruleCompareFunction", () => {
    this.OR(RenderState.CompareFunctionTokenList.map((token) => ({ ALT: () => this.CONSUME(token) })));
  });

  private _ruleDepthStatePropertyItem = this.RULE("_ruleDepthStatePropertyItem", () => {
    this.SUBRULE(this._ruleDepthStateProperty);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleDepthStateValue);
  });

  private _ruleDepthSatePropertyDeclaration = this.RULE("_ruleDepthSatePropertyDeclaration", () => {
    this.CONSUME(RenderState.RenderStateTypeTokens.DepthState);
    this.OPTION(() => this.CONSUME(Others.Identifier));
    this.CONSUME(Symbols.LCurly);

    this.MANY(() => {
      this.SUBRULE(this._ruleDepthStatePropertyItem);
      this.CONSUME(Symbols.Semicolon);
    });

    this.CONSUME(Symbols.RCurly);
  });

  private _ruleStencilStateProperty = this.RULE("_ruleStencilStateProperty", () => {
    this.OR(
      [...Object.values(RenderState.StencilStatePropertyTokens), RenderState.Enabled].map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleStencilStateValue = this.RULE("_ruleStencilStateValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleCompareFunction) },
      { ALT: () => this.SUBRULE(this._ruleStencilOperation) },
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Identifier) }
    ]);
  });

  private _ruleStencilOperation = this.RULE("_ruleStencilOperation", () => {
    this.OR(
      RenderState.StencilOperationTokenList.map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleStencilStatePropertyItem = this.RULE("_ruleStencilStatePropertyItem", () => {
    this.SUBRULE(this._ruleStencilStateProperty);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleStencilStateValue);
  });

  private _ruleStencilStatePropertyDeclaration = this.RULE("_ruleStencilStatePropertyDeclaration", () => {
    this.CONSUME(RenderState.RenderStateTypeTokens.StencilState);
    this.OPTION(() => this.CONSUME(Others.Identifier));
    this.CONSUME(Symbols.LCurly);

    this.MANY(() => {
      this.SUBRULE(this._ruleStencilStatePropertyItem);
      this.CONSUME(Symbols.Semicolon);
    });

    this.CONSUME(Symbols.RCurly);
  });

  private _ruleRasterStateProperty = this.RULE("_ruleRasterStateProperty", () => {
    this.OR(
      [...Object.values(RenderState.RasterStatePropertyTokens), RenderState.Enabled].map((token) => ({
        ALT: () => this.CONSUME(token)
      }))
    );
  });

  private _ruleRasterStateValue = this.RULE("_ruleRasterStateValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.SUBRULE(this._ruleCullMode) },
      { ALT: () => this.CONSUME(Identifier) }
    ]);
  });

  private _ruleCullMode = this.RULE("_ruleCullMode", () => {
    this.OR(RenderState.CullModeTokenList.map((token) => ({ ALT: () => this.CONSUME(token) })));
  });

  private _ruleRasterStatePropertyItem = this.RULE("_ruleRasterStatePropertyItem", () => {
    this.SUBRULE(this._ruleRasterStateProperty);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleRasterStateValue);
  });

  private _ruleRasterStatePropertyDeclaration = this.RULE("_ruleRasterStatePropertyDeclaration", () => {
    this.CONSUME(RenderState.RenderStateTypeTokens.RasterState);
    this.OPTION(() => this.CONSUME(Others.Identifier));
    this.CONSUME(Symbols.LCurly);

    this.MANY(() => {
      this.SUBRULE(this._ruleRasterStatePropertyItem);
      this.CONSUME(Symbols.Semicolon);
    });

    this.CONSUME(Symbols.RCurly);
  });

  private _consume(idx: number, tokType: TokenType) {
    if (idx === 0) return this.CONSUME1(tokType);
    else if (idx === 1) return this.CONSUME2(tokType);
    else if (idx === 2) return this.CONSUME3(tokType);
    else if (idx === 3) return this.CONSUME4(tokType);
    else if (idx === 4) return this.CONSUME5(tokType);
    else if (idx === 5) return this.CONSUME6(tokType);
    return this.CONSUME7(tokType);
  }

  private _ruleTuple(type: "int" | "float", num: number) {
    const valueToken = type === "int" ? Values.ValueInt : Values.ValueFloat;
    this.CONSUME2(Symbols.LBracket);
    for (let i = 0; i < num - 1; i++) {
      this._consume(i, valueToken);
      this._consume(i, Symbols.Comma);
    }
    this.CONSUME(valueToken);
    this.CONSUME(Symbols.RBracket);
  }

  private _ruleTupleFloat4 = this.RULE("_ruleTupleFloat4", () => this._ruleTuple("float", 4));
  private _ruleTupleFloat3 = this.RULE("_ruleTupleFloat3", () => this._ruleTuple("float", 3));
  private _ruleTupleFloat2 = this.RULE("_ruleTupleFloat2", () => this._ruleTuple("float", 2));

  private _ruleTupleInt4 = this.RULE("_ruleTupleInt4", () => this._ruleTuple("int", 4));
  private _ruleTupleInt3 = this.RULE("_ruleTupleInt3", () => this._ruleTuple("int", 3));
  private _ruleTupleInt2 = this.RULE("_ruleTupleInt2", () => this._ruleTuple("int", 2));
}
