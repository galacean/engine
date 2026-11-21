import { PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { expect, it } from "vitest";

it.each([
  ["standard", PhysXRuntimeMode.WebAssembly],
  ["SIMD", PhysXRuntimeMode.WebAssemblySIMD]
] as const)("loads %s PhysX in a module Worker and steps a scene", async (_, mode) => {
  const worker = new Worker(new URL("./fixtures/physxModuleWorker.ts", import.meta.url), { type: "module" });
  try {
    const result = await new Promise<{ before: boolean; after: boolean; y: number }>((resolve, reject) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.onerror = ({ message }) => reject(new Error(message));
      worker.postMessage(mode);
    });
    expect(result).toMatchObject({ before: true, after: false });
    expect(result.y).toBeLessThan(5);
  } finally {
    worker.terminate();
  }
});
