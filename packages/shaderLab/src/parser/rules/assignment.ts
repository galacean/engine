import { CstParser } from "chevrotain";
import { Keywords, Others, Symbols } from "../tokens";
import { ALL_RULES } from "./common";
import { IShaderParser } from "./interface";

function SubShaderPassPropertyAssignment(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.SUBRULE($.RuleShaderPassPropertyType);
  this.CONSUME(Symbols.Equal);
  this.CONSUME(Others.Identifier);
  this.CONSUME(Symbols.Semicolon);
}
ALL_RULES.push({
  name: "SubShaderPassPropertyAssignment",
  fn: SubShaderPassPropertyAssignment
});

function RuleShaderPassPropertyType(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    { ALT: () => this.SUBRULE($.RuleRenderStateType) },
    { ALT: () => this.CONSUME(Keywords.VertexShader) },
    { ALT: () => this.CONSUME(Keywords.FragmentShader) }
  ]);
}
ALL_RULES.push({
  name: "RuleShaderPassPropertyType",
  fn: RuleShaderPassPropertyType
});
