import type { AgentViewImage } from "./agent-types";

export type TraceImageMetadata = {
  attachmentId: string;
  mediaType: string;
  bytes: number;
  width: number;
  height: number;
  /** Only portable exports and legacy traces contain inline bytes. */
  dataUrl?: string;
  /** Storage identity for migrated legacy references such as image-1. */
  storageId?: string;
};

export interface TraceAttachmentStorage {
  save(image: TraceImageMetadata, data: Blob): Promise<void>;
  read(attachmentId: string): Promise<Blob>;
}

export async function prepareTraceImage(image: AgentViewImage): Promise<{ metadata: TraceImageMetadata; data: Blob }> {
  const bytes = new Uint8Array(await image.blob.arrayBuffer());
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const attachmentId = `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return {
    metadata: {
      attachmentId,
      mediaType: image.blob.type,
      bytes: bytes.length,
      width: image.width,
      height: image.height
    },
    data: image.blob
  };
}

export async function traceImageDataUrl(data: Blob): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${data.type};base64,${btoa(binary)}`;
}

const DEFAULT_TRACE_ATTACHMENTS_OPEN_TIMEOUT_MS = 4000;

/** Immutable DSH-style objects: no automatic deletion and no resident blob cache. */
export class IndexedDbTraceAttachments implements TraceAttachmentStorage {
  #database?: Promise<IDBDatabase>;
  constructor(
    private readonly name = "seed-world-trace-attachments-v1",
    private readonly openTimeoutMs = DEFAULT_TRACE_ATTACHMENTS_OPEN_TIMEOUT_MS
  ) {}

  async save(image: TraceImageMetadata, data: Blob): Promise<void> {
    const db = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Unable to save trace attachment"));
      const images = tx.objectStore("images");
      const existing = images.getKey(image.attachmentId);
      existing.onsuccess = () => {
        if (existing.result === undefined) images.add(data, image.attachmentId);
      };
    });
  }

  async read(attachmentId: string): Promise<Blob> {
    const db = await this.#open();
    return new Promise((resolve, reject) => {
      const request = db.transaction("images").objectStore("images").get(attachmentId);
      request.onsuccess = () =>
        request.result instanceof Blob
          ? resolve(request.result)
          : reject(new Error(`Trace attachment missing: ${attachmentId}`));
      request.onerror = () => reject(request.error);
    });
  }

  #open(): Promise<IDBDatabase> {
    if (!this.#database) {
      this.#database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("IndexedDB is unavailable"));
          return;
        }
        let settled = false;
        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
          }
        };
        let request: IDBOpenDBRequest;
        try {
          request = indexedDB.open(this.name, 2);
        } catch (error) {
          reject(error);
          return;
        }
        if (Number.isFinite(this.openTimeoutMs) && this.openTimeoutMs > 0) {
          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            timedOut = true;
            reject(new Error(`Trace attachment IndexedDB open timed out after ${this.openTimeoutMs}ms`));
          }, this.openTimeoutMs);
        }
        request.onupgradeneeded = () => {
          if (timedOut || settled) {
            try {
              request.transaction?.abort();
            } catch {
              // Ignore if the upgrade transaction is already inactive or finished.
            }
            return;
          }
          const db = request.result;
          if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
          // Preserve existing bytes; remove obsolete owners and fence out v1 deletion clients.
          if (db.objectStoreNames.contains("traces")) db.deleteObjectStore("traces");
        };
        request.onsuccess = () => {
          if (timedOut || settled) {
            try {
              request.result.close();
            } catch {
              // Ignore errors when closing a late-arriving IDBDatabase handle.
            }
            return;
          }
          settled = true;
          finish();
          request.result.onversionchange = () => {
            request.result.close();
            this.#database = undefined;
          };
          resolve(request.result);
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          finish();
          reject(request.error);
        };
        request.onblocked = () => {
          if (settled) return;
          settled = true;
          finish();
          reject(new Error("Trace attachment database is blocked"));
        };
      }).catch((error) => {
        this.#database = undefined;
        throw error;
      });
    }
    return this.#database;
  }
}
