import { testCaseList } from "./test-case";
import { Preprocessor } from "@galacean/engine-shader-lab";
// @ts-ignore
import { ShaderLib } from "@galacean/engine-core";
import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

const includedSource = readFileSync(join(__dirname, "test-case/included.txt")).toString();
ShaderLib["TEST"] = includedSource;

describe("Preprocessor", () => {
  for (const testCase of testCaseList) {
    it(testCase.name, () => {
      const preprocessor = new Preprocessor(testCase.source, ShaderLib);
      const out = preprocessor.process();
      expect(out).to.equal(testCase.compare);
    });
  }
});
