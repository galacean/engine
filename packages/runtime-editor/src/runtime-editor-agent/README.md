# Runtime editor Agent adapter

Depends on Runtime editor and AI Chat; neither core depends on this adapter.

- `runtime-native-editor.ts`: adapts editor transactions to Agent tools and exposes diagnostics.
- `runtime-scene-api.ts`: entity/component input validation, operation effects, documentation and host handlers.
- `runtime-native-tools.ts`: asset/document handlers and the generated entity/component dispatch table.
- `runtime-native-knowledge.ts`: native editing guide and asset/document declarations; consumes generated entity/component declarations.
- `engine-runtime-files.ts`: read-only Engine knowledge and declarations.

The application combines native and domain declarations. SeedWorldAgentDefinition composes the generic editor namespace with application tools and typed component proxies; its world runtime guide lives under agent-adapter/knowledge. Native declarations do not import world declarations.

Tests include a native-only typecheck without Seed World. Integration and historical evidence live in `../../tests/runtime-editor/`.

## Reproducing performance checks

Keep tests and runnable measurement/analysis scripts in version control. The `tests/runtime-editor/performance/` directory is ignored local output: historical reports, traces, profiles, screenshots and review snapshots are not PR inputs or test fixtures. Historical measurements below are observations from those runs, not guaranteed results on another machine.

Run these scripts from the materialized Gallery after syncing source and installing its dependencies; follow [the World workflow](../../../README.md). Browser checks require installed Chrome and a running Gallery Vite dev server (default `http://127.0.0.1:4173`). Use a disposable browser profile/project; the scene checks perform real edits. The isolated search benchmark starts its own server.

| Check | Command / configuration |
| --- | --- |
| Isolated search budgets | `node tests/runtime-editor/search-performance.mjs` |
| Real-scene read/search consistency and frames | `SEARCH_BASE_URL=http://127.0.0.1:4173 SEARCH_OUTPUT=/tmp/search-view node tests/runtime-editor/search-view-scene.mjs` |
| Native IndexedDB migration, atomicity and concurrency | `node tests/runtime-editor/project-storage-browser.mjs` |
| Delayed checkpoint failure/retry contracts | `node tests/runtime-editor/persistence-browser.mjs` |
| Real-scene publication, saving and reload | `PERSISTENCE_OUTPUT=/tmp/persistence node tests/runtime-editor/persistence-scene.mjs` |
| API editing / farming frame diagnosis | `API_DIAG_DIR=/tmp/api-frames node tests/runtime-editor/api-contract-frame-diagnosis.mjs` |
| Allocation and retained memory | `API_MEMORY_DIR=/tmp/api-memory node tests/runtime-editor/api-contract-memory-diagnosis.mjs` |
| Worker / RPC / host latency | `LATENCY_URL='http://127.0.0.1:4173/demos/terrain/seed-world-planner/index.html?seed=1&aiChat=1&agentTrace=1' LATENCY_OUTPUT=/tmp/edit-latency node tests/runtime-editor/edit-latency-scene.mjs` |
| Idle execution Worker heap | `WORKER_MEMORY_ORIGIN=http://127.0.0.1:4173 node tests/runtime-editor/idle-worker-memory.mjs`; optional `WORKER_MEMORY_OUTPUT` |

Use the same browser, scene and workload for baseline/candidate runs; keep frame measurement separate from allocation profiling. `analyze-edit-latency.mjs`, `api-contract-analyze-trace.mjs`, `analyze-runtime-memory.mjs` and `analyze-runtime-heapsnapshot.mjs` consume newly generated captures. Raw outputs stay local or outside the checkout. JS heap/backing-storage figures do not measure GPU memory or whole-process RSS.

Seed World registers preset systems at startup. Ordinary files/folders and Script assets are editable; system discovery, installation and authored system SDKs are outside this version.

## API contract pilot

Entity/component methods are registered once in `runtime-scene-api.ts`. Their Zod inputs provide runtime validation and inferred handler parameter types; handler return types provide the result declarations. `generate-scene-api.mjs` extracts the signatures at build time. Object methods preserve JavaScript names such as `delete`; component query declarations merge with the existing typed system overloads.

Farming's `FarmingAPIContract.ts` owns input schemas, method descriptions, effects, write options and named domain result types. `FarmingCommands` and `FarmingMutation` derive from `farmingOperations`; `FarmingAPI` consumes the same validators. The component extension iterates the registrations, and the declaration generator consumes their inferred types. There is no second handwritten input interface or mutation-name list. Domain result DTOs remain the domain's types; existing Farming result-envelope validation is unchanged.

Run `pnpm editor:api:generate` after contract changes and `pnpm editor:api:check` in validation (from the materialized Gallery, or through `world/scripts/run-engine.mjs`). Generated files are outputs, not edit points. The shared extraction helpers are in `shared/api-contract/scripts`; unsupported/unresolved `any` or import types fail generation rather than silently widening a declaration.

Registration still uses `createRuntimeComponentExtension`; the existing Worker facade constructs proxies from names and component bindings. No Engine/system implementation or schema catalog is sent to the execution Worker. The existing simplified TSC preflight and its checker Worker are retained. Generation does not replace runtime validation, command receipts, cancellation, storage, or projection.

Adding an entity/component method changes its registration and regenerates declarations. Adding a Farming operation changes its contract and business implementation; it does not require a new Worker handler, a shared routing branch, or a handwritten `.d.ts`. Registering a new system also requires its own lifecycle/resources; API registration does not manufacture those business capabilities.

Editing methods continue to modify the current execute draft; read routes do not dirty it. Farming commands keep their independent atomic memory commits; host checkpoints are asynchronous. Source component identities are resolved on every live call, including after replacement/removal.

### Pilot validation, 2026-10-27

The pilot covers 9 entity/component methods and all 35 existing Farming operations. The simplified TSC checker implementation and its Worker were not changed. Generated declarations still reject missing required arguments, invalid vectors/value types, nonexistent methods and nonexistent result fields before execution. A real browser Worker regression also exercises the checker.

Evidence is in `performance/api-contract-2026-10-27/summary.json` (local-only evidence), with full baseline/candidate samples and the interrupted sample beside it. The baseline retains the earlier search-tool changes and removes only this API-contract refactor, based on `3244845bfde450905cf6bb89d216b9fa4ccfb7b0`.

| Measurement | Baseline | Pilot |
| --- | ---: | ---: |
| Total emitted production JS | 50,346,062 B | 50,383,476 B |
| Sum of per-file gzip sizes | 12,294,944 B | 12,307,896 B |
| Entity/component edits, frame P99 | 33.3 ms | 34.3 ms |
| Farming query/updatePlot, frame P99 | 18.7 ms | 18.7 ms |
| Main JS heap change after 100 repeat edits, post-GC | +6.41 MiB | +5.06 MiB |
| Main JS heap change after removing probe/disposal, post-GC | +1.20 MiB | +1.06 MiB |
| Checker Worker heap after workload, post-GC | 20.05 MiB | 20.02 MiB |
| Compiler Worker heap after workload, post-GC | 14.74 MiB | 14.74 MiB |

Bundle measurements use Vite production builds. There are 57 JS assets on both sides; the delta is +37,414 B raw / +12,952 B gzip, not an initial-download measurement. The execution, checker and compiler Worker files are byte-identical. Main-thread declaration/registration content accounts for the changed chunks; preset declarations grow from 2,274,177 to 2,297,444 bytes.

Frame measurements use development servers, desktop Chrome 146 with ANGLE Metal on Apple M2, 1280×800 and a real Seed World seed=1 scene. Each run warms up 5 edits, then samples idle, 30 entity/component edits and 30 Farming query/label commands, followed by 100 repeat edits in batches of 25. Forced GC occurs outside frame samples. The final candidate edit sample has one 52 ms frame; an interrupted repeat has one 66.6 ms frame. Earlier exploratory runs fluctuate in both directions. These results do not establish a speedup, zero frame impact, leak freedom, production frame timing, mobile performance or GPU/browser-process memory budgets.

One repeat encountered the existing Farming `VERSION_CONFLICT` when a live simulation tick invalidated a captured revision. The benchmark records such conflicts without bypassing validation or silently retrying. The completed final comparison had zero conflicts. The first exploratory comparison exceeded the existing result-size budget only in a later catalog diagnostic; the bounded diagnostic and final comparison pass, and the exploratory records remain identified as such.

Functional checks: Runtime Editor/Farming typechecks and generated declaration checks pass; focused contract/native tests 12 pass; Farming suite 644 pass; editing suite 875 pass and 1 preexisting trace-image-redaction assertion fails (also reproduced in the baseline copy); browser tests 4 pass; assessment-helper unit tests 11 pass. Browser coverage includes real Worker RPC, native node/component Engine projection, Farming harvest/replay and persisted restoration. Natural Seed World planting/irrigation/maturity/harvest uses the real clock and rules, with no forced maturity. These are deterministic API scripts, not remote LLM instruction-following tests.

The natural lifecycle frame samples expose existing first-use cost and an unresolved outlier: planting/irrigation reaches a maximum frame of 333.3 ms in the baseline and 249.1 ms in the pilot (P99 34.3 / 33.8 ms). Harvest/replay reaches 18.7 / 66.7 ms maximum (P99 18.7 / 33.3 ms). Both versions mature naturally after about 150 seconds, yield exactly one radish fruit, and replay the same receipt. One lifecycle sample per version cannot attribute the harvest outlier or establish no regression; first-use farming is not stutter-free. Full lifecycle records accompany the summary.

Frame/heap sampling precedes the final type-only tightening of empty input declarations to `Record<string, never>` (so `list(123)` and unknown fields are still rejected). Runtime dispatch/validation did not change afterward; generated checks, focused type-checker regressions and production bundle measurements were rerun.

To reproduce against a running local Gallery from the materialized `world-gallery` directory:

```sh
API_REPORT=/tmp/api-contract-scene.json node tests/runtime-editor/api-contract-scene-performance.mjs
API_FEATURES_ONLY=1 API_REPORT=/tmp/api-contract-farming.json node tests/runtime-editor/api-contract-scene-performance.mjs
```

Set `API_SCENE_URL` to select the baseline server. Run baseline and candidate sequentially, without concurrent builds or other benchmark scenes. The feature run waits up to 360 seconds for natural maturity and records frame intervals around planting/irrigation and harvest/replay, including one second of presentation after each result. The harness exposes existing host references through test-only HTTP response interception; it does not replace APIs, state owners, rules, clocks, storage or rendering. It uses a fresh browser context and closes it after verification.

### Frame diagnosis follow-up, 2026-10-27

The GC-stall mechanism predates the contract refactor. The original historical 66.7 ms harvest sample was not traced and cannot be uniquely reconstructed. New real-scene runs reproduce candidate harvest intervals of 66.7 ms (maximum 100 ms): four Engine animation tasks take 74.7–80.7 ms, with 65.1–70.1 ms spent in incremental GC per task, after harvest/replay returned. The unchanged baseline also reproduces harvest intervals of 200 / 133.3 ms: two Engine animation tasks take 210.2 / 138.9 ms, with 195.8 / 118.8 ms incremental GC. Baseline external memory is already above its soft limit before these frames. This demonstrates an existing problem, not an estimate of regression frequency; changed allocation/GC timing is not excluded.

The earlier 33.3 / 34.3 ms values are **rAF frame-interval P99**, not synchronous API execution times or a fixed 1 ms routing overhead. Untraced repeats give baseline 34.0 / 33.4 ms versus candidate 33.2 ms. Editing unrelated node/camera properties still calls every activation participant; PlannedMasonry then reparses and clones unchanged authoring data. In the baseline, a 34.7 ms `PlannedMasonryStorage.read` overlaps about 29.4 ms of GC/pressure handling; normal reads are about 1–3 ms. The activation, parsing, cloning and Farming coordinator implementations are byte-identical between the two copies. The project contains about 1.93 million text characters, not hundreds of MB of project data; GC reclamation must not be equated with API parameter/package size.

Later runs show why these observations must not become a clean performance sign-off. Candidate-5 has idle max 233.4 ms and traced/untraced edit P99 about 300 ms. A 296.3 ms animation task contains 269.8 ms incremental GC, while that run's Masonry reads are at most 2.2 ms without GC inside them. GC can occur in subsequent Engine frames. Baseline idle also has a 66.7 ms scheduling gap without a corresponding long task or GC; a separate baseline harvest frame spends 34.4 ms in the Engine animation task without GC. A frame interval alone does not identify its cause. Later runs have roughly 33.3 ms median intervals versus earlier 16.7 ms; absolute cross-run maxima are not a controlled speed comparison.

Raw selected Chrome traces, frame/operation records, per-task attribution, source hashes and all valid run statistics are in `performance/api-contract-frame-diagnosis-2026-10-27/summary.json` (local-only evidence). CPU profiles were used only for stack discovery because some sample deltas were invalid; attribution uses native Trace event durations. GC categories and adjacent frame correlation windows overlap and must not be added together. The read-only wrappers, existing `agentTrace` probe, screenshots and tracing can perturb timing. These are development-scene diagnostics, not production/mobile budgets or an allocation-owner/leak analysis.

Reproduce with the existing local Gallery and real Workers, without forced growth or disabled validation:

```sh
API_DIAG_CPU_PROFILE=0 API_DIAG_FARM_ONLY=1 API_DIAG_SCREENSHOT=1 API_DIAG_DIR=/tmp/harvest-diagnosis node tests/runtime-editor/api-contract-frame-diagnosis.mjs
API_DIAG_CPU_PROFILE=0 API_DIAG_EDITS_ONLY=1 API_DIAG_DIR=/tmp/edit-diagnosis node tests/runtime-editor/api-contract-frame-diagnosis.mjs
node tests/runtime-editor/api-contract-analyze-trace.mjs /tmp/harvest-diagnosis /tmp/edit-diagnosis
```

Use `API_SCENE_URL` for the baseline; run one scene at a time. The harness records setup version conflicts and re-queries only remaining empty plots, without overwriting captured revisions or repeating successful plants. Recommended follow-up is dependency/version-aware activation for unchanged assets, then external-buffer ownership and per-frame allocation profiling. Preserve simplified TSC, command validation, persistence, projection and Worker boundaries. This diagnosis changes no product implementation.

### Unchanged-asset synchronization, 2026-10-28

`RuntimeProjectAssetSnapshot.isCurrent()` now shares the existing `assertCurrent()` validity predicate. `PlannedMasonryStorage` keeps one synchronized resource/data identity and that guard. Unchanged author bytes/metadata and the same resource/data skip parsing; replacement resources, replaced data, changed source, pending publications or disposal do not reuse the cached projection. Explicit `read()` still produces a detached draft. The host still reconciles component lifecycle and bindings. There is no second version ledger, reduced validation, scheduled product GC or changed Worker/state ownership.

The before copy includes the previous API-contract pilot and search changes; only this synchronization optimization differs. Real Seed World measurements ran sequentially in fresh Chrome 146 / ANGLE Metal contexts, with the actual checker/execution Workers, transactions and natural four-crop maturity. Allocation sampling, forced GC and heap snapshots were separate from frame measurements.

| Measurement | Before | After |
| --- | ---: | ---: |
| 30 real sync checks: author reads | 30 | 0 |
| Same checks: total / max synchronous time | 209.2 / 35.5 ms | 1.1 / 0.1 ms |
| Traced edit P99, two runs | 33.4 / 33.4 ms | 18.7 / 17.7 ms |
| Untraced edit P99, two runs | 32.2 / 33.3 ms | 18.7 / 17.7 ms |
| Untraced edit maximum, two runs | 52.0 / 34.3 ms | 18.8 / 33.7 ms |
| 100 edits: post-GC main-isolate usedSize | 1101.58 MiB | 1100.26 MiB |
| 100 edits: post-GC backingStorageSize | 656.76 MiB | 658.54 MiB |

The cache removes a specific allocation/blocking path, not the scene's large memory footprint. Sampling attributes about 22.45 MiB per 30 edits to the three masonry parsing modules before, with no samples in those modules afterward. Overall allocation remains about 826 / 820 MiB per 30 edits. Largest remaining editing sites are full-package copies in draft creation, publication and persistence/IndexedDB, and serialization of the declarations/sources compilation cache key. The simplified TSC/checker remains unchanged and is exercised by the real scripts.

Idle allocation is about 404 / 393 MiB over ten seconds. Sampled stacks identify animator vector-curve evaluation/writeback, vegetation candidate-cell list creation and key parsing, animal movement, bridge support and water/terrain sampling. A sampled caller can include inlined allocations; the animator result does not establish a new Vector3 per call. A post-GC baseline snapshot contains 28.1 million nodes, including about 592 MiB of native ArrayBuffer data and 530 MiB of ordinary array elements. Retaining paths reach terrain texture restorers, GLTF mesh indices, PhysX, building texture source caches and separately copied white-base restoration payloads, terrain/water fields, construction queries and appearance-listener closures. These are concrete ownership paths, not proof of leaks or exclusive reclaimable sizes. Recovery data must not simply be discarded.

Retention after 100 edits/disposal is comparable; no material reduction or long-term leak-freedom is established. Initial backing storage differs while scene initialization finishes, so initial-to-final differences are not comparable leak slopes. GPU/process RSS are not measured. Harvest/replay succeeds for four naturally matured crops on each side. The baseline's 83.4 ms harvest outlier contains 63.7 ms of first-use PBR shader compilation (about 62.5 ms waiting in `gl.getProgramParameter`), without GC; its difference from the candidate's 18.8 ms maximum is **not** a demonstrated benefit of this cache.

Evidence: `performance/runtime-gc-optimization-2026-10-28/summary.json` (local-only evidence), with raw selected traces, allocation profiles, source hashes and retention records. The first candidate full run's imported prototype timers missed HMR-versioned live instances; those method counters are excluded. Repeats wrap actual live owners and positively observe all 30 sync checks. A post-measurement verifier initially exceeded the existing script-output budget; returning a bounded status summary fixes the diagnostic. Both repeat runs then change/restore an actual building color through the typed Worker API and verify author/resource agreement. No output budget or checker was bypassed.

Validation: 68 targeted tests pass, final building file rerun 22 pass, Runtime Editor/Terrain `--noEmit` checks and generated Scene/Farming declarations pass. For allocation/retention investigation (not frame benchmarking), run `API_MEMORY_DIR=/tmp/memory-diagnosis node tests/runtime-editor/api-contract-memory-diagnosis.mjs`; opt into `API_MEMORY_SNAPSHOT=1` for a large heap snapshot. Analyze with `analyze-runtime-memory.mjs /tmp/memory-diagnosis`, adding `--snapshot` to stream large snapshots. Raw multi-GB heap snapshots remain outside the repository.


### Package capture and compilation cache, 2026-10-28

Editing, preview, import, undo, full publication and queued storage captures share immutable text values while copying their containers, manifest metadata and mutable binary bytes. This is ownership-aware copying, not a mutable shared draft or a second project store. Binary previews are detached too. Invalid binary inputs are rejected rather than converted. Publication revisions, runtime-owned asset merging and cancellation remain unchanged. Current publication/checkpoint timing is defined in `../runtime-editor/README.md`; the historical measurements below predate that split.

The script cache compares exact source/declaration keys and text values, retaining a private map snapshot only after a successful full compile. It does not serialize a giant cache key, use probabilistic hashes or rely on caller object identity. Module preparation reuses that compilation result and captures external bindings separately. Changed declarations, sources or external bindings still invalidate their appropriate layer. Analysis-only and failed/aborted builds do not populate the compiled cache. The simplified TSC, checking/execution Workers and compilation Worker remain in place.

IndexedDB schema 3 adds a unique index over the existing storage revision, preserving all schema-2 projects. A save checks the expected revision via `index.getKey()` (or project existence via `store.getKey()`) and writes the package in the **same readwrite transaction**. This avoids deserializing a full project just to check its revision. Legacy records without a revision retain the full-read check until their first successful save. The older pre-v2 incompatible-format reset remains unchanged. Old tabs must close before an upgrade can finish; blocked upgrades report that requirement, and new connections close on version changes. The current exported project version is 6; earlier package versions reject without rewriting. IndexedDB still serializes the complete record on `put`; this change does not claim incremental persistence or eliminate binary copies.

Real-scene before/after measurements use a fresh frozen copy that already contains the previous unchanged-masonry optimization. Chrome 146 / ANGLE Metal runs use the real Seed World scene, checking/execution Workers, durable transactions and projection. No LLM service call is needed for the deterministic scripts. Two frame trials per side include an untraced window; the final pair runs candidate before baseline. Allocation/retention runs are separate. The final candidate source also rejects invalid non-string/non-Uint8Array inputs; the preliminary frame run preceded only that guard, as recorded by the source hashes.

| Measurement | Before | After |
| --- | ---: | ---: |
| 30 edits, sampled main-isolate allocation | 802.46 MiB | 318.46 MiB (−60.3%) |
| Compile-cache call path, inclusive sampled allocation | 132.87 MiB | 0.10 MiB |
| Traced edit maximum, two trials | 35.3 / 32.2 ms | 17.8 / 17.8 ms |
| Untraced edit maximum, two trials | 33.6 / 18.7 ms | 17.8 / 17.7 ms |
| Traced edit MajorGC events, two trials | 6 / 5 | 1 / 1 |
| 100 edits: post-GC main-isolate usedSize | 1099.90 MiB | 1086.06 MiB |
| 100 edits: backingStorageSize | 658.55 MiB | 658.56 MiB |
| Probe disposal: post-GC usedSize | 1101.48 MiB | 1087.63 MiB |

All measured windows on both sides have zero frames over 50 ms; this does not prove elimination of the historical 66.7 ms frame. Traced edit P99 is 18.7 ms before and 17.7 ms after, but idle cadence also shifts by about 1 ms; the allocation reduction and reduced GC pressure are stronger evidence than that small P99 difference. Candidate retention is approximately flat from edit 50 to 100 (1086.05 → 1086.06 MiB). Initial backing growth is scene initialization, not a comparable leak slope. GPU/Worker heaps/process RSS and long-term leak freedom are not covered. The scene has 74 assets, about 1.93 million embedded text characters and zero embedded binary bytes; binary isolation is independently tested, but binary-heavy performance is not established.

Both sides pass four naturally matured crop harvests, idempotent command replay and crop removal, plus a building appearance edit/restore with author/resource agreement. Harvest maximums are 17.7 ms before and 18.8 ms after, without MajorGC; there is no demonstrated harvest-frame improvement in this run. Candidate planting still has a 33.3 ms frame correlated with 27.3 ms of first-use PBR shader compilation (25.3 ms in `getProgramParameter`), without GC. That cold rendering cost is unchanged in scope. Idle allocation remains about 378 / 366 MiB over ten seconds. The retained scene buffers and full IndexedDB `put` remain separate costs; the callback still accounts for about 112 MiB per 30 edits even though revision checks no longer deserialize the project. No product GC calls, timed cache expiration, reduced validation or rendering workarounds were added.

Validation: Runtime Editor core 122 tests, simplified checker/transaction 43 tests, PlannedMasonry 22 tests and Farming persistence 15 tests pass (202 distinct tests). Native Chromium IndexedDB covers blocked upgrade recovery, non-destructive v2 migration, source-byte/metadata isolation, indexed and legacy revision checks, stale-page writes, delete/recreate conflicts, aborted writes and queued captures. Runtime Editor/Terrain `--noEmit` and generated Scene/Farming declarations pass. Run the native storage contract with `node tests/runtime-editor/project-storage-browser.mjs`; use the existing frame/memory harnesses above for scene comparisons. Evidence, traces, profiles, source hashes and the isolated four-file implementation delta: `performance/runtime-copy-optimization-2026-10-28/summary.json` (local-only evidence).


### Incremental IndexedDB persistence, 2026-10-28

Database schema 4 adds `projectFiles` while keeping project headers/revisions in `projects`. A file is keyed by `[projectId, kind, virtualPath]`, with separate asset/document kinds. Headers contain the manifest and lists of embedded paths, preserving unloaded asset entries and optional documents. The export package format is version 6. Earlier package versions reject; merely opening the database does not rewrite or delete those records.

Every save captures an isolated package before queuing, then uses its last successfully loaded/committed private snapshot for exact text or byte comparison. Unchanged values are skipped even when maps or binary buffers have new identities. Only changed files are put and removed files are deleted. The header/revision is always put to retain the existing successful-save conflict semantics. Revision checking and **all** file/header writes use one `readwrite` transaction spanning both stores. Read reconstruction also spans both stores in one readonly transaction. Same-instance reads/writes are queued in invocation order, and neither failed transactions nor failed loads advance the private baseline. New/recreated project IDs clear only that project's orphan file keys in the same transaction. Missing stored files fail visibly rather than falling back to remote content.

The comparison snapshot is derived state owned by storage, not a second mutable project or independent revision ledger. Text leaves are immutable and shared; binary comparison baselines are private byte copies. Closing storage clears the baselines and rejects subsequent queued operations. This exact comparison retains a binary-memory cost for binary-heavy embedded packages; no hash, TTL, product GC, skipped validation, altered Worker/checker or gameplay-specific persistence branch is used.

The frozen baseline includes all preceding optimizations. Only `runtime-project.ts` differs in product code. Real Seed World comparisons use the same Chrome 146 / ANGLE Metal protocol and separate frame/allocation runs. Five post-timing Worker edits write 9,851,785 embedded text characters in the baseline versus 20,270 in the candidate: five full-package puts become five small headers plus five changed Scene records. This character count excludes header metadata and is not an on-disk byte count. A fresh storage connection reconstructs Scene, PlannedMasonry and Farming Catalog identically to accepted author data.

| Measurement | Before | After |
| --- | ---: | ---: |
| 30 edits, sampled main-isolate allocation | 263.39 MiB | 141.55 MiB (−46.3%) |
| Storage callback, inclusive sampled allocation | 111.89 MiB | 0.91 MiB |
| Traced edit maximum, two trials | 17.8 / 18.7 ms | 17.8 / 17.7 ms |
| Untraced edit maximum, two trials | 17.7 / 18.8 ms | 17.7 / 17.7 ms |
| 100 edits, post-GC usedSize | 1086.10 MiB | 1085.78 MiB |
| 100 edits, backingStorageSize | 658.56 MiB | 659.24 MiB |

Both sides already have zero >50 ms frames in these windows. Idle cadence varies too, so this establishes reduced serialization/allocation, not a meaningful long-frame or retained-memory improvement. Sampled edit windows last 2.200 / 1.824 seconds and include intervening rendering; callback attribution and actual write contents provide the more direct causal evidence. Idle allocation remains 384.47 / 389.31 MiB over approximately ten seconds. Main-isolate retention is essentially unchanged, and settled samples do not rise consistently with edit count. Binary-heavy projects, huge file-count load costs, GPU/process RSS and long-term leaks are not measured.

Both full runs verify four naturally matured harvests, idempotent replay, crop removal and building color edit/restoration. Harvest maxima are 18.7 ms on both sides. Candidate setup records one real `VERSION_CONFLICT` during irrigation after a successful plant; the harness re-queries remaining empty plots without repeating that plant or replacing the captured revision. All four crops still mature naturally. Planting maxima are 35.2 / 33.3 ms; these first-use frames are not credited as persistence gains.

Validation: 200 targeted tests across 16 files; native Chromium tests separately cover both schema-2 and schema-3 migration, atomic file/header rollback, cross-page conflicts, concurrent snapshot reads, exact binary comparison, isolated capture, deletions/renames, orphan cleanup and failed-save retry. Runtime Editor/Terrain `--noEmit` and Scene/Farming generation checks pass. Evidence and reproduction scripts: `performance/runtime-idb-delta-2026-10-28/summary.json` (local-only evidence). Set `API_DIAG_VERIFY_STORAGE=1` on the existing frame harness to audit native writes only after timing windows. Compressed heap profiles can be decompressed before using the allocation analyzer. This persistence-only change does not include a new production bundle-size measurement.

Final review also checks the preset-system declaration snapshot. It initially reported stale declarations from the optimization series; regenerating with `world/scripts/build-preset-system-declarations.mjs` updates three declaration entries (+646 bytes), and `--check` now passes. This type-text refresh follows the scene measurements; implementation bodies are unchanged. The measurements do not claim an exact final-bundle comparison. Additional search/API regressions pass 82 tests. Whole-change review and separately reproduced search issues are recorded in `performance/whole-change-review-2026-10-28/review.json` (local-only evidence).


### Search review closure (2026-10-28)

`SEARCH-1` and `SEARCH-2` from the whole-change review are closed through a shared canonical VFS text view, rather than normalizing one writer or caching synthesized files. Search supports generated manifests/metadata and cold text; explicit `read_tool` retains preparation semantics used by later asset validation. Remote searches close their readers without installing content in the accepted package. No changes to transaction ownership, storage CAS/atomicity, simplified TSC, or execution/compiler Worker routing.

The real Seed World acceptance writes a nested document through the actual checker/execution Workers and native transaction, then verifies search coordinates through `read_tool`. It also searches the actual remote Seed World Scene 20 times with no search cache entries, followed by the expected explicit-read hydration. Final native frame P99 matches the baseline at about 17.7 ms; repeated-search post-GC heap stays around 1091 MiB. Broader text coverage increases transient work, and 4× CPU still exposes Engine frame costs. See paired measurements (local-only evidence) and review (local-only evidence).

Validation: 152 targeted tests passed with the pre-existing image-event assertion excluded; after removing redundant stream wrapping, 48 relevant tests passed again. AI Chat and Runtime Editor typechecks pass. The broader run had 885/889 passing initially; the three relevant/obsolete assertions were resolved and retested. The remaining image-event assertion reproduces unchanged in the frozen pre-fix tree: raw image events intentionally carry pixels to the trace owner, while that assertion expects all events to be redacted. It is not attributed to this search change; no claim that the entire suite is green.


### Script file APIs (2026-10-29)

The model uses external `read/write/edit/delete/glob/grep` tools for project files and `execute` for editor/world APIs. `files.*` and `editor.document.*` are removed from scripts. File reads observe committed VFS state; each file mutation independently commits through host document operations. Existing write/edit targets require a current read; edit performs exact literal replacement. Registered assets still use `editor.asset.*`. Multiple calls in one model response retain separate IDs/results: safe reads may overlap, while mutations and execute are ordered exclusive barriers. The script checker, editor draft transaction, failure diagnostics, and Console/Return behavior are unchanged.

Console and Return are separate result/debug channels. A 64 KiB display budget replaces the former 4 KiB return limit. Overflow is available through immutable task output files; output presentation cannot change transaction receipts. Simplified TSC, execution Workers, error locations and rollback rules remain in place. See [AI Chat](../ai-chat/README.md) for output resource/storage limits.


## Agent Skills（2026-11-04）

运行时 Skill 由各系统自行提供，通过 AgentScriptApiCatalog.skills 注册。`createAgentProjectFiles` 将正文挂载到 VFS 根目录 skills/<name>/SKILL.md，子 Skill 和参考资料通过 documents 挂载；路径不可被项目资产或文档写入覆盖。`buildAgentMessages` 在 skills 上下文携带名称、用途与 SKILL.md 路径，不将全文加入 System Prompt。LLM 按需通过 read 读取正文和引用。

当前注册 galacean-editor，资产使用参考文档沿用 Editor 的职责划分，并使用当前 runtime editor 的真实 API。Skill 前言与注册元数据保持一致，链接与只读边界由 runtime-native-knowledge、files-draft 和 agent-skills 测试覆盖。Skill 不增加 Worker 权限；资产导入仍由 RuntimeEditor 事务和格式校验负责。

## Virtual roots

- `declare/editor/`: execute API declarations.
- `declare/engine/`: Script Engine and host declarations.
- `skills/<name>/SKILL.md`: workflow instructions, with sub-skills and `references/` beside them; frontmatter is the sole name/description source. Requests contain only metadata and path; bodies are read on demand.
- `.ai/outputs/`: long text outputs retained for the session with a bounded LRU. No project persistence. Screenshots retain their task lifetime; the existing editor/execute.js view exposes only the current task’s latest source, without new history storage.
- Project assets keep their virtual paths. Only registered assets expose `.meta`; project.json, folders and ordinary documents do not.

`editor.asset.info({path})` reads metadata without downloading content. `editor.asset.read({path})` returns a discriminated result: text, structured JSON, PNG/JPEG image dimensions, or GLB static model-local structure and bounds. It rejects unsupported encodings instead of returning empty data. Raw VFS read remains text/binary-descriptor access.
