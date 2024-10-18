import { testCaseList } from "./test-case";
// @ts-ignore
import { ShaderLib } from "@galacean/engine-core";
import { Preprocessor } from "@galacean/engine-shader-lab/verbose";
import { describe, expect, it } from "vitest";
import { server } from "@vitest/browser/context";
const { readFile } = server.commands;

const includedSource = await readFile("test-case/included.txt");
ShaderLib["TEST"] = includedSource;

describe("Preprocessor", () => {
  for (const testCase of testCaseList) {
    it(testCase.name, () => {
      Preprocessor.reset({});
      const out = Preprocessor.process(testCase.source);
      expect(out).to.equal(testCase.compare);
    });
  }
});
