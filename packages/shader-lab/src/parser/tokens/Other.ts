import { Lexer, createToken } from "chevrotain";

export const Identifier = createToken({ name: "Identifier", pattern: /[_a-zA-Z][_a-zA-Z0-9]*/ });

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /(\s|\n)+/,
  group: Lexer.SKIPPED
});

export const CommentLine = createToken({
  name: "CommentLine",
  pattern: /\/\/.*\n/,
  group: Lexer.SKIPPED
});

export const CommentMultiLine = createToken({
  name: "CommentMultiLine",
  pattern: /\/\*\*(.|\s)*?\*\//,
  group: Lexer.SKIPPED
});
