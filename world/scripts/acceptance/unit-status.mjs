import fs from "node:fs";
import path from "node:path";
// This aggregator includes withdrawn behavior fixes. It is historical evidence only.
console.warn("HISTORICAL ONLY: includes withdrawn fixes; use source-parity evidence for current acceptance.");
const root = path.resolve(import.meta.dirname, "../../.."),
  out = path.join(root, "world/.acceptance");
const read = (name) => (fs.existsSync(path.join(out, name)) ? JSON.parse(fs.readFileSync(path.join(out, name))) : {});
const groups = {};
function aggregate(files) {
  const tests = new Map(),
    suites = new Map();
  for (const file of files) {
    const data = read(file);
    for (const suite of data.testResults || []) {
      const key = suite.name.replace(/.*\/(?:\.acceptance\/tests|world-gallery)\//, "");
      // A complete rerun replaces the file, including renamed contract tests.
      // Filtered reruns contain pending assertions and only replace executed cases.
      if (suite.assertionResults.length && suite.assertionResults.every((a) => !["pending", "skipped"].includes(a.status))) {
        for (const [id, previous] of tests) if (previous.file === key) tests.delete(id);
      }
      suites.set(key, {
        name: key,
        status: suite.status,
        message: suite.message,
        failedAssertions: suite.assertionResults.filter((a) => a.status === "failed").length
      });
      const ordinals = new Map();
      for (const a of suite.assertionResults) {
        const ordinal = ordinals.get(a.fullName) || 0;
        ordinals.set(a.fullName, ordinal + 1);
        const k = key + "::" + a.fullName + "::" + ordinal;
        if (["pending", "skipped"].includes(a.status) && tests.has(k)) continue;
        tests.set(k, { file: key, occurrence: ordinal, ...a });
      }
    }
  }
  const cases = [...tests.values()];
  return {
    passed: cases.filter((t) => t.status === "passed").length,
    failed: cases.filter((t) => t.status === "failed").length,
    skipped: cases.filter((t) => ["pending", "skipped"].includes(t.status)).length,
    failures: cases.filter((t) => t.status === "failed"),
    loadFailures: [...suites.values()].filter((s) => s.status === "failed" && s.message),
    setupFailures: [...suites.values()].filter((s) => s.status === "failed" && !s.message && !s.failedAssertions)
  };
}
for (const group of ["animals", "farming", "editor", "water", "environment"]) {
  const rechecks = { editor: ["editor-recheck.json"], water: ["water-recheck.json"], environment: ["continuation-environment-final.json"] }[group] || [];
  groups[group] = {
    migrated: aggregate([`migrated-${group}-unit.json`, ...rechecks]),
    baseline: aggregate([`baseline-${group}-unit.json`])
  };
}
const terrainFiles = fs
  .readdirSync(path.join(out, "terrain"))
  .filter((f) => f.endsWith(".json") && !f.endsWith(".tmp.json"));
const rechecks = [
  "terrain-initial-recheck.json",
  "shader-cli-recheck.json",
  "terrain-sky-recheck.json",
  "planning-shader-recheck.json",
  "planning-shader-recheck-3.json",
  "plant-assets-recheck.json",
  "prompt-noise-recheck.json",
  "field-worker-recheck.json",
  "config-path-recheck.json",
  "continuation-final-unit.json",
  "continuation-grass-tree.json"
];
groups.terrain = {
  migrated: aggregate([
    ...terrainFiles.filter((f) => f.startsWith("migrated-")).map((f) => "terrain/" + f),
    ...rechecks
  ]),
  baseline: aggregate(terrainFiles.filter((f) => f.startsWith("baseline-")).map((f) => "terrain/" + f)),
  completedFiles: terrainFiles.filter((f) => f.startsWith("migrated-")).length,
  incomplete: terrainFiles.filter((f) => {
    const original = read("terrain/" + f);
    if (!original.incomplete) return false;
    const originalNames = (original.testResults || []).map((s) => s.name);
    return !rechecks.some((name) => (read(name).testResults || []).some((s) =>
      originalNames.includes(s.name) && s.assertionResults.length && s.assertionResults.every((a) => a.status === "passed")));
  })
};
for (const group of Object.values(groups)) {
  const base = new Set(group.baseline.failures.map((t) => t.file + "::" + t.fullName + "::" + t.occurrence));
  for (const t of group.migrated.failures)
    t.baselineAlsoFails = base.has(t.file + "::" + t.fullName + "::" + t.occurrence);
}
fs.writeFileSync(path.join(out, "unit-status-historical.json"), JSON.stringify(groups, null, 2));
for (const [key, g] of Object.entries(groups))
  console.log(
    key,
    JSON.stringify({
      passed: g.migrated.passed,
      failed: g.migrated.failed,
      loadFailures: g.migrated.loadFailures.length,
      setupFailures: g.migrated.setupFailures.length,
      baselineMatched: g.migrated.failures.filter((f) => f.baselineAlsoFails).length,
      completedFiles: g.completedFiles
    })
  );
