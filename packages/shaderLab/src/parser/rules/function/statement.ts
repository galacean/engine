import { CstParser } from "chevrotain";
import { Others, Symbols, GLKeywords, Values } from "../../tokens";
import { ALL_RULES } from "../common";
import { IShaderParser } from "../interface";

function RuleFnVariableDeclaration(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleVariableType);
  this.CONSUME(Others.Identifier);
  this.OPTION1(() => {
    this.CONSUME(Symbols.Equal);
    this.SUBRULE($.RuleFnExpression);
  });
  this.CONSUME(Symbols.Semicolon);
}
ALL_RULES.push({
  name: "RuleFnVariableDeclaration",
  fn: RuleFnVariableDeclaration
});

function RuleFnStatement(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    { ALT: () => this.SUBRULE($.RuleFnCall) },
    { ALT: () => this.SUBRULE($.RuleFnReturnStatement) },
    { ALT: () => this.SUBRULE($.RuleFnVariableDeclaration) },
    { ALT: () => this.SUBRULE($.RuleFnConditionStatement) },
    { ALT: () => this.SUBRULE($.RuleFnAssignStatement) },
    {
      ALT: () => {
        this.CONSUME(GLKeywords.Discard);
        this.CONSUME(Symbols.Semicolon);
      }
    }
  ]);
}
ALL_RULES.push({
  name: "RuleFnStatement",
  fn: RuleFnStatement
});

function RuleFnAssignStatement(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleFnAssignLO);
  this.SUBRULE($.RuleFnAssignmentOperator);
  this.SUBRULE($.RuleFnExpression);
  this.CONSUME(Symbols.Semicolon);
}
ALL_RULES.push({
  name: "RuleFnAssignStatement",
  fn: RuleFnAssignStatement
});

function RuleFnAssignmentOperator(this: CstParser) {
  this.OR([
    { ALT: () => this.CONSUME(Symbols.Equal) },
    { ALT: () => this.CONSUME(Symbols.MultiEqual) },
    { ALT: () => this.CONSUME(Symbols.DivideEqual) },
    { ALT: () => this.CONSUME(Symbols.AddEqual) },
    { ALT: () => this.CONSUME(Symbols.MinusEqual) }
  ]);
}
ALL_RULES.push({
  name: "RuleFnAssignmentOperator",
  fn: RuleFnAssignmentOperator
});

function RuleFnAssignLO(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
    { ALT: () => this.CONSUME(GLKeywords.GLPosition) },
    { ALT: () => this.SUBRULE($.RuleFnVariable) }
  ]);
}
ALL_RULES.push({
  name: "RuleFnAssignLO",
  fn: RuleFnAssignLO
});

function RuleFnVariable(this: CstParser) {
  this.CONSUME(Others.Identifier);
  this.MANY(() => {
    this.CONSUME(Symbols.Dot);
    this.CONSUME1(Others.Identifier);
  });
}
ALL_RULES.push({ name: "RuleFnVariable", fn: RuleFnVariable });

function RuleFnBlockStatement(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(Symbols.LCurly);
  this.SUBRULE($.RuleFnBody);
  this.CONSUME(Symbols.RCurly);
}
ALL_RULES.push({ name: "RuleFnBlockStatement", fn: RuleFnBlockStatement });

function RuleFnConditionStatement(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(GLKeywords.If);
  this.CONSUME1(Symbols.LBracket);
  this.SUBRULE($.RuleFnRelationExpr);
  this.CONSUME(Symbols.RBracket);
  this.SUBRULE($.RuleFnBlockStatement);
  this.MANY(() => {
    this.CONSUME(GLKeywords.Else);
    this.SUBRULE($.RuleFnConditionStatement);
  });
  this.OPTION(() => {
    this.CONSUME1(GLKeywords.Else);
    this.SUBRULE1($.RuleFnBlockStatement);
  });
}
ALL_RULES.push({
  name: "RuleFnConditionStatement",
  fn: RuleFnConditionStatement
});

function RuleFnReturnStatement(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(GLKeywords.Return);
  this.OR([
    { ALT: () => this.SUBRULE($.RuleFnExpression) },
    { ALT: () => this.SUBRULE($.RuleBoolean) },
    { ALT: () => this.CONSUME(Values.ValueString) }
  ]);

  this.CONSUME(Symbols.Semicolon);
}
ALL_RULES.push({ name: "RuleFnReturnStatement", fn: RuleFnReturnStatement });

function RuleFnReturnVariable(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    ...Values.tokenList.map((item) => ({ ALT: () => this.CONSUME(item) })),
    { ALT: () => this.SUBRULE($.RuleFnVariable) }
  ]);
}
ALL_RULES.push({ name: "RuleFnReturnVariable", fn: RuleFnReturnVariable });
