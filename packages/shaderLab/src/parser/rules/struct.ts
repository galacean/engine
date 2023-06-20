import { CstParser } from "chevrotain";
import { Others, Symbols, GLKeywords } from "../tokens";
import { ALL_RULES } from "./common";
import { IShaderParser } from "./interface";

function RuleStruct(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(GLKeywords.Struct);
  this.CONSUME(Others.Identifier);
  this.CONSUME(Symbols.LCurly);
  this.MANY(() => {
    this.SUBRULE($.RuleDeclaration);
    this.CONSUME(Symbols.Semicolon);
  });
  this.CONSUME(Symbols.RCurly);
}

ALL_RULES.push({ name: "RuleStruct", fn: RuleStruct });
