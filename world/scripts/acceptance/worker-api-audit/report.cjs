const fs = require("node:fs"),
  path = require("node:path");
const root = process.argv[2];
if (!root) throw Error("Pass audit evidence root");
const dirs = fs.readdirSync(root).filter((x) => fs.statSync(path.join(root, x)).isDirectory());
const inventories = dirs.map((x) => path.join(root, x, "inventory.json")).filter((x) => fs.existsSync(x));
if (!inventories.length) throw Error("Missing runtime inventory");
const inventory = JSON.parse(
  fs.readFileSync(inventories.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).at(-1))
);
const exposed = [
  ...inventory.tools.map((x) => ({ ...x, scope: "worker" })),
  ...(inventory.publicTools ?? []).map((x) => ({ name: x.function.name, scope: "public" }))
];
const cases = [];
const q = (a, p) => (a.length ? [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
for (const dir of dirs)
  for (const file of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(root, dir, file)));
    if (!data.job || !data.result) continue;
    const calls = data.trace?.toolCalls ?? [],
      primary = calls.filter((x) => x.tool === data.job.tool);
    const success =
      data.result.ok &&
      !data.result.receipt?.runtimeErrors?.length &&
      primary.length > 0 &&
      primary.every((x) => x.result.ok) &&
      calls.every((x) => !x.result.receipt?.runtimeErrors?.length) &&
      !data.pageErrors?.length &&
      (!data.job.verify || (data.verification?.ok && !data.verification.receipt?.runtimeErrors?.length));
    const frames = data.engine ?? [],
      gaps = frames.slice(1).map((x, i) => x.start - frames[i].start);
    const counts = {};
    for (const span of data.spans ?? []) {
      (counts[span.name] ??= { count: 0, ms: 0 }).count++;
      counts[span.name].ms += span.ms;
    }
    cases.push({
      run: dir,
      id: data.job.id,
      tool: data.job.tool,
      success: !!success,
      stage: data.result.error?.phase,
      error: data.result.error?.message,
      verificationError: data.verification?.error?.message,
      runtimeErrors: data.result.receipt?.runtimeErrors,
      wallMs: data.wallMs,
      primaryMs: primary.reduce((n, x) => n + x.durationMilliseconds, 0),
      maxEngineGapMs: q(gaps, 1),
      p95EngineGapMs: q(gaps, 0.95),
      maxEngineCpuMs: q(
        frames.map((x) => x.ms),
        1
      ),
      maxLongTaskMs: q(
        (data.long ?? []).map((x) => x.ms),
        1
      ),
      sceneWrites: data.sourceWrites?.length ?? 0,
      unchangedWrites: data.sourceWrites?.filter((x) => x.unchanged).length ?? 0,
      pauses: data.pauses?.filter((x) => x.key === "pause").length ?? 0,
      workerConstructionMs: (data.workers ?? []).filter((x) => x.kind === "construct").reduce((n, x) => n + x.ms, 0),
      workerFirstResponses: (data.workers ?? [])
        .filter((x) => x.kind === "first-response")
        .map((x) => ({ url: path.basename(x.url), ms: x.ms })),
      stages: data.stages,
      counts,
      profiled: !!data.job.profile,
      typingWorkaround: data.job.typingWorkaround,
      operationBoundaryFrame: !!frames[0]?.boundary,
      hostPrimaryMs: (data.stages ?? [])
        .filter((x) => x.name === "tool:" + data.job.tool)
        .reduce((n, x) => n + x.ms, 0),
      relatedTools: [...new Set(calls.filter((x) => x.tool !== data.job.tool).map((x) => x.tool))],
      evidence: path.join(dir, file)
    });
  }
const tools = exposed.map((t) => {
  const c = cases.filter((x) => x.tool === t.name);
  return {
    ...t,
    status: c.some((x) => x.success) ? "tested-successfully" : c.length ? "failed-or-unverified" : "pending",
    successfulCases: c.filter((x) => x.success).map((x) => ({ run: x.run, id: x.id })),
    attempts: c.length
  };
});
const report = {
  scope:
    "All tools exposed by actual Seed World runtime; method/operation coverage is tracked separately and is required before audit completion.",
  toolCount: tools.length,
  successfulTools: tools.filter((x) => x.status === "tested-successfully").length,
  tools,
  cases
};
report.branches = [
  ...[
    "list",
    "get",
    "create",
    "update",
    "updateMany",
    "setEnabled-false",
    "setEnabled-true",
    "color-instance",
    "color-shared",
    "texture",
    "remove"
  ].map((x) => "water." + x),
  ...["buildHouses", "buildTower", "buildWall", "buildFence", "buildSteps"].map((x) => "building." + x)
].map((id) => ({ id, success: cases.some((x) => x.id === id && x.success) }));
report.limitations = [
  "Wall time and Worker roundtrip include asynchronous waits, animation, resource fetch and publication; they are not CPU time.",
  "Frame and long-task samples include normal scene work and 1.5 seconds after each operation; attribution requires the accompanying spans/profile.",
  "Prerequisite calls are included in scenario wall time, but only the designated tool is included in primaryMs. Receipt queries must not inherit the cost of their preceding edit.",
  "Only later runs include the last pre-operation engine frame. Earlier maximum frame gaps can underestimate a stall at the operation boundary.",
  "First/repeat read cases run in the same page; they are not independent cold-start measurements.",
  "Water runtime cases use the shipped module type via JSDoc because the normal tools.water declaration is missing; normal entry remains broken.",
  "These are representative successful cases for each registered interface and selected operation variants, not exhaustive input/failure-path testing.",
  "Headless local development builds and instrumentation affect absolute timings; no cross-machine or production FPS claim is made."
];
const diagnosis = (name) => {
  if (name === "world.parameters.apply")
    return "Confirmed: cloud-only presentation edit takes full publication and pauses engine; compare atmosphere.update.";
  if (name === "world.parameters.receipt")
    return "Receipt itself is small. Slow scenario includes a preceding parameters.apply; do not attribute publication to receipt.";
  if (name === "terrain.create" || name === "terrain.update")
    return "Large hill edit takes full publication and engine pause. Geometry changes are real; reuse scope needs separate optimization.";
  if (name === "terrain.patch")
    return "Local patch avoids engine pause, but several-hundred-ms main-thread spikes remain during publication.";
  if (name === "spatial.search")
    return "Confirmed: repeated synchronous grid sampling and full sort; limit does not bound scan cost.";
  if (name === "world.delete" || name.startsWith("vegetation."))
    return "Edit publication has main-thread spikes; inspect spans/profile instead of attributing entire wall time to the command.";
  if (name === "world.parameters.materials.apply")
    return "Material publication can have several-hundred-ms main-thread spikes.";
  if (name === "water.author")
    return "Normal global declaration missing. Runtime branches tested using shipped module type; see branch coverage and water cases.";
  if (["write", "edit", "delete"].includes(name))
    return "Public file path owns its own transaction. Identical write still prepares/commits/activates; no >50ms task in measured no-op runs.";
  if (name === "snapshot")
    return "Capture/render/readback can exceed a frame; measured first and repeated captures differ. Inspect GL and long tasks.";
  if (name === "read")
    return "Declaration, large Scene text and snapshot references tested. A snapshot prerequisite is not read CPU cost.";
  if (["search_assets", "read_asset_descriptions", "source_text"].includes(name))
    return "Includes catalog/source fetch and parsing. Latency is recorded; no >50ms main task seen in measured cases.";
  if (name === "execute")
    return "Public orchestration includes checking, fresh script Worker and execution; large edits inherit business publication costs.";
  if (name.startsWith("editorComponents.FarmingSystem.methods."))
    return /\.(plant|irrigate|harvest|placeItem)$/.test(name)
      ? "First-use rendering can wait ~0.5s in getProgramParameter; command animation/wait is separate."
      : "Read methods are small; mutation roundtrips may wait for character actions/animation. See per-case long-task evidence.";
  if (name === "building.generate")
    return "Five generators tested; output generation only. Placement/publication is a separate operation.";
  return "No severe interface-specific stall established in tested case; includes common checker/Worker/transaction costs. Not a guarantee for arbitrary inputs or scene sizes.";
};
report.interfaces = tools.map((t) => {
  const c = cases.filter((x) => x.tool === t.name && x.success),
    m = (k) => (c.length ? Math.max(...c.map((x) => x[k] ?? 0)) : null);
  return {
    name: t.name,
    scope: t.scope,
    status: t.name === "water.author" ? "runtime-tested-with-declaration-workaround" : t.status,
    successfulCases: c.length,
    wallRangeMs: c.length ? [Math.min(...c.map((x) => x.wallMs)), m("wallMs")] : null,
    maxPrimaryRoundtripMs: m("primaryMs"),
    maxLongTaskMs: m("maxLongTaskMs"),
    maxEngineGapMs: m("maxEngineGapMs"),
    diagnosis: diagnosis(t.name),
    evidence: c.map((x) => x.evidence)
  };
});
fs.writeFileSync(path.join(root, "coverage.json"), JSON.stringify(report, null, 2));
const headers = [
  "name",
  "scope",
  "status",
  "successfulCases",
  "wallRangeMs",
  "maxPrimaryRoundtripMs",
  "maxLongTaskMs",
  "maxEngineGapMs",
  "diagnosis",
  "evidence"
];
const csv = (v) => '"' + String(Array.isArray(v) ? JSON.stringify(v) : (v ?? "")).replaceAll('"', '""') + '"';
fs.writeFileSync(
  path.join(root, "interfaces.csv"),
  [headers.join(","), ...report.interfaces.map((t) => headers.map((k) => csv(t[k])).join(","))].join("\n")
);
console.log(
  JSON.stringify(
    {
      total: tools.length,
      successful: report.successfulTools,
      pending: tools.filter((x) => x.status !== "tested-successfully").map((x) => x.name),
      slowest: cases
        .filter((x) => x.success)
        .sort((a, b) => (b.maxEngineGapMs ?? 0) - (a.maxEngineGapMs ?? 0))
        .slice(0, 12)
        .map(({ id, run, wallMs, primaryMs, maxEngineGapMs, maxLongTaskMs }) => ({
          id,
          run,
          wallMs,
          primaryMs,
          maxEngineGapMs,
          maxLongTaskMs
        }))
    },
    null,
    2
  )
);
