import fs from "node:fs";
import path from "node:path";
const out = path.resolve(import.meta.dirname, "../../.acceptance");
const groups = JSON.parse(fs.readFileSync(path.join(out, "unit-status.json")));
const results = [];
for (const [group, data] of Object.entries(groups)) {
  const baseline = new Map();
  const sources =
    group === "terrain"
      ? fs
          .readdirSync(path.join(out, "terrain"))
          .filter((f) => f.startsWith("baseline-") && f.endsWith(".json") && !f.endsWith(".tmp.json"))
          .map((f) => path.join(out, "terrain", f))
      : [path.join(out, `baseline-${group}-unit.json`)];
  for (const file of sources) {
    if (!fs.existsSync(file)) continue;
    for (const suite of JSON.parse(fs.readFileSync(file)).testResults || []) {
      const ordinals = new Map();
      for (const a of suite.assertionResults) {
        const n = ordinals.get(a.fullName) || 0;
        ordinals.set(a.fullName, n + 1);
        baseline.set(
          suite.name.replace(/.*\/(?:\.acceptance\/tests|world-gallery)\//, "") + "::" + a.fullName + "::" + n,
          a.status
        );
      }
    }
  }
  for (const a of data.migrated.failures) {
    const status = baseline.get(a.file + "::" + a.fullName + "::" + a.occurrence);
    results.push({
      group,
      file: a.file,
      name: a.fullName,
      occurrence: a.occurrence,
      baseline: status || "not-run",
      message: a.failureMessages[0]?.split("\n")[0]
    });
  }
}
fs.writeFileSync(path.join(out, "unit-differences.json"), JSON.stringify(results, null, 2));
console.log(
  "Assertions failing only in migration:",
  results.filter((x) => x.baseline === "passed")
);
console.log(
  "Failures without a completed baseline assertion:",
  results.filter((x) => !["passed", "failed"].includes(x.baseline)).length
);
