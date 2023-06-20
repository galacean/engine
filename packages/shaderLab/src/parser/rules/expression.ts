import { CstParser } from "chevrotain";
import { GLKeywords, Keywords, Others, Symbols, Types, Values } from "../tokens";
import { ALL_RULES } from "./common";
import { ValueFalse, ValueFloat, ValueInt, ValueTrue } from "../tokens/value";
import { IShaderParser } from "./interface";

function RuleDeclare(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleVariableType);
  this.CONSUME2(Others.Identifier);
}
ALL_RULES.push({ name: "RuleDeclaration", fn: RuleDeclare });

function RuleRenderStateType(this: CstParser) {
  this.OR([
    { ALT: () => this.CONSUME(Keywords.BlendState) },
    { ALT: () => this.CONSUME(Keywords.DepthState) },
    { ALT: () => this.CONSUME(Keywords.RasterState) },
    { ALT: () => this.CONSUME(Keywords.StencilState) }
  ]);
}
ALL_RULES.push({ name: "RuleRenderStateType", fn: RuleRenderStateType });

function RuleStateProperty(this: CstParser) {
  this.OR([
    { ALT: () => this.CONSUME(Keywords.Enabled) },
    { ALT: () => this.CONSUME(Keywords.DestColorBlendFactor) },
    { ALT: () => this.CONSUME(Keywords.SrcColorBlendFactor) }
  ]);
}
ALL_RULES.push({ name: "RuleStateProperty", fn: RuleStateProperty });

function RuleAssignableValue(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    { ALT: () => this.CONSUME(Values.ValueTrue) },
    { ALT: () => this.CONSUME(Values.ValueFalse) },
    { ALT: () => this.CONSUME(Values.ValueString) },
    { ALT: () => this.SUBRULE($.RuleFnAddExpr) },
    { ALT: () => this.CONSUME(GLKeywords.GLFragColor) },
    { ALT: () => this.CONSUME(GLKeywords.GLPosition) }
  ]);
}
ALL_RULES.push({ name: "RuleAssignableValue", fn: RuleAssignableValue });

function RuleRenderStateDeclaration(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleRenderStateType);
  this.CONSUME(Others.Identifier);
  this.CONSUME(Symbols.LCurly);
  this.MANY(() => {
    this.SUBRULE($.RuleStatePropertyAssign);
    this.CONSUME(Symbols.Semicolon);
  });
  this.CONSUME(Symbols.RCurly);
}
ALL_RULES.push({
  name: "RuleRenderStateDeclaration",
  fn: RuleRenderStateDeclaration
});

function RuleStatePropertyAssign(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleStateProperty);
  this.CONSUME(Symbols.Equal);
  this.SUBRULE($.RuleAssignableValue);
}
ALL_RULES.push({
  name: "RuleStatePropertyAssign",
  fn: RuleStatePropertyAssign
});

function RuleNumberWithSign(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OPTION(() => this.SUBRULE($.RuleAddOperator));
  this.SUBRULE($.RuleNumber);
}
ALL_RULES.push({ name: "RuleNumberWithSign", fn: RuleNumberWithSign });

function RuleNumber(this: CstParser) {
  this.OR([{ ALT: () => this.CONSUME1(ValueInt) }, { ALT: () => this.CONSUME(ValueFloat) }]);
}
ALL_RULES.push({ name: "RuleNumber", fn: RuleNumber });

function RuleBoolean(this: CstParser) {
  this.OR([{ ALT: () => this.CONSUME(ValueTrue) }, { ALT: () => this.CONSUME(ValueFalse) }]);
}
ALL_RULES.push({ name: "RuleBoolean", fn: RuleBoolean });

function RuleAddOperator(this: CstParser) {
  this.OR([{ ALT: () => this.CONSUME(Symbols.Add) }, { ALT: () => this.CONSUME(Symbols.Minus) }]);
}
ALL_RULES.push({ name: "RuleAddOperator", fn: RuleAddOperator });

function RuleMultiplcationOperator(this: CstParser) {
  this.OR([{ ALT: () => this.CONSUME(Symbols.Mutiply) }, { ALT: () => this.CONSUME(Symbols.Divide) }]);
}
ALL_RULES.push({
  name: "RuleMultiplcationOperator",
  fn: RuleMultiplcationOperator
});

function RuleRelationOperator(this: CstParser) {
  this.OR([{ ALT: () => this.CONSUME(Symbols.GreaterThan) }, { ALT: () => this.CONSUME(Symbols.LessThan) }]);
}
ALL_RULES.push({
  name: "RuleRelationOperator",
  fn: RuleRelationOperator
});
