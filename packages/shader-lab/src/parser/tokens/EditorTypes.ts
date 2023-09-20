import { createToken } from "chevrotain";

export const TypeInteger = createToken({
  name: "TypeInteger",
  pattern: /Integer/
});
export const TypeString = createToken({
  name: "TypeString",
  pattern: /String/
});
export const TypeFloat = createToken({ name: "TypeFloat", pattern: /Float/ });
export const TypeRange = createToken({
  name: "Range",
  pattern: /Range/
});

export const tokenList = [TypeInteger, TypeString, TypeFloat, TypeRange];
