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
