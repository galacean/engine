# Preset systems in Script assets

Use this guide when writing a game Script asset. In `execute`, use the Editor APIs and asynchronous component proxies instead. Script assets run on the Engine thread; their imports below are the actual native component classes already used by Scene loading. Do not run unbounded loops or CPU-heavy computation in Script callbacks.

Import `FarmingSystem`, `FarmingAreaComponent`, `FarmingAPI`, `BuildingSystem`, `HouseComponent`, `WallComponent`, `FenceComponent`, `WindowComponent`, `DoorComponent`, `OpeningComponent`, `WallLampComponent`, `RoofWindowComponent`, `RoofHatchComponent`, and `RoofLampComponent` from `@galacean/seed-world-systems`. The [runtime entry](../../declare/runtime/node_modules/@galacean/seed-world-systems/index.d.ts) and its relative imports contain generated declarations from the running source. These imports do not create or install a system.

## Finding existing components

Use normal Engine Entity/Scene access. `entity.getComponent(FarmingSystem)` looks on that Entity; it does not search the whole Scene. Use `getComponentsIncludeChildren` on Scene root Entities when finding managers elsewhere. Query again after a Scene reload or component replacement; do not keep a destroyed component reference. BuildingSystem manages the active building components of one Scene; choose a body or decoration by its actual Entity/component identity.

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

State belongs to each system's configured assets. Component properties select virtual-path assets through normal Editor serialization. Gameplay methods mutate domain state through the existing system session. To author persistent Scene bindings or Script components, use the [Editor APIs](../../declare/native/api.d.ts); changing arbitrary runtime object properties does not itself author a saved Scene edit.

- Buildings: query native Entity components (`HouseComponent`, `WallComponent`, `FenceComponent`) and their child decoration components. Entity transforms own placement; component properties own shape, dimensions, surfaces and decoration configuration. Persistent edits use the same Scene transaction as other components; direct Script assignments are runtime changes. `BuildingSystem` owns compilation and the runtime collection, never a separate writable object directory. Host terrain updates automatically re-ground the affected groups. Geometry resources are referenced from VFS.

- Roof attachments: `RoofWindowComponent`, `RoofHatchComponent`, and `RoofLampComponent` are child Entity decorations of a `HouseComponent`. Their roof chart `uv` and metre `elevation` own mounting; keep the child local transform at identity. `width`, `height`, `rank` and supported `type` select the existing producer configuration. Wall attachments instead use the child Entity transform. Both paths save through Scene edits and use the host VFS construction library.

- `OpeningComponent` represents an existing ground-open arch. Mount its Entity on the host wall with local y=0; edit width/height and seed through Scene transactions. The effective wall material (including its surface placement binding) chooses the stone or timber arch. Hiding arch surface units preserves the authored opening; disabling or deleting the opening component closes the wall aperture.
