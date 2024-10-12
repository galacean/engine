// @ts-ignore
import { BaseScanner } from "@galacean/engine-shader-lab";
import { expect } from "chai";

describe("BaseScanner", () => {
  describe("skipCommentsAndSpace()", () => {
    it("should skip over multi-line comments and proceed to the next token", () => {
      const source = `/* This is a
      multi-line comment */
      nextToken`;
      const scanner = new BaseScanner(source);

      scanner.skipCommentsAndSpace();

      const token = scanner.scanToken();
      expect(token?.lexeme).to.equal("nextToken");
    });

    it("should skip over multiple multi-line comments and spaces", () => {
      const source = `/* First comment */
      /* Second comment */
      
      thirdToken`;
      const scanner = new BaseScanner(source);

      scanner.skipCommentsAndSpace();

      const token = scanner.scanToken();
      expect(token?.lexeme).to.equal("thirdToken");
    });

    it("should handle multi-line comments without leading spaces", () => {
      const source = `/*Comment without leading space*/nextToken`;
      const scanner = new BaseScanner(source);

      scanner.skipCommentsAndSpace();

      const token = scanner.scanToken();
      expect(token?.lexeme).to.equal("nextToken");
    });
  });
});
