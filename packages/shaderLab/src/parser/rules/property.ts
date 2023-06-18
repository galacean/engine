import { CstParser } from "chevrotain";
import { EditorTypes, Keywords, Others, Symbols, Values } from "../tokens";
import { ALL_RULES } from "./common";
import { IShaderParser } from "./@types";

export function RuleProteryItem(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(Others.Identifier);
  this.CONSUME9(Symbols.LBracket);
  this.CONSUME(Values.ValueString);
  this.CONSUME(Symbols.Comma);
  this.SUBRULE($.RulePropertyItemType);
  this.CONSUME(Symbols.RBracket);
  this.CONSUME(Symbols.Equal);
  this.SUBRULE($.RulePropertyItemValue);
  this.CONSUME(Symbols.Semicolon);
}
ALL_RULES.push({ name: "RuleProteryItem", fn: RuleProteryItem });

function RulePropertyItemType(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    ...EditorTypes.tokenList
      .filter((item) => item.name !== "Range")
      .map((item) => ({
        ALT: () => this.CONSUME(item)
      })),
    { ALT: () => this.SUBRULE($.RuleVariableType) },
    { ALT: () => this.SUBRULE($.RuleRange) }
  ]);
}
ALL_RULES.push({ name: "RulePropertyItemType", fn: RulePropertyItemType });

function RulePropertyItemValue(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.OR([
    { ALT: () => this.SUBRULE($.TupleFloat4) },
    { ALT: () => this.SUBRULE($.TupleFloat3) },
    { ALT: () => this.SUBRULE($.TupleFloat2) },
    { ALT: () => this.SUBRULE($.TupleInt4) },
    { ALT: () => this.SUBRULE($.TupleInt3) },
    { ALT: () => this.SUBRULE($.TupleInt2) },
    { ALT: () => this.CONSUME(Values.ValueTrue) },
    { ALT: () => this.CONSUME(Values.ValueFalse) },
    { ALT: () => this.CONSUME1(Values.ValueInt) },
    { ALT: () => this.CONSUME(Values.ValueString) },
    { ALT: () => this.CONSUME(Values.ValueFloat) }
  ]);
}
ALL_RULES.push({ name: "RulePropertyItemValue", fn: RulePropertyItemValue });

export function RuleRange(this: CstParser) {
  this.CONSUME(EditorTypes.TypeRange);
  this.CONSUME2(Symbols.LBracket);
  this.CONSUME(Values.ValueInt);
  this.CONSUME(Symbols.Comma);
  this.CONSUME1(Values.ValueInt);
  this.CONSUME(Symbols.RBracket);
}

ALL_RULES.push({ name: "RuleRange", fn: RuleRange });

export function RuleProperty(this: CstParser) {
  const $ = this as any as IShaderParser;

  this.CONSUME(Keywords.EditorProperties);
  this.CONSUME(Symbols.LCurly);
  this.MANY(() => {
    this.SUBRULE($.RuleProteryItem);
  });
  this.CONSUME(Symbols.RCurly);
}

ALL_RULES.push({ name: "RuleProperty", fn: RuleProperty });
