import { testCaseList } from "./test-case";
// @ts-ignore
import { ShaderLib } from "@galacean/engine-core";
import { expect } from "chai";
import { readFileSync } from "fs";
import { Preprocessor } from "@galacean/engine-shader-lab/dist/main.editor";
import { join } from "path";

const includedSource = readFileSync(join(__dirname, "test-case/included.txt")).toString();
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
