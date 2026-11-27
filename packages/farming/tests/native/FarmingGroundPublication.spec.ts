import { afterEach, expect, it, vi } from "vitest";
import { nativeFixture } from "./native-fixtures";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";
import type { FarmingGroundChange, FarmingGroundView } from "../../src/farming/domain/FarmingGround";
import { findItemPlacement, itemPlacement, regroundFarmItems } from "../../src/farming/domain/rules/FarmItemRules";

const fixtures: ReturnType<typeof nativeFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.system.dispose();
});
async function fixture() {
  let view = TEST_GROUND_PROVIDER.capture();
  const listeners = new Set<(change: FarmingGroundChange) => void>();
  const f = nativeFixture("ground-publication", {
    groundProvider: {
      capture: () => view,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    }
  });
  fixtures.push(f);
  await f.ready;
  return {
    ...f,
    async publish(next: FarmingGroundView) {
      view = next;
      for (const listener of listeners) listener({ revision: view.revision });
      await f.area.service.whenIdle();
    }
  };
}

it("preserves items through pending publications, then validates every original position against the ready ground", async () => {
  const f = await fixture(),
    service = f.area.service,
    before = service.getSnapshot();
  expect(before.items.instances.length).toBeGreaterThan(0);
  const base = TEST_GROUND_PROVIDER.capture();
  const inspect = vi.fn((id, bounds) => ({ ...base.inspectBounds(id, bounds), blocked: true }));
  const pending = { ...base, revision: 1, placementPending: true, inspectBounds: inspect };
  expect(regroundFarmItems(before, TEST_FARMING_DEFINITIONS, pending)).toEqual({
    items: before.items,
    changes: [],
    blocked: []
  });
  expect(inspect).not.toHaveBeenCalled();
  await f.publish(pending);
  await service.refreshItemsGround();
  await f.publish({ ...pending, revision: 2 });
  expect(service.getSnapshot().items).toEqual(before.items);
  // Plot availability still observes the blocked view; only impossible item searches are deferred.
  expect(inspect).toHaveBeenCalled();
  expect(inspect.mock.calls.length).toBeLessThan(100);
  const height = 0.123456789012345;
  const readyInspect = vi.fn(base.inspectBounds);
  await f.publish({
    ...base,
    revision: 3,
    inspectBounds: readyInspect,
    sample: (id, x, z) => ({ ...base.sample(id, x, z)!, position: [x, height, z] })
  });
  expect(readyInspect.mock.calls.length).toBeGreaterThanOrEqual(before.items.instances.length);
  expect(service.getSnapshot().items.instances.map((i) => i.position)).toEqual(
    before.items.instances.map((i) => [i.position[0], height, i.position[2]])
  );
});

it("rejects direct placement and search on a pending view without querying obsolete geometry", async () => {
  const f = await fixture(),
    snapshot = f.area.service.getSnapshot(),
    item = snapshot.items.instances[0];
  const inspectBounds = vi.fn(() => {
    throw Error("obsolete geometry");
  });
  const view = { ...TEST_GROUND_PROVIDER.capture(), placementPending: true, inspectBounds };
  expect(itemPlacement(snapshot, TEST_FARMING_DEFINITIONS, view, item.groundId, item.position, item.id)).toBeNull();
  expect(
    findItemPlacement(snapshot, TEST_FARMING_DEFINITIONS, view, item.groundId, item.position, item.id, 20)
  ).toBeNull();
  expect(inspectBounds).not.toHaveBeenCalled();
});

it("retains exact nearest-first relocation after pending publication and does not cache across ready views", async () => {
  const f = await fixture(),
    before = f.area.service.getSnapshot(),
    item = before.items.instances[0];
  const snapshot = {
    ...before,
    storage: { ...before.storage, containers: [] },
    items: { ...before.items, instances: [item], carried: null }
  };
  const base = TEST_GROUND_PROVIDER.capture();
  const ready: FarmingGroundView = {
    ...base,
    revision: 2,
    inspectBounds(id, b) {
      const x = (b.minimumX + b.maximumX) / 2,
        z = (b.minimumZ + b.maximumZ) / 2;
      return { ...base.inspectBounds(id, b), blocked: x === item.position[0] && z === item.position[2] };
    }
  };
  const expected = regroundFarmItems(snapshot, TEST_FARMING_DEFINITIONS, ready);
  expect(expected.items.instances[0].position).toEqual([item.position[0], 0, item.position[2] - 0.5]);
  const deferred = regroundFarmItems(snapshot, TEST_FARMING_DEFINITIONS, {
    ...ready,
    revision: 1,
    placementPending: true
  });
  expect(regroundFarmItems({ ...snapshot, items: deferred.items }, TEST_FARMING_DEFINITIONS, ready)).toEqual(expected);
  const unavailable = regroundFarmItems(snapshot, TEST_FARMING_DEFINITIONS, {
    ...base,
    revision: 3,
    inspectBounds: () => ({
      covered: true,
      blocked: true,
      underwater: false,
      surfaces: ["soil"],
      maximumSlopeDegrees: 0
    })
  });
  expect(unavailable.blocked).toEqual([item.id]);
  expect(unavailable.items).toBe(snapshot.items);
  expect(regroundFarmItems(snapshot, TEST_FARMING_DEFINITIONS, { ...base, revision: 4 }).blocked).toEqual([]);
});
