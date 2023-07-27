import { createToken } from "chevrotain";

/** { */
export const LCurly = createToken({ name: "LCurly", pattern: /\{/, label: "{" });
/** } */
export const RCurly = createToken({ name: "RCurly", pattern: /\}/, label: "}" });
/** ( */
export const LBracket = createToken({ name: "LBracket", pattern: /\(/, label: "(" });
/** ) */
export const RBracket = createToken({ name: "RBracket", pattern: /\)/, label: ")" });
/** [ */
export const LSquareBracket = createToken({ name: "LSquareBracket", pattern: /\[/, label: "[" });
/** ] */
export const RSquareBracket = createToken({ name: "RSquareBracket", pattern: /\]/, label: "]" });
/** , */
export const Comma = createToken({ name: "Comma", pattern: /,/, label: "," });
/** : */
export const Colon = createToken({ name: "Colon", pattern: /:/, label: ":" });
/** = */
export const Equal = createToken({ name: "SymbolEqual", pattern: /=/, label: "=" });
/** ; */
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/, label: ";" });
/** . */
export const Dot = createToken({ name: "Dot", pattern: /\./, label: "." });
export const Add = createToken({ name: "SymbolAdd", pattern: /\+/, label: "+" });
export const Minus = createToken({ name: "SymbolMinus", pattern: /\-/, label: "-" });
export const MultiEqual = createToken({
  name: "SymbolMultiEqual",
  pattern: /\*=/,
  label: "*="
});
export const DivideEqual = createToken({
  name: "SymbolDivideEqual",
  pattern: /\/=/,
  label: "/="
});
export const AddEqual = createToken({
  name: "SymbolAddEqual",
  pattern: /\+=/,
  label: "+="
});
export const MinusEqual = createToken({
  name: "SymbolMinusEqual",
  pattern: /\-=/,
  label: "-="
});
export const Multiply = createToken({ name: "SymbolMultiply", pattern: /\*/, label: "*" });
export const Divide = createToken({ name: "SymbolDivide", pattern: /\//, label: "/" });
export const GreaterThan = createToken({
  name: "SymbolGreaterThan",
  pattern: /\>/,
  label: ">"
});
export const LessThan = createToken({
  name: "SymbolLessThan",
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
  LSquareBracket,
  RSquareBracket,
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
