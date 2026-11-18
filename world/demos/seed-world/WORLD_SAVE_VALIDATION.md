# Personal world save validation — in progress

This is an incomplete acceptance record, not a release approval. Full asset CRUD,
cross-session restoration, and the subsequent code review remain required.

## Environment

- Engine checkout: `engine-next`, branch `dev/2.0`, baseline `d60642099`, with local changes.
- Local Wrapper/ASAP on `127.0.0.1:8082`, Gallery on `127.0.0.1:4173`.
- Test identity: `seed-world-local-debug`; artifact: `seed-world-planner-local`.
- World identity: `g=1729&h=0`, linked root seed `2691171009`.
- Actual browser actions used the Agent Trace instruction editor. Tool results
  were checked in the local backend trace, not inferred from assistant prose.
- Re-entry below means a full Wrapper page reload with the same test identity.
  Production native-shell login and cross-device restoration are not yet verified.

## Observed results (2026-09-21)

1. Initial storage transport incorrectly selected the local injected DEV MOCK.
   Local preview now selects the real CandyJar storage bridge; backend DAO logs
   confirmed snapshot writes and subsequent reads.
2. A newly created hill could not be restored by feeding authored height patches
   into full natural-world generation: lake support and water clearance failed.
   Restoration now generates the baseline world and replays saved authoring
   through the same local runtime-delta path used by live editing. Natural water
   is not silently replaced to make restoration succeed.
3. Hill `agent-terrain-feature-3d245269-74f0-4567-a300-51c7899f35da`:
   - Create and re-entry: position `[-986.822,116.53199964467845,-784.581]`,
     pedestal 40 m, peak relief 76 m, influence radius 660 m.
   - Update and another re-entry: peak relief 92 m, resolved body radius 357.04 m,
     position `[-986.822,132.53904162224762,-784.581]`; actual query results match.
   - Delete: deleted count 1, immediate remaining count 0. Another re-entry and
     actual query returned `matchedCount: 0, items: []`.
   - Trace interactions: creation `85977642-35bf-48b2-9278-763dfd50bdbe`,
     restored read `74816094-e6aa-499b-92b6-4461412fe7b5`,
     update `f77c8698-d7e6-43c5-afb9-dd2df2b4566e`,
     updated read `3e453b31-7f1d-4c71-8c78-ecf715851444`,
     deletion `4f9e6b39-2468-4a81-9b38-1c1df792f0e5`,
     deleted read `756d9979-4057-4630-9634-f45117b16fbb`.
4. Natural lake `2781ad6d4a8d568e0d556622198063736b3027b48e512950bfe84265ad75300b`:
   color changed to `[220,40,160]`; backend snapshot includes the override;
   actual inspect after re-entry returned the same RGB.
5. Shrubland `agent-shrub-cluster-ce1c8618-779c-4018-a2b0-d4919e60b9de`:
   create and re-entry preserved position `[-986.822,0.5710639614557067,-784.581]`,
   radius 20 m, member count 4, and seed `4002701749`.
   Combined color/shrub create trace: `7f02fd7c-d040-44c6-b6c4-b3591ac5f8bc`;
   restored reads: `17976b67-3636-49cc-846f-f99701cfb3e3`.

6. Closed the entire test tab and opened a new tab with the same Wrapper identity
   (not a browser refresh). Snapshot `1789966536140` restored these exact results:
   - Deleted shrubland remains absent (`matchedCount: 0`).
   - Grassland radius 17 m, seed `1938148660`, position unchanged.
   - Flower field radius 11 m, seed `20260921`, position unchanged.
   - Pond depth 3.1 m, radius 10 m, canonical/effective water level -0.089 m;
     position `[-956.822,0,-784.581]` and other parameters match before closing.
   These checks called the real application methods through the browser console.
7. Created single tree `agent-tree-single-0832ab88-77f9-4870-a559-94d60424d021`,
   single shrub `agent-shrub-single-e1cbb511-35e5-4202-805a-e96065befb82`, water
   grass `agent-aquatic-grass-area-bb0d8a28-3b27-445c-8eb8-c8183b714878`, and forest
   `agent-tree-cluster-566ee0ef-4865-49bc-9cdf-8f6240d139b1` (5 actual trees).
   The first forest attempt with radius 14 m was correctly rejected for capacity
   and rolled back; radius 60 m succeeded. Deleted one natural small rock and one
   natural mushroom, immediate query counts both zero. Backend snapshot
   `1789966834910`, hash `9a08ddf90f7e7c393f6a9b1307b9c86324fa9cf83a3bf85c4b41534092b869bb`,
   contains all brushes and both exact removal identities.

## Failed exact-world restoration check — acceptance remains blocked by defects

- Before closing the tab: 1,286 discrete objects, 7 authored instances. SHA-256 of
  the ID-sorted list of `{id,kind,source,position,footprint,properties}`:
  `cda1adbbb9d90307d311fcbdfa0926d29e27264ea512f944c20dac30bda45935`.
- Reopened the same snapshot: 1,303 objects, 7 authored instances, different hash
  `4fcc676961bff0efd69ce99fd414b93b173903249f5ec5a5df297220d2a643d6`.
  Forest instance `:tree:20` retained position but scale changed from
  `[0.9039845797048858,0.7748439254615228,0.9039845797048858]` to
  `[0.7748439254615228,1.5496878509223733,0.7748439254615228]`.
- Cause of appearance drift: renderer catalog assignment preserves edit history,
  while collapsed schema replay assigned new slots by a different ordinal. Added
  persisted per-instance recipe/variation ownership and strict restore validation.
  Targeted appearance/serialization tests pass, but a new real save/reopen cycle
  with these added fields is still required. Old snapshots did not record these
  slots and cannot retroactively prove the original appearance.
- Mixed water/removal replay bypassed Worker-root preservation. A new regression
  reproduced thousands of unwanted natural instances from a UI-thread recompile.
  The compiler now retains Worker roots for mixed edits. However, reopening the
  real old snapshot with this change yielded 759 objects, **not** the original
  1,286. Therefore this is not yet a successful fix for exact scene restoration;
  the realized population and the canonical/root replay must still be reconciled.
- Restore failure no longer silently falls back to a different default world.

## Remaining acceptance work

### Additional storage checks

- Save repository regression suite: 7 tests passed (exit 0). Includes independent
  repository instances with the same timestamp and authored hash: rejection of the
  second pointer write preserves the first snapshot and its original appearance.
  Snapshot keys now use UUIDs to avoid overwriting/deleting the first snapshot.
- A pointer referencing a missing snapshot now raises an error instead of being
  interpreted as an empty account. This is repository-level evidence, not proof
  of user-facing recovery behavior.
- Terrain TypeScript check and `git diff --check` passed after these changes.

- Verify all named asset kinds, not just the examples above: terrain features;
  ocean/lake/pond/river/stream; tree/forest/shrub/shrubland/grassland/flower-field/
  aquatic-grass-bed; rock/mushroom/road/bridge/poi.
- Cover create, update, query and delete where required, natural assets as well
  as authored assets, and exact stable identities/parameters after re-entry.
- Verify individual vegetation instance identities/transforms, not merely group
  member counts; check mixed edits, removals, shared tree appearance and water colors.
- Existing API gaps are not acceptance passes: natural terrain geometry update is
  rejected by the current contract; rock/mushroom/road/bridge/poi creation/update
  are not exposed by the current landscape tools. These need resolution.
- Verify account isolation, failed saves, corrupt/unavailable storage, rapid exit,
  generation/retry behavior, and edits after restoration.
- A 30-test run and a separate 17-test run had passing assertions but exited with
  a Vitest `onTaskUpdate` timeout. Neither is recorded as a passing test run.
- Complete code review only after acceptance gaps have been resolved.

## Realized-population snapshot: actual close/reopen evidence

Test identity `seed-world-local-debug-population-v1`, snapshot timestamp
`1789968686348`. The previous test identity and its failed legacy snapshot were
left intact. This is a local Wrapper re-entry, not production logout/login.

- Created tree, forest, pond, grassland, flower-field and aquatic grass; updated
  forest and pond (observed pond depth 3.1 metres), then deleted a natural rock
  and mushroom. Deletion returned 2 and both subsequent ID queries returned 0.
- Closed the test tab completely and opened the same Wrapper identity in a new
  tab. Persistence changed from `saved` to `restored`, with the same timestamp.
- Actual object catalog before and after: 1,284 objects, including 947 trees,
  112 shrubs, 35 rocks, 135 small rocks and 55 mushrooms; 5 authored instances.
  SHA-256 of sorted identities, kinds, sources, positions, footprints and
  properties matched exactly:
  `4d7d515f776155083b8eaf0b425d55bbe2b45b07ec2c94138ba5864725dec98a`.
- All five 384-square density sample channels matched byte-for-byte by SHA-256:
  grass-2, water-grass, flowers-1, flowers-2 and flower-1. Density metadata was
  not fully compared by this probe and must not be inferred as covered.
- Ten other field buffers matched (materialWeights, rockySlopeWeight, waterMask,
  flow, sediment, wetness, wetlandWeight, riverBankDistanceMetres,
  wetlandWaterLevelMetres, habitat).
- **Failure: heightSamples differed**, despite equal length 148225. Before:
  `65f8dbc99016c3b02c3e40b0ebe1cea0d063e854ade0cfa048b349e31e8c8b86`;
  after: `2700bff56db9a9afeaca00daac8f3e3f9d793d7e5fb718b830de18022ddec3b9`.
  The exact differing samples and cause remain to be investigated. This mixed
  scenario is therefore NOT an overall restoration pass; CR remains gated.

### Height rounding investigation

- Added a regression that actually publishes four successive pond depth height
  patches (2200, 3100, 2800, 4300 mm), then compares the full height buffer with
  direct restoration of the final Authoring state. Before the fix it failed with
  15 differing samples; this is distinct from the previous single-step replay test.
- Runtime height compilation now accepts an immutable generation height baseline
  and its represented Authoring state. Main captures these together when the
  generation is published and releases them on destruction. Subsequent edits
  calculate from this baseline rather than accumulating R16 decode/encode error.
- The targeted regression passed after the fix (1 passed, 18 skipped, exit 0),
  and terrain TypeScript checking passed (exit 0). Other runtime-delta consumers
  without a supplied baseline retain the previous calculation path.
- Browser verification of this fix is still pending. Existing snapshots do not
  contain the previous accumulated height rounding; their former physical height
  bytes cannot be claimed to have been recovered by this change.
- Extended the height regression to delete the final pond and compare every
  height sample against the initial terrain, then apply the publication rollback
  bytes and compare against the edited terrain. Both comparisons passed. The
  targeted run also covered local pond/lake/stream/river create/update compilation:
  2 passed, 17 skipped, exit 0. This does not replace browser re-entry verification
  or prove application-level rollback/save failure handling.

### Browser verification of height baseline fix

- Reloaded the updated application, restoring test identity
  `seed-world-local-debug-population-v1`. Through the real application API,
  updated pond `agent-water-body-6c6b17a1-036c-46fc-8ad0-a5b39785b178`
  to depths 2.8 and then 4.3 metres. Both returned `applied` and `saved`;
  final snapshot timestamp `1789969494126`.
- Captured the height buffer, completely closed the test tab, and opened a new
  tab with the same Wrapper identity. Observed `restored` and the same timestamp.
- All 148225 height samples now have matching SHA-256 before/after:
  `6aebc9134ffc543a06e649261945ce8c291ce02dac6640fca8fde65498baaeba`.
  This verifies the new mixed-world pond-depth scenario's height preservation.
  It does not recover old rounding history or complete all-asset/login acceptance.

### Remaining capability gate confirmed in current source

- `landscape-tools.ts` exposes terrain, water and vegetation creation/update only.
  Terrain update references explicitly require `source: authored`; water creation
  supports pond/lake/stream/river, not ocean creation. No rock/mushroom/road/bridge/
  poi creation/update contract is present in that tool set.
- `SeedWorldAgentApplication.deleteWorld` explicitly skips natural non-object
  assets with a warning that no reversible deletion atom exists. If nothing can
  be mutated it raises `NOT_EDITABLE`. `_requireFeatureResource` resolves only
  Authoring resources, so natural terrain cannot use semantic terrain update.
- These are implementation gaps, not merely missing test coverage. Persistence
  tests cannot establish full CRUD for these types. Full acceptance remains open.
- After the height fix, reran SaveState and SavedPopulation targeted suites:
  8 tests passed, exit 0. This verifies only their storage/layout contracts.

### Save-failure feedback implementation (verification pending)

- Added a visible saving/saved/failure status with a retry button on failure.
  Snapshot-capture errors now take the same failure-feedback path instead of
  escaping after the edit was already committed. Retry captures current world
  state, not a stale failed snapshot.
- Added a browser beforeunload warning while saving or after failure. Destruction
  now occurs on non-bfcache pagehide so cancelling the warning retains the live
  world. Browser warnings are best-effort and do not guarantee native-shell or
  OS process-termination protection.
- Terrain typecheck and diff whitespace check passed. Actual failed-storage,
  retry, cancelled-navigation and native lifecycle scenarios are NOT yet verified.

### Concurrent load/publication race

- Added a targeted interleaving test: a reader obtains the old pointer, another
  repository publishes a new snapshot and reclaims the old one, then the reader
  attempts to fetch the old snapshot. Load now re-reads the pointer and follows
  the new snapshot only if that pointer actually advanced. An unchanged dangling
  pointer remains an error; repeated churn is bounded to one retry.
- SaveState suite: 8 passed, exit 0. This is transport-level deterministic evidence,
  not a claim of end-to-end multi-tab conflict resolution or browser retry QA.

### Seven authored terrain kinds: real create/update/read/re-entry

- In the existing population-v1 Wrapper test world, created mountain, ridge,
  canyon, valley, slope, plateau and basin at distinct positions. Each started
  with length 80 m, width 60 m, magnitude 10 m; updated each to length 90 m and
  elevation +15 m (raised kinds) or -15 m (canyon/valley/basin).
- All seven completed; final save timestamp `1789969971224`. The visible UI
  showed “世界已保存”. Queried their actual IDs and properties before closing.
- Fully closed the test tab and reopened the same identity. Observed `restored`
  with the same save timestamp. Seven IDs/kinds/properties matched SHA-256
  `4a8822e0e827ff713ef1f93268af4230e7c850be69a2649213f6625b4cb57996`.
- Actual height bytes matched `f5168eded0a787461657a25e2746e3bed1ad3fe06f993f03a151949b63025074`;
  material weights matched `6d497e28a451947aaf1b9e9936a8f9d7c5ba8e6d033717afeadc5771be4f795f`;
  rocky slope weights matched `a0440bb09ba8e30ef1eb8ff4fbaa9554719336d7df1b4e7b9f3c991fee0f9f5b`.
- Deletion/re-entry for these seven, natural terrain editing, other asset gaps,
  failure UI, and actual production login remain open. This is not full acceptance.

### Seven authored terrain kinds: deletion and re-entry

- Deleted exactly the seven test terrain assets from the preceding scenario;
  application returned deletedCount 7 and saved timestamp `1789970115719`.
- Height fingerprint immediately returned to the pre-creation world (which still
  includes the separately authored pond):
  `6aebc9134ffc543a06e649261945ce8c291ce02dac6640fca8fde65498baaeba`.
- Closed the tab entirely and reopened the same identity. Observed `restored`
  with timestamp `1789970115719`, zero authored assets for those seven terrain
  kinds, and the identical height fingerprint. Their create/update/read/delete
  and re-entry sequence is now covered in this real Wrapper scenario.
- This does not establish natural-terrain CRUD, the remaining asset types,
  production authentication, or failure/retry acceptance.

### Browser save-failure feedback and real retry

- On the local population-v1 test page only, intercepted exactly one CandyJar
  `lingguang.storage.setItem` call and invoked its failure callback. The original
  bridge method was restored immediately; this was explicit fault injection,
  not a real backend outage or a substitute success implementation.
- Changed the real pond depth to 4.5 m. Mutation returned `applied`, persistence
  was `save-error`, and the page visibly showed “世界保存失败，当前编辑尚未保存。
  请重试后再离开。” with a “重试保存” button. This distinguishes local edit success
  from save success, though the tool result itself still says applied.
- Clicked the actual retry button. Observed “正在保存世界，请稍候…” followed by
  “世界已保存”. Readback: `saved`, timestamp `1789970471748`, depth 4.5 m,
  original CandyJar method restored. Retry used the real bridge.
- Re-entry after this particular retry, cancellation of browser navigation,
  concurrent UI request ordering and native-shell exit remain unverified.

### Wrapper navigation-warning failure

- Injected one failed storage write while changing pond depth to 4.6 m; bridge
  was restored immediately and observed `save-error` plus the visible retry UI.
- Triggered top-level Chrome reload. No confirmation dialog appeared; the page
  reloaded and DevTools context reset to top. Therefore cancellation/exit-warning
  acceptance FAILED in this Wrapper; no claim of loss prevention is warranted.
- Read-only inspection of ASAP's `mini_app_wrapper_middle_layer.html` found the
  iframe sandbox enables allow-scripts, allow-same-origin and allow-popups, but
  not allow-modals. This is a plausible restriction on beforeunload dialogs;
  it has not been isolated experimentally from user-activation requirements.
- Did not modify the Wrapper or relax its sandbox. Native lifecycle integration
  needs an authorized target entry and cannot be proven with this page alone.

## Revised scope: browser localStorage only

User clarified that DB integration is their future work, no new asset editing
capabilities are required, and closing/reopening the local page is the intended
re-entry test. Earlier backend/production-login requirements are not gates for
this local verification. Earlier bridge tests do not prove the localStorage path.

- Localhost/127.0.0.1 now use window.localStorage even inside the Wrapper.
- Actual new mountain ID `agent-terrain-feature-c6113bf5-4835-49f0-a0e9-dd36cba4f22a`,
  length 80 m, width 60 m, elevation delta 12 m, seed 51001, saved at
  `1789971443413`. Verified browser storage pointer, then closed the tab completely.
- Reopened page restored the same timestamp and exactly one asset with the same
  ID and parameters. All 148225 height samples matched SHA-256
  `336a62a53fa6ebc6fdaff1d366344b2b1b3671a719a7383e720507e6a56a6adc`.
- This first localStorage create/re-entry scenario passed. LocalStorage repeated
  updates/deletions, mixed assets and quota behavior remain to be verified; CR
  has not started.

## Debounced saving and engine UI

- Reference inspected through a read-only shallow checkout of editor dev/2.0,
  commit `91b94e0aeb9166ad80e0bea6799ee2fe58303385`: project.ts merges scene
  changes at 100ms; EditorAsset.ts saveMain/saveMeta use 1500ms trailing debounce.
  Adopted the actual asset-write delay (1500ms), plus the agreed 10000ms max wait.
- Added a renderer-independent save scheduler: lazy latest-state capture, one
  in-flight write, revision-aware status, merged follow-up writes, explicit retry,
  and timer/completion cleanup on destruction. Editing no longer waits for saving.
- Replaced the DOM notice/button with Galacean UICanvas/Text at bottom right.
  Idle text is not raycastable; failure text supports engine pointer-click retry.
- Browser: three consecutive real terrain updates (13/14/15 metres) returned
  pending with zero storage writes, then produced exactly one snapshot write and
  one pointer write. Reload restored the final 15-metre value.
- Screenshot verified bottom-right engine-rendered text and no DOM retry label.
  Injected one localStorage failure for a 16-metre edit; the UI displayed failure.
  Clicking the actual Galacean UI text retried through real localStorage and
  visibly returned to saved. The intercepted storage method was restored.
- Scheduler tests cover debounce, max wait, slow writes/new revisions, failure,
  capture failure, explicit flush during writes, older failed writes and disposal.
  UI/source terrain typecheck passed. These checks do not close unrelated
  outstanding whole-world persistence acceptance items.
