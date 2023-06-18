import { CstParser } from "chevrotain";
import { Symbols, Keywords, Values } from "../tokens";
import { ALL_RULES } from "./common";
import { IShaderParser } from "./@types";

function RuleTag(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(Keywords.Tags);
  this.CONSUME(Symbols.LCurly);
  this.MANY_SEP({
    DEF: () => {
      this.SUBRULE($.RuleTagAssignment);
    },
    SEP: Symbols.Comma
  });
  this.CONSUME(Symbols.RCurly);
}
ALL_RULES.push({ name: "RuleTag", fn: RuleTag });

function RuleTagAssignment(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleTagType);
  this.CONSUME(Symbols.Equal);
  this.CONSUME(Values.ValueString);
}
ALL_RULES.push({ name: "RuleTagAssignment", fn: RuleTagAssignment });

function RuleTagType(this: CstParser) {
  this.OR(
    Keywords.tagTokenList.map((kw) => ({
      ALT: () => this.CONSUME(kw)
    }))
  );
}
ALL_RULES.push({ name: "RuleTagType", fn: RuleTagType });
