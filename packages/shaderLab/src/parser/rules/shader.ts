import { CstParser } from "chevrotain";
import { Symbols, Keywords, Values } from "../tokens";
import { ALL_RULES } from "./common";
import { IShaderParser } from "./@types";

export function RuleShader(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(Keywords.Shader);
  this.CONSUME(Values.ValueString);
  this.CONSUME(Symbols.LCurly);
  this.MANY(() => {
    this.OR([{ ALT: () => this.SUBRULE($.RuleProperty) }, { ALT: () => this.SUBRULE($.RuleSubShader) }]);
  });
  this.CONSUME(Symbols.RCurly);
}

ALL_RULES.push({ name: "RuleShader", fn: RuleShader });
