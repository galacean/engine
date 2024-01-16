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

export const SelfAdd = createToken({ name: "SelfAdd", pattern: /\+\+/, label: "++" });
export const SelfMinus = createToken({ name: "SelfMinus", pattern: /\-\-/, label: "--" });

export const Exp = createToken({ name: "Expo", pattern: /e[-+]?\d+/, label: "exp" });
export const Negative = createToken({ name: "Negative", pattern: /\!/, label: "!" });

export const tokenList = [
  SelfAdd,
  SelfMinus,
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
  Exp,
  Negative
];

const GreaterThan = createToken({
  name: "SymbolGreaterThan",
  pattern: /\>/,
  label: ">"
});
const GreaterEqual = createToken({ name: "SymbolGreaterEqual", pattern: /\>=/, label: ">=" });
const LessThan = createToken({
  name: "SymbolLessThan",
  pattern: /\</,
  label: "<"
});
const LessEqual = createToken({ name: "SymbolLessEqual", pattern: /\<=/, label: "<=" });
const EqualThan = createToken({ name: "SymbolEqualThan", pattern: /==/, label: "==" });
const NotEqual = createToken({ name: "SymbolNotEqual", pattern: /\!=/, label: "!=" });
const AND = createToken({ name: "AND", pattern: /\&\&/, label: "&&" });
const OR = createToken({ name: "OR", pattern: /\|\|/, label: "||" });
const BitwiseOR = createToken({ name: "BitwiseOR", pattern: /\|/, label: "|" });
const BitwiseAND = createToken({ name: "BitwiseAND", pattern: /\&/, label: "&" });
export const RelationTokenList = [
  GreaterEqual,
  GreaterThan,
  LessEqual,
  LessThan,
  EqualThan,
  NotEqual,
  AND,
  OR,
  BitwiseAND,
  BitwiseOR
];
