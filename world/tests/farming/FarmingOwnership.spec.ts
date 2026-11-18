import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebGLEngine } from "@galacean/engine";
import { FarmingAreaComponent } from "@galacean/engine-farming/farming/native";
import { HeadlessEngine } from "../../../packages/rhi-null/src";
import { NativePreviewHost } from "../../demos/farming/native-preview/NativePreviewHost";
import {
  checkPresentationOwnership,
  checkSeedSackOwnership,
  checkStandaloneResourceOwnership
} from "./FarmingOwnershipAcceptance";

beforeEach(() => {
  const canvas = { ownerDocument: new EventTarget() };
  vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => canvas }));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

it("releases only farm-owned label variants on a real engine", () => checkSeedSackOwnership(HeadlessEngine.create));
it("releases sowing and cargo ownership through the real frame queue", () =>
  checkPresentationOwnership(HeadlessEngine.create));
it("releases standalone JSON assets for restore, failure and pending startup", () =>
  checkStandaloneResourceOwnership(HeadlessEngine.create));
it("does not adopt or destroy borrowed JSON in a restore interrupted by disposal", async () => {
  const engine = await HeadlessEngine.create();
  const host = new NativePreviewHost(engine);
  const entered = Promise.withResolvers<FarmingAreaComponent>();
  const resume = Promise.withResolvers<void>();
  try {
    await host.initialize();
    const checkpoint = await host.sceneFile();
    const previous = host.scene;
    const ready = vi.spyOn(FarmingAreaComponent.prototype, "ready", "get").mockImplementation(function (
      this: FarmingAreaComponent
    ) {
      entered.resolve(this);
      return resume.promise;
    });
    try {
      const restoring = host.restore(checkpoint);
      const rejected = expect(restoring).rejects.toMatchObject({ name: "AbortError" });
      const area = await entered.promise;
      const candidate = area.entity.scene!;
      const { catalog, rules } = area.configuration!;
      await expect(host.restore(checkpoint)).rejects.toThrow("already in progress");
      const closing = host.dispose();
      expect(host.dispose()).toBe(closing);
      resume.resolve();
      await rejected;
      await closing;
      expect(host.scene).toBe(previous);
      expect(candidate.destroyed).toBe(true);
      expect(catalog.destroyed || rules.destroyed).toBe(false);
    } finally {
      resume.resolve();
      ready.mockRestore();
    }
  } finally {
    await host.dispose();
    engine.destroy();
  }
});

it.each(["native preview", "first-person farm"])("cleans up the actual %s entry on startup failure", async (demo) => {
  const engine = await HeadlessEngine.create();
  const onPage = Object.assign(new EventTarget(), {
    location: new URL("https://farm.test/"),
    innerWidth: 320,
    innerHeight: 240
  });
  const errorTarget = { textContent: "", removeAttribute: () => {} };
  vi.stubGlobal("window", onPage);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => errorTarget }));
  const failure = new Error("Test area startup failure");
  const create = vi.spyOn(WebGLEngine, "create").mockResolvedValue(engine as unknown as WebGLEngine);
  const configure = vi.spyOn(FarmingAreaComponent.prototype, "configure").mockRejectedValue(failure);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    if (demo === "native preview") await import("../../demos/farming/native-preview/main");
    else await import("../../demos/farming/first-person-farm/main");
    await vi.waitFor(() => expect(engine.destroyed).toBe(true));
    expect(configure).toHaveBeenCalledOnce();
    const { catalog, rules } = configure.mock.calls[0][0];
    expect(catalog.destroyed && rules.destroyed).toBe(true);
    expect(errorTarget.textContent).toContain(failure.message);
    expect(report).toHaveBeenCalledWith(failure);
  } finally {
    onPage.dispatchEvent(new Event("pagehide"));
    create.mockRestore();
    configure.mockRestore();
    report.mockRestore();
    if (!engine.destroyed) engine.destroy();
  }
});
