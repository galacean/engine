import { afterEach, expect, it } from "vitest";
import { nativeFixture } from "./native-fixtures";
import { MemoryFarmRepository } from "../../src/farming/persistence/MemoryFarmRepository";
import { farmingAreaComponentData } from "../../src/farming/native/FarmingSceneData";
import { parseFarmingResource, serializeFarmingResource } from "../../src/farming/native/FarmingResources";
import { storeHarvest } from "../../src/farming/storage/StorageRules";
import { freezeSnapshot } from "../../src/farming/domain/FarmState";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";
const fixtures: ReturnType<typeof nativeFixture>[] = [];
async function create(...args: Parameters<typeof nativeFixture>) {
  const f = nativeFixture(...args);
  fixtures.push(f);
  await f.ready;
  return f;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.system.dispose();
});

it("exposes crop growth thresholds as detached catalog data for care decisions", async () => {
  const f = await create();
  const request = {operation: "getCatalog" as const, input: {farmId: f.area.farmId}};
  const first = await f.api.execute(request);
  if (!first.ok) throw new Error(first.error.message);
  const expected = TEST_FARMING_DEFINITIONS.catalog.crops[0].growthFactors;
  expect(first.value.crops[0].growthFactors).toEqual(expected);
  const before = f.area.service.getSnapshot();
  (first.value.crops[0].growthFactors.soilMoisture as {optimalMinimum: number}).optimalMinimum = -999;
  const second = await f.api.execute(request);
  if (!second.ok) throw new Error(second.error.message);
  expect(second.value.crops[0].growthFactors).toEqual(expected);
  expect(f.area.service.getSnapshot()).toEqual(before);
});

it("initializes the native default field and persists exact cargo, containers and retention in Scene data", async () => {
  const f = await create("storage-native", {}, { plots: undefined, initialLayout: { groundId: "test-ground" } });
  expect(f.area.service.queryPlots()).toHaveLength(9);
  expect(await f.api.execute({ operation: "getCatalog", input: { farmId: f.area.farmId } })).toMatchObject({
    ok: true,
    value: { storage: TEST_FARMING_DEFINITIONS.storage }
  });
  const harvest = storeHarvest(
    f.area.service.getSnapshot(),
    TEST_FARMING_DEFINITIONS,
    "berry",
    "berry-fruit",
    21,
    TEST_GROUND_PROVIDER.capture()
  );
  if (!harvest.ok) throw new Error(harvest.message);
  const stocked = await create(
    "storage-native",
    {},
    {
      plots: undefined,
      initialLayout: { groundId: "test-ground" },
      snapshot: freezeSnapshot({ ...f.area.service.getSnapshot(), storage: harvest.storage })
    }
  );
  const read = await stocked.api.execute({
    operation: "getContainers",
    input: { farmId: "storage-native", query: { cropId: "berry" } }
  });
  expect(read.ok && read.value.map((c) => c.quantity)).toEqual([20, 1]);
  const saved = await farmingAreaComponentData(stocked.area, (r) => (r === stocked.resources.catalog ? 0 : 1));
  const restored = await create(
    "storage-native",
    {},
    { plots: undefined, initialLayout: { groundId: "test-ground" }, snapshot: saved.props.configuration.snapshot }
  );
  expect(restored.area.service.getSnapshot()).toEqual(saved.props.configuration.snapshot);
  expect(parseFarmingResource(f.engine, serializeFarmingResource(f.resources.rules)).data).toEqual(
    f.resources.rules.data
  );
});

it("retries allocation through the native API without duplicating containers or losing captured revisions", async () => {
  const repository = new MemoryFarmRepository(),
    f = await create("storage-native", { repository });
  const before = f.area.service.getSnapshot();
  const request = {
    operation: "setContainerCount",
    input: { farmId: f.area.farmId, typeId: "basket", count: 3 },
    options: { commandId: "add-baskets" }
  } as const;
  repository.failNextTransaction = true;
  const failed = await f.api.execute(request);
  expect(failed).toMatchObject({ ok: false, error: { code: "STORAGE_FAILURE", retryable: true } });
  expect(f.area.service.getSnapshot()).toEqual(before);
  if (failed.ok || !failed.error.details?.retryRequest) throw new Error("Missing retry request");
  expect(await f.api.execute(failed.error.details.retryRequest)).toMatchObject({ ok: true });
  expect(await f.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
  expect(f.area.service.getContainers({ typeId: "basket" })).toHaveLength(3);
  expect(await f.api.execute({ ...request, input: { ...request.input, count: 4 } })).toMatchObject({
    ok: false,
    error: { code: "INVALID_COMMAND" }
  });
});

it("withdraws through the native transaction and forbids stale terrain on harvest", async () => {
  const f = await create("native-farm");
  await f.api.execute({
    operation: "plant",
    input: { farmId: f.area.farmId, plotId: "native/a", seedId: "berry-seed" }
  });
  await f.api.execute({ operation: "irrigate", input: { farmId: f.area.farmId, plotId: "native/a" } });
  // One watering starts at 80%. The linear 20–100% moisture curve needs 15s to mature.
  f.clock.advanceBy(15000);
  await f.area.service.checkpoint();
  const crop = f.area.service.getPlot("native/a")!.crop!;
  const harvest = {
    operation: "harvest",
    input: { farmId: f.area.farmId, plotId: "native/a", cropInstanceId: crop.instanceId }
  } as const;
  expect(await f.api.execute({ ...harvest, options: { expectedGroundRevision: 999 } })).toMatchObject({
    ok: false,
    error: { code: "GROUND_CHANGED" }
  });
  expect(await f.api.execute(harvest)).toMatchObject({ ok: true });
  const carried = f.area.service.getSnapshot().items.carried;
  if (!carried || !("itemId" in carried)) throw new Error("Expected carried harvest basket");
  expect(
    await f.api.execute({ operation: "unloadBasket", input: { farmId: f.area.farmId, basketId: carried.itemId } })
  ).toMatchObject({ ok: true });
  const quantity = f.area.service.getInventory()["berry-fruit"];
  const request = {
    operation: "withdrawInventory",
    input: { farmId: f.area.farmId, itemId: "berry-fruit", quantity },
    options: { commandId: "take-berries" }
  } as const;
  expect(await f.api.execute(request)).toMatchObject({ ok: true });
  expect(await f.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
  expect(f.area.service.getInventory()).toEqual({});
  expect(f.area.service.getContainers({ typeId: "basket" })).toMatchObject([{ quantity: 0, cropId: null }]);
});

it("allocates a new container around an existing loose hoe and preserves its pose",async()=>{
 const probe=await create("placement-probe");
 const farmId=probe.area.farmId;
 const old=probe.area.service.getContainers({typeId:"basket"});
 expect((await probe.api.execute({operation:"setContainerCount",input:{farmId,typeId:"basket",count:old.length+1}})).ok).toBe(true);
 const next=probe.area.service.getContainers({typeId:"basket"}).find(c=>!old.some(o=>o.id===c.id))!;
 const f=await create("placement-live");const id=f.area.farmId;
 expect((await f.api.execute({operation:"generateItems",input:{farmId:id,itemType:"hoe",count:1,groundId:next.groundId,position:next.position}})).ok).toBe(true);
 const before=f.area.service.getSnapshot().items;
 expect((await f.api.execute({operation:"setContainerCount",input:{farmId:id,typeId:"basket",count:old.length+1}})).ok).toBe(true);
 expect(f.area.service.getSnapshot().items).toEqual(before);
 const {farmItemGroundBounds}=await import("../../src/farming/domain/FarmItemFootprint");
 const {boundsTooClose,containerBounds}=await import("../../src/farming/storage/StoragePlacement");
 for(const c of f.area.service.getContainers({typeId:"basket"}))for(const item of before.instances)
  expect(boundsTooClose(containerBounds(c,TEST_FARMING_DEFINITIONS.storage!.containers.find(t=>t.id===c.typeId)!),farmItemGroundBounds(item.type,item.position,item.yaw),0.1)).toBe(false);
});
