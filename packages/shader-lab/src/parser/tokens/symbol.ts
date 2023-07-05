import { createToken } from "chevrotain";

/** { */
export const LCurly = createToken({ name: "LCurly", pattern: /\{/, label: "{" });
/** } */
export const RCurly = createToken({ name: "RCurly", pattern: /\}/, label: "}" });
/** ( */
export const LBracket = createToken({ name: "LBracket", pattern: /\(/, label: "(" });
/** ) */
export const RBracket = createToken({ name: "RBracket", pattern: /\)/, label: ")" });
/** , */
export const Comma = createToken({ name: "Comma", pattern: /,/, label: "," });
/** : */
export const Colon = createToken({ name: "Colon", pattern: /:/, label: ":" });
/** = */
export const Equal = createToken({ name: "Equal", pattern: /=/, label: "=" });
/** ; */
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/, label: ";" });
/** . */
export const Dot = createToken({ name: "Dot", pattern: /\./, label: "." });
export const Add = createToken({ name: "Add", pattern: /\+/, label: "+" });
export const Minus = createToken({ name: "Minus", pattern: /\-/, label: "-" });
export const MultiEqual = createToken({
  name: "MultiEqual",
  pattern: /\*=/,
  label: "*="
});
export const DivideEqual = createToken({
  name: "DivideEqual",
  pattern: /\/=/,
  label: "/="
});
export const AddEqual = createToken({
  name: "AddEqual",
  pattern: /\+=/,
  label: "+="
});
export const MinusEqual = createToken({
  name: "MinusEqual",
  pattern: /\-=/,
  label: "-="
});
export const Multiply = createToken({ name: "Multiply", pattern: /\*/, label: "*" });
export const Divide = createToken({ name: "Divide", pattern: /\//, label: "/" });
export const GreaterThan = createToken({
  name: "GreaterThan",
  pattern: /\>/,
  label: ">"
});
export const LessThan = createToken({
  name: "LessThan",
  pattern: /\</,
  label: "<"
});

export const tokenList = [
  GreaterThan,
  LessThan,
  LCurly,
  RCurly,
  LBracket,
  RBracket,
  Comma,
  Colon,
  Equal,
  Semicolon,
  MultiEqual,
  DivideEqual,
  AddEqual,
  MinusEqual,
  Add,
  Minus,
  Multiply,
  Divide,
  Dot,
  GreaterThan,
  LessThan
];
