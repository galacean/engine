# Runtime editor

Owns editable project data and its Engine projection, independently of LLM Tools. The neutral file view lives in [project-files](../project-files/README.md); Seed World composition is documented in [its module map](../../demos/terrain/seed-world-planner/MODULES.md).

- `project/`: project package, IndexedDB session, asset formats and detached edits. Optional `documents` holds asset-relative `.meta` and documentation files without registering them as Engine assets. The VFS derives missing file/folder sidecars from asset identity and type without fetching remote content; authored documents override those descriptions. Asset import accepts supported text/binary files, ordinary folders from application-provided file sources.
- `scene/`: source hierarchy import/compilation, Entity/Component edits and live projection.
- `scripts/`: type checking, ESM build/load, class registration, `assetUrl`, host declarations and unavailable-instance recovery. Generate/check host declarations with `scripts:host-declarations:generate` / `scripts:host-declarations:check` in the materialized Gallery.
- `runtime-editor.ts`: transaction orchestration (prepare, memory commit, activation, discard and resource completion); `run` serializes draft operations.
- `generated/`: pinned Editor compiler/schema and declarations from the materialized Engine. Regenerate with `world/scripts/build-runtime-{source-compiler,declarations,scene-settings}.mjs` from the repository root; the source compiler requires a local Editor checkout argument.

Dependencies may point to Engine, neutral file/transaction contracts and script-checking support. They must not point to ai-chat, runtime-editor-agent or a demo. The session owns its compiler Worker and resource URLs. Authoring data is authoritative; live instances are derived.

Unit tests: `tests/`. Cross-system browser tests: `../../tests/runtime-editor/`. From the materialized Gallery run `pnpm run typecheck:runtime-editor`, `pnpm run test:editing`, and `AGENT_TEST_PRODUCTION=1 pnpm run test:editing:e2e`.

## Virtual-path contract

An asset has one public identity: `project.files[].virtualPath`, for example `Models/Tree.glb`. `list_tool`, `read_tool`, native `asset.*({path})` and persisted `$ref` use exactly that string. No extra `assets/` mount prefix or asset ID is introduced. Entity/Component IDs retain their separate meanings. `file.path` is the storage/load location, owned by the host; it is not a second public identity. `project.json` is reserved for the manifest, `editor/` for host knowledge/declarations, and `remote/` for read-only source catalogs. The project root `README.md` and imported READMEs are ordinary project documents.

Script calls `assetUrl("./Model.glb")` are resolved from that Script's directory during checking; literal paths are required so dependencies can be protected. The returned string is the current physical load URL, preserving the existing Script API contract. Resolve it at load time; do not retain it across project edits. Persist the virtual path, never this transient URL.

Import `assetUrl` statically from `@galacean/editor-assets`, either as a named import (including an import alias) or through a namespace, and call it directly with one string literal. Reexporting or dynamically importing this SDK, or aliasing its function/namespace as a value, is rejected before publication because it bypasses resource-reference tracking. Other modules still support reexports and literal dynamic imports. Dynamic module specifiers must be literals.


Saved projects use format v5 and require complete direct dependency metadata. IndexedDB schema v4 stores the manifest and per-file records in separate stores. Compatible v2/v3 records are split on their first successful save; dependency metadata is not silently repaired. Storage validates graph completeness and atomically saves the complete prepared package. The last write transaction wins; there is no cross-page merge or exclusive editor lock. A later save from an older page, including an automatic simulation checkpoint, can overwrite another page's changes. The storage revision validates the differential-write cache, not permission to save.

The pinned Editor compiler is bundled with the path-reference codec in `world/scripts/runtime-source-compiler/source-ref-codec.ts`. Rebuild through the generator; do not patch the generated bundle. Typechecking's internal `declare/runtime/assets/` namespace is not a user-facing file path.

## VFS discovery and import

`configuredProjectFiles` registers a source catalog (explicit folders, file types, summaries and lazy content loaders); `mountProjectFiles` places it under `remote/`. Explicit empty folders are preserved in `project.directories`. The VFS exposes `read_tool`/`list_tool`; Editor owns mutation and persistence. Every asset, document and asset folder has a sibling `.meta` with `name`, `type`, `summary` and optional `usage`. Identity fields come from the current path and type. Existing assets receive generated descriptions when no authored metadata exists.

`editor.asset.import({source, path})` forwards through Worker RPC into the existing transaction. It accepts a single asset/document or an ordinary folder. Binary GLB/PNG/JPEG, opaque `Buffer` bytes, text assets, documentation and empty folders are copied together. Buffer imports require binary content; the consuming asset format owns any byte layout, size and digest constraints. Import does not enable rewriting Buffer assets through text `asset.update`. Folder serialized references are relative to the containing file. A file named manifest.json is an ordinary document and never triggers system installation. Missing dependencies reject the import.

Destination conflicts (including documents, folders, sidecars and file ancestors) fail with `PATH_ALREADY_EXISTS` and `path`/`existingPath`/`existingKind` details before content is fetched. The caller selects another destination and retries; no overwrite or automatic renaming occurs. All imported Engine assets enter project.json, documentation enters documents, and one project transaction controls publication, save and undo. Importing an archive file directly is not implemented; expose its unpacked folder through a provider.


VFS operations build one current namespace snapshot and use its provider ownership map throughout the operation. The next operation sees project additions, removals and metadata edits; there is no retained cross-operation content cache. Plain directory listing pages before fetching summaries. Summary search scans candidates for an exact total, yields during long scans and honors cancellation. Project sidecars are serialized only when requested, rather than rebuilding every description for each read.

Source configuration and import share `projectFileType`: explicit types are retained and checked against known asset extensions; omitted types use known extensions, while ordinary text and `.d.ts` remain documents. Unsupported binary files fail at import. Updating document text preserves its authored `.meta`; default descriptions are added only when the sidecar is missing.

## Asset references and deletion

Reference inspection and deletion are independent of content editing. `editor.asset.references({path})` returns incoming authoring reference paths for registered formats, including PNG/GLB, and rejects if potential callers cannot be inspected. The Agent should query first and unlink or replace callers before deletion. `editor.asset.delete({path})` independently checks current draft references and reports callers when deletion is blocked; a previous empty query is not authorization to bypass this check. Candidate resources belong in component properties or JSON configuration assets as `$ref` values. Scripts select configured candidates; arbitrary undeclared computed lookups remain outside static inspection. See [the authoring guide](../runtime-editor-agent/configured-assets.md).

Subresource references protect their containing asset: a material texture value `{url: "Can.glb", key: "textures[0]"}` references `Can.glb`. Material inspection reads its actual serialized reference paths without pruning by the property value's type. Deletion uses the registered format handler. Format `referenceTypes` is an exhaustive optimization contract, including container types; omit it when completeness cannot be guaranteed.

Registered Scenes and runtime-owned assets remain protected. Deletion removes the asset entry, its content and sidecar in the normal project save/undo transaction; URL-backed binary targets need not be downloaded just to delete them. PNG/GLB content editing remains unsupported.



### VFS transaction boundaries (2026-10-17)

- A read uses the exact listed virtual path, including spaces. Pending downloads belong to the accepted asset; deletion or replacement invalidates their result before it can enter the content cache.
- Each bulk import captures one source namespace and checks all destinations against one target namespace. Cached processing yields cooperatively for rendering/cancellation; the draft receives the completed batch atomically.
- Draft mutations check path structure, formats and runtime ownership. Cross-file reference completeness is checked at `finish` and publication, and validated at persistence. Write/delete related files in the same transaction; an incomplete transaction cannot be committed.

### Direct dependency manifest

`project.files[].dependencies` stores only direct virtual-path edges. `RuntimeDependencyMaintenance` is shared by authoring drafts and final merged publications. Writes invalidate changed inputs; reference queries, deletions and commits reconcile them. Unchanged inputs reuse their calculated edges. Scripts are invalidated by both source changes and compiler resolution inputs (project declarations), which are not themselves serialized as asset references. The accepted Script snapshot is retained independently of a failed/discarded draft. Runtime-owned changes are merged before final reconciliation; storage only validates and persists the result. Querying a complete manifest does not fetch remote callers. A new source catalog is explicitly ingested once with `initializeDependencies()`, after host formats and editable hierarchy conversion are ready. Saved projects never use this as a repair path. Binary formats declaring no outgoing references need no download; undo restores content and recalculates through the same maintenance flow.

Session publication also extracts references for direct domain writes and runtime-owned state. Memory publication accepts content and dependency fields together; rejected publications leave both unchanged. A failed checkpoint leaves both database fields unchanged without reverting accepted memory state. Dependency-only enrichment does not invalidate an unrelated in-flight resource read or projection. Removing an asset is rechecked against the final merged project, including concurrent runtime-owned references. Unknown formats/content cannot prove an asset is unused.

### Resource reads and Scene updates

Successful lazy reads notify the editor after the session has checked that the asset is still current and installed its cache content. Scene projection uses that read evidence only to fill missing comparison values for the same resource identity; existing authored bytes always take precedence. A read completing after draft capture is handled on either side of the comparison. This prevents unrelated edits from replaying resource setters merely because bytes were first downloaded. Actual writes, pending unprojected publications and undo/redo retain their normal change detection. Components require no additional interface, and editor disposal removes the read observer.

`tests/runtime-asset-read-projection.spec.ts` covers the transaction boundary with real Scene edit/projection/parser logic and headless Engine objects. Storage, network, resource resolution and the unused Script compiler are test doubles; this is not a GPU or LLM acceptance test.

## Authoring commit, runtime activation and persistence

Native edits use `run → prepare → commit() → activate(signal)`. Preparation checks generic Source/schema/reference integrity. Commit publishes authoring in memory and queues background persistence. Activation projects native resources and Scene, then settles runtime consumers; runtime failures are reported independently and do not undo authoring or prevent saving. One failing consumer does not skip other consumers, and cancellation always releases entered input batches.

`project.persistenceStatus` and `subscribePersistence` distinguish pending, saving, saved and failed checkpoints. A commit receipt confirms in-memory publication, not IndexedDB durability. `project.flush()` waits for the accepted revision and retries a failed save without rerunning edits or activation. Hosts must flush before a controlled close. Transaction discard only releases an uncommitted draft. Undo is a new authoring edit.

Default autosave waits 250 ms after the last commit, with a 2000 ms maximum delay measured from the first unsaved commit. Browser timer throttling and an in-flight transaction can delay the actual start; this is not a hard real-time deadline. There is one active save and no queue of package snapshots: pending commits coalesce in `projectPackage`. At save invocation storage captures a stable package (shared immutable text, copied containers/metadata/bytes). If its private checkpoint revision still matches the database, it writes only changed files/deletions plus the header. Otherwise it atomically clears that project's file records and writes the complete captured package, including the manifest and documents, so stale baselines cannot mix different snapshots. Both paths use one cross-store IndexedDB transaction; its completion acknowledges persistence. Calls on one storage owner are queued; separate owners follow IndexedDB write-transaction ordering, not a global wall-clock request order. Completing an older save never acknowledges later commits. No new VFS replica or Worker is introduced.

## Asset change propagation (2026-10-29)

`RuntimeAssetChanges` defines the same change boundary for session resource URLs and Scene projection: resource descriptor (URL/type/loader parameters), contents, and transitive VFS references. Dependency discovery and successful lazy reads only enrich the baseline; they do not trigger consumer updates. Each owner accepts its baseline after completing its own projection step, so a failed Scene application remains retryable.

Material edits update the existing loaded Material through the native `cloneTo` API and rebind the ResourceManager cache to that object. Multiple consumers keep the same identity. The shared resource projection owns this mapping; application systems are not globally invalidated. Other resource changes retain native reload/reference rebinding. Transitive dependencies are refreshed, so a Prefab that contains a changed Material is reloaded and its consumers can recreate their derived material copies from current inputs.

Script edits compile and update the affected module graph, register new Script classes, and replace components whose constructor changed. Source-authored properties are reapplied to the replacement. Runtime-only fields are not captured/restored; the browser regression explicitly observes a counter changing from 10 to 0. No prototype patching or blind field copying is used. Script state migration requires an explicit serialization/lifecycle contract. Per the user decision on 2026-10-29, it is explicitly deferred: retain this limitation, and do not implement state copying, prototype patching or a migration protocol in the current scope.

Host consumers own derived geometry, caches and domain compatibility. They may report activation failures through `runtimeErrors`; cross-resource business incompatibility must not become a project Save gate. The native building host no longer invalidates its system simply because Apply finished. Farming validates the resources it consumes and reports native registration failures during activation, without a project validator registration.

Native Source-linked Prefab instances are tracked by their Scene instance records. A changed template recreates affected instances through the native hierarchy parser, reapplies native overrides and rebinds references. Source parent/order and authored root properties are preserved; absent overrides use the current template values. Runtime component queries and reverse `identityOf` lookup include Prefab members through derived instance/template identities. Expanded template contents are not written into the Scene. The ordinary Scene tools now author those links and overrides: `entity.create({scene,name,prefab})` creates a linked instance; `component.query/read` expand the current draft, including new instances before Apply; `component.update` records sparse local overrides. Returning a property to an explicitly authored template value removes its override. `component.revert({scene,id,keys?})` restores inheritance, including Engine-owned defaults; omitted keys clear the component mutation block. The template asset and sibling instances are unchanged. `component.add` supports editable instance roots and children; `component.remove` supports inherited members and Scene-owned additions. Draft reads and runtime binding derive identities from the same native Source traversal, with no second persisted registry.

Apply ordering is: adopt complete authoring → enter input batches → update native resources and Scene → publish dependent world projections using final inputs → release batches → settle runtime consumers. Preparation must not reserve a world candidate against old Scene inputs. The common hooks contain no building or farming types. A failed activation remains reportable while authoring is checkpointed independently; a later edit can repair it.

The current native Source compiler stores inherited nested Prefab edits in Scene-owned `prefab.nestedOverrides`; changing the nested asset remains a distinct shared-template edit. `entity.list` now expands members as a read view with usable Entity/Component IDs. `entity.create({parentEntityId})` adds an inline node through `addedEntities`; creating below a local node extends that inline hierarchy. `entity.update` writes `entityProps` for inherited nodes; `entity.delete` writes `removedEntities` and removes obsolete subtree overrides, including already removed components. Locally added nodes are edited/deleted in their inline definition. Locally added Prefab roots own their own overrides (including name/transform), so their components are editable without changing a shared template. Reparenting template-owned nodes remains unavailable, consistent with Editor UI.

Explicit limits: arbitrary `PrefabResource.instantiate()` clones without a Source instance record are not linked; glTF instances have native synchronization but do not yet expose Prefab-style stable member IDs. Private consumer copies that are not reachable through declared asset dependencies require their owner's update contract. Script creation/compilation/attachment is supported; preserving running state across script hot replacement is deferred. Evidence: `output/asset-apply-implementation-20261029/REPORT.txt` at the repository root.

2026-10-29 Prefab editing entry verification: `runtime-prefab-edit.spec.ts`, native Tool browser page `tests/runtime-editor/prefab-edit.html`, and existing `tests/runtime-editor/asset-apply.html`. Evidence: `output/prefab-editing-20261029/REPORT.txt`.

2026-10-30 Editor-style entity override verification: 46 common/editor tests, 22 native Prefab tests, 35 real native Tool checks plus 52 asset regression checks; Engine build, terrain noEmit and declarations check passed. Two mixed-removal tests fail against the original HierarchyParser order and pass after resolving/removing components before entity destruction shifts paths. Source entity deletion also clears obsolete subtree component overrides. No new persistence format or business-system exception. Evidence: `output/prefab-structure-20261029/REPORT.txt`. No new reparent tool or cross-boundary nested Source format was introduced.

2026-10-30 hierarchy follow-up (supersedes the earlier no-reparent-tool limit): `entity.reparent({scene,id,parentEntityId,preserveWorld?})` moves ordinary Scene nodes/whole instance roots within the Scene hierarchy and locally added subtrees within the same Prefab owner. A null parent selects the Scene root. It preserves the authored world transform by default; `preserveWorld:false` keeps local TRS. This does not capture script/animation-driven live transforms. Cycles, template-owned nodes, ownership transfers, singular parents and non-TRS/sheared results reject before mutation. Explicit local IDs are scoped by their owner and own ID rather than their parent path; moving local subtrees retains Entity/Component query identities. Anonymous inline descendants need explicit Source IDs before moving.

`entity.revert({scene,id,keys?})` removes selected native Entity overrides (or all supported properties when keys are omitted), including authored instance-root fields, restoring inheritance without guessing Engine defaults. Locally added ordinary entities have no template properties to revert.

Evidence: `output/editor-parity-20261030/REPORT.txt`: 52 unit/API tests, 43 native Tool browser checks and 52 existing asset browser checks; terrain noEmit and declarations passed. Ownership conversion between Scene records and Prefab inline additions remains unsupported. Editor's add-existing-entity ownership-transfer path is a separate capability, not claimed as implemented here.


2026-10-30 Scene → Prefab ownership alignment (supersedes the previous ownership-transfer restriction): `entity.reparent` can now move an ordinary Scene subtree or a whole linked Prefab root under an editable instance. The subtree becomes native `addedEntities`; explicit Entity/Component Source IDs survive the conversion. Local moves within, across and out of instance owners are supported. Inherited template-node reparenting remains rejected. World preservation uses authored TRS, not script-driven live state.

The compiler now indexes inline Source IDs before validation/lowering, including forward references and inline Script classes. Scene projection resolves compiled appended indices through that same index and rebinds incoming references when ownership or an instance changes. Undo restores Scene ownership and references. Finite Scene-local nesting of the same Prefab is permitted; recursive template dependencies reject.

Verification: 57 unit/API tests, 58 real native Tool browser checks (including Apply, undo, template reload, unchanged-instance reference edits and fresh Engine/IndexedDB reopen), 52 existing asset Apply checks, terrain noEmit and declarations. Evidence: `output/editor-owner-alignment-20261030/REPORT.txt`.

Historical reference: the old `33456092` nested-override serializer limitation was superseded by the current Editor protocol. Runtime now consumes the current native schema, compiler and nested Source codecs. Script hot-update state recovery remains deferred.


### Editor current-contract alignment (2026-10-30)

The compiler/model snapshot is pinned to `b1b59de685d4df29a51c3df7eaf3d45a6bc74c1f` on Editor `dev/2.0`. Rebuild with `npm ci --prefix world/scripts/runtime-source-compiler` followed by `node world/scripts/build-runtime-source-compiler.mjs /path/to/editor`. The generated bundle contains the native codecs/commands; it does not depend on an Editor UI or a second persisted model. The VFS path codec remains the explicit host boundary.

| Previous change | Current decision |
| --- | --- |
| Source schema / compiler pinned to October 7 | Update schema, validator and compiler together to current Editor. |
| Inherited nested members rejected | Native nested Source addresses, baseline composition, commands and serialization. |
| Custom inline allocation / string injection | Remove; use the upstream allocation API. Require current stable inline IDs. |
| Local additions cannot cross owners | Use the native ownership command; preserve IDs, references and authored world pose. |
| Template instance propagation | Retain registered Source instance reconstruction and override replay; consume nested override changes too. |
| Shared Material identity | Retain in-place update and resource-cache mapping. |
| Commit / activation / persistence ordering | Adopt upstream background checkpoints; retain explicit runtimeErrors and ordered resource/world activation. |
| Script creation and mounting | Visit all Source component slots, including inline and nested additions, for compilation, registration and dependencies. State restoration during hot replacement remains deferred. |
| Building / farming integration | Retain consumer-owned synchronization and runtime diagnostics; no business save gate. |
| Engine reference count / removal ordering | Retain independently verified fixes. |

A moved instance root has two related authoring changes: hierarchy ownership and local placement. After the native ownership command calculates the new transform, the native entity-override command records that placement before serialization. This prevents an old root transform override from winning on reload; no delayed runtime correction is used.

Instance-root name, transform, active state and layer are authored through the template-root `entityProps` override, just like native Editor serialization. Reparenting merges that root block instead of appending a competing one. Projection compares the effective root properties separately from instance structure, so an ordinary root move keeps the existing Entity/Component objects; structural or asset changes still reconstruct registered instances.

Verification for this alignment: 188 unique common editor/Agent tests (187-suite plus one additional nested-local-anchor case), 69 world integration tests, 58 existing Prefab browser checks, 26 nested browser checks, 52 asset-Apply browser checks, and terrain TypeScript validation. Browser checks use real Engine objects and IndexedDB reopen; no live LLM, mobile or whole-world performance claim is made. Evidence: `output/editor-latest-alignment-20261030/REPORT.txt`.


### 2026-10-31: activated native object reads and reverse identities

`RuntimeSceneProjection.readEntity(id)` returns a detached native authoring record for a successfully activated Entity, including Prefab template properties and instance overrides. It shares the existing Source/instance projection with `readComponent`; it is not an independent authoring directory, draft reader or serialization of live simulation state. Failed activation requires projection recovery before these live-bound reads.

Reverse Entity/Component identity is rebuilt from the completed forward mappings at initial binding and successful Apply, including linked members and replaced/preallocated objects. Retired objects no longer resolve. Building inspection and group movement consume this common relationship. The native editor exposes its mounted `scene` so application-side native resource queries do not discover an Engine through incidental components.

Validation: 46 common unit/API tests, 58 Prefab and 57 asset-Apply browser checks, plus 19 building nested-instance checks and 35 existing building preset checks. Details: `output/building-native-access-20261031/REPORT.txt`.

### Author-snapshot resource preparation (2026-10-31)

`edit.withAsset<T, R>(path, use)` prepares a borrowed native resource and its author content from the **same transaction snapshot**. Use it when a calculation will produce author changes (for example, computing a new Prefab copy's footprint). `projection.readEntity/readComponent` and live components continue to describe the activated Scene; the live ResourceManager cache is not evidence that it matches current authoring after a committed edit's activation was cancelled.

The transaction serializes preparation with its other operations, hydrates the dependency closure, and checks cancellation and the publication revision before accepting the computed result. Source compilation and native loaders remain the only geometry/asset decoders. A temporary native reference namespace prevents preparation from rebinding the live Scene or mutating shared live Materials. Reference remapping touches native Scene/Prefab refs, Material shader/texture refs and AnimatorController clips only, never arbitrary component strings. Opaque native leaves keep their loader URLs. Native loaders resolve dependencies themselves, including non-cached PrimitiveMesh resources.

The callback is for read-only computation: destroy any instances it creates, return computed data, and do not retain the borrowed resource or call another operation on the same transaction from inside the callback. Preparation releases native reference leases, owned cached resources, virtual registrations and object URLs in success, cancellation and failure paths. Non-cached dependencies follow native ownership and Engine GC. `ResourceManager.registerVirtualResources()` now returns a disposer that removes only its own registrations and preserves later replacements; it does not destroy loaded resources.

Activation still uses the existing shared Material update and registered Prefab instance/override synchronization. Preparation does not activate the world, publish authoring, persist, roll back a commit, or notify domain systems. The commit/background-save/runtimeErrors contract is unchanged.

Current explicit limits: author Script dependencies require an isolated script runtime and reject rather than silently using a potentially stale live class. Reference-bearing custom asset formats without a native reference compiler also reject. This does not disable normal script creation/activation. No script hot-state recovery is implemented. Arbitrary URL strings interpreted inside business components are not native asset references and cannot gain snapshot guarantees merely by calling a native loader.

Evidence: `output/asset-snapshot-20261031/REPORT.txt`. Native building preset placement now consumes this common API; independent-copy semantics are preserved.

## Common author-asset history

`editor.history.query({direction?,limit?,cursor?})` returns a bounded page `{items,total,revision,nextCursor}`, next actionable entry first; direction defaults to `undo`. `history.read({transactionId})` returns full paths and runtime diagnostics. Summaries contain path/error counts and up to three shortened paths. Each accepted authoring execute has its own `transactionId`, changed paths and last runtime activation outcome. There is no automatic conversation/task grouping. Read-only calls, cache fills and runtime-owned simulation writes do not add entries.

`editor.history.undo({transactionIds:[T3,T2]})` and `editor.history.redo({transactionIds:[T2,T3]})` require the exact next contiguous IDs in the order returned by the query. Arbitrary selective undo is not supported: it could leave later edits referring to removed objects. A whole batch is validated before mutation, compacted to its final asset changes and published once. History navigation must be the only mutation in that execute. A new authoring edit clears redo.

History retains asset contents, manifest entries, documents and directories. Scene Entity/Component changes are changes to their owning Source asset. Restoration uses the same dependency validation, publication, persistence and runtime activation as ordinary edits. It does not replay system commands or reverse live simulation. Activation errors are returned as `runtimeErrors`; accepted authoring is not silently rolled back. History navigation can itself be retried or followed by explicit repair. History is cleared when the project session closes; accepted assets persist normally. Unloaded immutable VFS sources are resolved lazily if restoration needs their original bytes; mutable external URLs are not archival snapshots.

Activation participants can consume their author assets in `before`, apply prepared runtime work in `apply`, release batches in `finish`, and settle in `after`. Seed World's Editor/Planning consumers use this same route for normal edits and asset history; there is no world-specific undo participant. The runtime building panel uses this common history for both Undo and Redo.

## Transaction completion and bounded discovery

An EditTransaction may own preparation resources. Its idempotent `complete()` releases them whether the edit aborts, commits, fails activation, or never enters activation after cancellation. Completion never rolls back accepted authoring. The Agent executor invokes it on terminal paths, including an edit that opens after cancellation. Completion errors on committed edits are reported as runtimeErrors without changing the committed receipt.

`entity.list({scene,name?,parentId?,limit?,cursor?})` returns summaries in pages; `entity.read({scene,id})` returns the full authored record, including child/component IDs. Name matching uses a case-sensitive substring, parentId:null selects roots. Entity and history pages default to 50 rows, accept 1–100, and enforce a 32 KiB UTF8 envelope budget. Cursor identity covers the selector and result snapshot; changed results reject old cursors. Full values remain behind explicit detail reads. Tool execution uses its 8 MiB resource ceiling independently of the model display budget; it must not use the 64 KiB input/context converter.

### Authoring preparation

`RuntimeEditor.registerPreparation` registers a host authoring extension. It runs after host contributions enter the detached draft and before dependency, compiler and projection validation. The extension uses the provided `run` / `withAsset` operations; its output shares the outer commit and history entry. It must not publish another project edit or activate runtime state. Preparation failures and cancellation leave the published project unchanged. Runtime activation only consumes the committed package.

Preparation runs for changed authoring transactions. History undo/redo and explicit undo-patch restoration bypass it so replay restores the saved state exactly. Registration returns an unregister function; disposing the editor cancels pending work and removes all registrations. SeedWorld building initialization is a consumer of this boundary; no building-specific behavior belongs in the editor.

`RuntimeEditorEdit.captureUndo()` returns a detached copy of the accepted authoring undo **after `commit()` succeeds**, before or after activation. Calls before commit throw; an accepted no-op returns an empty patch. The patch includes host contributions and preparation output and uses the same publication diff as project history, excluding runtime-owned player progress. Activation failure or cancellation after commit does not invalidate the patch. Persisted patches can be restored after reopening the project with `restoreUndo()` in a new edit. Callers previously capturing before `prepare()` must move capture after `commit()`; the lower-level `RuntimeProjectEdit.captureUndo(before)` remains an immediate draft snapshot API.
