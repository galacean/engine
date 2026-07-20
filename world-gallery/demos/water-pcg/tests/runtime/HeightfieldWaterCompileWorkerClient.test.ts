import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import {
  collectHeightfieldWaterTransferables,
  createHeightfieldWaterCompiledTransfer
} from "../../compiler/heightfield/HeightfieldWaterCompileWorker";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import {
  HeightfieldWaterCompileWorkerClient,
  reviveHeightfieldWaterCompiledData
} from "../../runtime/heightfield/HeightfieldWaterCompileWorkerClient";

class FakeWorker {
  throwOnPost = false;
  terminated = false;

  postMessage(): void {
    if (this.throwOnPost) throw new DOMException("Uncloneable source", "DataCloneError");
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  terminate(): void {
    this.terminated = true;
  }
}

describe("HeightfieldWaterCompileWorkerClient", () => {
  it("transfers every large numeric buffer and revives compiler semantics", () => {
    const compiled = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture(WaterQualityTier.Low).descriptor
    ).data!;
    const transferred = createHeightfieldWaterCompiledTransfer(compiled);
    const transferables = collectHeightfieldWaterTransferables(transferred);
    const revived = reviveHeightfieldWaterCompiledData(transferred);

    expect(new Set(transferables).size).toBe(transferables.length);
    expect(transferables).toContain(transferred.localMapAtlas.pixels.buffer);
    expect(transferables).toContain(transferred.waveSet.packedShaderData.buffer);
    expect(revived.sourceHash).toBe(compiled.sourceHash);
    expect(revived.stats).toEqual(compiled.stats);
    expect(revived.chunks[0].geometry.positions.toTypedArray()).toEqual(
      compiled.chunks[0].geometry.positions.toTypedArray()
    );
    expect(revived.queryGrid.componentIndices.toTypedArray()).toEqual(
      compiled.queryGrid.componentIndices.toTypedArray()
    );
  });

  it("rejects structured-clone failures without leaving a pending request", async () => {
    const worker = new FakeWorker();
    worker.throwOnPost = true;
    const client = new HeightfieldWaterCompileWorkerClient(worker as unknown as Worker);

    await expect(client.compile({ callback: () => undefined })).rejects.toThrow(/Uncloneable source/);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects pending and subsequent requests after disposal", async () => {
    const worker = new FakeWorker();
    const client = new HeightfieldWaterCompileWorkerClient(worker as unknown as Worker);
    const pending = client.compile({ id: "pending" });

    client.dispose();

    await expect(pending).rejects.toThrow(/disposed before compilation completed/);
    await expect(client.compile({ id: "late" })).rejects.toThrow(/has been disposed/);
  });
});
