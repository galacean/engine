/** Storage owns byte transport only, not search, Editor state or LLM tools. */
export interface ResourceStorage {
  read(url: string, options: { signal?: AbortSignal; maxBytes: number }): Promise<Uint8Array>;
}

export async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RangeError(`Resource exceeds ${maxBytes} bytes`);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createHttpStorage(fetcher: typeof fetch = fetch): ResourceStorage {
  return {
    async read(url, { signal, maxBytes }) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Expected an HTTP(S) resource URL");
      const response = await fetcher(url, { signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Resource request failed: HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("Resource response has no body");
      return readBoundedStream(response.body, maxBytes, signal);
    }
  };
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
