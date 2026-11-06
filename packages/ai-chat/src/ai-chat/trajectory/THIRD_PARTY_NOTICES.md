# DeepSeek Harness

The recorded-time projection in `trajectory-model.ts` is adapted from
`packages/client/ui-trajectory/src/client/timeline.ts` in
https://github.com/deepseek-ai/deepseek-harness
(commit `687f282e8625c6b8d11ff58211a90524be2e4317`).
The standalone viewer now directly uses the upstream TrajectoryTable,
TrajectoryTimeline, TrajectoryToolbar, search index, Markdown/JSON inspectors,
code highlighter, attachment gallery, lightbox, and theme styles. They are
compiled without behavioral patches into `demos/agent-trajectory/dsh/renderer.js`
and `renderer.css`. Source maps contain the original sources; `manifest.json`
records the pinned commit and SHA-256 hashes. The primitive export facade only
limits the dependency graph; it does not replace primitive implementations.

Seed World event adaptation and offline hosting remain local. In particular,
`execute` is normalized to DSH's `run_code` semantic tool identity to enable the
unchanged PTC inspector; the recorded name remains in source blocks and schemas.
Native tool arguments, including whitespace, take precedence over reconstructed
arguments. Missing timing, usage, schemas and attachment metadata are not
invented. Attachment loading is restricted to imported inline raster images;
the offline page has no DSH session/server authorization or history-fetch API.
All imported history is resident and uses DSH's virtualized table. The host
provides file/drop/paste import, locale, preferences and the image slot instead
of the DSH plugin container. Seed World still only copies/downloads Trace JSON.

The offline HTML host enforces `img-src data: blob:` before loading resources.
DSH Markdown intentionally accepts HTTP(S) image destinations without using
the attachment loader, so guarding that loader alone does not prevent network
image requests. Even same-origin image URLs are denied; imported inline raster
attachments still work in thumbnails and the unchanged DSH lightbox. Markdown
source is preserved, with DSH's existing alt-text fallback for blocked images.
This follows the host-policy approach in upstream
`ui-sidebar-documentpreview/src/client/html/basic-document.ts`, not a change to
the shared Markdown renderer. Only automatic image loading is restricted, not
all networking or user-clicked navigation. ASAP is unchanged.

2026-10-23 image-policy verification: normal file import plus assistant detail
reproduced an HTTP image request before repair. After repair the probe server
received no image request, and the built app also blocked an existing same-origin
PNG in overview/preview. Raw Markdown retained its URL. Tool-result and model-input
inline thumbnails and lightboxes decoded successfully in the browser. Two host
policy regressions failed before repair and passed afterward; the ai-chat and
Seed World integration suite passed 445 tests. Both TypeScript projects, vendor
integrity and the standalone build passed. HTTP/HTTPS/same-origin browser
regressions are in `tests/image-policy.pw.spec.ts`; existing screenshot tests now
also check thumbnail decoding. Browser checks used the actual UI, but the full
Playwright runner suite was not executed (test collection passed).

Call-group association follows the ownership model of upstream
`trajectory-tool-definition.ts`: a result retains its own starting call's raw
arguments. Seed World provider IDs are unique only within an assistant exchange,
so the local adapter scopes argument lookup to turn/step/callId. Canonical
receipts are scoped to the producing step; legacy request receipts use their
own assistant-message slot, preserved through explicit compaction replacements.
Screenshot Context deduplication uses the producing cell identity, not the native
ID. Native IDs remain unchanged. Partial legacy receipts with ambiguous owners
are left unassociated rather than matched by content or running-call order.

2026-10-23 call-group verification: the initial six real AgentLoop/TraceStore
regressions had three failures with reused IDs and three passing distinct-ID
controls. After repair, ten tests cover raw arguments, receipts, screenshot
Context, retries, compaction, cancellation snapshots and ambiguous partial logs.
Model transport and attachment storage are test doubles. The ai-chat and Seed
World integration suite passed 455 tests; both TypeScript projects, vendor
integrity and the standalone production build passed. This is not a live-provider
or full browser-suite validation; ASAP and the pinned DSH renderer are unchanged.

2026-10-23 normalized-ID compatibility follow-up: partial imports may omit
`step.toolCallId` while retaining accepted native calls. Pending tools now use
their cell's normalized ID for every receipt/group/image lookup, with no second
raw-ID copy. Missing IDs are recovered only from the final accepted attempt,
never from a rejected retry. Original Trace records remain unchanged; ambiguous
ungrouped receipts still do not guess an owner. Seven added regressions failed
before repair and passed afterward. All 462 unit/integration tests and 56
desktop/mobile-viewport Chromium tests passed, along with both TypeScript
projects, vendor integrity and a production rebuild. Current normal exports
already contain summary IDs; this is an import compatibility fix, not an ASAP
or live-provider change.

Inspector contracts follow upstream `TrajectoryTable.tsx`: an unrecorded tool
catalog provides only `systemPromptDetail`, while an explicitly recorded `[]`
is a complete empty catalog. Schemas are scoped to the recorded step, not
inherited from another request or interaction. Runtime failure Context uses
`inputDetail`; assistant failures use `outputDetail`. A later runtime failure
does not relabel a completed model response as failed.

2026-10-23 verification: both regressions reproduced with a user-exported Trace
before repair and passed afterward. `TrajectoryInspectorContract.spec.ts`
adds 11 cases; the ai-chat and Seed World integration suite passed 443 tests.
Both TypeScript projects, vendor integrity and the standalone build passed.
Browser checks on 4178 verified system-only detail, explicit empty catalogs,
and failure Context overview/preview/raw content. Two browser regressions are
also recorded in `demos/agent-trajectory/tests/dsh.pw.spec.ts`; the full
Playwright suite was not rerun for this repair. ASAP was not changed.

Screenshot traces keep schema version 1 and add an optional per-interaction
`attachments` array. Resident/sessionStorage records keep `attachmentId`,
media type, byte count, width and height; binary images are stored separately
in the browser's `seed-world-trace-attachments-v1` IndexedDB database. The ID
is the SHA-256 of decoded image bytes, so identical screenshots share one
object across retained traces. Trace ownership prevents pruning one trace
from deleting an image still referenced by another retained trace. Clearing
or pruning records releases their ownership after pending writes finish.
This is persistent browser storage, not a server upload or a RAM blob cache.
Portable exports add `dataUrl` once per attachment so importing on a different
origin/device still works without access to the source browser's database.
`view_observed` records the producing `step` and `toolCallId`;
its image and subsequent `model_request` images reference that attachment.
The local projection exposes the screenshot as a tool output and the actual
user-role observation as a context input, using unchanged DSH image components.
Raw request JSON retains references instead of expanding image bytes. Only
debug-mode observations are recorded; images are deduplicated within a trace,
with a default 2 MiB encoded-payload / 32 unique-image limit per interaction.
`exportCurrentTrace()` and `exportLastTrace()` now return promises: they wait
for attachment writes and read the requested trace's images, never whichever
trace happens to be newest after the wait. The debug panel uses reference-only
snapshots and does not read image bytes on every refresh. Existing inline
session snapshots migrate to the attachment store, preserving their old IDs.
Failed migration retains the original bytes rather than silently losing them.
Storage failures/omissions are explicit; missing stored images fail portable
export. The live model input is never changed by the trace budget. Old traces
without image bytes cannot reconstruct screenshots. Text history deduplication
and a hard bound for the entire running trace are separate, unimplemented work.

From `world/gallery`, use:

```sh
pnpm trajectory:dev
pnpm trajectory:build
pnpm trajectory:vendor /path/to/clean/deepseek-harness-checkout
node demos/agent-trajectory/scripts/check-dsh.mjs
```

Vendoring requires the exact commit above and a clean upstream checkout. It
extracts public TypeScript contracts and rewires only locale type imports to
the offline host; the renderer and styles are generated from upstream source.
Do not hand-edit the generated renderer. The gallery manifest and the materialized
engine's authoritative `world/engine/overlay/pnpm-lock.yaml` pin its dependencies.

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
