import { testCaseList } from "./test-case";
import { Preprocessor } from "@galacean/engine-shader-lab";
// @ts-ignore
import { ShaderLib } from "@galacean/engine-core";
import { expect } from "chai";

describe("Preprocessor", () => {
  for (const testCase of testCaseList) {
    it(testCase.name, () => {
      const preprocessor = new Preprocessor(testCase.source, ShaderLib);
      const out = preprocessor.process();
      expect(out).to.equal(testCase.compare);
    });
  }
});
