import path from "node:path";
import base from "./modified-engine.config.mjs";
const root = path.resolve(import.meta.dirname, "../../..");
// The source overlay intentionally shares identical compiled Shader programs;
// the native duplicate-Shader rejection contract is not the modified contract.
export default {
  ...base,
  test: {
    ...base.test,
    include: [
      path.join(root, "tests/src/loader/MaterialLoader.test.ts"),
      path.join(root, "packages/modify/tests/MaterialLoaderCompatibility.test.ts")
    ],
    // Native unsupported-field rejection is a different contract. Its original
    // tests remain unchanged and run separately without engineModify.
    testNamePattern: "MaterialLoader (loads|rejects a)|old World loader|ignored editor metadata",
    outputFile: path.join(root, "world/.acceptance/native-material-compatibility.json")
  }
};
