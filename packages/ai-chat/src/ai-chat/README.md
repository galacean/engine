# AIChat

`shared/ai-chat` is the browser-owned Agent infrastructure shared by Gallery applications. It is deliberately independent from terrain, water, vegetation, rendering, and other application domains.

This document defines the current protocol as one breaking, compatibility-free contract.

## Agent boundary

The model is responsible for:

1. understanding the current instruction, including likely ASR substitutions and contextual references;
2. reading the application's knowledge index and retrieving only the guides and declarations needed through the external `read` tool;
3. writing or revising a task script;
4. choosing the console messages and return value needed for the next decision;
5. interpreting the returned result and either writing another script or completing the task.

The model uses provider-native Tool Calling to invoke `read`, `write`, `edit`, `delete`, `glob`, `grep`, `execute`, or the optional `observe_view` / `read_image` capabilities.
When the task is complete, it returns an ordinary assistant message without a Tool Call.
The loop records sequential step numbers without a fixed task step limit.
Cancellation, error handling, script timeouts, repair limits, no-progress protection and host-call budgets still apply.
When the existing context is sufficient and no operation is needed, the model can reply without invoking a Tool.
Claims about completed operations still require actual Tool Result evidence.
There is no separate intent-classification protocol or custom JSON decision envelope before the Agent Loop.

### VFS text search

`grep({ pattern, path?, include? })` searches virtual project text with RE2 regular expressions. `path` accepts an exact file or directory; omitted or `"."` means the root. `include` accepts one positive glob, including brace alternatives and character classes. Scoped patterns match relative to the searched directory; basename patterns match at any depth. VCS metadata is excluded before opening contents. Results show matching lines grouped by file; partial scans report the reason and unavailable files explicitly.

The internal VFS search API also supports literal search and case-insensitive flags. Those are host implementation options, not additional model tools.

Each matching line yields at most one `{ path, line, column, text, textColumn }`. Positions are 1-based UTF-16 offsets, compatible with `read` windows. `text` is a maximum 400-character same-line excerpt starting at `textColumn`, not a complete contract or necessarily a complete line. Use the hit's `line` to read its surrounding declaration and required guide. Reading or searching does not create an implicit model knowledge cache.

The searcher streams provider paths in registration order without a content/line index. Search and `read` both open the canonical `ProjectFileView`: metadata formatting, generated manifests and UTF-8 decoding belong to the provider, so the two tools use the same coordinates. There is no separate resident-only `peek` representation. Path/glob filtering happens before opening content. Searches observe current content per file, not a cross-file snapshot.

Providers can implement `open(path, signal)` with an operation-scoped text stream or a binary descriptor. Existing providers remain compatible through `prepare` + canonical `read`; their existing loading policy still applies. Runtime project searches stream remote text without installing body contents into the accepted package. Explicit `read` keeps the existing provider preparation/cache behavior so subsequent editor asset validation can use the loaded content; after preparation it opens the same canonical view. Configured lazy searches load transiently; explicit reads/import preparation retain the existing catalog cache. Search skips known binary assets without downloading their bodies. Custom asset types declare text through the existing registered format/encoding mechanism. Cold Engine declaration reads/searches share the existing lazy module import; that module is retained by the browser, not a new search cache. Streams must honor cancellation and release resources on iterator closure; custom synchronous loaders are outside the cooperative scheduler's control.

Runtime limits are host-owned: 16 Ki UTF-16 character blocks, approximately 2 ms cooperative time slices, 8 Mi scanned characters, 20,000 visited paths, 250 ms traversal/scanning budget (excluding awaits for content), a separate 5 s wall deadline, at most 250 matches and a 16 KiB serialized Tool Result. Long lines are processed across blocks. Fixed-string case-insensitive matching does not lowercase the full source. Returned excerpts copy their bounded characters so retained results cannot pin entire files through substring backing storage. Reads return bounded windows and total line counts, including for large streams. Search allocates no persistent content cache; bounded results still live in the existing conversation/trace owners.

`complete` is true only when traversal finishes without a budget stop or read failures. `stopReason` is `match_limit`, `output_budget`, `scan_budget`, `path_budget`, `time_budget`, or null. `unavailableFiles` counts failed opens/streams; `errors` contains up to four bounded path/message diagnostics. A null stop reason with `unavailableFiles > 0` is still incomplete. Counts describe only visited/scanned work; `searchedFiles` counts fully scanned text files and `scannedChars` conservatively counts blocks inspected, including the final partial block. Incomplete results do not establish absence; narrow the scope or explicitly read a candidate. Abort is checked at task yields and between blocks/files. A slice target is cooperative, not a hard deadline: provider enumeration/serialization, engine string representation work, scheduling and GC remain browser operations.

The design references ripgrep's separation of searching and result collection, bounded buffering and match limits ([searcher source](https://github.com/BurntSushi/ripgrep/blob/master/crates/searcher/src/searcher/mod.rs)); it introduces no native/WASM dependency or copied upstream code.

Regex patterns run on each complete logical line, even across incoming chunks. CRLF is normalized consistently with `read`; no cross-line matches, backreferences or lookaround are supported. Anchors apply to the whole line, not a scan block. Case-insensitive mode uses RE2JS flags (inline pattern flags can override them). Unsupported syntax and compiled programs exceeding 8,192 instructions fail explicitly; there is no fallback to JavaScript RegExp. One match per line is returned, including zero-width matches; empty files and the position after a final LF are not extra lines.

Only regex searches create a dedicated module Worker. It owns compilation and matching, while VFS remains on the host. At most one 16K-character message is in flight, with at most one unfinished line buffered in the Worker; total scanned input remains capped at 8M UTF-16 units. The 250 ms scan budget includes matching/message waits, but excludes content loading and Worker initialization. Compilation has a separate 250 ms watchdog; the 5 s wall deadline bounds the entire operation. Cancellation, timeout, errors and successful completion terminate the Worker. The RE2JS module is a separate production Worker asset, not a main-thread import; there is no resident Worker pool or content index. These bounds do not claim constant memory independent of the longest line, or a hard main-thread frame deadline.

Run `node tests/runtime-editor/regex-search-browser.mjs` to verify the production Worker bundle, cross-chunk matching, cancellation, output budgets and repeated-search retention. Run `REGEX_SCENE_URL='http://127.0.0.1:4173/demos/terrain/seed-world-planner/index.html?seed=1&aiChat=1&agentTrace=1' node tests/runtime-editor/regex-search-scene.mjs` for actual Seed World rendering and deterministic native Tool calls. Raw reports remain local under `/tmp` by default.

From the materialized `world-gallery`, run `node tests/runtime-editor/search-performance.mjs` (or `SEARCH_CHROME_CHANNEL=chrome node tests/runtime-editor/search-performance.mjs`). It bundles the actual implementation, tests cold Engine declaration loading, searches actual Engine declarations and stress fixtures with renderer frame/task tracing at native and 4x CPU rates, checks cancellation, and compares post-GC heap after repeated searches and a retained excerpt from a transient 16 Mi-character source. Output: `test-results/search-tool-performance.json`. Desktop Chromium/CPU emulation measures this CPU path; it does not replace active-world or physical mobile device acceptance.

Historical resident-only implementation, before the canonical-view fix: 2026-10-27 measurement snapshot (local-only evidence), Chrome 146: 699 Engine declaration files / 911,409 characters took 1.7–2.1 ms per search at native CPU and 6.4–19 ms at 4x throttle. Across declaration, 8 Mi-character long-line, dense short-line and 20,001-path fixtures, main-thread task P99 was 3.72 / 3.44 ms (native / 4x), with maxima of 13.58 / 4.31 ms and no 50 ms long tasks. Search rAF P99 was 17.7 / 17.6 ms versus idle 17.4 / 17.6 ms. Dense short-line searches at 4x throttle reached the wall-time budget and correctly returned incomplete results.

Repeated searches retained approximately 25 / 5 KiB after forced GC. The 10 ms sampled transient heap increase was approximately 3.1 / 2.4 MiB; this is a sampled high-water mark, not an exact instantaneous peak. Saving an excerpt from a transient 16 Mi-character source retained approximately 14 KiB after GC, and cold declaration search made zero downloads. These deltas exclude pre-existing fixture/module memory and are observations from this run, not fixed per-search allocation guarantees.

### Seed World 3D scene validation

2026-10-27 actual-scene report (local-only evidence) and scene capture (local-only evidence): headed Chrome 146, Apple M2 / ANGLE Metal, 1280×800, seed 1, real terrain/vegetation/water/buildings and Agent HUD. The test uses the scene's application definition/providers, not a separate text fixture. An explicit Entity.d.ts read prepares the normal declaration bundle before warm measurements: 1,652 virtual paths and 5,663,631 resident text characters in a full miss. The initial cold search made no network requests.

Five alternating idle/search windows per CPU rate keep the camera fixed and the actual Engine rendering. Search windows attempt a call every 100 ms, rotating a full resident-text miss, bounded declaration matches and a case-insensitive parameter lookup; result conversion/serialization is included. At native CPU, the two search windows had frame P99 17.7 ms and approximately 60 FPS, with no >50 ms frames. Idle averages were 58.8 FPS and search averages 59.6 FPS; one idle window also had a 34.2 ms P99, so no extra persistent frame loss was observed under this native load.

At 4x CPU throttle the scene already runs near its CPU limit: idle averages were 28.0 FPS, high-frequency search averages 25.3 FPS, and >50 ms frame ratios rose from 7.8% to 17.2%. A subsequent idle/search/idle comparison at one attempted search per second had P99 50.0/50.2/50.1 ms; average FPS still decreased slightly during search. These results establish a loaded-scene cost, not a zero-overhead guarantee. Cooperative search wall time can exceed its 250 ms target while the renderer delays the next continuation.

Across 600 mixed searches, main-page post-GC heap ended 394,488 bytes (0.38 MiB) above baseline, without a sustained increase; one intermediate sample rose and then fell again. Backing storage was effectively constant. This scene's own post-GC heap was approximately 1.06 GiB, independent of the small search delta. A warmed-HUD follow-up drove 120 real Agent Loop tasks using deterministic native search_tool responses through the existing CandyJar envelope: Trace stayed at 20 records, post-GC heap grew about 1.85 MiB including retained task evidence, and the change from task 20 to 120 was 0.18 MiB. After ten seconds idle and clearing Trace/session history, heap returned to about 0.39 MiB above that follow-up's baseline. No unbounded search-content retention was observed.

Reproduce with the current worktree's Gallery server running: `SEARCH_CHROME_CHANNEL=chrome node tests/runtime-editor/search-scene-performance.mjs`, from the materialized `world-gallery`. `SEARCH_SCENE_URL` overrides the scene URL. Test-only response instrumentation exposes the live application/HUD; product modules need no benchmark hooks. Forced GC pauses occur outside frame windows. The memory metrics cover the main page isolate/backing storage; they are not total browser RSS or Worker heap measurements. CPU throttling is desktop emulation, and model responses are controlled, so these measurements do not establish physical mobile-device performance or live model latency.

### View observation

Applications may supply `AgentApplicationDefinition.observeView`. This exposes the argument-free `observe_view` tool; the model decides whether and when to use it. It returns a camera snapshot, not object identities or proof that an operation succeeded. No screenshot is captured or sent unless the tool is called.

Each capture returns a stable task-local image ID, capture time and metadata; a paired user message carries the image. The ASAP transport encodes this as text and `image_url` content blocks. Only the latest four image occurrences are sent: older payloads become text references without deleting native Tool Call/Result pairs or original screenshots. `read_image({ imageId })` reintroduces the saved pixels and metadata, not a new capture of the world. The protected `agent_task.images` directory keeps saved images discoverable after server compaction. Offloaded occurrences stay offloaded on later requests.

The task image store owns immutable JPEG/PNG Blobs until completion, failure or cancellation, then releases them. Conversation photo attachments are borrowed through leases and remain readable while their owner retains them; ordinary observations remain task-local. Trace persists image attachments separately and exports pixels only at its serialization boundary. Shared `ImageResourceBudget` accounts for photo images, identity data, display resources and temporary transport/readback allocations; exhaustion reports a paired failure without deleting retained photo originals.

Seed World uses the next normal camera frame's Final Pass color, before Overlay UI, and captures identity/depth synchronously from that same frame before awaiting JPEG export. Color and pointer use the same aspect-preserving dimensions, at most 768 pixels on the longest side. Pointer buffers share the conversation image budget and keep the existing 32 MiB / three-snapshot sub-limits. Snapshot identity is immutable; pointer reads do not rerender or alter selection. Historical notes below describe earlier implementations and measurements, not the current capture contract.

A task does not have to fit in one script. The model may execute several script stages when a result requires new semantic judgement. Data processing with predictable control flow belongs inside a script so arrays, intermediate API results, filtering, ordering, aggregation, and validation do not consume model context.

## Input queue, stop and continue

`AIChatSession` owns a single driver and inbox. `submit(text, options, target)` returns an input ID and completion Promise; `run(...)` returns that Promise directly. `target` defaults to `next-step`:

- With an active task, `next-step` is consumed at the next Agent Loop boundary, after the entire current Tool/execute invocation has settled. It neither interrupts an in-flight model request nor changes a running script. If a final answer arrives with steering pending, the loop takes another step instead of dropping the input.
- `next-turn` starts a new task in FIFO order after the active task succeeds. These entries are never delivered as supplements. Without an active task, either target starts a task.
- Each input snapshots its source, options and application context at submission. The initial instruction and ordered consumed inputs jointly define the goal. A supplement's Promise resolves with the task it steered. `pendingInputs` exposes snapshots; `removeInput(id)` withdraws an unconsumed input and rejects its Promise. The pending inbox is bounded to 64 entries.
- `cancel()` immediately closes admission and aborts the active model/Worker pipeline; `stop()` also waits for settlement. Already committed edits and commands remain committed. Drafts follow the existing transaction discard contract. Existing queued inputs stay parked. A new submission after stop (including while cancellation is settling) starts fresh work after the previous driver exits, without continuing the stopped task. New default input takes precedence over the parked queue; unconsumed old `next-step` inputs are cancelled, while explicit `next-turn` entries retain FIFO order. Submitting an explicit `next-turn` appends to that queue. Previously consumed inputs and committed results remain in history.
- `continue()` returns `Promise<AIChatSubmission>`: after the stop barrier it acknowledges admission with `{ id, completion }`. The ID is the original input ID, not a new turn/input. Only admission failures reject the outer Promise; accepted execution failures reject `completion` and are retained in Session data. To await execution, use `await (await session.continue()).completion`. It then re-enters the model with the stopped task's active (possibly compacted) transcript, paired Tool results, receipts and consumed inputs. It does not resume a JavaScript stack or automatically replay an old script. Task-local image leases are released; retained screenshot versions can be reopened with `read_image`, while expired images require a new observation. Pending supplements join the resumed task; queued turns run afterward. If there is only a parked inbox, it starts its first entry.
- Failed tasks also park the queue. An uncertain publication or unknown command receipt blocks continuation; the caller must inspect/reconcile host state before starting a fresh session. `reset()` explicitly discards continuation, queue and conversation history and is only allowed while settled.

`AIChatSession` is the single lifecycle authority. Its mutually exclusive states are `idle`, `preparing`, `executing`, `stopping`, `stopped`, and terminal `disposed`. Image/ASR preparation is part of the same input lifecycle as execution. `executing → preparing → executing` also occurs when a supplement needs an export. Stop closes admission immediately; the driver is retained only as the physical cancellation barrier until existing work settles. Continue transfers the retained continuation into a new attempt without advancing conversation time. New input during stopping waits for that barrier. Transitions are checked centrally; the machine owns stopped continuation and restart intent, with no parallel paused/disposed flags.

`session.snapshot` / `subscribeState(listener)` expose immutable session data, including current status, capability flags, pending inputs, progress and outcomes. Subscription immediately provides current data. The Session retains the latest 20 attempts and at most 256 semantic progress entries per attempt; raw image bytes and host resources never enter those display records. Accepted commentary is sanitized before storage; raw model/tool transcript events are for diagnostic observers. State notification tolerates observer reentrancy without delivering a superseded snapshot afterward. The DOM chat and Seed World HUD project these facts; they do not independently track task completion. The HUD is reused for the application lifetime; turns only change its projected state. Views handle admission errors locally, but never write task results from `run`/`continue` completion callbacks. DOM focus follows the send interaction, not delayed task completion. View destruction unsubscribes and frees view-owned resources only. The owning application disposes the Session; Seed World's task-viewer and Trace bindings likewise belong to the Session, not the HUD. Voice/ASR, gestures, animation and dismissal remain local presentation state.

`session_state` and task events remain diagnostic subscriptions. `task_started.continuedFrom` links execution attempts. `task_started.inputId` identifies the initial input; `input_consumed` identifies supplements. Model history records and logical user turns differ: `historyRecordCount` counts retained task outcomes (including stop/continue attempts); `ConversationHistory.beginTurn()` advances only when a fresh user goal reaches execution. No state survives a page reload. Cancellation releases the local wait but cannot guarantee that the remote provider stops computing or billing.

Each input owns an ordered array of lightweight image references. Model message assembly derives `inputId`, `photoNumber` and `photoCount` from that array, outside immutable image metadata. Reusing image B from input `[A, B]` in a later input `[B]` produces 2/2 then 1/1 without mutating B. Historical references use message/input order; there is no second round-to-photo index. `read_image` reads immutable version facts, never a cached input-relative ordinal.

The DOM controller accepts input while running: Enter supplements, Shift+Enter queues, Escape stops, and empty Enter continues. Seed World exposes native stop/continue and input-target controls beside the voice orb. Stage feedback uses actual model/read/script events; it is not token streaming or a predicted progress percentage.

## Request context

Every model turn receives the stable Agent protocol and the current task transcript, plus one bounded task context:

```ts
export interface AgentTaskContext {
  instruction: string;
  world_thumbnail: AgentValue;
  history: readonly AgentConversationRecord[];
}

export interface AgentConversationRecord {
  /** ISO 8601 time when this task completed. */
  timestamp: string;
  instruction: string;
  result: AgentTaskOutcome;
}
```

The system prompt contains only general Agent rules. `read({ file_path, offset: 1, limit: 2000 })` reads bounded pages from the requested virtual project files. `editor/README.md` is the host discovery entry; project `README.md` remains an authored document; the model follows guide and declaration imports when needed. The host knowledge mount resolves Markdown links, reference definitions and inline-code file paths to known project-root paths, so callers can copy them into `read` without joining directories. Both `read` and `grep` consume this same published text. External URLs, code examples, declaration imports and authored project files are unchanged; unresolved paths remain errors rather than selecting a similarly named file. Reading files does not change API permissions. The checker independently resolves the complete registered declaration environment. No host filesystem access is exposed. No file is implicitly cached as model knowledge; each task starts with fresh read observations.

`world_thumbnail` is rebuilt for the current decision and describes only the world as it exists now. A world application should keep it small and include information such as the current viewer position and orientation, time, season, weather, and a bounded scene summary. It must not contain recent-operation summaries, previous instructions, API receipts, script results, or execution logs.

Conversation history contains the five most recent `{ timestamp, instruction, inputs?, result }` records. `inputs` retains accepted supplemental text and its input source, without per-input world snapshots.
`timestamp` is the ISO 8601 completion time of the task.
Records are sorted from newest to oldest by `timestamp`, so the first record is the most recently completed task.
History supplements context and references omitted by the current instruction but never overrides information the user stated in the current turn.
It retains compact host execution receipts in result.executions so that a task-level failure cannot hide an earlier committed edit. It does not retain raw model messages, scripts, API calls, raw API results, traces, or older-turn summaries.
Changing the ASAP model route resets this history.

Within one task, every model Tool Call and paired execution result is appended to the canonical transcript. Image entries retain their original IDs and metadata, without duplicating pixels on each reread; original screenshots remain in the task image store. The active transcript replays these original Assistant/Tool messages until a validated server summary replaces a complete older group.
A successful text read returns `{ path, offset, lines, totalLines, next }`. Each line has `{ number, text, column? }`; a non-null `next` supplies the next `offset` and `column`. Binary files return descriptors only. Long-line positions use UTF-16 code units without splitting surrogate pairs. Repeated reads return current content again; nothing is implicitly cached as model knowledge. `editor/execute.js` contains the last submitted script; an external read can inspect it.
The public execute result is `{ok: true, result, console, returnValuePresent, receipt}` or `{ok: false, error, code, phase, ...diagnostics, console, receipt}`; `outputFile` is added when output is saved.
The `ok` envelope belongs to the Agent protocol, not to an application API's resolved value.
An `await tools.*` expression resolves only to the validated success type declared by that API; an application failure rejects through the structured Tool Error channel instead of returning an optional `error` property beside success data.
Raw API collections, local variables, filtering state and logs remain Trace-only.
After successful completion, the native transcript is released and only the compact task record is eligible for cross-turn history. Stopped or failed tasks additionally retain one in-memory continuation checkpoint until continuation, reset, or disposal.

### Server context observations

The frontend does not count tokens. Every model attempt retains any `telemetry` returned by ASAP; pending requests and responses without telemetry remain unknown.
`model_request` still records debug messages (with image bytes omitted), but contains no local estimate. Failed attempts do not borrow usage from earlier attempts.

Successful ASAP responses may contain the resolved `modelName`, `inputLimitTokens`, `maxOutputTokens`, and provider `usage` (`inputTokens`, `outputTokens`, `cachedInputTokens`, `totalTokens`).
`telemetry.inputEstimate` contains `source="asap"`, `scope="prepared-request"`, the adapter request `modelName`, a server-owned `method`, `inputTokens`, `requestTokens`, `imageTokens`, `messageCount`, `imageCount`, and `tokensPerImage`.
ASAP projects the final messages, reasoning, tool declarations/calls and enabled response format into its existing `TokenEstimator` / `Utf8TokenEstimator`. The common request is text-only; ASAP separately reports an image allowance, without counting base64. There is no frontend copy of that algorithm.
The service input gate and telemetry share one observation. The frontend validates its shape and sums, then displays it without recomputing token counts. A new server estimator can use the same telemetry contract without adding a frontend tokenizer.

ASAP's configured context window is an input preflight limit, not a proven shared input/output window. Input occupancy divides observed input tokens by that limit; it neither subtracts the output limit nor discounts cached input.
The Trace panel displays ASAP estimates, provider actual input/output/cache, estimate-minus-actual error, and occupancy. Actual usage remains displayable if an estimate is unavailable. Copy/download export the same structured observations without image pixels.
Telemetry arrives after the provider stream drains in the existing nonce-correlated terminal result, independently of `debugMode`; it is not an additional pre-request counting RPC.
Missing values, older ASAP deployments, cancellations and transport failures remain unknown rather than zero. Server retries and failed provider work are not aggregated into a billing ledger.

Estimates and image allowances are not a safe upper bound. Provider usage is the actual-count source.
Internal DeepSeek probes found ordinary-text matches but special-token and tool-choice counterexamples against official recipe 0.2.0. No official tokenizer is treated as an exact internal counter and no observed offset is fitted. See ASAP UP-MINI-APP-AI-CHAT-003 for reproduction and evidence; deployed browser/SDK parity still requires a deployed ASAP integration check.

### Persistent server compaction

Every AgentLoop request automatically carries `responseFormat.params.contextCompaction = { version: 1, protectedPrefixLength: 2 }` through the existing transport bridge. The fixed prefix is the complete system message plus `agent_task`, rebuilt for each model round. ASAP owns the existing compactor and estimator, with default trigger/target budgets of 80%/50% of its input limit. The frontend has no tokenizer, summarizer, or automatic budget calculation.

Successful terminal results may return top-level `contextCompaction` independently of debug tracing:

```ts
{
  version: 1,
  status: "not_needed" | "compacted" | "failed",
  strategy: "summary",
  beforeTokens: number,
  afterTokens: number,
  durationMs: number,
  reason?: string,
  replacement?: { prefixLength: 2, cutIndex: number, summary: string }
}
```

`cutIndex` counts removed original messages after the two-message prefix, before inserting the summary. `summary` is the whole server summary message content, inserted verbatim as one user message; it is never wrapped, summarized again, or interpreted locally. No original messages or image bytes are echoed in this metadata. A replacement is allowed only for `compacted`, with nonempty summary and strictly lower token count. Unchanged statuses retain equal before/after counts.

The client fails closed on malformed metadata, out-of-range cuts, modified request snapshots, removal of system messages or images, orphan Tool receipts, and cuts through Assistant/Tool groups. It applies each response at most once, before any protocol-correction retry. Subsequent retries and rounds use the persisted active summary and newly appended results, never reconstructing active context from the full canonical transcript. Cancelling a request prevents late patches from being applied; each new task owns a fresh transcript. Existing cross-task final-result history is unchanged.

Canonical messages remain append-only; debug Trace records them in `transcript_appended` events, including Tool receipts removed from effective context. `model_request` shows the actual active request, and attempts retain validated `contextCompaction`. Image bytes are omitted from Trace events. The counter panel displays status, before/after tokens, duration and the server's reason when present; it never displays the summary text in counters or invents a local reason.

Active images and suffix system messages pin the protected tail. ASAP may return `failed` with unchanged context when that prevents useful compaction. Image offloading happens locally before the next request snapshot; it does not relax compaction patch validation. The server estimator, compactor, thresholds and four-image wire limit are unchanged.

Explicit test/debug budgets use `AgentRunOptions.contextCompaction?: { triggerTokens?: number; targetTokens?: number }`. Seed's public diagnostic path retains the normal submit lifecycle and Trace capture:

```ts
SeedWorldAI.debug.enable();
SeedWorldAI.debug.setContextCompactionBudget({ triggerTokens: 12000, targetTokens: 6000 });
await SeedWorldAI.submit("your test task");
SeedWorldAI.debug.setContextCompactionBudget(undefined); // Restore ASAP defaults.
```

The override is validated, copied, held only in memory, and cannot change during a busy/destroyed controller. There are no URL budget parameters or persisted production overrides. Choose test budgets above the protected prefix size; a budget too small for protected content cannot force successful compaction.

Deploy ASAP's bridge-parameter support before deploying this frontend. Missing result metadata remains compatible, but older deployed ASAP versions that reject unknown request parameters are not request-compatible. Such rejection surfaces as a failure; the frontend never retries by removing compaction. Local backend/frontend E2E must exercise the same nonce-correlated terminal envelope before deployment.

Frontend regression commands (from repository root, run sequentially because they sync the same materialized Gallery):

```bash
# Use Node 22+ (the shared execution tests require Promise.withResolvers).
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run shared/ai-chat/tests --config tests/vitest.config.ts
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run demos/terrain/project-tests/SeedWorldVoiceHudController.spec.ts demos/terrain/project-tests/SeedWorldAIChatIntegration.spec.ts --config demos/terrain/project-tests/vitest.config.ts
node world/scripts/run-engine.mjs pnpm --dir world-gallery typecheck:ai-chat
node world/scripts/run-engine.mjs pnpm --dir world-gallery typecheck:terrain
```

### Stage output design

A stage output is a bounded, minimum-sufficient handoff, not a transcript of the script. Its shape follows the result cardinality and lifetime:

- one entity returns the stable reference or ID provided by an API plus only the facts needed later;
- a small, explicitly bounded set may return stable references or IDs;
- a large set returns an API-provided collection handle, exact count, and semantic summary, never every member;
- a bulk mutation returns its transaction handle, affected count, and scope;
- a bulk deletion does not return now-invalid entity references; it keeps the transaction handle needed for tracing or undo;
- an aggregate query returns the aggregate facts rather than its source rows;
- only a decision that still requires model-level semantic judgement returns Top-K candidates, after the script has already performed deterministic query, filtering, and ordering. Each candidate contains a stable reference and only the discriminating facts.

The script may only propagate handles that an API actually returned. It must never invent an entity, collection, selection, or transaction handle. If a later script or future conversation may refer to an earlier entity or operation, every intervening stage output must carry that stable handle forward. Otherwise the handle is intentionally released with that stage's execution context.

For example, creating one tree should preserve the created tree's stable reference so a later instruction can refer to “that tree”:

```json
{
  "created": {
    "ref": "object:tree-42",
    "kind": "tree"
  }
}
```

Deleting every tree should preserve the operation, not enumerate deleted trees:

```json
{
  "transactionId": "transaction:delete-17",
  "deletedCount": 2048,
  "scope": "all trees"
}
```

## Agent Script API surface

An application provides an `AgentScriptApiCatalog` with these parts:

- `catalog`: the root README with links to system guides;
- `documents`: read-only Markdown files keyed by canonical knowledge paths;
- `modules`: generated TypeScript declaration modules. Every callable API, concrete public asset type and shared public type owns an independent `.d.ts` module. A callable module records which registered runtime API it describes; this metadata does not grant permissions.

The model-facing file tools follow DSH naming and argument conventions, adapted to the browser VFS:

| Tool | Arguments | Result |
| --- | --- | --- |
| `read` | `file_path`, `offset?`, `limit?` | Numbered text within `<path>/<content>` blocks, or a binary descriptor |
| `write` | `file_path`, `content` | Create/replace confirmation and host receipt |
| `edit` | `file_path`, `old_string`, `new_string`, `replace_all?` | Literal replacement confirmation and host receipt |
| `delete` | `file_path` | Single-file deletion confirmation and host receipt |
| `glob` | `pattern`, `path?` | Stable sorted paths, first 100 plus a full-list artifact when needed |
| `grep` | `pattern`, `path?`, `include?` | Matching line excerpts grouped by file and explicit partial-scan diagnostics |

`delete` is a local extension using the same file_path/result style; DSH has no standalone delete tool. Virtual paths are project-relative, not OS paths. Glob supports `*`, `?`, `**`, character classes and `{a,b}`; VFS has no mtime, so paths sort lexically. Read defaults to 2000 lines with the existing 16 KiB page budget and a 32 KiB transport bound. Rows that do not fit a page are deferred intact to the next offset. Lines longer than 2000 UTF-16 units explicitly report truncation without splitting surrogate pairs; the external API has line offsets, without a column argument. Regex matching runs in a dedicated Worker with the existing scan/time/output budgets. These are VFS adaptations, not native shell commands.

ASAP requires strict function schemas. Provider declarations therefore require every property, with `null` representing an unused optional argument. Runtime validation also accepts omission; `null` and omission both select the documented defaults.

`write`, `edit` and `delete` open host-owned document transactions and each commit independently. Existing write/edit targets must have been read in this task and remain unchanged; literal edit must match uniquely unless `replace_all=true`. Empty replacement removes matched text. Delete rejects missing paths and removes the file's metadata. Registered assets still use `editor.asset.*`; `editor/`, execution output and mounted libraries are read-only. Host validation enforces metadata and path boundaries.

One assistant response may contain multiple calls with unique IDs. Consecutive read/glob/grep calls run concurrently (up to eight); write/edit/delete, execute and image calls are ordered barriers. Each call gets its own result or error. Ordinary failures preserve sibling calls. Cancellation, exhausted task budgets or uncertain publication stop admission, settle started work, and return explicit interrupted/not-started replies for remaining IDs. All replies precede image context messages in the transcript. Trace uses one model-response cell and independent invocation cells, retaining host commit/activation receipts.

File mutations and execute share the same bounded post-commit activation wait. Cancellation or activation timeout preserves the committed receipt and adds runtimeErrors; it never replays the write or claims rollback. Host activation remains serialized until admitted callbacks settle, checks cancellation between phases, and passes the activation signal to resource loading. Stopping the caller's wait does not synchronously interrupt arbitrary host code. Commit acceptance and background persistence remain separate facts.

All admitted external file and visual calls publish tool_started/tool_finished with their native toolCallId. Script-internal API calls use the same recorder with their execution step/call identity. Tool receipts remain the model-facing evidence; image pixels stay in the image/attachment channel. Visual failures and cancellation are counted even if a later call succeeds. Trace projection enriches an existing call cell rather than rendering a second call for lifecycle events; old traces remain readable.

External reads see committed state, including earlier successful file mutations in the same response. They never run inside an execute draft. `files.*` and `editor.document.*` are absent from script declarations, Worker bindings and native tool registries. `editor.*`, world APIs, simplified TSC, execute transactions and Console/Return retain their existing behavior. No DSH PTC interpreter is introduced.

Declaration dependencies come from generated TypeScript imports, not a handwritten graph. Generic APIs may require reading a concrete asset declaration separately to understand its fields. Seed World publishes nine guides with Usage Guide and API Reference Index sections; API indexes are projected from executable contracts and validated for broken links.

The executable Zod registry remains the application contract truth. Generated TypeScript declarations are the model-readable projection of that registry. `defineTool()` parses every runtime input and output with Zod, while the model sees semantic types, property documentation, function descriptions, parameter descriptions and return descriptions. The model never receives Draft-07 JSON Schema.

## AgentScriptCalling

`AgentScriptCalling` is the complete protocol for model-authored script execution:

```text
AgentScriptCalling
├── AgentScriptCall
├── AgentScriptRuntime
├── AgentScriptResult
└── AgentScriptTrace
```

```ts
export interface AgentScriptCall {
  id: string;
  source: string;
  toolBindings: readonly AgentScriptToolBinding[];
  signal: AbortSignal;
  maxToolCalls: number;
  timeoutMs: number;
  onTrace?(trace: AgentScriptTrace): void;
}

export type AgentScriptResult = ({ ok: true; output: AgentValue } | { ok: false; error: AgentScriptError }) & { receipt?: AgentExecutionReceipt };

export interface AgentScriptRuntime {
  execute(call: AgentScriptCall): Promise<AgentScriptResult>;
}
```

Every model-authored script must run through `AgentScriptRuntime`. The default implementation runs JavaScript in a fresh native Worker, with host-owned API bindings. The local JavaScript executor is used inside that Worker and by explicitly injected Node tests; it is not a production fallback.

A script is an async JavaScript function body: `const r = await editor.asset.list({}); return r;` runs directly, without an entry declaration. Function declarations are ordinary helpers and are never invoked implicitly. Scripts support local variables, helper functions, conditions, arrays and bounded loops through the same bound API facade. Console messages and the script return value are separate output channels. Omitting return is valid and distinct from returning `null`. The checker uses an internal function wrapper for body-form input; diagnostic and runtime locations refer to the original submitted lines, and traces retain the original source. Static imports, dynamic imports and eval remain unsupported.

Each `AgentScriptCall` starts with a fresh execution context. Local variables and raw API results exist only for that call and are released when it ends. Hidden runtime globals do not persist between calls. Data required by a later stage must be included deliberately in Console or Return output, or accessed through a saved output file.

### Checked, transactional execution

1. A lazily created, reusable checker Worker runs TypeScript `allowJs`/`checkJs` against execute JS and the complete registered `.d.ts` environment. It bundles local ES2023 library declarations, caches the language service, emits no code and returns at most 12 diagnostics. Bad code is rejected before opening an edit. API boundary Zod validation remains mandatory: static checking cannot prove termination, resource feasibility or correctness of runtime behavior. Nested script-asset strings are not checked by this stage.
2. The host lazily opens `AgentApplicationDefinition.beginEdit(executionId, signal)` on the first application API call and binds its draft tools. Pure computation and file-only reads do not open a transaction; subsequent file reads join the opened draft queue. Application tools declare `effect: "read" | "edit" | "command"` (default edit); independent commands retain their original host binding and may coexist with draft tools in the same script. The host must preserve domain-owned committed state when publishing a draft; an editing call without a transaction fails closed. Reads owned by the draft must observe earlier draft writes; independent live-system reads retain their original host binding. After all accepted calls settle, the transaction reports pending authoring changes through `hasChanges()`. An unchanged draft is discarded without preparation, publication, revision changes or undo history; accessing draft-bound reads alone is not a change. A query that creates retained editor state, such as a reusable selection, can still require publication. Seed World queues all accepted draft calls in invocation order, including reads and undo; `Promise.all` does not make its history mutations overlap.
3. A fresh execution Worker runs the submitted async function body. The host terminates it on cancellation, timeout or completion. Accepted asynchronous calls are tracked; Returning from the script closes admission, then already accepted calls drain. A failed editing call poisons the transaction even if JS catches it. Output validation also precedes publication.
4. The host prepares resources, checks cancellation one last time, then transfers ownership to commit. Failure before commit discards the draft and revokes late completions. Applications must keep prepare private and implement their own atomic publication; the generic host cannot make arbitrary side effects reversible.
5. Committed behaviors activate with a separate bounded wait using `timeoutMs` and a cancellation signal. Their failures become `receipt.runtimeErrors`; they cannot erase an accepted editor commit. Host callbacks must honor the signal. A Worker can terminate generated JS, not synchronously interrupt arbitrary host engine code.

The authoritative receipt has `executionId`, status and (after publication) application transaction ID/revision. Status is `rejected` (no execution), `aborted` (draft discarded), `committed`, `unsaved` (preview started, save not confirmed; inspect current working state before another edit), or `publication_failed` (publication/cleanup state is uncertain, no automatic script retry). Successful executions with no pending draft changes use `completed`, including pure draft reads and computation; executions that publish draft changes use `committed`, with per-command receipts when applicable. Failed executions with admitted commands use `interrupted`: the draft is discarded, but command receipts remain authoritative and interruption never implies command rollback. A command-only execution does not prepare or publish an unused draft. A thrown host failure or `executed: true` error without a definitive application result leaves that command `unknown`, blocks subsequent independent commands and draft writes in the same script, and stops the Agent Loop. Pure reads remain available for verification. Known nonexecuted refusals may be caught and followed by a new command. When an application has a complete final command receipt including committed side effects, its trusted adapter may set `outcomeKnown: true`; the failure remains a settled rejection with its actual revision, rather than an unknown outcome. Output parsing failures and ambiguous exceptions never inherit this flag. The model must not reuse newly created references from an aborted draft or replay committed creation because a snapshot, trace or activation failed. Per-tool trace success describes draft work, not publication.

This is execution isolation and editor atomicity, not a hardened hostile-code or memory-limit sandbox. No QuickJS is used. Concurrent editor conflict detection and automatic merge are deliberately out of scope. The checker Worker is disposed on cancellation or knowledge reset and recreated lazily on demand.

Seed World provides an in-memory, versioned editor document containing building snapshots, selection/tag memory and environment/camera/mount targets. Building drafts are created on first building access. Building undo retains only changed records (or a removal marker for a newly created building); unchanged documents and renderer objects are reused. Exported editor snapshots remain complete, but transaction creation does not export a snapshot. Selection/tag memory and non-environment editor settings use field inverses and identity-keyed collections, so undo preserves unrelated edits already made in the current execute. For environment/time, ordered field change records carry before/after configured values, fallback runtime targets when configuration was absent, and activation options. Configuration, activation and undo consume these records; undo records its own changes against the current draft. Repeated writes are retained. Other settings inverses still cover targets explicitly touched by legacy inverse engine commands. Whole-execute undo retains the latest 20 editable transactions in this application session; pure reads do not hide the latest edit. Undo restores authored data and configured targets, not elapsed simulation, physical motion or completed gameplay. Environment inverses retain complete affected weather channels, rather than reconstructing them from the public state summary. Time and camera inverses prefer the previous committed target even if its activation failed; ordinary live queries keep their live-state semantics. Existing unsupported legacy landscape CRUD still returns an explicit unsupported error. General script-asset editing is not introduced by this infrastructure change.

## Result and trace separation

`AgentScriptResult` is the only script-execution object returned to the model. On success it contains the value intentionally returned by `main()` and the host transaction receipt. It also includes explicit console entries as `{level,args}` and `returnValuePresent`; raw API arguments/results, timings and intermediate variables remain trace-only unless explicitly logged or returned. Independent commands expose only bounded commit facts (`call`, `tool`, `status`, `ok`, `errorCode`, and optional command/scope IDs, revision and replay flag). Pure queries carry no command receipt. The entire command ledger is limited to 12 KiB; capacity is reserved before invoking a write, so an exhausted budget rejects the next write without dropping earlier commits. Host identity strings have explicit byte limits.

For example, a script that queries 2,000 objects and removes 37 matching trees should return a result shaped like:

```json
{
  "ok": true,
  "output": {
    "removedCount": 37,
    "summary": "Removed all matching trees"
  }
}
```

The complete execution process belongs to `AgentScriptTrace`. A trace may contain script source, available API names, each API's arguments and raw result, ordering, timings, bounded console output, error stacks, cancellation details, and serialization diagnostics. Trace is available to diagnostics and the Agent Trace UI but is never appended to the model transcript or conversation history.

The script's final output must belong to the closed `AgentValue` algebra: `null`, booleans, finite numbers, strings, arrays, and plain string-keyed objects.
As in JSON object serialization, properties whose value is `undefined` are omitted; if every declared root property disappears, the output remains invalid rather than becoming a misleading empty success.
A root `undefined` is represented with `returnValuePresent: false`; explicit `null` has `returnValuePresent: true`. Array holes/undefined elements, invalid numbers, circular values and unsupported return objects remain `INVALID_SCRIPT_OUTPUT`.

Console (`log/info/warn/error/debug`) is snapshotted in call order and retained before exceptions, timeout and cancellation. The trace viewer labels Console, Return and Execution separately. Error codes, source locations, simplified TSC diagnostics, execution evidence and final transaction receipts remain unchanged.

The initial display budget is 64 KiB for Console + Return. Larger output is saved as immutable `execution-output/<execution>.json` containing the complete two channels; the result provides `outputFile` and a bounded preview. The external `read` tool can page through it in later calls, including explicit continuation. If pretty JSON would contain a line longer than the read line cap, the artifact uses a `chunked-json` envelope: concatenate its `chunks` strings in order and parse the reconstructed JSON to recover the original Console and Return. Chunk lines stay within the read cap even after JSON escaping, so generated output is fully recoverable without repeating execution. Ordinary output retains its plain JSON representation. Starting a new task or resetting releases these artifacts. Storage has a conservative 64 MiB UTF-16 task budget; exhaustion preserves existing artifacts and reports that full new output could not be saved, without changing execution success or the commit receipt. This is separate from the execution resource ceilings (8 MiB per return, 8 MiB total console, 10,000 console calls). Exceeding those execution ceilings can still fail execution; the display budget itself cannot roll back an edit.

## Failure and cancellation

Failures returned to the model are compact and actionable:

```ts
export interface AgentScriptError {
  code: string;
  phase: "search" | "check" | "parse" | "execution" | "tool" | "output" | "prepare" | "publish" | "timeout" | "cancelled";
  message: string;
  location?:
    | { source: "execute.code" }
    | { source: "execute.code"; line: number; column: number }
    | { source: "execute.code"; target: "return" };
  tool?: string;
  retryable?: boolean;
  details?: AgentValue;
  execution?: AgentScriptExecutionEvidence;
}
```

`AgentScriptError` is the Engine-internal control and diagnostic contract.
The paired `execute` Tool Result deliberately gives the model only `{ ok: false, error, code, phase, tool?, retryable?, location?, details?, execution?, receipt? }`: `error` is the original actionable message (for structured TS diagnostics, a short summary instead of duplicating the diagnostic list), `location` points into the existing `execute.code` source when the Runtime can identify it, and application `details` are preserved without adding Engine interpretation.
Error codes and phases are preserved so the model can distinguish code diagnostics from checker infrastructure failures; optional Tool identity and retryability are also retained. Check diagnostics include TS codes, messages, virtual file paths and one-based positions, plus related declaration diagnostics. At most 12 primary and 12 related diagnostics per item are returned, with total counts and explicit truncation flags. TS messages and locations appear only in details.diagnostics in the model result; the full internal error message/location remain available to diagnostics.
The Tool Result does not repeat the script because the Assistant Tool Call with the same `tool_call_id` already contains the authoritative source.
Runtime, syntax and output failures use a structured `location`: `source` identifies the paired `execute.code`, `line` and `column` identify a concrete source position when available, and `target: "return"` identifies output projection failures.
Application API failures preserve the API's message and optional business facts instead of replacing them with a second Engine-defined error taxonomy.
Full stack traces and raw values remain in `AgentScriptTrace`; failed API traces retain the original implementation stack, while the model transcript excludes Engine-internal stack frames.
The compact error should provide enough information for the model to revise the next script without replaying successful mutations blindly.
If one or more Tool calls completed before a later script, output, timeout, or Tool failure, the compact error includes bounded `execution` evidence with the retained successful call result and whether earlier results were truncated.
This evidence reports draft execution only. The host receipt determines whether it was committed or discarded; uncertain publication requires inspection before further editing.

The runtime normalizes at least syntax errors, unsupported syntax, API input validation errors, API execution failures, API output validation errors, invalid script output, timeouts, cancellation, and execution-limit failures. `AIChatSession.cancel()` propagates one `AbortSignal` through the active model request, `AgentScriptRuntime`, every API binding, and the application's asynchronous transaction.

`AgentLoop` has explicit stage and repair limits. A failed script may lead to a revised script, but unchanged failures and exhausted limits terminate the task rather than loop indefinitely.

Provider-native strict Tool schemas constrain Tool arguments before the response reaches the application.
The Engine still validates Tool Call count, name and arguments at its boundary.
When a response violates that contract, the Engine does not choose among calls or execute a partial response: it sends the untouched response and the exact validation reason back as a bounded protocol-correction turn, then fails closed if correction attempts are exhausted.
Explicit structured rate-limit errors retain their stable identity across ASAP and CandyJar.
The hosted stream transport preserves error-event fields per request because published SDKs may omit the error code from the final rejected Promise.
Later generic events cannot erase the first failure, and a late successful result cannot override it; the final rejection remains available through the normalized error's cause.
Cancellation and late events are isolated to their originating request.
The parent receiver and child SDK snapshot in `tests/fixtures/published-stream-sdk.json` is exercised together with the production transport by `tests/AIChatPublishedStream.spec.ts`.
ASAP owns bounded retries before semantic output; the Engine never replays a model request and only presents the terminal structured error.

The Loop also treats an exact repetition of both script source and successful model-visible output as no progress. The second consecutive identical result raises `AgentNoProgressError`. A script that intentionally performs incremental work must therefore return the changing handle, cursor, count, or other bounded progress evidence needed by the next stage; hiding all progress and replaying the same side effect is invalid task design.

## Application contract

An application provides:

- an `AgentApplicationDefinition` containing the compact catalog and declaration graph, matching runtime API names, `provideWorldThumbnail()`, and only when necessary optional application constraints that cannot live in API contracts or runtime enforcement;
- a `beginEdit` transaction provider for editing capabilities;
- internal `AgentTool` bindings containing Zod input/output contracts and browser-side execution;
- an optional ASAP model route alias;
- DOM elements only if the optional reusable `AIChat` controller is used; engine-native or custom UI can submit commands to `AIChatSession` and render its `subscribeState` snapshot.

`defineTool()` derives TypeScript input/output types and runtime validation from Zod. Inputs are parsed before application execution; outputs are parsed before they become script values. Zod and Draft-07 JSON Schema are not copied into the model prompt. Internal bindings do not provide cross-turn history projections because API results are never conversation history.

Every API binding receives an execution context containing the active task's `AbortSignal`. Long-running or asynchronous operations must observe it while waiting and should use a domain-appropriate timeout. Application mutations that need atomic behavior remain responsible for their own transaction semantics.

## Transport and local wrapper

ASAP is the only model backend.
The canonical model request carries provider-native `tools`, `toolChoice: "auto"`, and `parallelToolCalls: true`.
The currently deployed Flash App shell drops those top-level fields while preserving `responseFormat`, so `requestAsapChat()` temporarily tunnels them through a versioned `lingguang_ai_chat_transport_bridge` response-format envelope.
ASAP removes that transport envelope before model routing and restores the canonical top-level request; neither the Agent protocol nor the model sees the compatibility layer.
Local Wrapper previews use the same envelope so they exercise the deployed transport contract instead of bypassing it.
ASAP maps Tool definitions, Assistant Tool Calls, Tool Results, Tool Call IDs and finish reasons without executing application Tools or choosing a business action.
ASAP also owns transient Provider retry policy; browser runtimes must not retry model calls because they cannot prove whether an upstream attempt already produced a Tool Call.
AgentLoop records a failed model request as attempt evidence for Trace, then rethrows the same normalized transport error so callers retain its structured type and recovery policy.
Only responses that arrived successfully but violate the Agent protocol are represented as `AgentDecisionError` and corrected through another model turn.
Local wrapper previews use `window.CandyJar.call("FlashApp", "remoteSkill", ...)`, while deployed Flash Apps use `window.lingguang.ai.chat(...)`.
When a local Flash App runs inside the wrapper's child iframe without a directly injected `window.CandyJar`, AIChat installs the wrapper-compatible `postMessage` bridge itself.
The bridge is local-only infrastructure: it forwards calls to the parent wrapper, validates that callbacks came from that parent and its referrer origin, and never replaces an existing native CandyJar channel.

`createAsrClient()` binds exactly one ASR provider for the lifetime of the client. The local Wrapper identifies itself through CandyJar `Env.getRuntimeInfo` and reports its ASR capability in the same response. Once that explicit local runtime identity is present, its capability result is authoritative; the client must not fall back to the public `base.js` development mock. When no local Wrapper claims the runtime, deployed applications bind the documented `window.lingguang.asr.start/stop` contract directly. `start()` is the authoritative capability boundary and reports unsupported clients, permission denial, or device failures through its rejected Promise; internal CandyJar route names must not be passed to `window.lingguang.canIUse` as a gate for this public API. Applications therefore ship one build and do not branch on hostname, Wrapper presence, or deployment environment.

Each `AsrClient.start()` returns an `AsrSession` with `ready`, `done`, `released`, `stop()`, and `abort()`. The session is the only owner of provider callbacks, outcome state, finalization timeout, and exactly-once completion. Internally it uses the mutually exclusive `resolving`, `starting`, `listening`, `stopping`, `aborting`, and `terminal` states instead of coordinating independent lifecycle booleans. The normal completion path is `resolving -> starting -> listening -> stopping -> terminal`; stop, abort, synchronous provider callbacks, and failures may reach the appropriate finalization state earlier, but `terminal` is unique and irreversible. Calling `stop()` before `ready` is valid and must still settle `done` promptly; the provider is responsible for closing its pending start operation and releasing any resource that arrives late. `ready` resolves only after the selected provider crosses its documented start boundary; if the session reaches a terminal state first, `ready` rejects with `ASR_START_CANCELLED` instead of reporting a false successful start. `done` is only the user-visible disposition boundary; it never proves that the provider has released the microphone or its session resource. `released` is the sole resource-ownership boundary and resolves only from the provider adapter's authoritative release signal. Provider `requestStop()` and `requestAbort()` Promises report command results only and are never interpreted as resource-release evidence by the managed session. The native adapter publishes `released` from `onEnd` for normal stop/error completion and from a successful public `abort()` Promise for cancellation: the deployed bridge defines abort as immediate cancellation and removes that session's callbacks once the call succeeds, so no later `onEnd("abort")` can be observed. A rejected or pending native abort remains quarantined until a real `onEnd` arrives. The local adapter publishes release from the unique terminal event or the local `abort=true` success callback whose protocol guarantees cleanup first. `onError` records the failure but is not release evidence because the official native contract sends `onEnd("error")` afterwards. An abort timeout completes `done` as failed but leaves `released` pending, so the client remains quarantined without inventing cleanup success. If `released` arrives later, the client leaves quarantine automatically regardless of whether the earlier abort command rejected or stayed pending. If a stop request fails, the session falls back to a provider abort request while the same `released` Promise continues to own cleanup authority. UI code that cancels a press-to-talk attempt waits for `abort()`'s bounded outcome and additionally waits for `released` only when that outcome succeeds; after a failed abort it surfaces a cleanup error and lets unrelated text input continue while the client itself keeps new ASR sessions quarantined. Native permission dialogs may blur and refocus the WebView without hiding the application, so HUD lifecycle code records plain `window.blur` and `window.focus` events without treating them as cancellation. A modal `pointercancel` is instead the authoritative end of that press gesture: the HUD cancels and cleans up the first attempt so the user can press again after granting permission. An actual hidden-document transition also interrupts the active voice interaction. For the native provider, invoking `window.lingguang.asr.start()` is the start boundary because the production shell may keep its returned Promise pending for the complete recognition session; final completion is represented only by the session's `done` Promise. The local provider uses the explicit CandyJar start callback as its `ready` boundary. The HUD consumes only this session contract and never decides provider availability or reconstructs ASR lifecycle flags.

`AsrClient.getDiagnostics()` returns the bounded runtime capability and lifecycle snapshot, while `subscribeDiagnostics()` publishes a new snapshot after every provider or session event. Diagnostic observers are isolated from microphone ownership: listener failures are swallowed and cannot change ASR state. A UI may therefore expose start, provider selection, ready, interim text, stop, end, terminal, and release events while recognition is still in progress instead of waiting for `done`.

The application document that owns `AIChatSession` must be the direct application iframe managed by the Flash App Wrapper. Do not wrap a Gallery or router shell that embeds the application in another iframe, because CandyJar is not injected through arbitrary nested iframe boundaries. The Seed World Planner runbook in `demos/terrain/seed-world-planner/README.md` is the canonical end-to-end startup, smoke-test, troubleshooting, shutdown, build, and publication procedure.

## Minimal integration

```ts
import * as z from "zod";
import { AgentLoop, AIChatSession, defineTool, type AgentApplicationDefinition } from "./index";

const tools = [
  defineTool({
    name: "scene.read",
    effect: "read",
    input: z.strictObject({}),
    output: z.strictObject({
      version: z.number().int(),
      entities: z.array(z.object({ id: z.string() })),
      selection: z.array(z.string())
    }),
    execute: () => application.readState()
  })
];

const definition: AgentApplicationDefinition = {
  scriptApi: {
    catalog: "| 能力 | 内部函数符号 |\n| --- | --- |\n| 读取场景 | scene.read |",
    entries: [{
      name: "scene.read",
      description: "读取最新场景状态",
      moduleId: "tools/scene.read.d.ts"
    }, {
      name: "SceneState",
      description: "场景状态",
      moduleId: "assets/SceneState.d.ts"
    }],
    modules: [{
      id: "tools/scene.read.d.ts",
      source: "import type { SceneState } from '../assets/SceneState';\ndeclare global { namespace AgentTools { interface SceneApi { read(): Promise<SceneState>; } } const tools: { readonly scene: AgentTools.SceneApi }; }\nexport {};",
      imports: ["assets/SceneState.d.ts"],
      toolNames: ["scene.read"]
    }, {
      id: "assets/SceneState.d.ts",
      source: "export type SceneState = { version: number; entities: { id: string }[]; selection: string[] };",
      imports: []
    }]
  },
  toolNames: tools.map((tool) => tool.name),
  provideWorldThumbnail: () => application.getThumbnail()
};

const session = new AIChatSession({ agent: new AgentLoop({ definition, tools }) });
await session.run("find the nearest selected entity", {
  model: "provider-model-alias"
});
```

When discovery is needed, the model retrieves a declaration through a native Tool Call:

```json
{
  "id": "call-read-1",
  "type": "function",
  "function": {
    "name": "read",
    "arguments": "{\"file_path\": \"editor/tools/scene.read.d.ts\"}"
  }
}
```

The Tool Result returns only the requested file with the matching Tool Call ID. The next request retains these files in the transcript, without changing the System Prompt.
A following `execute` Tool Call can query and reduce data without returning intermediate objects to the model:

```json
{
  "id": "call-execute-1",
  "type": "function",
  "function": {
    "name": "execute",
    "arguments": "{\"code\":\"const state = await tools.scene.read(); return { entityCount: state.entities.length };\"}"
  }
}
```

The model receives only `{ "ok": true, "result": { "entityCount": 12 } }`.
It can then call another Tool or return an ordinary assistant message as the final task result.
Cross-turn history stores only that final task result together with the original instruction.

`demos/terrain/seed-world-planner/agent-adapter` is the reference application adapter.

## Verification

The regression suite must verify the request-context boundary, five-record history, API declaration integrity, fresh per-call runtime state, compact script results, trace isolation, error normalization, multi-stage execution, limits, and cancellation.

```bash
cd world
pnpm gallery:sync
node scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run \
  shared/ai-chat/tests/AIChatAgentLoop.spec.ts \
  shared/ai-chat/tests/AIChatAgentProtocol.spec.ts \
  shared/ai-chat/tests/AIChatSession.spec.ts \
  shared/ai-chat/tests/AIChatController.spec.ts \
  shared/ai-chat/tests/AIChatCandyJarBridge.spec.ts \
  shared/ai-chat/tests/AIChatConversationHistory.spec.ts \
  demos/terrain/project-tests/SeedWorldAgentApplication.spec.ts \
  --config demos/terrain/project-tests/vitest.config.ts
```
## Knowledge visibility

An external `read` exposes only its returned page to the model; it is not evidence that the entire document was seen. Script Console and Return expose only their displayed portions. There is no `session_knowledge` promotion or hidden reread. Pagination, output artifact paths and normal transcript compaction make the visible evidence explicit. The complete declaration graph remains available to the simplified TSC regardless of model-visible output.

## Module ownership

ASAP owns bounded output-length retries. The frontend never adds its own retry after a server model failure.
Nonce-correlated results with `error` become terminal request failures before Tool parsing or execution; their code, finish reason, trace ID and server usage remain in Agent Trace.
Server-filtered `error.details` is retained as a snapshot in each server attempt and in the frontend attempt's `errorDetails`, including after rate-limit presentation wrapping, so exported Trace preserves diagnostic metadata.
`modelAttempts` preserves each server attempt, including rejected candidates. Top-level telemetry is the final attempt, not cumulative input occupancy; missing observations stay unknown. The context panel renders these server observations without implementing a token estimator.

- This module owns conversations, model transport, Agent protocol, execute checking and its Worker.
- [Runtime editor](../runtime-editor/README.md) owns project data, asset/scene edits, Script compilation and live projection.
- [Editor Agent adapter](../runtime-editor-agent/README.md) exposes those operations as Tools and knowledge.
- Shared file-view and transaction contracts live in `../project-files/virtual-project-files.ts` and `../edit-transaction.ts`; compiler libraries live in `../script-checking/`.
- Tests here cover Agent behavior. World tests live with the application; browser and live-model integration live in `../../tests/runtime-editor/`.

Run `pnpm run typecheck:ai-chat`; use the Gallery-wide `pnpm run test:editing` for the complete editing chain.

### Read observations and task call budgets

A successful unchanged draft may accept session observations through `completeRead()` before discard. This does not prepare, commit, save, increment the project revision, or create an undo entry. Failed scripts discard their observations along with the draft. Applications must keep transient query history out of `hasChanges()` and serialized authoring documents; explicitly saving a named selection or tag remains an edit.

`maxToolCallsPerTask` defaults to 256 host API calls across all execute stages, in addition to the per-script limit. Changing the script or recovering from an error does not reset this budget. The Worker receives the remaining allowance; exhausting it cannot be hidden by catching the error. Pure computation and a final response remain possible after using exactly the allowance. An attempt to exceed it terminates the task with `TASK_TOOL_CALL_LIMIT`, preserving receipts for earlier committed operations. Budget exhaustion is an incomplete task, never evidence that a spatial condition is false.

Native execution prepares and commits authoring in memory, then activates the runtime. Background checkpoint status is exposed by the project persistence API; a committed receipt does not imply IndexedDB durability. Activation failures remain `runtimeErrors` and do not undo authoring. A failed checkpoint can be retried through `project.flush()` without replaying the command.

Both execute and standalone write/edit/delete own terminal completion of their EditTransaction. They release preparation resources even when activation is skipped after commit, or prepare/publication/activation fails. Completion is idempotent and never undoes accepted authoring; committed cleanup failures join runtimeErrors without replacing the transaction ID or existing activation errors. Precommit cleanup failures preserve the original failure diagnostic.


### 2026-10-28 canonical text-view verification

The two review findings are fixed at the VFS content boundary: automatically authored folder metadata now has the same search/read coordinates; project manifests, implicit sidecars, Engine manifests and cold declarations are searchable without a preliminary read. Explicit reads still prepare/cache assets under the existing owner policy; searches do not depend on that side effect. A cold provider wait is separate from the 250 ms traversal/scanning budget, with a 5 s wall deadline. The 2 ms cooperative slices, 16 Ki-character chunks, 8 Mi-character scan cap, path cap and result cap remain in place. An incomplete search never establishes absence.

Real Seed World A/B on Chrome 146 / Apple M2 / ANGLE Metal at 1280×800: both versions had approximately 17.7 ms native search-frame P99 and no >50 ms native search frames. After 600 searches the candidate's post-GC JS heap stayed around 1091 MiB, backing storage around 660 MiB, without sustained growth. Twenty searches of the actual URL-backed Seed World Scene left the new project's content cache empty; an explicit read then loaded that asset normally. Cold Engine declarations retain the existing shared module once.

Coverage has a cost: query wall time and temporary allocation are higher than resident-only search. Native scene sampled heap high-water deltas were 77.5 / 23.8 MiB across five-second search windows versus baseline 4.2 / 8.3 MiB; these include rendering and GC timing, not per-query allocation. The isolated fixture retained about 65 / 3 KiB at native / 4× CPU, with temporary high-water deltas about 6.1 / 5.3 MiB. The VFS/search/read minified kernel adds 949 gzip bytes; this is not a whole-application bundle measurement.

At 4× CPU the scene itself exceeds the frame budget. A captured 66.242 ms search-window task spent 65.410 ms in `Engine._this._animate`, with no recorded GC event in that task; idle windows also had long Engine callbacks. This does not establish the cause of untraced historical outliers or guarantee physical mobile performance. Full receipts, paired measurements and diagnosis: search-view summary (local-only evidence). Reproduce with `SEARCH_BASE_URL=... SEARCH_LABEL=baseline|candidate node tests/runtime-editor/search-view-scene.mjs`; `SEARCH_TRACE=1` adds a separate diagnostic window.


### Failure diagnostics and recovery status

`agent-failure.ts` classifies failures without replacing provider codes or changing retry eligibility.
`agent-failure-statistics.ts` derives request, generation-attempt, transport-recovery, Tool and script counters from trace events; multi-call replies and terminal snapshots are deduplicated by task/step/attempt identity.
Tool and script failures can describe the same incident and are not summed; unavailable generation details remain explicitly unknown. Cancelling a model round preserves completed attempts and the in-flight request, including available usage, duration, recovery events and raw diagnostics. Cancelled requests have their own `cancelledRequests` count and are excluded from `failedRequests`; cancellation before a request starts does not invent another request. Late responses retain evidence but cannot execute their tool calls. Retry eligibility and budgets are unchanged.
Trace exports include `diagnostics`; the context trace panel shows request and recovery totals.

`model_recovery` events show requesting or waiting within admission, transport, output and protocol correction.
The ASAP request envelope opts into `recoveryEvents`; nonce-correlated newline frames carry events before the atomic terminal envelope.
ASAP produces and transmits events without embedding recovery arrays in model results or maintaining a parallel digest history.
`SessionData` retains accepted recovery events by task, model step, request attempt, layer and sequence, independently of debug mode and the 256-entry presentation history limit.
Session snapshots expose `recoveryEvents` and their derived `recoverySummary`; remounted views consume that snapshot, and traces capture the same accepted events.
`model-recovery.ts` owns shared recovery aggregation for Session snapshots and trace statistics.
New model-attempt records do not duplicate recovery arrays; the trace reader accepts those arrays only for older exported traces, with explicit events taking precedence.
Already received events remain available after cancellation or transport failure, but the in-memory Session is not durable across page reloads and ASAP does not provide disconnected-event replay.
`SessionRecovery.spec.ts` exercises the actual transport, AgentLoop and Session through success, provider failure, disconnect and cancellation, plus duplicate/foreign/late events and UI remounts.
A logical model round shares 120 seconds across existing protocol corrections; each ASAP request receives only the remaining budget, with ten seconds of transport headroom.
Retry conditions, attempt limits and model settings remain owned by their existing policies.

Task failure messages derive committed, rejected, aborted and uncertain outcomes from host execution receipts, including independently settled commands.
Raw errors remain available to callers and traces; both terminal event rendering and promise-rejection rendering use the same task failure message.
A failed model request means no new Tool operation from that request; it does not roll back earlier committed modifications.

### 2026-10-29: shared execute feedback

Execute now accepts one ordinary async JavaScript body, with no automatic named entrypoint. The execute contract teaches that Console and Return can both expose results: print multiple/intermediate values, or return a final value; select only necessary evidence and output each full result once. Runtime faithfully preserves both channels, including repeated values, with the same display budget and complete output artifacts for model feedback and traces. The general prompt combines result reuse and avoiding unproductive repeated reads/writes in one rule: change approach on repetition and explain the obstacle if progress remains blocked. Type-check failures retain up to 12 compiler diagnostics with bounded source excerpts; only the first three receive additional declared-property/contextual-type and literal-union/nullability feedback. Type formatting uses compiler truncation, and line extraction reuses compiler line offsets. Successful checks do no repair-context work. Failure presentation describes task-wide saved, discarded and uncertain modification outcomes; rejected query attempts remain in structured diagnostics instead of being presented as unfinished user steps. No retry policy changes.

Validation: 140 focused protocol/output/checker/file-tool/edit-execution/agent-loop tests, AI Chat TypeScript checking, and two real browser Worker tests passed. The Worker checks cover Console-only and Return-only output, ordinary helper-function invocation, and recovery of oversized output through `read`. A local Node microbenchmark using standard libraries and a small API declaration compared the same checker with repair hints enabled/disabled, alternating 60 measured warm checks per case after ten warm-ups. Warm median overhead was 0.00 ms for valid code and 0.06–0.10 ms for field/literal/multiple-error cases; this is an isolated checker measurement, not browser Worker or full task latency. Real-model adherence to the revised prompt has not yet been measured.

### Visual pointer observation lifecycle

`observe_view` captures the color image and optional host-owned identity/depth snapshot in one synchronous frame interval. The application returns an exclusive `AgentViewPointer` lease with its retained CPU byte estimate, a read-only `point(x,y)` function, and an idempotent `dispose()`. GPU scratch is destroyed before the observation is returned. The task image store takes ownership on `save`, including disposal when admission fails. Host callbacks and identity/depth buffers are never cloned into transcripts, Worker messages, trace exports, or project assets.

The native `pointer({imageId,x,y})` Tool uses integer pixels in the returned image, with a top-left origin. It reads that image's retained snapshot, never a fresh camera pick, and returns its own call-ID-correlated result. It does not synthesize input or change the user's selection. Native file calls and execute keep their existing scheduling; pointer uses the exclusive batch path.

An identified observation returns only stable `ref`, `type` and the captured surface `hitPosition`. It does not query complete properties or create special oversized pointer output files. Explicit inspection APIs own property reads. The registered owner can be a whole region; identification does not imply editability. Unknown pixels and missing authoring identities are distinct outcomes.

Pointer snapshots use the shared image budget with a 32 MiB sub-budget and at most three retained snapshots. Old pointer data can be released while its immutable color Blob stays readable; references expose `pointerState`. Completion, failure and cancellation release task pointers. Historical photo attachments may survive through conversation leases, but `read_image` does not rebuild a released pointer snapshot. Fresh observation is needed for pointer after continuation.

Seed World retains eight bytes per pixel for CPU identity/depth, plus copied identity records. Capture scratch is reserved before allocation and released before JPEG export completes. Regular instances retain copied IDs; position-dependent terrain retains cloned identity geometry without renderer references. A world-authoring revision change rejects pointer resolution; moving the camera alone leaves the saved identity intact. Unregistered renderers can occlude registered objects without acquiring invented Refs.

Verification: 58 focused tests and the AI Chat typecheck passed. Native Tool protocol/image-store tests cover correlated pointer results, coordinate bounds, byte/count eviction, readable color images after eviction, rejected admission, late capture after cancellation, and idempotent disposal. Terrain tests cover frozen identity geometry, camera-independent reconstruction, world-revision rejection, and GPU cleanup on capture failure. A real Chrome Seed World test passed for a captured tree matching the existing GPU picker, unchanged selection/query history, stable identity after camera movement, four captures evicting the oldest pointer, and zero retained store bytes after disposal. This sample measured 30.9 ms for identity/depth capture and 31,147,596 retained bytes before final release; it is not a cross-device performance bound. Real LLM pointer selection has not been evaluated. The full Terrain typecheck still reports two baseHeight optionality errors in untouched ContextLandscapeClusters.spec.ts and GuidanceFitting.spec.ts.

2026-10-30 real LLM follow-up: `tests/llm/cases/view-pointer.json` now exercises natural-language image selection through the actual ASAP Wrapper and `aisearch_dsv41flash`. Final run `2026-10-29T16-31-55.914Z-23386` passed all eight automatic checks and independent screenshot/response review: 12.13 seconds, seven model requests, six pointer calls (three multi-call batches), two native reads, and one `world.inspect`. The selected tree was `landscape-101.5-108.5`; model-supplied pixels matched independent GPU identities, and scene, camera and user selection stayed unchanged. Task completion retained zero image/pointer bytes. This is one scene/sample, not a latency or coverage guarantee.

The first run exposed a trace lifecycle defect: release happened in `finally`, after terminal consumers sealed their traces. Completion and failure now release images before emitting the terminal event; `finally` remains an idempotent fallback. The failed ordering assertions turned green, and 19 image/session/trace tests plus AI Chat typechecking passed. A later run exposed a missing `world/` segment in pointer's guide; a native project-file integration test now verifies the returned path is readable. Pointer also distinguishes surface-hit position from object origin and states that editing support was not checked, instead of encouraging an inference that identified objects cannot be edited.

All three earlier runs and their original traces remain in the local test output. The test observer was corrected to capture an independent identity snapshot in the same `view_observed` event turn: fixture-time snapshots cannot validate moving foliage seconds later. The scene is not frozen and model outputs are not replaced. Three oracle tests and LLM-test typechecking passed. The broader knowledge/pointer suite had 14 passing tests and one unrelated existing flower-density wording assertion failure; this was not changed. No retry strategy was added.

2026-10-30 efficiency follow-up: the seven-round run above was functionally correct but over-investigated. Round 1 observed the image; round 2's first pointer already identified the requested tree (the same response also sampled a building). Round 3 sampled the same tree and an unidentified pixel; round 4 read two guides; round 5 inspected extra properties; round 6 sampled the same tree twice; round 7 answered. Rounds 3–6 consumed about 7.05 seconds without being required for the identification goal. The existing consecutive execute-signature guard does not detect semantic scope expansion across different coordinates and queries.

The shared work principles now require filling only evidence gaps relevant to the current goal and then acting or answering. Pointer's contract states that an identified Ref confirms the hit's registered identity, and that its guide is for additional properties or subsequent operations. Known documentation paths can be read directly. These changes add no hard call limit, runtime early termination, result filtering, or retry strategy.

Twenty-one protocol/pointer tests passed. Three predetermined sequential real LLM samples used the same natural-language case and oracle: `2026-10-29T16-46-43.018Z-30170` took 8.60 seconds / 3 rounds / 1 pointer; `2026-10-29T16-49-43.345Z-30700` took 5.83 seconds / 3 rounds / 1 pointer; both passed automatic checks and independent review. `2026-10-29T16-53-43.991Z-31337` took 11.75 seconds / 7 rounds / 2 pointers: the first hit grassland and the second hit the tree, so the second point was justified, but grep/read/inspect after identification remained unnecessary. Its eight automatic checks passed, while independent response review failed because it described world-space bounds Y endpoints as a tree-height range. The failure and original output are retained; no additional runs were selected to replace it. This is partial efficiency improvement, not a guarantee of immediate completion. User preview rendering load differed from the older run, so wall-clock samples are descriptive rather than a controlled performance claim.

2026-10-30 data-boundary follow-up: the failed sample's actual backend request contained the updated prompt and tool descriptions, ruling out stale deployment. `inspectPickedObject` already produced a full public record, but the adapter discarded its position, bounds and properties, emitted a guide, and the model then fetched the same data through grep/read/world.inspect. This is a verified information-loss/retrieval path, not proof of the model's private motivation. The adapter now forwards that record with separate hit coordinates, and direct inspection and picking share runtime-property enrichment (including water color). The generic read tool no longer mandates starting at the editor root. No system-prompt additions, semantic completion gate, hard pointer limit or retry policy were introduced.

Three fixed sequential samples, with the same prompt/fixture/oracle, all eliminated document and property re-query: `2026-10-29T17-26-40.742Z-36484` took 9.32 seconds / 4 rounds / 4 pointers; `2026-10-29T17-29-32.177Z-37081` took 6.73 seconds / 3 rounds / 3 pointers; `2026-10-29T17-31-59.509Z-37511` took 6.78 seconds / 3 rounds / 2 pointers. All eight automatic identity/state/resource checks passed in every sample, but all three final-response reviews failed: unsupported shrub/decor classification, extrapolating an unidentified pixel to an entire object's missing identity, and a false five-metre camera distance respectively. The first sample still repeated picking after identifying the tree; samples two and three submitted multiple points before seeing results and answered immediately afterwards. These failures remain in the reports. The data detour is removed; unnecessary exploration and unsupported final claims are not declared solved.

Verification for this follow-up: 83 focused tests passed; one pre-existing flower-density wording assertion remains failing. AI Chat typechecking passed; Terrain typechecking still reports only the two previously recorded `baseHeight` test errors. Cross-kind tests cover tree/building/river records, real application projections cover vegetation/terrain/water and runtime color, and a loop test verifies overflow readback without forced completion. Old inspect fields and the new pointer record were compared field-by-field and matched; the sample record was 656 UTF-8 bytes. Timing is observational: the user preview remained open, and a Terrain typecheck ran during the first sample's preparation.

2026-10-30 responsibility correction: pointer now resolves only stable object identity/type and the captured surface hit position. It does not inspect full properties or spill object details to files. Explicit world.inspect retains detail ownership; its BuildingAsset contract distinguishes the existing authored design record from the natural planned-building identity record (planningElementId). Earlier full-detail pointer notes above describe superseded behavior.

本地 streamChat 为同一页面维持稳定 `sessionId`，每个请求以自己的 stream nonce 作为 `queryId`；用户停止通过既有 CandyJar `remoteSkill` 调用 `lingguang.ai.stopChat`，无需修改 Wrapper。
Session 立即停止接收结果；stopChat 的 `accepted` 只表示受理，不表示远端已终止。控制面失败会告警且不重发，模型总预算仍生效。
本地 ASAP 入口负责登记现有取消 scope，公共退避等待感知该 scope；生产 SDK 路径仍使用其原有 AbortSignal 契约。
