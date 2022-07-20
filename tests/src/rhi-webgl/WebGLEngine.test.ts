import { expect } from "chai";
import { WebGLEngine, WebCanvas } from "@oasis-engine/rhi-webgl";

describe("webgl engine test", () => {
  it("create a webgl engine", () => {
    const canvas = document.createElement("canvas");
    const engine = new WebGLEngine(canvas);
    expect(engine).not.be.null;
  });
});
// npx cross-env TS_NODE_PROJECT=tsconfig.tests.json nyc --reporter=lcov floss -p tests/src/*.test.ts -r ts-node/register
// npx cross-env TS_NODE_PROJECT=tsconfig.tests.json nyc --reporter=lcov floss --path tests -r ts-node/register
