import { expect, it, vi } from "vitest";
import { Matrix, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { FarmingWorldPresentation } from "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";

// Real selector, pointer listener, async click and beginPlayerWork. Only scene/GPU
// services are substituted; native WebGL coverage exercises the depth producer.
function fixture() {
  const eye = new Vector3(0.625, 1.8, 2.925);
  const camera = {
    entity: {
      transform: { worldPosition: eye, worldForward: new Vector3(0, -0.7, -0.7), worldRight: new Vector3(1, 0, 0) }
    },
    viewMatrix: new Matrix(),
    projectionMatrix: new Matrix(),
    farClipPlane: 100,
    aspectRatio: 1,
    fieldOfView: 60,
    worldToViewportPoint: (_: Vector3, out: Vector3) => out.set(0.5, 0.5, 1),
    screenPointToRay: (_: unknown, ray: Ray) => {
      ray.origin.copyFrom(eye);
      ray.direction.set(0, -1, -1).normalize();
    },
    viewportPointToRay: (_: unknown, ray: Ray) => {
      ray.origin.copyFrom(eye);
      ray.direction.set(0, -1, -3).normalize();
    }
  };
  const snapshot: any = {
    revision: 1,
    grid: { originX: 0, originZ: 0, cellSize: 1.25 },
    crops: {},
    plots: [],
    storage: { containers: [], layout: { groundId: "ground" } },
    items: { instances: [{ id: "hoe", type: "hoe", groundId: "ground" }], carried: { itemId: "hoe" } }
  };
  const ground = {
    revision: 1,
    sample: (_: string, x: number, z: number) => ({ position: [x, 0, z] }),
    raycast: vi.fn(() => null)
  };
  const service = { getSnapshot: () => presentation.snapshot, inspectCultivation: () => ({ canCultivate: true }) };
  const presentation: any = Object.assign(Object.create(FarmingWorldPresentation.prototype), {
    surfaces: new Map(),
    camera,
    ground: { capture: () => ground },
    snapshot,
    service,
    playerTargetKey: "",
    playerTargetCheckedAt: -Infinity,
    playerTarget: null,
    workPoint: new Vector3(),
    workScreen: new Vector3(),
    workRay: new Ray(),
    viewRay: new Ray(),
    viewportCenter: new Vector2(0.5, 0.5),
    previousRay: new Float64Array(6).fill(NaN),
    targetGroundRevision: -1,
    refreshSelection() {},
    items: { hitHeld: () => false, worldBounds: () => null },
    endPlayerWork() {
      this.playerActionTarget = undefined;
    }
  });
  const nearBlocked = (ray: Ray) => Math.abs(ray.direction.z / ray.direction.y) < 1;
  const visibility = { hint: nearBlocked, strict: nearBlocked };
  const prepare = vi.fn(async (_: Ray, _root?: unknown) => true);
  const execute = vi.fn(async (..._args: unknown[]) => ({ receipt: { ok: true } })),
    result = vi.fn();
  const document = Object.assign(new EventTarget(), { defaultView: new EventTarget() });
  const canvas = {
    ownerDocument: document,
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
  };
  const interaction = new FarmingItemInteraction({
    canvas,
    camera,
    service,
    coordinator: { execute },
    presentation,
    ground: { capture: () => ground },
    definitions: {},
    isEnabled: () => true,
    isStorageContainerVisible: () => false,
    occluded: (r: Ray) => visibility.strict(r),
    hintOccluded: (r: Ray) => visibility.hint(r),
    prepareOcclusion: prepare,
    result
  } as any);
  const tap = () => {
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new Event(type);
      for (const [key, value] of Object.entries({
        target: canvas,
        pointerId: 1,
        clientX: 50,
        clientY: 30,
        button: 0,
        isPrimary: true
      }))
        Object.defineProperty(event, key, { value });
      document.dispatchEvent(event);
    }
  };
  return { presentation, interaction, visibility, prepare, execute, result, ground, camera, snapshot, tap };
}

it("probing a blocked better candidate does not replace the displayed visible target", () => {
  const f = fixture();
  try {
    const shown = f.presentation.getPlayerWorkTarget();
    expect(shown.ground.cellZ).toBe(0);
    expect(f.presentation.getPlayerWorkCandidate().ground.cellZ).toBe(1);
    expect(f.presentation.playerTarget).toBe(shown);
    expect(f.presentation.getPlayerWorkTarget()).toBe(shown);
  } finally {
    f.interaction.dispose();
  }
});

it("a native tap executes the displayed visible candidate when the better candidate is blocked", async () => {
  const f = fixture();
  try {
    const shown = f.presentation.getPlayerWorkTarget();
    f.tap();
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
    expect(f.execute.mock.calls[0][0]).toMatchObject({ target: shown.ground });
    expect(f.result).not.toHaveBeenCalled();
    expect(f.prepare).toHaveBeenCalledTimes(1);
  } finally {
    f.interaction.dispose();
  }
});

it("a first tap with unknown hints confirms bounded candidates until a visible one is found", async () => {
  const f = fixture();
  try {
    f.visibility.hint = () => true;
    expect(f.presentation.getPlayerWorkTarget()).toBeNull();
    f.tap();
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
    expect(f.execute.mock.calls[0][0]).toMatchObject({ target: { cellZ: 0 } });
    expect(f.prepare).toHaveBeenCalledTimes(2); // blocked near cell, clear far cell; no unrelated pointer read
  } finally {
    f.interaction.dispose();
  }
});

it("does not retarget an in-flight click when the displayed target changes during readback", async () => {
  const f = fixture();
  try {
    const shown = f.presentation.getPlayerWorkTarget();
    let finish!: (available: boolean) => void;
    f.prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    f.tap();
    f.visibility.hint = () => false;
    f.presentation.playerTargetCheckedAt = -Infinity;
    expect(f.presentation.getPlayerWorkTarget().ground.cellZ).toBe(1);
    finish(true);
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
    expect(f.execute.mock.calls[0][0]).toMatchObject({ target: shown.ground });
  } finally {
    f.interaction.dispose();
  }
});

it("rejects a newly blocked selected target instead of operating another clear candidate", async () => {
  const f = fixture();
  try {
    f.presentation.getPlayerWorkTarget();
    f.visibility.strict = (ray) => !f.visibility.hint(ray);
    f.tap();
    await vi.waitFor(() => expect(f.result).toHaveBeenCalled());
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.prepare).toHaveBeenCalledTimes(1);
  } finally {
    f.interaction.dispose();
  }
});

it.each(["seed-bag", "harvest-basket"])("uses the new hint endpoint and crop root after switching to %s", (type) => {
  const f = fixture();
  try {
    const p = f.presentation,
      old = p.getPlayerWorkTarget();
    const target = { groundId: "ground", cellX: 0, cellZ: -3 };
    const point = new Vector3(0.625, 0, -3.125),
      crop = {};
    p.surfaces.set("ground/x0z-3", { cropAnchor: crop });
    p.snapshot = {
      ...f.snapshot,
      revision: 2,
      plots: [{ ...target, plotId: "ground/x0z-3", ground: { availability: "available" } }],
      items: { instances: [{ id: "next", type, groundId: "ground" }], carried: { itemId: "next" } }
    };
    f.ground.raycast.mockReturnValue({ groundId: "ground", position: [0.625, 0, -3.125] } as any);
    p.updateViewTarget();
    expect(p.target.ground).toEqual(target);
    const query = vi.fn((ray: Ray, distance: number) => ray.getPoint(distance, new Vector3()).z < 0);
    p.setPlayerOcclusionQuery(undefined, query);
    expect(p.hintOccluded(point)).toBe(true);
    expect(query.mock.lastCall![0].getPoint(query.mock.lastCall![1], new Vector3()).z).toBeCloseTo(point.z);
    expect((query.mock.lastCall as any)[3]).toBe(crop);
    // Return to the physical tool: normal selection must recover, not stay pinned remotely.
    p.snapshot = f.snapshot;
    p.setPlayerOcclusionQuery(undefined, () => false);
    expect(p.getPlayerWorkTarget()?.ground.cellZ).toBe(1);
    expect(old.ground.cellZ).toBe(0);
  } finally {
    f.interaction.dispose();
  }
});

it("an explicitly locked target owns its hint even while holding a physical tool", () => {
  const f = fixture();
  try {
    f.presentation.getPlayerWorkTarget();
    const target = { groundId: "ground", cellX: 0, cellZ: -3 };
    f.presentation.setTarget({ plotId: "ground/x0z-3", ground: target }, { lock: true });
    const query = vi.fn((ray: Ray, distance: number) => ray.getPoint(distance, new Vector3()).z < 0);
    f.presentation.setPlayerOcclusionQuery(undefined, query);
    expect(f.presentation.hintOccluded(new Vector3(0.625, 0, -3.125))).toBe(true);
  } finally {
    f.interaction.dispose();
  }
});

it.each(["tool", "camera", "disposed", "unavailable"])(
  "invalidates the captured work target during its own readback: %s",
  async (change) => {
    const f = fixture();
    try {
      f.presentation.getPlayerWorkTarget();
      let finish!: (available: boolean) => void;
      f.prepare.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      f.tap();
      await vi.waitFor(() => expect(f.prepare).toHaveBeenCalledTimes(1));
      if (change === "tool")
        f.presentation.snapshot = { ...f.snapshot, revision: 2, items: { instances: [], carried: null } };
      if (change === "camera") f.camera.viewMatrix.elements[12] = 1;
      if (change === "disposed") f.interaction.dispose();
      finish(change !== "unavailable");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.prepare).toHaveBeenCalledTimes(1);
    } finally {
      f.interaction.dispose();
    }
  }
);

it("a carried-item publication clears the previous physical-tool selection", () => {
  const f = fixture();
  try {
    const p = f.presentation;
    expect(p.getPlayerWorkTarget()).not.toBeNull();
    Object.assign(p, { boundaryPreview: { refresh() {} }, soils: { setField() {} }, plants: { sync() {} } });
    const next = {
      ...f.snapshot,
      revision: 2,
      items: {
        instances: [{ id: "seed", type: "seed-bag", groundId: "ground" }],
        carried: { itemId: "seed" }
      }
    };
    p.sync(next, [{ kind: "carry-changed" }]);
    expect(p.snapshot).toBe(next);
    expect(p.playerTarget).toBeNull();
    expect(p.getPlayerWorkCandidate()).toBeNull();
  } finally {
    f.interaction.dispose();
  }
});

import { SeedWorldVisualQuery as PlanningVisualOcclusion } from "@galacean/engine-world-planning/world/SeedWorldVisualQuery";
it("probes all reachable hint candidates instead of indefinitely refreshing two blocked ones", async () => {
  const f = fixture();
  f.camera.entity.transform.worldPosition.set(1.25, 1.8, 2.8);
  (f.camera as any).engine = { on() {}, off() {} };
  const p = f.presentation;
  const candidates = p.getPlayerWorkCandidates();
  expect(candidates).toHaveLength(4);
  const endpoints: number[][] = [];
  const blocked = candidates.slice(0, 2);
  const picker = {
    waitForFrame: async () => {},
    dispose() {},
    depthAlongRay: async (_visit: unknown, ray: Ray) => {
      const end = ray.getPoint(-ray.origin.y / ray.direction.y, new Vector3());
      endpoints.push([end.x, end.z]);
      return blocked.some((c) => Math.hypot(c.position[0] - end.x, c.position[2] - end.z) < 0.001) ? 0.5 : Infinity;
    }
  };
  const query = new PlanningVisualOcclusion(
    f.camera as any,
    () => f.ground,
    () => 1,
    () => {},
    picker as any
  );
  let now = 1000;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  p.setPlayerOcclusionQuery(
    (r, d) => query.occluded(r, d),
    (r, d, k) => query.hintOccluded(r, d, k)
  );
  try {
    for (let i = 0; i < 50; i++) {
      p.getPlayerWorkTarget();
      for (let j = 0; j < 10; j++) await Promise.resolve();
      now += 110;
    }
    expect(
      endpoints.some(([x, z]) =>
        candidates.slice(2).some((c) => Math.hypot(c.position[0] - x, c.position[2] - z) < 0.001)
      )
    ).toBe(true);
    expect(p.getPlayerWorkTarget()).not.toBeNull();
  } finally {
    clock.mockRestore();
    query.dispose();
    f.interaction.dispose();
  }
});

it("rejects non-cultivable work candidates without submitting hint queries", () => {
  const f = fixture();
  try {
    const hint = vi.fn(() => true);
    f.presentation.service.inspectCultivation = () => ({ canCultivate: false });
    f.presentation.setPlayerOcclusionQuery(undefined, hint);
    expect(f.presentation.getPlayerWorkTarget()).toBeNull();
    expect(f.presentation.getPlayerWorkCandidates()).toEqual([]);
    expect(hint).not.toHaveBeenCalled();
  } finally {
    f.interaction.dispose();
  }
});

it("prepares cold work candidates together while preserving score order", async () => {
  const f = fixture();
  try {
    const bulk = vi.fn(async () => true);
    (f.interaction as any).options.prepareOcclusions = bulk;
    f.visibility.hint = () => true;
    f.tap();
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
    expect(bulk).toHaveBeenCalledOnce();
    expect(bulk.mock.calls[0][0]).toHaveLength(2);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute.mock.calls[0][0]).toMatchObject({ target: { cellZ: 0 } });
  } finally {
    f.interaction.dispose();
  }
});

it("shares the default visual policy for empty crop anchors only", () => {
  const f = fixture(),
    target = { groundId: "ground", cellX: 0, cellZ: 0 },
    anchor = { childCount: 0 };
  try {
    f.presentation.surfaces.set("ground/x0z0", { cropAnchor: anchor });
    expect(f.presentation.getGroundOcclusionRoot(target)).toBeUndefined();
    anchor.childCount = 1;
    expect(f.presentation.getGroundOcclusionRoot(target)).toBe(anchor);
  } finally {
    f.interaction.dispose();
  }
});
