import { CstParser } from "chevrotain";
import { GLKeywords, Others, Symbols } from "../../tokens";
import { ALL_RULES } from "../common";
import { IShaderParser } from "../interface";

export * from "./expression";
export * from "./statement";
export * from "./macro";

function RuleFn(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleFnReturnType);
  this.CONSUME1(Others.Identifier);
  this.CONSUME1(Symbols.LBracket);
  this.MANY_SEP({
    SEP: Symbols.Comma,
    DEF: () => this.SUBRULE($.RuleFnArg)
  });
  this.CONSUME(Symbols.RBracket);
  this.CONSUME(Symbols.LCurly);
  this.SUBRULE($.RuleFnBody);
  this.CONSUME(Symbols.RCurly);
}
ALL_RULES.push({ name: "RuleFn", fn: RuleFn });

function RuleFnArg(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleVariableType);
  this.CONSUME2(Others.Identifier);
}
ALL_RULES.push({ name: "RuleFnArg", fn: RuleFnArg });

function RuleFnReturnType(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([{ ALT: () => this.SUBRULE($.RuleVariableType) }, { ALT: () => this.CONSUME(GLKeywords.Void) }]);
}
ALL_RULES.push({ name: "RuleFnReturnType", fn: RuleFnReturnType });

function RuleFnBody(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.MANY(() => {
    this.OR([{ ALT: () => this.SUBRULE($.RuleFnMacro) }, { ALT: () => this.SUBRULE($.RuleFnStatement) }]);
  });
}
ALL_RULES.push({ name: "RuleFnBody", fn: RuleFnBody });
