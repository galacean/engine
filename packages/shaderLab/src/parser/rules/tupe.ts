import { CstParser } from "chevrotain";
import { Symbols, Values } from "../tokens";
import { ALL_RULES, consume } from "./common";

function RuleTuple(this: CstParser, type: "int" | "float", num: number) {
  const valueToken = type === "int" ? Values.ValueInt : Values.ValueFloat;
  this.CONSUME2(Symbols.LBracket);
  for (let i = 0; i < num - 1; i++) {
    consume.bind(this)(i, valueToken);
    consume.bind(this)(i, Symbols.Comma);
  }
  this.CONSUME(valueToken);
  this.CONSUME(Symbols.RBracket);
}

ALL_RULES.push({
  name: "TupleInt2",
  fn() {
    RuleTuple.bind(this as any as CstParser)("int", 2);
  }
});
ALL_RULES.push({
  name: "TupleInt3",
  fn() {
    // @ts-ignore
    RuleTuple.bind(this)("int", 3);
  }
});
ALL_RULES.push({
  name: "TupleInt4",
  fn() {
    // @ts-ignore
    RuleTuple.bind(this)("int", 4);
  }
});

ALL_RULES.push({
  name: "TupleFloat2",
  fn() {
    // @ts-ignore
    RuleTuple.bind(this)("float", 2);
  }
});
ALL_RULES.push({
  name: "TupleFloat3",
  fn() {
    // @ts-ignore
    RuleTuple.bind(this)("float", 3);
  }
});
ALL_RULES.push({
  name: "TupleFloat4",
  fn() {
    // @ts-ignore
    RuleTuple.bind(this)("float", 4);
  }
});
