import { CstParser, Lexer } from "chevrotain";
import { Others, Symbols, Types, EditorTypes, Keywords, Values, GLKeywords } from "./tokens";
import { ALL_RULES } from "./rules";

const allTokens = [
  Others.WhiteSpace,
  Others.CommentLine,
  Others.CommentMultiLine,
  ...Symbols.tokenList,
  ...Keywords.tokenList,
  ...GLKeywords.variableTokenList,
  ...GLKeywords.funcTokenList,
  ...GLKeywords.macroTokenList,
  ...GLKeywords.otherTokenList,
  ...Keywords.tagTokenList,
  ...Values.tokenList,
  ...Types.tokenList,
  ...EditorTypes.tokenList,
  Others.Identifier
];

export class ShaderParser extends CstParser {
  lexer: Lexer;

  constructor() {
    super(allTokens, { maxLookahead: 8 });
    this.lexer = new Lexer(allTokens);
    ALL_RULES.forEach((rule) => {
      this.RULE(rule.name, rule.fn.bind(this));
    });
    this.performSelfAnalysis();
  }

  parse(text: string) {
    // TODO: replace include

    const lexingResult = this.lexer.tokenize(text);
    this.input = lexingResult.tokens;
  }
}
