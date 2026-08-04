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

function collectExportTargets(value, targets = []) {
  if (typeof value === "string") {
    if (value.startsWith("./") && !value.includes("*")) targets.push(value.slice(2));
    return targets;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectExportTargets(nested, targets);
  }
  return targets;
}

for (const exportTarget of collectExportTargets(packageJson.exports)) {
  assert.equal(packedFiles.has(exportTarget), true, `packed parser is missing export target '${exportTarget}'`);
}

for (const requiredFile of [
  "package.json",
  "internal/package.json",
  "internal/analyzer/package.json",
  "dist/main.js",
  "dist/main.analyzer.js",
  "types/runtime.d.ts",
  "types/index.d.ts"
]) {
  assert.equal(packedFiles.has(requiredFile), true, `packed parser is missing '${requiredFile}'`);
}
for (const removedFile of ["internal/verbose/package.json", "dist/main.verbose.js", "dist/module.verbose.js"]) {
  assert.equal(packedFiles.has(removedFile), false, `packed parser still contains removed '${removedFile}'`);
}

const runtimeForbiddenTerms = [
  "DiagnosticType",
  "ShaderValidator",
  "ShaderAnalysisInfo",
  "branchAnalysis",
  "analyzerSemanticDiagnostics",
  "Redefinition of",
  "is unavailable under at least one macro",
  "expects a sampler as its first argument",
  "No overload function type found",
  "Undefined function",
  "Undeclared identifier",
  "divergent types across macro branches",
  "no such field",
  "_VERBOSE",
  "jscc"
];
for (const runtimeFile of ["dist/main.js", "dist/module.js"]) {
  const runtimeSource = readFileSync(join(packageRoot, runtimeFile), "utf8");
  const leakedTerms = runtimeForbiddenTerms.filter((term) => runtimeSource.includes(term));
  assert.deepEqual(leakedTerms, [], `${runtimeFile} contains analyzer-only terms: ${leakedTerms.join(", ")}`);
}

const runtimeForbiddenSources = [
  "../src/common/BranchAnalysis.ts",
  "../src/lexer/AnalyzerLexer.ts",
  "../src/parser/AnalyzerSemanticDiagnostics.ts",
  "../src/parser/PassParser.ts"
];
for (const runtimeMapFile of ["dist/main.js.map", "dist/module.js.map"]) {
  const runtimeMap = JSON.parse(readFileSync(join(packageRoot, runtimeMapFile), "utf8"));
  const leakedSources = runtimeForbiddenSources.filter((source) => runtimeMap.sources.includes(source));
  assert.deepEqual(leakedSources, [], `${runtimeMapFile} contains analyzer-only sources: ${leakedSources.join(", ")}`);
}

const packageRequire = createRequire(join(packageRoot, "package-boundary-smoke.cjs"));
assert.throws(
  () => packageRequire.resolve("@galacean/engine-shader-parser"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "the parser root must not resolve"
);
assert.equal(packageRequire.resolve("@galacean/engine-shader-parser/internal"), join(packageRoot, "dist/main.js"));
assert.equal(
  packageRequire.resolve("@galacean/engine-shader-parser/internal/analyzer"),
  join(packageRoot, "dist/main.analyzer.js")
);

const runtime = packageRequire("@galacean/engine-shader-parser/internal");
const analyzerSupport = packageRequire("@galacean/engine-shader-parser/internal/analyzer");
for (const analyzerOnlyExport of [
  "AnalyzerLexer",
  "TypeSystem",
  "analyzerSemanticDiagnostics",
  "branchAnalysis",
  "formatDiagnosticSource",
  "parseShaderPass"
]) {
  assert.equal(analyzerOnlyExport in runtime, false, `runtime must not export '${analyzerOnlyExport}'`);
  assert.equal(analyzerOnlyExport in analyzerSupport, true, `analyzer support must export '${analyzerOnlyExport}'`);
}

console.log("shader-parser package boundary verified");
