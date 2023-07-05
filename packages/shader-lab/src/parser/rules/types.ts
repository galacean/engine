import { CstParser } from "chevrotain";
import { Others, Types } from "../tokens";
import { ALL_RULES } from "./common";

function RuleVariableType(this: CstParser) {
  const types = Types.tokenList.map((item) => ({
    ALT: () => this.CONSUME(item)
  }));

  this.OR([...types, { ALT: () => this.CONSUME(Others.Identifier) }]);
}
ALL_RULES.push({ name: "RuleVariableType", fn: RuleVariableType });
