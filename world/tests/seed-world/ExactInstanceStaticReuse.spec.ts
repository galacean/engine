import { expect, it, vi } from "vitest";
import { BoundingBox, Matrix, type Camera } from "@galacean/engine";
import {
  SeedWorldExactInstanceCellRuntime,
  type SeedWorldExactInstanceSpatialEntry
} from "@galacean/engine-world-planning/world/SeedWorldExactInstanceCellRuntime";

it("updates published instances and completes LOD fades with a stationary camera", () => {
  const camera = { projectionMatrix: new Matrix(), viewMatrix: new Matrix() } as Camera;
  const entry = (id: string, update = vi.fn<() => boolean>(() => false)): SeedWorldExactInstanceSpatialEntry => ({
    id,
    category: "vegetation",
    bounds: new BoundingBox(),
    controller: { update, setAuthoringVisible: vi.fn() }
  });
  const original = entry("original");
  const runtime = new SeedWorldExactInstanceCellRuntime(camera, [original], undefined, false);
  runtime.update(0);
  runtime.update(1);
  expect(runtime.getSnapshot()).toMatchObject({ reusedStaticCamera: true, instanceUpdateCount: 0 });

  const fade = vi.fn<() => boolean>(() => false).mockReturnValueOnce(true);
  const added = entry("added", fade);
  runtime.replaceEntries([added]);
  runtime.update(2);
  runtime.update(3);
  expect(fade.mock.calls).toHaveLength(2);
  expect(original.controller.update).toHaveBeenCalledTimes(1);
  runtime.update(4);
  expect(runtime.getSnapshot()).toMatchObject({ reusedStaticCamera: true, instanceUpdateCount: 0 });

  // A placement transaction can also move an existing instance without changing membership.
  runtime.replaceEntries([added]);
  runtime.update(5);
  expect(fade.mock.calls).toHaveLength(3);
});

it("addEntries and removeEntries update incrementally without refreshing existing entry bounds", () => {
  const camera = { projectionMatrix: new Matrix(), viewMatrix: new Matrix() } as Camera;
  const makeEntry = (id: string, x: number, z: number) => {
    const update = vi.fn<() => boolean>(() => false);
    const refreshBounds = vi.fn();
    const bounds = new BoundingBox();
    bounds.min.set(x - 1, 0, z - 1);
    bounds.max.set(x + 1, 2, z + 1);
    const item: SeedWorldExactInstanceSpatialEntry = {
      id,
      category: "vegetation",
      bounds,
      refreshBounds,
      controller: { update, setAuthoringVisible: vi.fn() }
    };
    return { item, update, refreshBounds };
  };

  const a = makeEntry("a", 0, 0);
  const b = makeEntry("b", 10, 0);
  const runtime = new SeedWorldExactInstanceCellRuntime(camera, [a.item], undefined, true);
  runtime.update(0);
  expect(a.update).toHaveBeenCalledTimes(1);

  runtime.addEntries([b.item]);
  runtime.update(1);
  // Adding b must not recompute a's bounds or needlessly re-update settled a with a static camera.
  expect(a.refreshBounds).not.toHaveBeenCalled();
  expect(b.refreshBounds).not.toHaveBeenCalled();
  expect(a.update).toHaveBeenCalledTimes(1);
  expect(b.update).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot().totalInstanceCount).toBe(2);

  runtime.removeEntries(new Set([b.item]));
  expect(runtime.getSnapshot().totalInstanceCount).toBe(1);
  runtime.update(2);
  expect(b.update).toHaveBeenCalledTimes(1);
});

it("addEntries respects terrainOcclusion on stationary cameras and deduplicates existing entries", () => {
  const camera = { projectionMatrix: new Matrix(), viewMatrix: new Matrix() } as Camera;
  const makeEntry = (id: string, x: number, z: number) => {
    const update = vi.fn<(t: number, v?: boolean) => boolean>(() => false);
    const bounds = new BoundingBox();
    bounds.min.set(x - 1, 0, z - 1);
    bounds.max.set(x + 1, 2, z + 1);
    const item: SeedWorldExactInstanceSpatialEntry = {
      id,
      category: "vegetation",
      bounds,
      controller: { update, setAuthoringVisible: vi.fn() }
    };
    return { item, update };
  };

  const a = makeEntry("a", 0, 0);
  const b = makeEntry("b", 2, 0);
  const occlusion = {
    visibilityRevision: 1,
    horizonQueryableThisFrame: true,
    isBoundsOccluded: vi.fn(() => true)
  };
  const runtime = new SeedWorldExactInstanceCellRuntime(camera, [a.item], occlusion, true);
  // Settle initial confirmation frames while camera stays stationary.
  runtime.update(0);
  runtime.update(1);
  expect(runtime.getSnapshot().candidateInstanceCount).toBe(0);

  // Adding a duplicate entry and a new entry inside an occluded cell must not bypass occlusion.
  runtime.addEntries([a.item, b.item]);
  runtime.update(2);
  expect(runtime.getSnapshot().totalInstanceCount).toBe(2);
  expect(runtime.getSnapshot().candidateInstanceCount).toBe(0);
  expect(b.update).not.toHaveBeenCalledWith(2, true);
});
