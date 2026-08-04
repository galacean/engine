import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(repositoryRoot, "packages/shader-parser");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

for (const legacyField of ["main", "module", "debug", "types"]) {
  assert.equal(packageJson[legacyField], undefined, `root legacy field '${legacyField}' must stay absent`);
}

const npmArgs = ["pack", "--dry-run", "--json"];
const npmExecPath = process.env.npm_execpath;
const packed = npmExecPath
  ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], {
      cwd: packageRoot,
      encoding: "utf8"
    })
  : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, {
      cwd: packageRoot,
      encoding: "utf8",
      shell: process.platform === "win32"
    });
assert.equal(packed.status, 0, packed.stderr || packed.stdout);
const packedFiles = new Set(JSON.parse(packed.stdout)[0].files.map((file) => file.path));
for (const requiredFile of [
  "package.json",
  "internal/package.json",
  "internal/verbose/package.json",
  "dist/main.js",
  "dist/main.verbose.js",
  "types/runtime.d.ts",
  "types/index.d.ts"
]) {
  assert.equal(packedFiles.has(requiredFile), true, `packed parser is missing '${requiredFile}'`);
}

const runtimeForbiddenTerms = [
  "DiagnosticType",
  "ShaderValidator",
  "ShaderAnalysisInfo",
  "AmbiguousMacro",
  "NonConstInitializer",
  "MissingVertexPosition",
  "diagnosticsEnabled",
  "branchAnalysisEnabled",
  "reportError",
  "reportWarning",
  "reportRedefinition",
  "reportBranchAvailability",
  "reportBranchAmbiguity",
  "_VERBOSE",
  "jscc"
];
for (const runtimeFile of ["dist/main.js", "dist/module.js"]) {
  const runtimeSource = readFileSync(join(packageRoot, runtimeFile), "utf8");
  const leakedTerms = runtimeForbiddenTerms.filter((term) => runtimeSource.includes(term));
  assert.deepEqual(leakedTerms, [], `${runtimeFile} contains analyzer-only terms: ${leakedTerms.join(", ")}`);
}

const packageRequire = createRequire(join(packageRoot, "package-boundary-smoke.cjs"));
assert.throws(
  () => packageRequire.resolve("@galacean/engine-shader-parser"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "the parser root must not resolve"
);
assert.equal(packageRequire.resolve("@galacean/engine-shader-parser/internal"), join(packageRoot, "dist/main.js"));
assert.equal(
  packageRequire.resolve("@galacean/engine-shader-parser/internal/verbose"),
  join(packageRoot, "dist/main.verbose.js")
);

console.log("shader-parser package boundary verified");
