# Preset systems in Script assets

Use this guide when writing a game Script asset. In `execute`, use the Editor APIs and asynchronous component proxies instead. Script assets run on the Engine thread; their imports below are the actual native component classes already used by Scene loading. Do not run unbounded loops or CPU-heavy computation in Script callbacks.

Import `FarmingSystem`, `FarmingAreaComponent`, `FarmingAPI`, `Building`, `BuildingManager`, `BuildingGroupComponent`, `BuildingPartComponent` and `buildingDraftSource` from `@galacean/seed-world-systems`. The [runtime entry](../../engine/node_modules/@galacean/seed-world-systems/index.d.ts) and its relative imports contain generated declarations from the running source. Scene loading and Script imports share these native class identities.

## Finding existing components

Use normal Engine Entity/Scene access. `entity.getComponent(FarmingSystem)` looks on that Entity; it does not search the whole Scene. Use `getComponentsIncludeChildren` on Scene root Entities when finding managers elsewhere. Query again after a Scene reload or component replacement; do not keep a destroyed component reference. BuildingManager manages flat BuildingPartComponents in one Scene. Choose parts by their actual Source component identity or by definition.id; neither is an array index.

```ts
import { Script } from "@galacean/engine";
import { FarmingSystem, FarmingAPI } from "@galacean/seed-world-systems";

export default class FarmStatus extends Script {
  async inspectFarm() {
    const systems: FarmingSystem[] = [];
    for (const root of this.entity.scene.rootEntities) {
      systems.push(...root.getComponentsIncludeChildren(FarmingSystem, []));
    }
    const system = systems.find(item => !item.destroyed && !item.isDisposed);
    if (!system) return;
    const result = await new FarmingAPI(system).execute({operation: "list", input: {}});
    if (!result.ok) throw new Error(result.error.message);
    for (const farm of result.value) console.log(farm.farmId, farm.initialized, farm.cropCount);
  }
}
```

## Readiness, commands and persistence

- Farming: `new FarmingAPI(system).execute({operation, input, options?})` provides the typed operations used by the native farming API. Read `FarmingAPIContract.d.ts` via the entry's imports for operation-specific arguments and results. Check `result.ok`; handle `result.error` on failure. Areas may initialize after Script `onAwake`; inspect `list`/diagnostics and `initialized` before commands. Prefer this API for planting, watering, harvesting, persistent item/basket and inventory operations so validation, receipts and persistence stay in the owning system. Do not rewrite raw snapshots or call `configureRuntime`/`dispose` to operate a farm.

State belongs to each system's configured assets. Component properties select virtual-path assets through normal Editor serialization. Gameplay methods mutate domain state through the existing system session. To author persistent Scene bindings or Script components, use the [Editor APIs](../../editor/declare/native/api.d.ts); changing arbitrary runtime object properties does not itself author a saved Scene edit.

- Buildings: query `BuildingPartComponent`. Its `definition` owns type, support, algorithm, Unit and placement parameters. `relations` reference explicit part identities and boundaries; `BuildingGroupComponent` independently owns the group definition and assetLibrary. The explicit `frame` Entity defines a shared compilation group. Native Entity transforms own group position/orientation. Persistent changes use Scene/Prefab transactions; direct Script assignments are runtime-only.

- Attachments: a window, door or lamp is a part using `attachmentMount`, `mountAttachment`, a `nativeAttachment` Unit and an explicit host relation. A wall mount uses either normalized `spec.u` plus metre `spec.bottom`, or `support.params.point: [x,y,z]` in the host wall's canonical local coordinates. Do not store both positions. A wall Point attachment node may translate relative to its host; this displacement is resolved into the canonical mounting point before openings are computed. The initial world uses node position and a zero Point offset. Relative rotation/scale and translating a UV mount are rejected; edit their geometry/Unit or UV coordinates instead. Roof mounts use chart `spec.uv` plus metre `spec.bottom`. Dimensions and asset selection remain explicit. Design derives openings; never save a second generated opening cache.

- Removing a dependent structural part requires updating its relations and remaining geometry. Removing an attachment removes its outgoing host relation as part of the same transaction. Saved old house/decoration components are converted once before Scene activation; scripts must use the new API.

In game Scripts, for new buildings use `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps` to generate a flat `BuildingDraft {groups,parts,relations}`. Common `buildWalls/buildRoof/buildSteps` select no architectural style. Custom Mesh/Path/Point parts may bypass the European generator. See the [building skill](editor/knowledge/building/SKILL.md).

In Agent `execute`, call `tools.building.generate({generator,parameters,source})`; imports are unavailable there. It invokes the same five European builders and returns `{content}` containing a complete native Prefab Source (`asset.version`, `root`, `entities`, `components`). Pass content unchanged to `editor.asset.create`, then instantiate through `editor.entity.create` in the existing edit transaction. Generation is read-only and does not publish or render. Use the actual project asset-library path. Later edits update the persisted component definitions, not a second generator recipe. To verify publication from execute, use runtime entity/component queries to find the actual BuildingManager instance and read its public buildStatus property. It must be bound, not pending, and have no errors; inspect diagnostics too. Runtime inspection never invokes errors()/metrics() methods.

`BuildingPartComponent` stores one definition and outgoing relations; BuildingGroupComponent owns group identity, palette, seed and assets. It has no recursive parts or plan. `BuildingManager.forScene(scene)` reuses the scene manager for CRUD and atomic publication. The scene host calls it after authored Scene loading; it collects already-enabled parts once. Enabling a part only registers with an existing manager, so loading a building cannot insert a runtime root between authored Scene roots. In Seed World, retain its existing camera, asset library and published terrain binding. In a standalone scene, provide the camera and native asset library; use bind({camera, terrain}) for a transferable terrain snapshot, or explicitly set a terrain callback for main-thread execution. Call create(parent,draft), await flushAsync(), and inspect errors() before treating the new output as published. Inspect authored parts with get(id, frame)/snapshot(frame) and runtime state with metrics(); the manager has no output/design property. Preserve originals; design cuts, placements and render buffers are derived. Unknown connection rules fail; extend buildingConnectionRules for other support types. Node hierarchy owns grouping. Units cannot contain BuildingGroupComponent or BuildingPartComponent, including disabled components and inactive descendants. Invalid Units fail before output publication. Generated output never contributes author identities. Manager.remove(entityOrBuildingComponent) deletes authors; disabling a component uses its enabled state. Do not create author buildings under generated output. Manager deletion and editor deletion share the same rule: structural profile parts remove their group; ordinary parts are removed individually; incoming and outgoing relations are cleaned only in the affected native frame, including hidden/disabled owners. The remaining author graph is validated before mutation.

The European design/placement kernels preserve dev/2.0 instance geometry and render ABI. Generic algorithms use buildingSupportAlgorithms/buildingPlacementAlgorithms, with native references and registered names. Custom analytic-profile placements register a geometry convention through `buildingPlacementAlgorithms.register(id, callback, {profile:{basis:"grid"}})` and return profile placement output. The convention does not replace the callback. Dynamically registered placement/connection functions run on the main thread; only bundled implementations use Worker execution. Seed World uses BuildingManager and BuildingRuntime for group scheduling, atomic publication and terrain transactions. Transferable profile parts use the new Worker and residency scheduler; native-reference Units run on the main thread in the same publication flow. Only changed frames rebuild. Use part.rebuild() after editing a referenced Mesh/Unit in place. Main-thread Units currently retain their full representation; automatic distance substitutes and structural collision for arbitrary Unit geometry are not provided. Point/Path/Mesh utility APIs remain available.

Building design uses typed author/derived identities, independently from the editable `selection` (group or part). Custom connection results use `localId` and `selection`, not an author `id`; their relation supplies provenance. Persist only author drafts. Native roof-tile appearance is configured with `part.appearance.roofColor` (integer 0–12), or generator `style.appearance` / `roofStyle.appearance`. Generic tiles default to 0. A profile roof uses explicit appearance when supplied, otherwise its existing roof.color. Palette changes do not change placement or identity; Prefab materials retain their own appearance.
