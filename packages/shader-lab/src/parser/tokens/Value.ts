import { createToken } from "chevrotain";

export const ValueInt = createToken({ name: "ValueInt", pattern: /-?\d+/ });
export const ValueFloat = createToken({ name: "ValueFloat", pattern: /-?\d+\.\d+/ });
export const ValueString = createToken({
  name: "ValueString",
  pattern: /"[\w-\s/\.]*"/
});
export const ValueTrue = createToken({ name: "ValueTrue", pattern: /true/ });
export const ValueFalse = createToken({ name: "ValueFalse", pattern: /false/ });

export const tokenList = [ValueFloat, ValueInt, ValueString, ValueTrue, ValueFalse];
