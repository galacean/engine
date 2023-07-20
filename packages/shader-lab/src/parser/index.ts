import { CstParser, Lexer, TokenType } from "chevrotain";
import { Others, Symbols, Types, EditorTypes, Keywords, Values, GLKeywords } from "./tokens";
import { ValueFalse, ValueFloat, ValueInt, ValueTrue } from "./tokens/value";

const allTokens = [
  Others.WhiteSpace,
  Others.CommentLine,
  Others.CommentMultiLine,
  ...Symbols.tokenList,
  ...Keywords.tokenList,
  ...GLKeywords.variableTokenList,
  ...GLKeywords.funcTokenList,
  ...GLKeywords.macroTokenList,
  ...GLKeywords.otherTokenList,
  ...Keywords.tagTokenList,
  ...Values.tokenList,
  ...Types.tokenList,
  ...EditorTypes.tokenList,
  Others.Identifier
];

export class ShaderParser extends CstParser {
  lexer: Lexer;

  constructor() {
    super(allTokens, { maxLookahead: 8 });
    this.lexer = new Lexer(allTokens);

    this.performSelfAnalysis();
  }

  parse(text: string) {
    // TODO: replace include

    const lexingResult = this.lexer.tokenize(text);
    this.input = lexingResult.tokens;
  }

  public ruleShader = this.RULE("_ruleShader", () => {
    this.CONSUME(Keywords.Shader);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this._ruleProperty) }, { ALT: () => this.SUBRULE(this._ruleSubShader) }]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleSubShader = this.RULE("_ruleSubShader", () => {
    this.CONSUME(Keywords.SubShader);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this._ruleShaderPass) },
        { ALT: () => this.SUBRULE(this._ruleTag) },
        { ALT: () => this.SUBRULE(this._ruleRenderStateDeclaration) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
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
        { ALT: () => this.SUBRULE(this._ruleFnVariableDeclaration) },
        { ALT: () => this.SUBRULE(this._ruleSubShaderPassPropertyAssignment) },
        { ALT: () => this.SUBRULE(this._ruleRenderStateDeclaration) },
        { ALT: () => this.SUBRULE(this._ruleFnMacroInclude) },
        { ALT: () => this.SUBRULE(this._ruleFnMacroDefine) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleStruct = this.RULE("_ruleStruct", () => {
    this.CONSUME(GLKeywords.Struct);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this._ruleDeclaration);
      this.CONSUME(Symbols.Semicolon);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleDeclaration = this.RULE("_ruleDeclaration", () => {
    this.SUBRULE(this._ruleVariableType);
    this.CONSUME(Others.Identifier);
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
    this.SUBRULE(this._ruleTagType);
    this.CONSUME(Symbols.Equal);
    this.CONSUME(Values.ValueString);
  });

  private _ruleTagType = this.RULE("_ruleTagType", () => {
    this.OR(
      Keywords.tagTokenList.map((kw) => ({
        ALT: () => this.CONSUME(kw)
      }))
    );
  });

  private _ruleFn = this.RULE("_ruleFn", () => {
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

  private _ruleFnArg = this.RULE("_ruleFnArg", () => {
    this.SUBRULE(this._ruleVariableType);
    this.CONSUME2(Others.Identifier);
  });

  private _ruleFnBody = this.RULE("_ruleFnBody", () => {
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this._ruleFnMacro) }, { ALT: () => this.SUBRULE(this._ruleFnStatement) }]);
    });
  });

  private _ruleFnMacro = this.RULE("_ruleFnMacro", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnMacroDefine) },
      { ALT: () => this.SUBRULE(this._ruleFnMacroInclude) },
      { ALT: () => this.SUBRULE(this._ruleFnMacroCondition) }
    ]);
  });

  private _ruleFnMacroCondition = this.RULE("_ruleFnMacroCondition", () => {
    this.SUBRULE(this._ruleFnMacroConditionDeclare);
    this.CONSUME(Others.Identifier);
    this.SUBRULE(this._ruleFnBody);
    this.OPTION(() => {
      this.SUBRULE(this._ruleFnMacroConditionBranch);
    });
    this.OPTION1(() => {
      this.SUBRULE1(this._ruleFnBody);
    });
    this.CONSUME(GLKeywords.M_ENDIF);
  });

  private _ruleFnMacroConditionDeclare = this.RULE("_ruleFnMacroConditionDeclare", () => {
    this.OR([{ ALT: () => this.CONSUME(GLKeywords.M_IFDEF) }, { ALT: () => this.CONSUME(GLKeywords.M_IFNDEF) }]);
  });

  private _ruleFnMacroConditionBranch = this.RULE("_ruleFnMacroConditionBranch", () => {
    this.SUBRULE(this._ruleFnMacroConditionBranchDeclare);
    this.SUBRULE(this._ruleFnBody);
  });

  private _ruleFnMacroConditionBranchDeclare = this.RULE("_ruleFnMacroConditionBranchDeclare", () => {
    this.OR([{ ALT: () => this.CONSUME(GLKeywords.M_ELSE) }]);
  });

  private _ruleFnMacroDefine = this.RULE("_ruleFnMacroDefine", () => {
    this.CONSUME(GLKeywords.M_DEFINE);
    this.CONSUME(Others.Identifier);
    this.OPTION(() => {
      this.SUBRULE(this._ruleAssignableValue);
    });
  });

  private _ruleAssignableValue = this.RULE("_ruleAssignableValue", () => {
    this.OR([
      { ALT: () => this.CONSUME(Values.ValueTrue) },
      { ALT: () => this.CONSUME(Values.ValueFalse) },
      { ALT: () => this.CONSUME(Values.ValueString) },
      { ALT: () => this.SUBRULE(this._ruleFnAddExpr) },
      { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
      { ALT: () => this.CONSUME(GLKeywords.GLPosition) }
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
      { ALT: () => this.SUBRULE(this._ruleFnParenthesisExpr) },
      { ALT: () => this.SUBRULE(this._ruleNumber) },
      { ALT: () => this.SUBRULE(this._ruleFnCall) },
      { ALT: () => this.SUBRULE(this._ruleFnVariable) }
    ]);
  });

  private _ruleAddOperator = this.RULE("_ruleAddOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.Add) }, { ALT: () => this.CONSUME(Symbols.Minus) }]);
  });

  private _ruleFnParenthesisExpr = this.RULE("_ruleFnParenthesisExpr", () => {
    this.CONSUME1(Symbols.LBracket);
    this.SUBRULE(this._ruleFnAddExpr);
    this.CONSUME(Symbols.RBracket);
  });

  private _ruleNumber = this.RULE("_ruleNumber", () => {
    this.OR([{ ALT: () => this.CONSUME1(ValueInt) }, { ALT: () => this.CONSUME(ValueFloat) }]);
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
      { ALT: () => this.CONSUME(GLKeywords.Pow) },
      { ALT: () => this.CONSUME(GLKeywords.Texture2D) },
      { ALT: () => this.CONSUME(Others.Identifier) }
    ]);
  });

  private _ruleFnVariable = this.RULE("_ruleFnVariable", () => {
    this.CONSUME(Others.Identifier);
    this.MANY(() => {
      this.CONSUME(Symbols.Dot);
      this.CONSUME1(Others.Identifier);
    });
  });

  private _ruleMultiplicationOperator = this.RULE("_ruleMultiplicationOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.Multiply) }, { ALT: () => this.CONSUME(Symbols.Divide) }]);
  });

  private _ruleFnMacroInclude = this.RULE("_ruleFnMacroInclude", () => {
    this.CONSUME(GLKeywords.M_INCLUDE);
    this.CONSUME(Values.ValueString);
  });

  private _ruleFnStatement = this.RULE("_ruleFnStatement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnCall) },
      { ALT: () => this.SUBRULE(this._ruleFnReturnStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnVariableDeclaration) },
      { ALT: () => this.SUBRULE(this._ruleFnConditionStatement) },
      { ALT: () => this.SUBRULE(this._ruleFnAssignStatement) },
      {
        ALT: () => {
          this.CONSUME(GLKeywords.Discard);
          this.CONSUME(Symbols.Semicolon);
        }
      }
    ]);
  });

  private _ruleFnReturnStatement = this.RULE("_ruleFnReturnStatement", () => {
    this.CONSUME(GLKeywords.Return);
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleFnExpression) },
      { ALT: () => this.SUBRULE(this._ruleBoolean) },
      { ALT: () => this.CONSUME(Values.ValueString) }
    ]);

    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnExpression = this.RULE("_ruleFnExpression", () => {
    this.SUBRULE(this._ruleFnAddExpr);
  });

  private _ruleBoolean = this.RULE("_ruleBoolean", () => {
    this.OR([{ ALT: () => this.CONSUME(ValueTrue) }, { ALT: () => this.CONSUME(ValueFalse) }]);
  });

  private _ruleFnVariableDeclaration = this.RULE("_ruleFnVariableDeclaration", () => {
    this.SUBRULE(this._ruleVariableType);
    this.CONSUME(Others.Identifier);
    this.OPTION1(() => {
      this.CONSUME(Symbols.Equal);
      this.SUBRULE(this._ruleFnExpression);
    });
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnConditionStatement = this.RULE("_ruleFnConditionStatement", () => {
    this.CONSUME(GLKeywords.If);
    this.CONSUME1(Symbols.LBracket);
    this.SUBRULE(this._ruleFnRelationExpr);
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

  private _ruleFnRelationExpr = this.RULE("_ruleFnRelationExpr", () => {
    this.SUBRULE(this._ruleFnAddExpr);
    this.SUBRULE(this._ruleRelationOperator);
    this.SUBRULE1(this._ruleFnAddExpr);
  });

  private _ruleRelationOperator = this.RULE("_ruleRelationOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.GreaterThan) }, { ALT: () => this.CONSUME(Symbols.LessThan) }]);
  });

  private _ruleFnBlockStatement = this.RULE("_ruleFnBlockStatement", () => {
    this.CONSUME(Symbols.LCurly);
    this.SUBRULE(this._ruleFnBody);
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleFnAssignStatement = this.RULE("_ruleFnAssignStatement", () => {
    this.SUBRULE(this._ruleFnAssignLO);
    this.SUBRULE(this._ruleFnAssignmentOperator);
    this.SUBRULE(this._ruleFnExpression);
    this.CONSUME(Symbols.Semicolon);
  });

  private _ruleFnAssignLO = this.RULE("_ruleFnAssignLO", () => {
    this.OR([
      { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
      { ALT: () => this.CONSUME(GLKeywords.GLPosition) },
      { ALT: () => this.SUBRULE(this._ruleFnVariable) }
    ]);
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

  private _ruleSubShaderPassPropertyAssignment = this.RULE("_ruleSubShaderPassPropertyAssignment", () => {
    this.SUBRULE(this._ruleShaderPassPropertyType);
    this.CONSUME(Symbols.Equal);
    this.CONSUME(Others.Identifier);
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
    this.OR([
      { ALT: () => this.CONSUME(Keywords.BlendState) },
      { ALT: () => this.CONSUME(Keywords.DepthState) },
      { ALT: () => this.CONSUME(Keywords.RasterState) },
      { ALT: () => this.CONSUME(Keywords.StencilState) }
    ]);
  });

  private _ruleRenderStateDeclaration = this.RULE("_ruleRenderStateDeclaration", () => {
    this.SUBRULE(this._ruleRenderStateType);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this._ruleStatePropertyAssign);
      this.CONSUME(Symbols.Semicolon);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _ruleStatePropertyAssign = this.RULE("_ruleStatePropertyAssign", () => {
    this.SUBRULE(this._ruleStateProperty);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._ruleAssignableValue);
  });

  private _ruleStateProperty = this.RULE("_ruleStateProperty", () => {
    this.OR([
      { ALT: () => this.CONSUME(Keywords.Enabled) },
      { ALT: () => this.CONSUME(Keywords.DestColorBlendFactor) },
      { ALT: () => this.CONSUME(Keywords.SrcColorBlendFactor) }
    ]);
  });

  private _ruleProperty = this.RULE("_ruleProperty", () => {
    this.CONSUME(Keywords.EditorProperties);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this._rulePropertyItem);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private _rulePropertyItem = this.RULE("_rulePropertyItem", () => {
    this.CONSUME(Others.Identifier);
    this.CONSUME9(Symbols.LBracket);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.Comma);
    this.SUBRULE(this._rulePropertyItemType);
    this.CONSUME(Symbols.RBracket);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this._rulePropertyItemValue);
    this.CONSUME(Symbols.Semicolon);
  });

  private _rulePropertyItemType = this.RULE("_rulePropertyItemType", () => {
    this.OR([
      ...EditorTypes.tokenList
        .filter((item) => item.name !== "Range")
        .map((item) => ({
          ALT: () => this.CONSUME(item)
        })),
      { ALT: () => this.SUBRULE(this._ruleVariableType) },
      { ALT: () => this.SUBRULE(this._ruleRange) }
    ]);
  });

  private _ruleRange = this.RULE("_ruleRange", () => {
    this.CONSUME(EditorTypes.TypeRange);
    this.CONSUME2(Symbols.LBracket);
    this.CONSUME(Values.ValueInt);
    this.CONSUME(Symbols.Comma);
    this.CONSUME1(Values.ValueInt);
    this.CONSUME(Symbols.RBracket);
  });

  private _rulePropertyItemValue = this.RULE("_rulePropertyItemValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this._ruleTupleFloat4) },
      { ALT: () => this.SUBRULE(this._ruleTupleFloat3) },
      { ALT: () => this.SUBRULE(this._ruleTupleFloat2) },
      { ALT: () => this.SUBRULE(this._ruleTupleInt4) },
      { ALT: () => this.SUBRULE(this._ruleTupleInt3) },
      { ALT: () => this.SUBRULE(this._ruleTupleInt2) },
      { ALT: () => this.CONSUME(Values.ValueTrue) },
      { ALT: () => this.CONSUME(Values.ValueFalse) },
      { ALT: () => this.CONSUME1(Values.ValueInt) },
      { ALT: () => this.CONSUME(Values.ValueString) },
      { ALT: () => this.CONSUME(Values.ValueFloat) }
    ]);
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
