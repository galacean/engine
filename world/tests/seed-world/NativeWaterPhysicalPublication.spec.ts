import { expect, it, vi } from "vitest";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { NativeWaterHost } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterHost";

function fixture(lateProjection = false) {
  let activation: any;
  const body = {
    waterId: "lake",
    destroyed: false,
    enabled: true,
    configuration: {
      asset: { contentHash: "geometry" },
      quality: { contentHash: "quality" },
      interaction: { query: true }
    },
    entity: { isActiveInHierarchy: true, transform: { worldMatrix: { elements: [1, 0, 0, 1] } } }
  };
  let projected = false;
  if (lateProjection) {
    Object.setPrototypeOf(body, WaterBodyComponent.prototype);
    Object.defineProperty(body, "_readAuthoring", { value: () => ({}) });
  }
  const system = {
    bodies: [body],
    runtimeState: { effectiveEnabled: true },
    observeRuntimeState: () => () => {},
    beginInputUpdate: vi.fn(),
    endInputUpdate: vi.fn(),
    requestAuthoringUpdate: vi.fn(async () => {}),
    flushAuthoring: vi.fn(async () => {})
  };
  const notify = vi.fn();
  const host = new NativeWaterHost(
    {
      registerRuntimeActivation: (value: any) => {
        activation = value;
        return () => {};
      }
    } as any,
    {
      projection: {
        queryComponents: () => (projected && lateProjection ? [{ scene: "Scene", id: "body" }] : []),
        component: () => body
      },
      registerPreparation: () => () => {}
    } as any,
    system as any,
    { physicalPublication: notify }
  );
  projected = true;
  const edit = async (change = () => {}) => {
    await activation.before();
    change();
    await activation.apply();
    activation.finish();
    await activation.after();
  };
  return { body, system, notify, host, edit };
}

it("uses already-published startup water as the first edit baseline", async () => {
  const f = fixture();
  // Startup can finish after the host is constructed, before any editor activation.
  f.body.configuration.asset.contentHash = "published-at-startup";
  await f.edit();
  await f.edit();
  expect(f.notify).not.toHaveBeenCalled();
  expect(f.system.flushAuthoring).toHaveBeenCalledTimes(2);
  f.host.dispose();
});

it.each(["geometry", "quality", "query", "enabled", "transform", "removal"])(
  "still publishes the first real %s edit exactly once",
  async (kind) => {
    const f = fixture();
    await f.edit(() => {
      if (kind === "geometry") f.body.configuration.asset.contentHash = "changed";
      if (kind === "quality") f.body.configuration.quality.contentHash = "changed";
      if (kind === "query") f.body.configuration.interaction.query = false;
      if (kind === "enabled") f.body.enabled = false;
      if (kind === "transform") f.body.entity.transform.worldMatrix.elements[0] = 2;
      if (kind === "removal") f.system.bodies.length = 0;
    });
    expect(f.notify).toHaveBeenCalledOnce();
    await f.edit();
    expect(f.notify).toHaveBeenCalledOnce();
    f.host.dispose();
  }
);

it("does not accept a failed first activation as the physical baseline", async () => {
  const f = fixture();
  f.system.flushAuthoring.mockRejectedValueOnce(Error("failed"));
  await expect(
    f.edit(() => {
      f.body.configuration.asset.contentHash = "new";
    })
  ).rejects.toThrow("failed");
  expect(f.notify).not.toHaveBeenCalled();
  await f.edit();
  expect(f.notify).toHaveBeenCalledOnce();
  f.host.dispose();
});

it("binds late startup Source identities before establishing the first physical baseline", async () => {
  const f = fixture(true);
  await f.edit();
  expect(f.body.waterId).not.toBe("lake");
  expect(f.notify).not.toHaveBeenCalled();
  await f.edit(() => {
    f.body.configuration.asset.contentHash = "edited";
  });
  expect(f.notify).toHaveBeenCalledOnce();
  f.host.dispose();
});

it("compares an edit with water published after the initial empty Scene activation", async () => {
  const f = fixture();
  f.system.bodies.length = 0;
  await f.edit();
  // The world publisher installs water and publishes farming against it outside
  // the editor transaction. A later time edit must not replay that publication.
  f.system.bodies.push(f.body);
  await f.edit();
  expect(f.notify).not.toHaveBeenCalled();
  await f.edit(() => {
    f.body.configuration.asset.contentHash = "actual-edit";
  });
  expect(f.notify).toHaveBeenCalledOnce();
  f.host.dispose();
});
