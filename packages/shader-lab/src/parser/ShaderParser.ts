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

  public RuleShader = this.RULE("RuleShader", () => {
    this.CONSUME(Keywords.Shader);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this.RuleProperty) }, { ALT: () => this.SUBRULE(this.RuleSubShader) }]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleSubShader = this.RULE("RuleSubShader", () => {
    this.CONSUME(Keywords.SubShader);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.RuleShaderPass) },
        { ALT: () => this.SUBRULE(this.RuleTag) },
        { ALT: () => this.SUBRULE(this.RuleRenderStateDeclaration) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleShaderPass = this.RULE("RuleShaderPass", () => {
    this.CONSUME(Keywords.Pass);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.RuleTag) },
        { ALT: () => this.SUBRULE(this.RuleStruct) },
        { ALT: () => this.SUBRULE(this.RuleFn) },
        { ALT: () => this.SUBRULE(this.RuleFnVariableDeclaration) },
        { ALT: () => this.SUBRULE(this.SubShaderPassPropertyAssignment) },
        { ALT: () => this.SUBRULE(this.RuleRenderStateDeclaration) },
        { ALT: () => this.SUBRULE(this.RuleFnMacroInclude) },
        { ALT: () => this.SUBRULE(this.RuleFnMacroDefine) }
      ]);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleStruct = this.RULE("RuleStruct", () => {
    this.CONSUME(GLKeywords.Struct);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this.RuleDeclaration);
      this.CONSUME(Symbols.Semicolon);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleDeclaration = this.RULE("RuleDeclaration", () => {
    this.SUBRULE(this.RuleVariableType);
    this.CONSUME(Others.Identifier);
  });

  private RuleVariableType = this.RULE("RuleVariableType", () => {
    const types = Types.tokenList.map((item) => ({
      ALT: () => this.CONSUME(item)
    }));

    this.OR([...types, { ALT: () => this.CONSUME(Others.Identifier) }]);
  });

  private RuleTag = this.RULE("RuleTag", () => {
    this.CONSUME(Keywords.Tags);
    this.CONSUME(Symbols.LCurly);
    this.MANY_SEP({
      DEF: () => {
        this.SUBRULE(this.RuleTagAssignment);
      },
      SEP: Symbols.Comma
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleTagAssignment = this.RULE("RuleTagAssignment", () => {
    this.SUBRULE(this.RuleTagType);
    this.CONSUME(Symbols.Equal);
    this.CONSUME(Values.ValueString);
  });

  private RuleTagType = this.RULE("RuleTagType", () => {
    this.OR(
      Keywords.tagTokenList.map((kw) => ({
        ALT: () => this.CONSUME(kw)
      }))
    );
  });

  private RuleFn = this.RULE("RuleFn", () => {
    this.SUBRULE(this.RuleFnReturnType);
    this.CONSUME1(Others.Identifier);
    this.CONSUME1(Symbols.LBracket);
    this.MANY_SEP({
      SEP: Symbols.Comma,
      DEF: () => this.SUBRULE(this.RuleFnArg)
    });
    this.CONSUME(Symbols.RBracket);
    this.CONSUME(Symbols.LCurly);
    this.SUBRULE(this.RuleFnBody);
    this.CONSUME(Symbols.RCurly);
  });

  private RuleFnReturnType = this.RULE("RuleFnReturnType", () => {
    this.OR([{ ALT: () => this.SUBRULE(this.RuleVariableType) }, { ALT: () => this.CONSUME(GLKeywords.Void) }]);
  });

  private RuleFnArg = this.RULE("RuleFnArg", () => {
    this.SUBRULE(this.RuleVariableType);
    this.CONSUME2(Others.Identifier);
  });

  private RuleFnBody = this.RULE("RuleFnBody", () => {
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this.RuleFnMacro) }, { ALT: () => this.SUBRULE(this.RuleFnStatement) }]);
    });
  });

  private RuleFnMacro = this.RULE("RuleFnMacro", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.RuleFnMacroDefine) },
      { ALT: () => this.SUBRULE(this.RuleFnMacroInclude) },
      { ALT: () => this.SUBRULE(this.RuleFnMacroCondition) }
    ]);
  });

  private RuleFnMacroCondition = this.RULE("RuleFnMacroCondition", () => {
    this.SUBRULE(this.RuleFnMacroConditionDeclare);
    this.CONSUME(Others.Identifier);
    this.SUBRULE(this.RuleFnBody);
    this.OPTION(() => {
      this.SUBRULE(this.RuleFnMacroConditionBranch);
    });
    this.OPTION1(() => {
      this.SUBRULE1(this.RuleFnBody);
    });
    this.CONSUME(GLKeywords.M_ENDIF);
  });

  private RuleFnMacroConditionDeclare = this.RULE("RuleFnMacroConditionDeclare", () => {
    this.OR([{ ALT: () => this.CONSUME(GLKeywords.M_IFDEF) }, { ALT: () => this.CONSUME(GLKeywords.M_IFNDEF) }]);
  });

  private RuleFnMacroConditionBranch = this.RULE("RuleFnMacroConditionBranch", () => {
    this.SUBRULE(this.RuleFnMacroConditionBranchDeclare);
    this.SUBRULE(this.RuleFnBody);
  });

  private RuleFnMacroConditionBranchDeclare = this.RULE("RuleFnMacroConditionBranchDeclare", () => {
    this.OR([{ ALT: () => this.CONSUME(GLKeywords.M_ELSE) }]);
  });

  private RuleFnMacroDefine = this.RULE("RuleFnMacroDefine", () => {
    this.CONSUME(GLKeywords.M_DEFINE);
    this.CONSUME(Others.Identifier);
    this.OPTION(() => {
      this.SUBRULE(this.RuleAssignableValue);
    });
  });

  private RuleAssignableValue = this.RULE("RuleAssignableValue", () => {
    this.OR([
      { ALT: () => this.CONSUME(Values.ValueTrue) },
      { ALT: () => this.CONSUME(Values.ValueFalse) },
      { ALT: () => this.CONSUME(Values.ValueString) },
      { ALT: () => this.SUBRULE(this.RuleFnAddExpr) },
      { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
      { ALT: () => this.CONSUME(GLKeywords.GLPosition) }
    ]);
  });

  private RuleFnAddExpr = this.RULE("RuleFnAddExpr", () => {
    this.SUBRULE(this.RuleFnMultiplicationExpr);
    this.MANY(() => {
      this.SUBRULE(this.RuleAddOperator);
      this.SUBRULE2(this.RuleFnMultiplicationExpr);
    });
  });

  private RuleFnMultiplicationExpr = this.RULE("RuleFnMultiplicationExpr", () => {
    this.SUBRULE(this.RuleFnAtomicExpr);
    this.MANY(() => {
      this.SUBRULE(this.RuleMultiplicationOperator);
      this.SUBRULE2(this.RuleFnAtomicExpr);
    });
  });

  private RuleFnAtomicExpr = this.RULE("RuleFnAtomicExpr", () => {
    this.OPTION(() => this.SUBRULE(this.RuleAddOperator));
    this.OR([
      { ALT: () => this.SUBRULE(this.RuleFnParenthesisExpr) },
      { ALT: () => this.SUBRULE(this.RuleNumber) },
      { ALT: () => this.SUBRULE(this.RuleFnCall) },
      { ALT: () => this.SUBRULE(this.RuleFnVariable) }
    ]);
  });

  private RuleAddOperator = this.RULE("RuleAddOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.Add) }, { ALT: () => this.CONSUME(Symbols.Minus) }]);
  });

  private RuleFnParenthesisExpr = this.RULE("RuleFnParenthesisExpr", () => {
    this.CONSUME1(Symbols.LBracket);
    this.SUBRULE(this.RuleFnAddExpr);
    this.CONSUME(Symbols.RBracket);
  });

  private RuleNumber = this.RULE("RuleNumber", () => {
    this.OR([{ ALT: () => this.CONSUME1(ValueInt) }, { ALT: () => this.CONSUME(ValueFloat) }]);
  });

  private RuleFnCall = this.RULE("RuleFnCall", () => {
    this.SUBRULE(this.RuleFnCallVariable);
    this.CONSUME1(Symbols.LBracket);
    this.MANY_SEP({
      SEP: Symbols.Comma,
      DEF: () => {
        this.SUBRULE(this.RuleAssignableValue);
      }
    });
    this.CONSUME(Symbols.RBracket);
  });

  private RuleFnCallVariable = this.RULE("RuleFnCallVariable", () => {
    this.OR([
      ...Types.tokenList.map((item) => ({ ALT: () => this.CONSUME(item) })),
      { ALT: () => this.CONSUME(GLKeywords.Pow) },
      { ALT: () => this.CONSUME(GLKeywords.Texture2D) },
      { ALT: () => this.CONSUME(Others.Identifier) }
    ]);
  });

  private RuleFnVariable = this.RULE("RuleFnVariable", () => {
    this.CONSUME(Others.Identifier);
    this.MANY(() => {
      this.CONSUME(Symbols.Dot);
      this.CONSUME1(Others.Identifier);
    });
  });

  private RuleMultiplicationOperator = this.RULE("RuleMultiplicationOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.Multiply) }, { ALT: () => this.CONSUME(Symbols.Divide) }]);
  });

  private RuleFnMacroInclude = this.RULE("RuleFnMacroInclude", () => {
    this.CONSUME(GLKeywords.M_INCLUDE);
    this.CONSUME(Values.ValueString);
  });

  private RuleFnStatement = this.RULE("RuleFnStatement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.RuleFnCall) },
      { ALT: () => this.SUBRULE(this.RuleFnReturnStatement) },
      { ALT: () => this.SUBRULE(this.RuleFnVariableDeclaration) },
      { ALT: () => this.SUBRULE(this.RuleFnConditionStatement) },
      { ALT: () => this.SUBRULE(this.RuleFnAssignStatement) },
      {
        ALT: () => {
          this.CONSUME(GLKeywords.Discard);
          this.CONSUME(Symbols.Semicolon);
        }
      }
    ]);
  });

  private RuleFnReturnStatement = this.RULE("RuleFnReturnStatement", () => {
    this.CONSUME(GLKeywords.Return);
    this.OR([
      { ALT: () => this.SUBRULE(this.RuleFnExpression) },
      { ALT: () => this.SUBRULE(this.RuleBoolean) },
      { ALT: () => this.CONSUME(Values.ValueString) }
    ]);

    this.CONSUME(Symbols.Semicolon);
  });

  private RuleFnExpression = this.RULE("RuleFnExpression", () => {
    this.SUBRULE(this.RuleFnAddExpr);
  });

  private RuleBoolean = this.RULE("RuleBoolean", () => {
    this.OR([{ ALT: () => this.CONSUME(ValueTrue) }, { ALT: () => this.CONSUME(ValueFalse) }]);
  });

  private RuleFnVariableDeclaration = this.RULE("RuleFnVariableDeclaration", () => {
    this.SUBRULE(this.RuleVariableType);
    this.CONSUME(Others.Identifier);
    this.OPTION1(() => {
      this.CONSUME(Symbols.Equal);
      this.SUBRULE(this.RuleFnExpression);
    });
    this.CONSUME(Symbols.Semicolon);
  });

  private RuleFnConditionStatement = this.RULE("RuleFnConditionStatement", () => {
    this.CONSUME(GLKeywords.If);
    this.CONSUME1(Symbols.LBracket);
    this.SUBRULE(this.RuleFnRelationExpr);
    this.CONSUME(Symbols.RBracket);
    this.SUBRULE(this.RuleFnBlockStatement);
    this.MANY(() => {
      this.CONSUME(GLKeywords.Else);
      this.SUBRULE(this.RuleFnConditionStatement);
    });
    this.OPTION(() => {
      this.CONSUME1(GLKeywords.Else);
      this.SUBRULE1(this.RuleFnBlockStatement);
    });
  });

  private RuleFnRelationExpr = this.RULE("RuleFnRelationExpr", () => {
    this.SUBRULE(this.RuleFnAddExpr);
    this.SUBRULE(this.RuleRelationOperator);
    this.SUBRULE1(this.RuleFnAddExpr);
  });

  private RuleRelationOperator = this.RULE("RuleRelationOperator", () => {
    this.OR([{ ALT: () => this.CONSUME(Symbols.GreaterThan) }, { ALT: () => this.CONSUME(Symbols.LessThan) }]);
  });

  private RuleFnBlockStatement = this.RULE("RuleFnBlockStatement", () => {
    this.CONSUME(Symbols.LCurly);
    this.SUBRULE(this.RuleFnBody);
    this.CONSUME(Symbols.RCurly);
  });

  private RuleFnAssignStatement = this.RULE("RuleFnAssignStatement", () => {
    this.SUBRULE(this.RuleFnAssignLO);
    this.SUBRULE(this.RuleFnAssignmentOperator);
    this.SUBRULE(this.RuleFnExpression);
    this.CONSUME(Symbols.Semicolon);
  });

  private RuleFnAssignLO = this.RULE("RuleFnAssignLO", () => {
    this.OR([
      { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
      { ALT: () => this.CONSUME(GLKeywords.GLPosition) },
      { ALT: () => this.SUBRULE(this.RuleFnVariable) }
    ]);
  });

  private RuleFnAssignmentOperator = this.RULE("RuleFnAssignmentOperator", () => {
    this.OR([
      { ALT: () => this.CONSUME(Symbols.Equal) },
      { ALT: () => this.CONSUME(Symbols.MultiEqual) },
      { ALT: () => this.CONSUME(Symbols.DivideEqual) },
      { ALT: () => this.CONSUME(Symbols.AddEqual) },
      { ALT: () => this.CONSUME(Symbols.MinusEqual) }
    ]);
  });

  private SubShaderPassPropertyAssignment = this.RULE("SubShaderPassPropertyAssignment", () => {
    this.SUBRULE(this.RuleShaderPassPropertyType);
    this.CONSUME(Symbols.Equal);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.Semicolon);
  });

  private RuleShaderPassPropertyType = this.RULE("RuleShaderPassPropertyType", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.RuleRenderStateType) },
      { ALT: () => this.CONSUME(Keywords.VertexShader) },
      { ALT: () => this.CONSUME(Keywords.FragmentShader) }
    ]);
  });

  private RuleRenderStateType = this.RULE("RuleRenderStateType", () => {
    this.OR([
      { ALT: () => this.CONSUME(Keywords.BlendState) },
      { ALT: () => this.CONSUME(Keywords.DepthState) },
      { ALT: () => this.CONSUME(Keywords.RasterState) },
      { ALT: () => this.CONSUME(Keywords.StencilState) }
    ]);
  });

  private RuleRenderStateDeclaration = this.RULE("RuleRenderStateDeclaration", () => {
    this.SUBRULE(this.RuleRenderStateType);
    this.CONSUME(Others.Identifier);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this.RuleStatePropertyAssign);
      this.CONSUME(Symbols.Semicolon);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RuleStatePropertyAssign = this.RULE("RuleStatePropertyAssign", () => {
    this.SUBRULE(this.RuleStateProperty);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this.RuleAssignableValue);
  });

  private RuleStateProperty = this.RULE("RuleStateProperty", () => {
    this.OR([
      { ALT: () => this.CONSUME(Keywords.Enabled) },
      { ALT: () => this.CONSUME(Keywords.DestColorBlendFactor) },
      { ALT: () => this.CONSUME(Keywords.SrcColorBlendFactor) }
    ]);
  });

  private RuleProperty = this.RULE("RuleProperty", () => {
    this.CONSUME(Keywords.EditorProperties);
    this.CONSUME(Symbols.LCurly);
    this.MANY(() => {
      this.SUBRULE(this.RulePropertyItem);
    });
    this.CONSUME(Symbols.RCurly);
  });

  private RulePropertyItem = this.RULE("RulePropertyItem", () => {
    this.CONSUME(Others.Identifier);
    this.CONSUME9(Symbols.LBracket);
    this.CONSUME(Values.ValueString);
    this.CONSUME(Symbols.Comma);
    this.SUBRULE(this.RulePropertyItemType);
    this.CONSUME(Symbols.RBracket);
    this.CONSUME(Symbols.Equal);
    this.SUBRULE(this.RulePropertyItemValue);
    this.CONSUME(Symbols.Semicolon);
  });

  private RulePropertyItemType = this.RULE("RulePropertyItemType", () => {
    this.OR([
      ...EditorTypes.tokenList
        .filter((item) => item.name !== "Range")
        .map((item) => ({
          ALT: () => this.CONSUME(item)
        })),
      { ALT: () => this.SUBRULE(this.RuleVariableType) },
      { ALT: () => this.SUBRULE(this.RuleRange) }
    ]);
  });

  private RuleRange = this.RULE("RuleRange", () => {
    this.CONSUME(EditorTypes.TypeRange);
    this.CONSUME2(Symbols.LBracket);
    this.CONSUME(Values.ValueInt);
    this.CONSUME(Symbols.Comma);
    this.CONSUME1(Values.ValueInt);
    this.CONSUME(Symbols.RBracket);
  });

  private RulePropertyItemValue = this.RULE("RulePropertyItemValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.TupleFloat4) },
      { ALT: () => this.SUBRULE(this.TupleFloat3) },
      { ALT: () => this.SUBRULE(this.TupleFloat2) },
      { ALT: () => this.SUBRULE(this.TupleInt4) },
      { ALT: () => this.SUBRULE(this.TupleInt3) },
      { ALT: () => this.SUBRULE(this.TupleInt2) },
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

  private _RuleTuple(type: "int" | "float", num: number) {
    const valueToken = type === "int" ? Values.ValueInt : Values.ValueFloat;
    this.CONSUME2(Symbols.LBracket);
    for (let i = 0; i < num - 1; i++) {
      this._consume(i, valueToken);
      this._consume(i, Symbols.Comma);
    }
    this.CONSUME(valueToken);
    this.CONSUME(Symbols.RBracket);
  }

  private TupleFloat4 = this.RULE("TupleFloat4", () => this._RuleTuple("float", 4));
  private TupleFloat3 = this.RULE("TupleFloat3", () => this._RuleTuple("float", 3));
  private TupleFloat2 = this.RULE("TupleFloat2", () => this._RuleTuple("float", 2));

  private TupleInt4 = this.RULE("TupleInt4", () => this._RuleTuple("int", 4));
  private TupleInt3 = this.RULE("TupleInt3", () => this._RuleTuple("int", 3));
  private TupleInt2 = this.RULE("TupleInt2", () => this._RuleTuple("int", 2));
}
