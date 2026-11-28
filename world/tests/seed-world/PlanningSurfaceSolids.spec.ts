import { expect, it, vi } from "vitest";
import { preparePlanningSurfaceSolidsSwap } from "@galacean/engine-world-planning/spatial/runtime/PlanningSurfaceSolids";
import { preparePlanningBridgeTransfer } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedSolids";

function fixture(fail = false) {
  const world: any = {},
    stage: any = { destroy: vi.fn(), isActive: false };
  const oldRoot: any = { parent: world, isActive: true },
    nextRoot: any = { parent: stage, isActive: true };
  const bridge: any = { root: { parent: oldRoot }, reparent: (parent: unknown) => (bridge.root.parent = parent) };
  const transfer = preparePlanningBridgeTransfer(bridge, nextRoot);
  const previous: any = { root: oldRoot, dispose: vi.fn() };
  const next: any = {
    root: nextRoot,
    commit: () => {
      transfer.commit();
      if (fail) throw Error("failed after bridge transfer");
    },
    rollbackCommit: transfer.rollback,
    finalizeCommit: transfer.finalize,
    dispose: vi.fn()
  };
  return { previous, next, world, stage, bridge, frame: preparePlanningSurfaceSolidsSwap(previous, next, stage) };
}
it("restores retained bridges and old visibility when a later publication owner fails", () => {
  const f = fixture();
  f.frame.commit();
  expect(f.previous.root.isActive).toBe(false);
  expect(f.next.root.parent).toBe(f.world);
  expect(f.bridge.root.parent).toBe(f.next.root);
  f.frame.rollback();
  expect(f.bridge.root.parent).toBe(f.previous.root);
  expect(f.previous.root.isActive).toBe(true);
  expect(f.next.root.parent).toBe(f.stage);
  expect(f.previous.dispose).not.toHaveBeenCalled();
  f.frame.discard();
  expect(f.next.dispose).toHaveBeenCalledOnce();
  expect(f.stage.destroy).toHaveBeenCalledOnce();
});
it("retires the old solids only after acceptance and leaves accepted geometry alive", () => {
  const f = fixture();
  f.frame.commit();
  expect(f.previous.dispose).not.toHaveBeenCalled();
  f.frame.finalize();
  f.frame.discard();
  expect(f.previous.dispose).toHaveBeenCalledOnce();
  expect(f.next.dispose).not.toHaveBeenCalled();
  expect(f.bridge.root.parent).toBe(f.next.root);
});
it("rolls back a bridge transfer that mutates before throwing", () => {
  const f = fixture(true);
  expect(() => f.frame.commit()).toThrow("failed after bridge transfer");
  expect(f.bridge.root.parent).toBe(f.previous.root);
  expect(f.previous.root.isActive).toBe(true);
  f.frame.discard();
  expect(f.previous.dispose).not.toHaveBeenCalled();
});
it.each(["finalize", "discard"] as const)("releases the staging root even when %s disposal fails", (action) => {
  const f = fixture();
  if (action === "finalize") f.frame.commit();
  const owner = action === "finalize" ? f.previous : f.next;
  owner.dispose.mockImplementation(() => {
    throw new Error("disposal failed");
  });
  expect(() => f.frame[action]()).toThrow("disposal failed");
  expect(f.stage.destroy).toHaveBeenCalledOnce();
});
