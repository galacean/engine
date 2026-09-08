import { Lexer, Preprocessor, SymbolTable, type IBaseSymbol } from "@galacean/engine-shader-parser/internal";
import { AnalyzerLexer } from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function inheritedCandidates(lexerType: typeof Lexer, sourceCondition: string, targetCondition: string) {
  const source = `#if ${sourceCondition}
inherited;
#endif
#if ${targetCondition}
overriding;
#endif`;
  const processed = Preprocessor.parseWithErrors(source, "", {}, new Map());
  expect(processed.errors).toEqual([]);
  const tokens = Array.from(new lexerType(processed.content, {}, undefined, processed.conditionalArms).tokenize());
  const symbols = ["inherited", "overriding"].map((name, sourceScope): IBaseSymbol => {
    const token = tokens.find((candidate) => candidate.lexeme === name);
    expect(token, name).toBeDefined();
    expect(token!.branch, name).toHaveLength(1);
    expect(token!.branch[0].sourceArm, name).toBeDefined();
    return {
      ident: "value",
      sourceScope,
      branchSignature: token!.branch,
      isInMacroBranch: true,
      equal(other) {
        return other.ident === this.ident;
      }
    };
  });
  const table = new SymbolTable<IBaseSymbol>();
  for (const symbol of symbols) table.insert(symbol, true, symbol.branchSignature);
  return { inherited: symbols[0], overriding: symbols[1], candidates: table.getSymbols(symbols[0], true, []) };
}

describe.each([
  { name: "runtime", lexerType: Lexer },
  { name: "analyzer", lexerType: AnalyzerLexer }
])("condition error coverage through the $name lexer", ({ lexerType }) => {
  it.each([
    { source: "!defined(B)", target: "!((1 / defined(A)) && defined(B))" },
    { source: "defined(F)", target: "!(1 % defined(D) && 0)" }
  ])("retains an inherited $source declaration when $target may fail evaluation", ({ source, target }) => {
    const { inherited, overriding, candidates } = inheritedCandidates(lexerType, source, target);
    expect(candidates).toHaveLength(2);
    expect(candidates).toContain(inherited);
    expect(candidates).toContain(overriding);
  });

  it("replaces an inherited declaration when the same valid guard covers it", () => {
    const { inherited, overriding, candidates } = inheritedCandidates(lexerType, "!defined(B)", "!defined(B)");
    expect(candidates).toEqual([overriding]);
    expect(candidates).not.toContain(inherited);
  });
});
