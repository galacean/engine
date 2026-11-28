import { expect, it, vi } from "vitest";
import { Matrix, Ray, Vector3 } from "@galacean/engine-math";
vi.mock("@galacean/engine-world-planning/world/SeedWorldPicker", () => ({ SeedWorldPicker: class {} }));
import { SeedWorldVisualQuery as PlanningVisualOcclusion } from "@galacean/engine-world-planning/world/SeedWorldVisualQuery";

function fixture() {
  let world = {},
    revision = 1;
  const listeners = new Map<string, () => void>();
  const camera = {
    entity: { transform: { worldPosition: new Vector3() } },
    viewMatrix: new Matrix(),
    projectionMatrix: new Matrix(),
    engine: {
      on: (name: string, fn: () => void) => listeners.set(name, fn),
      off: (name: string) => listeners.delete(name)
    }
  };
  const picker = {
    waitForFrame: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
    depthAlongRay: vi.fn(async () => 5),
    depthAlongRays: vi.fn(async (_visit: unknown, requests: any[]) => requests.map(() => 5)),
    dispose: vi.fn()
  };
  const query = new PlanningVisualOcclusion(
    camera as any,
    () => world,
    () => revision,
    () => {},
    picker as any
  );
  return {
    query,
    picker,
    camera,
    listeners,
    move: () => revision++,
    publish: () => {
      world = {};
    }
  };
}
const ray = () => new Ray(new Vector3(), new Vector3(0, 0, -1));

it("shares one asynchronous depth read for targets on a ray and blocks only targets behind the building", async () => {
  const f = fixture(),
    r = ray();
  expect(f.query.occluded(r, 10)).toBe(true);
  expect(f.query.occluded(r, 3)).toBe(true);
  await f.query.prepare(r);
  expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(1);
  expect(f.query.occluded(r, 3)).toBe(false);
  expect(f.query.occluded(r, 10)).toBe(true);
  f.query.dispose();
});

it.each(["building", "camera", "publication", "device"])(
  "discards an in-flight result after %s changes",
  async (change) => {
    const f = fixture(),
      r = ray();
    let finish!: (distance: number) => void;
    f.picker.depthAlongRay.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = f.query.prepare(r);
    await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalled());
    if (change === "building") f.move();
    if (change === "camera") f.camera.viewMatrix.elements[12] = 1;
    if (change === "publication") f.publish();
    if (change === "device") f.listeners.get("devicelost")!();
    finish(Infinity);
    expect(await pending).toBe(false);
    f.query.dispose();
    expect(f.query.occluded(r, 10)).toBe(true);
  }
);

it("fails closed on readback errors and cancellation and releases the picker", async () => {
  const f = fixture();
  f.picker.depthAlongRay.mockRejectedValue(new Error("context lost"));
  expect(await f.query.prepare(ray())).toBe(false);
  f.query.dispose();
  expect(await f.query.prepare(ray())).toBe(false);
  expect(f.picker.dispose).toHaveBeenCalledTimes(1);
  expect(f.listeners.size).toBe(0);
});

it("retains independent work-target and pointer rays without issuing duplicate readbacks", async () => {
  const f = fixture(),
    pointer = ray(),
    work = ray();
  work.direction.set(0, -1, -1).normalize();
  await f.query.prepare(pointer);
  f.picker.depthAlongRay.mockResolvedValue(Infinity);
  await f.query.prepare(work);
  expect(f.query.occluded(pointer, 10)).toBe(true);
  expect(f.query.occluded(work, 10)).toBe(false);
  await f.query.prepare(pointer);
  expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(2);
  f.query.dispose();
});

it("keeps a confirmed same-target hint through camera motion while actions still require the exact pose", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(),
      r = ray();
    f.picker.depthAlongRay.mockResolvedValue(Infinity);
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(false);
    f.camera.viewMatrix.elements[12] = 0.01;
    r.origin.x = 0.01;
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(false);
    expect(f.query.occluded(r, 3)).toBe(true);
    r.origin.x = 0.5;
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(false);
    r.origin.x = 0.8;
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(true);
    r.origin.x = 0.01;
    expect(f.query.hintOccluded(r, 3, "other cell")).toBe(true);
    await vi.advanceTimersByTimeAsync(510);
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(true);
    f.query.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it("bounds aggregate hint submissions, accepts moving readbacks, and invalidates on publication", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(),
      r = ray();
    let finish!: (n: number) => void;
    f.picker.depthAlongRay.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    f.query.hintOccluded(r, 3, "cell");
    await vi.advanceTimersByTimeAsync(1);
    f.camera.viewMatrix.elements[12] = 0.01;
    finish(Infinity);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(false);
    for (let i = 0; i < 90; i++) {
      f.query.hintOccluded(r, 3, "cell");
      f.query.hintOccluded(r, 3, "another");
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(1);
    f.publish();
    expect(f.query.hintOccluded(r, 3, "cell")).toBe(true);
    f.query.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it("the real work selector retains a reachable candidate during pending GPU work without authorizing an action", async () => {
  const { FarmingWorldPresentation } = await import(
    "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation"
  );
  const f = fixture();
  f.picker.depthAlongRay.mockResolvedValue(Infinity);
  f.camera.entity.transform.worldPosition.set(0.5, 1.8, 2.1);
  const camera = Object.assign(f.camera, {
    aspectRatio: 1,
    fieldOfView: 60,
    worldToViewportPoint: (_: Vector3, out: Vector3) => out.set(0.5, 0.5, 1)
  });
  Object.assign(camera.entity.transform, { worldForward: new Vector3(0, -0.7, -0.7) });
  const ground = { revision: 1, sample: (_: string, x: number, z: number) => ({ position: [x, 0, z] }) };
  const presentation = Object.assign(Object.create(FarmingWorldPresentation.prototype), {
    surfaces: new Map(),
    camera,
    ground: { capture: () => ground },
    playerTargetKey: "",
    playerTargetCheckedAt: -Infinity,
    workPoint: new Vector3(),
    workScreen: new Vector3(),
    workRay: ray(),
    snapshot: {
      revision: 1,
      grid: { originX: 0, originZ: 0, cellSize: 1 },
      plots: [],
      items: { instances: [{ id: "hoe", type: "hoe", groundId: "ground" }], carried: { itemId: "hoe" } }
    },
    service: { inspectCultivation: () => ({ canCultivate: true }) },
    refreshSelection() {}
  });
  presentation.setPlayerOcclusionQuery(
    (r: Ray, d: number) => f.query.occluded(r, d),
    (r: Ray, d: number, key: string) => f.query.hintOccluded(r, d, key)
  );
  const candidate = presentation.getPlayerWorkCandidate();
  expect(candidate).not.toBeNull();
  expect(presentation.getPlayerWorkTarget()).toBeNull();
  expect(presentation.beginPlayerWork(candidate)).toBe(false);
  await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 5));
  camera.entity.transform.worldPosition.x += 0.01;
  camera.viewMatrix.elements[12] += 0.01;
  presentation.playerTargetCheckedAt = -Infinity;
  expect(presentation.getPlayerWorkTarget()?.ground).toEqual(candidate.ground);
  expect(presentation.beginPlayerWork(candidate)).toBe(false);
  const r = new Ray(camera.entity.transform.worldPosition.clone(), new Vector3(...candidate.position));
  r.direction.subtract(r.origin).normalize();
  await f.query.prepare(r);
  expect(presentation.beginPlayerWork(candidate)).toBe(true);
  f.picker.depthAlongRay.mockResolvedValue(1);
  await f.query.prepare(r, undefined, true);
  expect(presentation.playerTargetReachable(candidate, false, r.origin)).toBe(false);
  f.query.dispose();
});

it("does not share a target-excluded depth result with another crop or a world query", async () => {
  const f = fixture(),
    r = ray(),
    own = { instanceId: 12 } as any,
    other = { instanceId: 13 } as any;
  f.picker.depthAlongRay.mockResolvedValue(Infinity);
  await f.query.prepare(r, own);
  expect(f.query.occluded(r, 3, own)).toBe(false);
  expect(f.query.occluded(r, 3, other)).toBe(true);
  expect(f.query.occluded(r, 3)).toBe(true);
  f.query.dispose();
});

it("requires a completed post-animation visibility sample before commit", async () => {
  const { FarmingWorldPresentation } = await import(
    "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation"
  );
  const finish = vi.fn(async () => true),
    confirm = vi.fn(async () => false);
  const presentation = Object.assign(Object.create(FarmingWorldPresentation.prototype), {
    active: true,
    disposed: false,
    camera: { entity: { transform: { worldPosition: new Vector3(0, 2, 2) } } },
    surfaces: new Map(),
    prepareActionAnimation: finish,
    preparePlayerOcclusion: confirm,
    playerActionTarget: { position: [0, 0, 0], ground: { groundId: "g", cellX: 0, cellZ: 0 } }
  });
  expect(await presentation.prepareAction({ type: "hoe" }, new AbortController().signal)).toBe(false);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledTimes(1);
  confirm.mockResolvedValue(true);
  expect(await presentation.prepareAction({ type: "hoe" }, new AbortController().signal)).toBe(true);
});

it("forces a fresh action sample even when a clear hint is cached", async () => {
  const f = fixture(),
    r = ray();
  f.picker.depthAlongRay.mockResolvedValue(Infinity);
  await f.query.prepare(r);
  f.picker.depthAlongRay.mockResolvedValue(1);
  await f.query.prepare(r, undefined, true);
  expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(2);
  expect(f.query.occluded(r, 3)).toBe(true);
  f.query.dispose();
});

it("distinguishes actual obstruction from missing and expired action evidence", async () => {
  const f = fixture(),
    r = ray();
  let now = 1000;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  f.picker.waitForFrame.mockResolvedValue(undefined);
  try {
    expect(f.query.occlusionState(r, 3)).toBe("unavailable");
    await f.query.prepare(r);
    expect(f.query.occlusionState(r, 3)).toBe("clear");
    expect(f.query.occlusionState(r, 10)).toBe("blocked");
    now += 149;
    expect(f.query.occlusionState(r, 3)).toBe("clear");
    now++;
    expect(f.query.occlusionState(r, 3)).toBe("unavailable");
    expect(f.query.occluded(r, 3)).toBe(true);
  } finally {
    f.query.dispose();
    clock.mockRestore();
  }
});

it("does not renew evidence lifetime when a delayed readback completes", async () => {
  const f = fixture(),
    r = ray();
  let now = 1000;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  f.picker.waitForFrame.mockResolvedValue(undefined);
  f.picker.depthAlongRay.mockImplementation(async () => {
    now += 151;
    return Infinity;
  });
  try {
    expect(await f.query.prepare(r)).toBe(true);
    expect(f.query.occlusionState(r, 3)).toBe("unavailable");
    expect(f.query.occluded(r, 3)).toBe(true);
  } finally {
    f.query.dispose();
    clock.mockRestore();
  }
});

it("deduplicates a batch and shares its pending render with a concurrent forced query", async () => {
  const f = fixture(),
    a = ray(),
    b = ray();
  b.direction.set(0.1, 0, -1).normalize();
  try {
    const batch = f.query.prepareMany([{ ray: a }, { ray: b }, { ray: a }], true);
    const same = f.query.prepare(a, undefined, true);
    expect(await batch).toBe(true);
    expect(await same).toBe(true);
    expect(f.picker.waitForFrame).toHaveBeenCalledTimes(1);
    expect(f.picker.depthAlongRays).toHaveBeenCalledTimes(1);
    expect(f.picker.depthAlongRays.mock.calls[0][1]).toHaveLength(2);
    expect(f.picker.depthAlongRay).not.toHaveBeenCalled();
    expect(f.query.occlusionState(a, 3)).toBe("clear");
    expect(f.query.occlusionState(b, 7)).toBe("blocked");
  } finally {
    f.query.dispose();
  }
});

it("returns false and releases pending ownership if the frame boundary is cancelled", async () => {
  const f = fixture();
  try {
    f.picker.waitForFrame.mockRejectedValueOnce(new Error("cancelled"));
    expect(await f.query.prepare(ray(), undefined, true)).toBe(false);
    expect(f.picker.depthAlongRay).not.toHaveBeenCalled();
    f.picker.waitForFrame.mockResolvedValue(undefined);
    expect(await f.query.prepare(ray(), undefined, true)).toBe(true);
  } finally {
    f.query.dispose();
  }
});

it("does not reuse a prior-frame pending action sample for a forced click", async () => {
  const f = fixture(),
    r = ray();
  const time = ((f.camera.engine as any).time = { frameCount: 1 });
  let finish!: (distance: number) => void;
  f.picker.depthAlongRay.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  try {
    const previous = f.query.prepare(r, undefined, true);
    await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalledOnce());
    time.frameCount++;
    const clicked = f.query.prepare(r, undefined, true);
    finish(Infinity);
    await previous;
    expect(await clicked).toBe(true);
    expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(2);
  } finally {
    f.query.dispose();
  }
});

it.each(["camera", "readback", "publication"])(
  "samples a new stable click after an unrelated hint loses validity through %s",
  async (change) => {
    const f = fixture(),
      action = new Ray(new Vector3(), new Vector3(0.2, 0, -1).normalize());
    let finish!: (distance: number) => void, fail!: (error: Error) => void;
    f.picker.depthAlongRay.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        })
    );
    try {
      f.query.hintOccluded(ray(), 3, "old hint");
      await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalledOnce());
      // The new click owns the current world/pose; only the older hint is stale.
      if (change === "camera") f.camera.viewMatrix.elements[12] = 0.1;
      if (change === "publication") f.publish();
      const clicked = f.query.prepareVisible([{ ray: action, distance: 3 }]);
      if (change === "readback") fail(new Error("old hint readback failed"));
      else finish(Infinity);
      expect(await clicked).toBe(true);
      expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(2);
      expect(f.query.occlusionState(action, 3)).toBe("clear");
    } finally {
      f.query.dispose();
    }
  }
);

it.each(["camera", "publication", "device", "disposed"])(
  "does not resample a click invalidated by %s while waiting behind a hint",
  async (change) => {
    const f = fixture(),
      action = new Ray(new Vector3(), new Vector3(0.2, 0, -1).normalize());
    let finish!: (distance: number) => void;
    f.picker.depthAlongRay.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    try {
      f.query.hintOccluded(ray(), 3, "old hint");
      await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalledOnce());
      const clicked = f.query.prepareVisible([{ ray: action, distance: 3 }]);
      if (change === "camera") f.camera.viewMatrix.elements[12] = 0.1;
      if (change === "publication") f.publish();
      if (change === "device") f.listeners.get("devicelost")!();
      if (change === "disposed") f.query.dispose();
      finish(Infinity);
      expect(await clicked).toBe(false);
      expect(f.picker.depthAlongRay).toHaveBeenCalledOnce();
      expect(f.query.occlusionState(action, 3)).toBe("unavailable");
    } finally {
      f.query.dispose();
    }
  }
);

it("does not retry a failed shared action readback", async () => {
  const f = fixture(),
    r = ray();
  let fail!: (error: Error) => void;
  f.picker.depthAlongRay.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })
  );
  try {
    const first = f.query.prepare(r, undefined, true);
    await vi.waitFor(() => expect(f.picker.depthAlongRay).toHaveBeenCalledOnce());
    const shared = f.query.prepare(r, undefined, true);
    fail(new Error("shared readback failed"));
    expect(await first).toBe(false);
    expect(await shared).toBe(false);
    expect(f.picker.depthAlongRay).toHaveBeenCalledOnce();
  } finally {
    f.query.dispose();
  }
});

it("invalidates cached depth when the camera rendering mask changes", async () => {
  const f = fixture(),
    r = ray();
  try {
    (f.camera as any).cullingMask = 1;
    await f.query.prepare(r);
    expect(f.query.occlusionState(r, 3)).toBe("clear");
    (f.camera as any).cullingMask = 2;
    expect(f.query.occlusionState(r, 3)).toBe("unavailable");
  } finally {
    f.query.dispose();
  }
});

it("does not reuse old evidence for a candidate skipped by an early-stop batch", async () => {
  const f = fixture(),
    a = ray(),
    b = ray();
  b.direction.set(0.1, 0, -1).normalize();
  let finish!: (depths: number[]) => void;
  try {
    await f.query.prepare(b);
    f.picker.depthAlongRays.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const batch = f.query.prepareVisible([
      { ray: a, distance: 3 },
      { ray: b, distance: 3 }
    ]);
    await vi.waitFor(() => expect(f.picker.depthAlongRays).toHaveBeenCalledOnce());
    const otherConsumer = f.query.prepare(b, undefined, true);
    finish([Infinity]); // Candidate B has not been rendered by this batch.
    expect(await batch).toBe(true);
    expect(await otherConsumer).toBe(true);
    expect(f.picker.depthAlongRay).toHaveBeenCalledTimes(2);
  } finally {
    f.query.dispose();
  }
});
