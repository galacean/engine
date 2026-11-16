import { expect, it, vi } from "vitest";
import { createRiver } from "@galacean/engine-water/water/authoring/river/createRiver";
import { RiverNetworkCompiler } from "@galacean/engine-water/water/compiler/river/RiverNetworkCompiler";
import { executeRiverCompileWorkerRequest } from "@galacean/engine-water/water/compiler/river/RiverCompileWorker";
import { RiverCompileWorkerMessageKind } from "@galacean/engine-water/water/compiler/river/RiverCompileWorkerProtocol";
import { RiverResource } from "@galacean/engine-water/water/runtime/river/RiverResource";
import { RiverCompileWorkerClient } from "@galacean/engine-water/water/runtime/river/RiverCompileWorkerClient";
import { createRiverCompiledTransfer } from "@galacean/engine-water/water/compiler/river/RiverResourceTransfer";
const source = () =>
  createRiver({
    id: "exact-worker",
    points: [
      { id: "a", position: [0, 2, 0] },
      { id: "b", position: [30, 1, 10] }
    ],
    width: 4
  });
it("keeps worker geometry, queries and persistent/physical identities identical to synchronous compilation", () => {
  const descriptor = source(),
    compiled = RiverNetworkCompiler.compile(descriptor);
  expect(compiled.valid).toBe(true);
  const direct = RiverResource.create(descriptor, compiled.data!, undefined, "0123456789abcdef");
  const { response, transferables } = executeRiverCompileWorkerRequest({
    kind: RiverCompileWorkerMessageKind.Compile,
    requestId: 1,
    source: descriptor
  });
  expect(response.kind).toBe(RiverCompileWorkerMessageKind.Success);
  if (response.kind !== RiverCompileWorkerMessageKind.Success) throw Error("compile failed");
  const transferred = structuredClone(response.resource, { transfer: transferables });
  const worker = RiverResource.fromWorkerTransfer(transferred, "0123456789abcdef");
  expect(worker.identity).toEqual(direct.identity);
  expect(createRiverCompiledTransfer(worker.data)).toEqual(createRiverCompiledTransfer(direct.data));
  expect(worker.spatialFieldIdentity).toEqual(direct.spatialFieldIdentity);
  worker.dispose();
  direct.dispose();
});
it("retains compiler rejection and diagnostics for invalid input", () => {
  const descriptor = source();
  descriptor.nodes[0].elevation = NaN;
  const direct = RiverNetworkCompiler.compile(descriptor);
  const { response, transferables } = executeRiverCompileWorkerRequest({
    kind: RiverCompileWorkerMessageKind.Compile,
    requestId: 2,
    source: descriptor
  });
  expect(direct.valid).toBe(false);
  expect(response).toEqual({
    kind: RiverCompileWorkerMessageKind.Failure,
    requestId: 2,
    diagnostics: direct.diagnostics
  });
  expect(transferables).toEqual([]);
});
it.each(["abort", "dispose"] as const)(
  "terminates outstanding compilation on %s without publishing a late result",
  async (action) => {
    const worker = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
      terminate: vi.fn()
    };
    const client = new RiverCompileWorkerClient(() => worker as any),
      controller = new AbortController();
    const pending = client.compile(source(), controller.signal, "0123456789abcdef");
    const rejection = expect(pending).rejects.toThrow();
    if (action === "abort") controller.abort();
    else client.dispose();
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.removeEventListener).toHaveBeenCalledTimes(2);
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  }
);
