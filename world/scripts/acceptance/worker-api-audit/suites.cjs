// Generate independent-page suites. Each JSON is consumed by run.cjs through
// AUDIT_CASES, with a distinct external AUDIT_OUTPUT directory. Start Vite first.
// Run suites sequentially: concurrent renderers contaminate frame measurements.
// The farming suite waits for a real crop to mature (up to 15 minutes).
const fs = require("node:fs");
const path = require("node:path");
const destination = process.argv[2];
if (!destination) throw Error("Pass an external directory for generated case files");
fs.mkdirSync(destination, { recursive: true });
const reads = require("./cases.cjs").cases.filter((job) => job.tool !== "water.author");
const farming = require("./farming-cases.cjs");
const suites = {
  reads: [
    ...reads.map((job) => ({ ...job, id: job.id + "-first" })),
    ...reads.map((job) => ({ ...job, id: job.id + "-repeat" }))
  ],
  native: require("./native-cases.cjs"),
  farming: [...farming.cases, ...farming.harvestTail],
  public: require("./public-cases.cjs"),
  world: require("./world-cases.cjs"),
  water: require("./water-cases.cjs")
};
for (const [name, jobs] of Object.entries(suites)) {
  fs.writeFileSync(path.join(destination, name + ".json"), JSON.stringify(jobs, null, 2));
  console.log(name, jobs.length);
}
