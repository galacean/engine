const fs = require("node:fs");
const path = require("node:path");
const out = process.env.BENCH_OUTPUT;
const names = process.argv.slice(2);
if (!out || !names.length) throw Error("Set BENCH_OUTPUT and pass completed trial names");
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
};
const stats = (values) => ({
  n: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: percentile(values, 1)
});
const exclusionPath = path.join(out, "exclusions.json");
const exclusions = fs.existsSync(exclusionPath) ? JSON.parse(fs.readFileSync(exclusionPath)) : [];
const selected = (trial) =>
  trial.results.filter((s) => !exclusions.some((e) => e.trial === trial.trial && e.case === s.case));
const trials = names.map((name) => JSON.parse(fs.readFileSync(path.join(out, name + ".json"))));
const prepareWait = (sample) => {
  const prepare = sample.spans.find((span) => span.name === "native.prepare");
  if (!prepare) return { wait: 0, other: 0 };
  const intervals = sample.spans
    .filter((span) => span.name === "scheduler.yield")
    .map((span) => [Math.max(prepare.start, span.start), Math.min(prepare.end, span.end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let wait = 0,
    cursor = prepare.start;
  for (const [start, end] of intervals) {
    wait += Math.max(0, end - Math.max(cursor, start));
    cursor = Math.max(cursor, end);
  }
  return { wait, other: prepare.end - prepare.start - wait };
};
const aggregate = (samples) => {
  // The one-second frame tail can contain unrelated host publications. Keep
  // operation attribution inside its window, and candidate validation inside
  // the measured commit rather than counting background publications.
  const operationSpans = samples.map((sample) =>
    sample.spans.filter((span) =>
      span.start >= sample.start && span.end <= sample.end &&
      (span.name !== "project.validateCandidate" || sample.spans.some((parent) =>
        parent.name === "native.commit" && span.start >= parent.start && span.end <= parent.end
      ))
    )
  );
  const frames = samples.flatMap((s) => s.frames.map((f) => f.dt));
  const operationFrames = samples.map((s) =>
    s.frames.filter((f) => f.end - f.dt <= s.end && f.end >= s.start).map((f) => f.dt)
  );
  const spans = [...new Set(operationSpans.flatMap((entries) => entries.map((p) => p.name)))];
  return {
    samples: samples.length,
    verified: samples.every((s) => s.verified),
    total: stats(samples.map((s) => s.end - s.start)),
    stages: Object.fromEntries(
      ["edit", "prepare", "commit", "activate"].map((key) => [key, stats(samples.map((s) => s.stages[key]))])
    ),
    spans: Object.fromEntries(
      spans.map((key) => [
        key,
        stats(operationSpans.map((entries) => entries.filter((p) => p.name === key).reduce((sum, p) => sum + p.end - p.start, 0)))
      ])
    ),
    spanCalls: Object.fromEntries(
      spans.map((key) => [key, operationSpans.reduce((sum, entries) => sum + entries.filter((p) => p.name === key).length, 0)])
    ),
    prepareCheckpointWait: stats(samples.map((sample) => prepareWait(sample).wait)),
    prepareOtherWall: stats(samples.map((sample) => prepareWait(sample).other)),
    paths: samples.reduce((counts, s) => {
      for (const m of s.modes) counts[m.mode] = (counts[m.mode] || 0) + 1;
      return counts;
    }, {}),
    frame: {
      ...stats(frames),
      p99: percentile(frames, 0.99),
      over33: frames.filter((f) => f > 33.4).length,
      over50: frames.filter((f) => f > 50.1).length,
      sampleMax: stats(samples.map((s) => Math.max(0, ...s.frames.map((f) => f.dt))))
    },
    operationFrame: {
      ...stats(operationFrames.flat()),
      sampleMax: stats(operationFrames.map((frames) => Math.max(0, ...frames)))
    },
    longTask: stats(samples.flatMap((s) => s.long.map((l) => l.ms))),
    lifecycle: samples.map((s) => s.lifecycle),
    source: samples[0]?.source
  };
};
const summary = {
  exclusions,
  trials: trials.map((t) => ({
    name: t.trial,
    inventory: t.inventory,
    errors: t.errors,
    idle: stats(t.idle.frames.map((f) => f.dt)),
    caseIdle: Object.fromEntries(
      Object.entries(t.caseIdle ?? {}).map(([key, value]) => [key, stats(value.frames.map((f) => f.dt))])
    ),
    cases: Object.fromEntries(
      [...new Set(selected(t).map((s) => s.case))].map((key) => [
        key,
        aggregate(selected(t).filter((s) => s.case === key && s.iteration >= 0))
      ])
    )
  })),
  combined: {},
  incrementalOnly: {}
};
for (const variant of ["before", "after"]) {
  const samples = trials
    .filter((t) => t.trial.startsWith(variant))
    .flatMap(selected)
    .filter((s) => s.iteration >= 0);
  summary.combined[variant] = Object.fromEntries(
    [...new Set(samples.map((s) => s.case))].map((key) => [key, aggregate(samples.filter((s) => s.case === key))])
  );
  const incremental = samples.filter(
    (sample) => sample.modes.length && sample.modes.every((mode) => mode.mode === "incremental")
  );
  summary.incrementalOnly[variant] = Object.fromEntries(
    [...new Set(incremental.map((s) => s.case))].map((key) => [
      key,
      aggregate(incremental.filter((s) => s.case === key))
    ])
  );
}
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
const round = (n) => (n == null ? "—" : n.toFixed(1));
const rows = [
  "| case | prepare before → after | activate before → after | frame max/sample p50 before → after | after path | checks before → after |",
  "|---|---:|---:|---:|---|---|"
];
for (const [key, b] of Object.entries(summary.combined.before)) {
  const a = summary.combined.after[key];
  if (!a) continue;
  rows.push(
    `| ${key} | ${round(b.stages.prepare.p50)} → ${round(a.stages.prepare.p50)} | ${round(b.stages.activate.p50)} → ${round(a.stages.activate.p50)} | ${round(b.frame.sampleMax.p50)} → ${round(a.frame.sampleMax.p50)} | ${JSON.stringify(a.paths)} | ${b.verified ? "PASS" : "FAIL"} → ${a.verified ? "PASS" : "FAIL"} |`
  );
}
fs.writeFileSync(path.join(out, "summary.md"), rows.join("\n") + "\n");
console.log(rows.join("\n"));
