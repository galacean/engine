# Seed World incremental Scene benchmark

Runs the original Seed World in an isolated Chrome profile with the real Engine, project publication, composed Agent transaction, and domain activation participants. No model request, rendering pause, forced garbage collection, or mocked Engine is used. The added `IncrementalBenchmarkProbe` is a registered, lightweight native Component; these results do not measure first-use Renderer/shader compilation or Script execution.

## Run

Set `BENCH_OUTPUT` to an evidence directory outside the checkout. To compare successive uncommitted implementations, run `snapshot.cjs` with `BENCH_SNAPSHOT_MODE=working` before editing, preserve its output, and pass it as both the base and shared snapshot. For a HEAD comparison, freeze common HEAD sources first, then start two servers in separate terminals with the same snapshot and output directory:

```sh
BENCH_OUTPUT=/tmp/seed-incremental-benchmark node world/scripts/acceptance/incremental-scene/snapshot.cjs
BENCH_SHARED_SNAPSHOT=/tmp/seed-incremental-benchmark/shared-source.json BENCH_VARIANT=before BENCH_PORT=5197 BENCH_OUTPUT=/tmp/seed-incremental-benchmark node world/scripts/acceptance/incremental-scene/server.mjs
BENCH_SHARED_SNAPSHOT=/tmp/seed-incremental-benchmark/shared-source.json BENCH_VARIANT=after BENCH_PORT=5198 BENCH_OUTPUT=/tmp/seed-incremental-benchmark node world/scripts/acceptance/incremental-scene/server.mjs
```

The before server accepts `BENCH_BASE_SNAPSHOT` (a repository-relative path → source text JSON map) to compare against a captured working implementation; without it, the baseline is HEAD. The after server freezes current bytes of the eleven implementation files listed in `server.mjs`, including the public preparation context and Seed World registrations. Use the same `BENCH_SHARED_SNAPSHOT` for both servers to freeze all other JS/TS inputs, including worker sources, while preserving engineModify's native replacement mapping. Generated assets, dependencies, and configuration must remain stable. Do not use a HEAD snapshot when the intended baseline includes earlier uncommitted implementation work. HMR is disabled. SHA-256 manifests identify the frozen inputs. Restart a server after changing an implementation file. Do not switch Git branches or run a second benchmark/browser workload during measurement.

Run sequentially in the order before-1, after-1, after-2, before-2, changing URL port and trial name for each invocation:

```sh
BENCH_OUTPUT=/tmp/seed-incremental-benchmark BENCH_TRIAL=before-1 BENCH_REPEATS=8 BENCH_URL='http://127.0.0.1:5197/world/demos/seed-world/index.html?template=original&seed=1&aiChat=1&agentTrace=1' node world/scripts/acceptance/incremental-scene/run.cjs
BENCH_OUTPUT=/tmp/seed-incremental-benchmark node world/scripts/acceptance/incremental-scene/summarize.cjs before-1 after-1 after-2 before-2
```

`BENCH_CASES` optionally selects comma-separated cases. Each ordinary case runs two warmups and eight measured repetitions. Each failure case runs once at the end: activation-failure leaves committed authoring and the recovery case then attempts undo through the real composed transaction. A failed recovery is retained as a failed check, not bypassed or represented as successful recovery. `*-complete.json` records failed checks; a successful process exit only means measurement completed.

## Cases and evidence

| Case | Operation and correctness check |
| --- | --- |
| add-leaf | Add one Component; verify runtime value and lifecycle counts. |
| add-parent | Add one Component on a parent with 32 active child Components; verify subtree lifecycle counts. |
| replace-reference | Remove a property to replace a referenced Component; verify destruction and rebinding of the unchanged consumer. |
| asset-change | Modify a referenced JSON asset and add one Component; verify the live loaded value and full fallback. |
| undo / redo | Navigate history; verify runtime removal / restoration. |
| binding-drift | Reparent the target only in runtime, then add a Component; verify full synchronization restores the authored parent. |
| prefab-add | Instantiate a small real Prefab, then add one Component to the ordinary leaf; observe full fallback. |
| activation-failure | Throw from an authored property setter; verify failure and retention of committed Source. |
| recovery | Undo that failed transaction; verify authoring removal and runtime query recovery, or retain the actual error. |

The fixture adds 34 Entity records and 35 Components to the real world; it does not replace or simplify the world. The Prefab is instantiated only in its own case. Failure cases follow that case, so they test the scene with the Prefab present.

Each sample saves top-level edit/prepare/commit/activate wall time, nested native and Scene-projection spans, actual incremental/full selection, rAF intervals, Long Tasks, lifecycle counts, and verification results. Undo cleanup and persistence flush happen outside the measurement window. Frame sampling spans the operation plus a one-second tail. Idle sampling lasts four seconds initially (three seconds plus that tail), and two seconds before each case. The runner also captures plan eligibility, source-version guards, and live-binding checks. Nested stages include preparation extensions, script/resource compilation, dependency refresh, validation, record indexing, net changes, publication/history, activation resources and host hooks. `scheduler.yield` measures awaited scheduling checkpoints, not CPU work.

Wall time includes asynchronous waits and yielded frames; it is not main-thread blocking time. Nested spans are inclusive and must not be added to their parent. The summary excludes warmups, uses nearest-rank percentiles, and reports both pooled frame statistics and per-operation maximum-frame statistics. Raw trial data retains the original frame timestamps. Screenshot, GPU, canvas, visibility, authored/runtime inventory, browser version, source hashes, and console errors accompany each trial.

Preparation measurements also record `prepare.context`, `prepare.view.parse`, per-extension `prepare.selection.<name>` and `prepare.extension.<name>` spans. The parsed-view span is nested inside selection or callback work. A missing callback span means the callback was skipped, not a zero-cost execution. Before declarations have names, registration order supplies benchmark-only names. Timing instrumentation is confined to the benchmark server. Report extension invocation counts as well as duration, scheduler checkpoint interval unions, commit time and total operation wall time. Skipping an early validator can move its first parse to final commit validation; a prepare reduction alone does not establish the same total-latency reduction. Natural asset updates can also force full projection fallback, so retain actual path counts and report incremental-only samples separately.

This development-mode, headless desktop benchmark excludes LLM, Agent Worker/checker, network response time, production bundling, and mobile performance. Compare repeated trial distributions and idle variation before drawing a frame-stall conclusion.

## Preparation ablations and attribution

`BENCH_DIAGNOSTICS=1` enables symmetric benchmark-only spans for temporary asset input preparation, compilation, registration, loading, validator callbacks and cleanup. `BENCH_EXTRA_DETAIL=1` additionally separates legacy input snapshots/matching from the new baseline view. Neither flag changes product validation or resource ownership. `BENCH_INPUT_HASHES=1` records normalized Source and asset namespace fingerprints outside operation timing; these do not prove identical resource bytes or runtime simulation state.

An ablation must retain all other mechanisms and correctness checks. Keep each source snapshot, its patch, the instrumentation version and the experimental plan. Quantify snapshot/selection costs separately from skipped callback work. Do not add inclusive spans or independent P50s. Preserve slow samples and report commit, activation and frames alongside prepare.

Forward/reverse page trials can still confound treatment with environment changes. Use paths where the changed mechanism does not execute as negative controls. If identical work shows large differences, do not certify those differences as an optimization effect. A confirmation can use one module snapshot with benchmark-only switches, balanced crossover blocks on the same page, and identical initialization/cleanup outside the measured action. Validate input fingerprints, actual callback counts and fallback paths. Failures must be followed by real recovery before the next crossover arm. Report paired intervals as exploratory when sample counts are small; neither a favorable median nor a test matrix proves universal positive performance.
