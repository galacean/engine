import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const directory = path.join(root, "world/.acceptance", process.argv[2] || "browser");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "world/demos.json")));
const rows = inventory.map((demo) => {
  const id = demo.entry.replace(/[^a-zA-Z0-9]+/g, "-");
  const file = path.join(directory, id + ".json");
  if (!fs.existsSync(file)) return { entry: demo.entry, status: "pending" };
  const data = JSON.parse(fs.readFileSync(file));
  return {
    entry: demo.entry,
    complete: data.complete,
    runs: data.runs.map((run) => ({
      variant: run.variant,
      fatal: run.fatal,
      readinessTimeout: run.readinessTimeout,
      readiness: run.readiness,
      errors: run.errors,
      requests: run.requests,
      loadMs: run.loadMs,
      frameMs: run.metrics?.frameMs,
      engineCpuMs: run.metrics?.engineCpuMs,
      drawCallsPerFrame: run.metrics?.drawCallsPerFrame,
      totalDraws: run.metrics?.totalDraws,
      gpu: run.metrics?.gpu,
      screenshot: run.screenshot
    }))
  };
});
fs.writeFileSync(path.join(directory, "status.json"), JSON.stringify(rows, null, 2));
for (const row of rows) {
  console.log(
    row.entry,
    row.runs
      ?.map(
        (r) =>
          `${r.variant}: errors=${r.errors.length}, requests=${r.requests.length}, draws=${r.totalDraws}, frame p95=${r.frameMs?.p95?.toFixed(2)}, CPU p95=${r.engineCpuMs?.p95?.toFixed(2)}${r.fatal ? ", FATAL" : ""}${r.readinessTimeout ? ", NOT READY" : ""}`
      )
      .join(" | ") || "pending"
  );
}
