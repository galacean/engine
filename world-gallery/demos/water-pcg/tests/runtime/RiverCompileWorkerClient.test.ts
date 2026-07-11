import { describe, expect, it } from "vitest";
import { RiverCompileWorkerClient } from "../../runtime/river/RiverCompileWorkerClient";

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

describe("RiverCompileWorkerClient", () => {
  it("rejects structured-clone failures without leaving the request pending", async () => {
    const worker = new FakeWorker();
    worker.throwOnPost = true;
    const client = new RiverCompileWorkerClient(worker as unknown as Worker);

    await expect(client.compile({ callback: () => undefined })).rejects.toThrow(/Uncloneable source/);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects pending requests when the client is disposed", async () => {
    const worker = new FakeWorker();
    const client = new RiverCompileWorkerClient(worker as unknown as Worker);
    const pending = client.compile({ id: "pending" });

    client.dispose();

    await expect(pending).rejects.toThrow(/disposed before compilation completed/);
    await expect(client.compile({ id: "late" })).rejects.toThrow(/has been disposed/);
  });
});
