import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const repo = path.resolve(import.meta.dirname, "../../.."),
  variant = process.argv[2] || "migrated";
const root =
  variant === "baseline"
    ? path.resolve(repo, "../engine-next/world/.materialized/engine/world-gallery")
    : path.join(repo, "world/.acceptance/tests");
const out = path.join(repo, "world/.acceptance/terrain");
let files = fs
  .readdirSync(path.join(root, "demos/terrain/project-tests"))
  .filter((f) => f.endsWith(".spec.ts") && !f.endsWith(".e2e.spec.ts") && f !== "runtime.spec.ts")
  .sort();
if (variant === "baseline" && process.env.FAILURES_ONLY)
  files = files.filter((f) => {
    const p = path.join(out, "migrated-" + f + ".json");
    if (!fs.existsSync(p)) return false;
    const d = JSON.parse(fs.readFileSync(p));
    return d.incomplete || d.numFailedTestSuites || d.numFailedTests;
  });
if (process.env.ACCEPTANCE_SHARD_COUNT)
  files = files.filter(
    (f, i) => i % Number(process.env.ACCEPTANCE_SHARD_COUNT) === Number(process.env.ACCEPTANCE_SHARD_INDEX || 0)
  );
files = files.filter((f) => !fs.existsSync(path.join(out, variant + "-" + f + ".json")));
if (process.env.ACCEPTANCE_EXCLUDE_REGEX)
  files = files.filter((f) => !new RegExp(process.env.ACCEPTANCE_EXCLUDE_REGEX).test(f));
if (process.env.ACCEPTANCE_FILES) files = files.filter((f) => process.env.ACCEPTANCE_FILES.split(",").includes(f));
async function run(batch) {
  const output = path.join(out, variant + "-batch-" + batch[0] + ".tmp.json");
  const log = fs.openSync(output + ".log", "w");
  const patterns = [];
  let filterAssertions = variant === "baseline" && process.env.FAILURES_ONLY;
  if (filterAssertions)
    for (const file of batch) {
      const data = JSON.parse(fs.readFileSync(path.join(out, "migrated-" + file + ".json")));
      const failures = (data.testResults || []).flatMap((s) => s.assertionResults).filter((a) => a.status === "failed");
      if (!failures.length) {
        filterAssertions = false;
        break;
      }
      for (const assertion of failures) patterns.push(assertion.fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repo, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        path.join(repo, "world/scripts/acceptance/unit.config.mjs"),
        ...batch.map((f) => "demos/terrain/project-tests/" + f),
        ...(filterAssertions ? ["--testNamePattern", patterns.join("|")] : []),
        "--outputFile",
        output
      ],
      {
        cwd: root,
        detached: true,
        env: {
          ...process.env,
          TEST_VARIANT: variant,
          TEST_GROUP: "terrain",
          ACCEPTANCE_INCREMENTAL: "1",
          NODE_OPTIONS: "--max-old-space-size=" + (process.env.ACCEPTANCE_HEAP_MB || 6144)
        },
        stdio: ["ignore", log, log]
      }
    );
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }, 600000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  fs.closeSync(log);
  if (fs.existsSync(output)) {
    const data = JSON.parse(fs.readFileSync(output));
    for (const f of batch) {
      const results = data.testResults.filter((t) => path.basename(t.name) === f);
      const assertions = results.flatMap((t) => t.assertionResults);
      fs.writeFileSync(
        path.join(out, variant + "-" + f + ".json"),
        JSON.stringify({
          startTime: data.startTime,
          numPassedTests: assertions.filter((a) => a.status === "passed").length,
          numFailedTests: assertions.filter((a) => a.status === "failed").length,
          numPendingTests: assertions.filter((a) => ["pending", "skipped"].includes(a.status)).length,
          numFailedTestSuites: results.filter((t) => t.status === "failed").length,
          incomplete: !results.length,
          testResults: results
        })
      );
    }
    fs.unlinkSync(output);
  } else if (batch.length > 1) {
    for (const f of batch) if (!fs.existsSync(path.join(out, variant + "-" + f + ".json"))) await run([f]);
  } else
    fs.writeFileSync(
      path.join(out, variant + "-" + batch[0] + ".json"),
      JSON.stringify({ incomplete: true, ...result })
    );
  console.log(variant, batch.length, batch[0], JSON.stringify(result));
}
for (let i = 0; i < files.length; i += 20) await run(files.slice(i, i + 20));
