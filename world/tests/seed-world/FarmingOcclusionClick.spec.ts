import { expect, it, vi } from "vitest";
import { BoundingBox, Matrix, Ray, Vector3 } from "@galacean/engine-math";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";
import { SeedWorldVisualQuery } from "@galacean/engine-world-planning/world/SeedWorldVisualQuery";

// Exercise routing and command submission rather than a private routing stub.
function fixture() {
  let snapshot: any = {
    revision: 1,
    grid: { originX: 0, originZ: 0, cellSize: 1 },
    plots: [],
    items: { carried: null, instances: [{ id: "seed", type: "seed-bag", groundId: "g" }] },
    storage: { containers: [], layout: { groundId: "g" } }
  };
  let ground = { revision: 1, raycast: () => null };
  const document = Object.assign(new EventTarget(), { defaultView: new EventTarget() });
  const camera = {
    viewMatrix: new Matrix(),
    projectionMatrix: new Matrix(),
    farClipPlane: 100,
    entity: {
      transform: { worldPosition: new Vector3(), worldForward: new Vector3(0, 0, -1), worldRight: new Vector3(1, 0, 0) }
    },
    screenPointToRay: (_: unknown, ray: Ray) => {
      ray.origin.set(0, 0, 0);
      ray.direction.set(0, 0, -1);
    }
  };
  let finish!: (available: boolean) => void;
  const prepare = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  const executeItem = vi.fn(async (..._args: unknown[]) => ({ receipt: { ok: true } }));
  const setTarget = vi.fn();
  const cropRoot = { instanceId: 12 };
  const presentation = {
    items: { worldBounds: () => new BoundingBox(new Vector3(-0.2, -0.2, -2), new Vector3(0.2, 0.2, -1)) },
    getGroundOcclusionRoot: vi.fn(() => cropRoot),
    setTarget
  };
  const options: any = {
    canvas: { ownerDocument: document },
    camera,
    service: { getSnapshot: () => snapshot },
    coordinator: { executeItem },
    ground: { capture: () => ground },
    presentation,
    definitions: {},
    isEnabled: () => true,
    isStorageContainerVisible: () => false,
    prepareOcclusions: prepare,
    occlusionState: () => "clear"
  };
  const interaction = new FarmingItemInteraction(options);
  return {
    interaction,
    executeItem,
    prepare,
    options,
    presentation,
    camera,
    cropRoot,
    finish: (v: boolean) => finish(v),
    changeFarm: () => {
      snapshot = { ...snapshot, revision: 2 };
    },
    changeGround: () => {
      ground = { ...ground, revision: 2 };
    }
  };
}

it("waits for GPU visibility before submitting a pickup", async () => {
  const f = fixture();
  try {
    const pending = (f.interaction as any).prepareClick(10, 20);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.executeItem).not.toHaveBeenCalled();
    f.finish(true);
    await pending;
    expect(f.executeItem.mock.calls[0][0]).toMatchObject({ type: "pickup-item", itemId: "seed" });
  } finally {
    f.interaction.dispose();
  }
});

it.each([false, true])(
  "a click after a moving hint picks the item without changing the action (invalidate click: %s)",
  async (invalidateClick) => {
    const f = fixture();
    Object.assign(f.camera, { engine: { on() {}, off() {} } });
    let finish!: (distance: number) => void;
    const picker = {
      waitForFrame: vi.fn(async () => {}),
      depthAlongRay: vi.fn(async () => Infinity),
      dispose: vi.fn()
    };
    picker.depthAlongRay.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const query = new SeedWorldVisualQuery(
      f.camera as any,
      () => f.options.ground.capture(),
      () => 1,
      () => {},
      picker as any
    );
    f.options.prepareOcclusions = (requests: any) => query.prepareVisible(requests);
    f.options.occlusionState = (r: Ray, d: number) => query.occlusionState(r, d);
    try {
      query.hintOccluded(new Ray(new Vector3(), new Vector3(0.2, 0, -1).normalize()), 3, "old hint");
      await vi.waitFor(() => expect(picker.depthAlongRay).toHaveBeenCalledOnce());
      f.camera.viewMatrix.elements[12] = 0.1;
      const clicked = (f.interaction as any).prepareClick(10, 20);
      if (invalidateClick) f.changeFarm();
      finish(Infinity);
      await clicked;
      expect(picker.depthAlongRay).toHaveBeenCalledTimes(2);
      if (invalidateClick) expect(f.executeItem).not.toHaveBeenCalled();
      else {
        expect(f.executeItem).toHaveBeenCalledOnce();
        expect(f.executeItem.mock.calls[0][0]).toMatchObject({ type: "pickup-item", itemId: "seed" });
      }
    } finally {
      query.dispose();
      f.interaction.dispose();
    }
  }
);

it.each(["camera", "farm", "ground", "disposed", "unavailable", "expired", "disabled"])(
  "does not act on a stale %s result",
  async (change) => {
    const f = fixture();
    try {
      const pending = (f.interaction as any).prepareClick(10, 20);
      if (change === "camera") f.camera.viewMatrix.elements[12] = 1;
      if (change === "farm") f.changeFarm();
      if (change === "ground") f.changeGround();
      if (change === "disposed") f.interaction.dispose();
      if (change === "expired") f.options.occlusionState = () => "unavailable";
      if (change === "disabled") f.options.isEnabled = () => false;
      f.finish(change !== "unavailable");
      await pending;
      expect(f.executeItem).not.toHaveBeenCalled();
    } finally {
      f.interaction.dispose();
    }
  }
);

it("does not exclude the crop over an item, even when the pointer ground has a crop root", async () => {
  const f = fixture();
  try {
    const view = f.options.ground.capture();
    view.raycast = () => ({ groundId: "g", position: [0, 0, -3], distance: 3 });
    f.options.occlusionState = (_r: Ray, _d: number, ignored: unknown) => (ignored ? "clear" : "blocked");
    const pending = (f.interaction as any).prepareClick(10, 20);
    expect(f.prepare.mock.calls[0][0]).toEqual([expect.not.objectContaining({ ignoredRoot: f.cropRoot })]);
    f.finish(true);
    await pending;
    expect(f.executeItem).not.toHaveBeenCalled();
    expect(f.presentation.getGroundOcclusionRoot).not.toHaveBeenCalled();
  } finally {
    f.interaction.dispose();
  }
});

it("does not query the GPU for a click without an item or ground candidate", async () => {
  const f = fixture();
  try {
    f.options.presentation.items.worldBounds = () => null;
    await (f.interaction as any).prepareClick(10, 20);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.executeItem).not.toHaveBeenCalled();
  } finally {
    f.interaction.dispose();
  }
});

it("a rejected GPU request cannot submit an action", async () => {
  const f = fixture();
  try {
    f.prepare.mockRejectedValue(new Error("device lost"));
    await (f.interaction as any).prepareClick(10, 20);
    expect(f.executeItem).not.toHaveBeenCalled();
  } finally {
    f.interaction.dispose();
  }
});
