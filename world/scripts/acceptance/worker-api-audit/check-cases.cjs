// Check fixtures against the actual inventory before opening an expensive scene.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "../../../..");
const req = Module.createRequire(root + "/world/package.json");
const apiReq = Module.createRequire(root + "/packages/ai-chat/package.json");
const { outputFiles } = req("esbuild").buildSync({
  stdin: {
    contents:
      'export {AgentJavaScriptChecker} from "./agent-script-checker";export {validateAgentScriptReferences} from "./agent-script-preflight";',
    resolveDir: root + "/packages/ai-chat/src/ai-chat",
    loader: "ts"
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  external: ["typescript"]
});
const compiled = new Module(root + "/packages/ai-chat/audit-check.cjs");
compiled.paths = Module._nodeModulePaths(root + "/packages/ai-chat");
compiled._compile(outputFiles[0].text, compiled.id);
const libraries = {};
const librarySource = fs.readFileSync(root + "/packages/ai-chat/src/script-checking/typecheck-libraries.ts", "utf8");
for (const match of librarySource.matchAll(/typescript\/lib\/(lib[^"?]+)\?raw/g))
  libraries["/" + match[1]] = fs.readFileSync(apiReq.resolve("typescript/lib/" + match[1]), "utf8");
const inventory = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const cases = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const checker = new compiled.exports.AgentJavaScriptChecker(libraries);
let failures = 0,
  checked = 0;
for (const job of cases)
  for (const field of ["source", "verify", "waitUntil"]) {
    if (!job[field]) continue;
    const source = job[field].replaceAll("__RUNTIME_ROOT__", String(inventory.runtimeRoot));
    const error =
      compiled.exports.validateAgentScriptReferences(
        source,
        inventory.tools.map((x) => x.name)
      ) ?? checker.check(source, inventory.modules);
    checked++;
    if (error) {
      failures++;
      console.log(job.id, field, error.message);
    }
  }
checker.dispose();
console.log(JSON.stringify({ checked, failures }));
process.exitCode = failures ? 1 : 0;
