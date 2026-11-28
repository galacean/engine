import { expect, it, vi } from "vitest";
import { WaterBodyLoader } from "@galacean/engine-water/water/runtime/body/WaterBodyLoader";

it.each(["compile-key", "source-hash"])("does not acquire resources after cancellation during %s", async (stage) => {
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((r) => {
    resolve = r;
  });
  const controller = new AbortController();
  const acquire = vi.fn();
  const loader = Object.assign(Object.create(WaterBodyLoader.prototype), { _compileCache: { acquire } });
  const backend = {
    id: "test",
    getCompileKey: () => (stage === "compile-key" ? pending : "key"),
    getSourceHash: () => (stage === "source-hash" ? pending : "source")
  };
  const result = loader._acquireCompiledResource({ sourceHash: "source" }, {}, backend, controller.signal, {});
  const rejection = expect(result).rejects.toThrow();
  await Promise.resolve();
  controller.abort();
  resolve("identity");
  await rejection;
  expect(acquire).not.toHaveBeenCalled();
});
it("rejects a late identity after the loader is destroyed", async () => {
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((r) => {
    resolve = r;
  });
  const acquire = vi.fn(),
    loader = Object.assign(Object.create(WaterBodyLoader.prototype), { _compileCache: { acquire } });
  const result = loader._acquireCompiledResource(
    { sourceHash: "source" },
    {},
    { id: "test", getCompileKey: () => pending },
    undefined,
    {}
  );
  const rejection = expect(result).rejects.toThrow("destroyed");
  loader._destroyed = true;
  resolve("key");
  await rejection;
  expect(acquire).not.toHaveBeenCalled();
});
