import { CstParser, TokenType } from "chevrotain";

export const ALL_RULES: Array<{ name: string; fn: (...arg: any[]) => any }> = [];

export function consume(this: CstParser, idx: number, tokType: TokenType) {
  if (idx === 0) return this.CONSUME1(tokType);
  else if (idx === 1) return this.CONSUME2(tokType);
  else if (idx === 2) return this.CONSUME3(tokType);
  else if (idx === 3) return this.CONSUME4(tokType);
  else if (idx === 4) return this.CONSUME5(tokType);
  else if (idx === 5) return this.CONSUME6(tokType);
  return this.CONSUME7(tokType);
}
