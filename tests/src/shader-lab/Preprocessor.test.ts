import { testCaseList } from "./test-case";
// @ts-ignore
import { ShaderLib } from "@galacean/engine-core";
import { PpParser } from "@galacean/engine-shaderlab/verbose";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";
const { readFile } = server.commands;

const includedSource = await readFile("test-case/included.txt");
ShaderLib["TEST"] = includedSource;

describe("Preprocessor", () => {
  for (const testCase of testCaseList) {
    it(testCase.name, () => {
      const out = PpParser.parse(testCase.source, [], []);
      expect(out).to.equal(testCase.compare);
    });
  }
});
