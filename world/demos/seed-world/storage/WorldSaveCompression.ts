import { gzipWorldBytes } from "./gzipWorldBytes";

const workerThreshold = 256 * 1024;
const encoder = new TextEncoder();

export class WorldSaveCompression {
  private worker?: Worker;
  private disabled = false;
  private sequence = 0;
  private readonly pending = new Map<number, { resolve(value: Uint8Array): void; reject(): void }>();

  private startWorker(): Worker {
    const worker = new Worker(new URL("./WorldSaveGzip.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<{ id: number; gzip?: Uint8Array }>) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      if (data.gzip) job.resolve(data.gzip);
      else job.reject();
    };
    worker.onerror = () => this.close();
    worker.onmessageerror = () => this.close();
    return worker;
  }

  // Encoded text can be reconstructed from its immutable source after a failed transfer.
  // Binary input belongs to the incremental-save baseline and must stay attached.
  async compress(bytes: Uint8Array, text?: string): Promise<Uint8Array> {
    if (bytes.byteLength < workerThreshold || this.disabled || typeof Worker === "undefined") {
      return gzipWorldBytes(bytes);
    }
    try {
      const worker = (this.worker ??= this.startWorker());
      const input = text === undefined ? bytes.slice() : bytes;
      const id = ++this.sequence;
      return await new Promise<Uint8Array>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        worker.postMessage({ id, input }, [input.buffer]);
      });
    } catch {
      this.close();
      return gzipWorldBytes(text !== undefined && bytes.byteLength === 0 ? encoder.encode(text) : bytes);
    }
  }

  close(): void {
    this.disabled = true;
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of this.pending.values()) job.reject();
    this.pending.clear();
  }
}
