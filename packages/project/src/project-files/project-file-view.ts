/** Canonical, operation-scoped content. Closing iteration releases any reader;
 * opening a view must not add a second persistent content cache. */
import type { ProjectFileProvider } from "./virtual-project-files";

export type ProjectFileView = { kind: "text"; chunks: AsyncIterable<string> } | { kind: "binary"; byteLength?: number };

export const TEXT_BLOCK_CHARS = 16 * 1024;
export const TEXT_SLICE_MS = 2;

/** One cooperative clock across the entire stream, including tiny producer chunks. */
async function* boundedText(chunks: AsyncIterable<string>, signal?: AbortSignal): AsyncGenerator<string> {
  let yieldedAt = performance.now();
  for await (const source of chunks) {
    let offset = 0;
    do {
      signal?.throwIfAborted();
      if (performance.now() - yieldedAt >= TEXT_SLICE_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        yieldedAt = performance.now();
      }
      yield source.slice(offset, offset + TEXT_BLOCK_CHARS);
      offset += TEXT_BLOCK_CHARS;
    } while (offset < source.length);
  }
  signal?.throwIfAborted();
}

async function* textChunks(source: string, signal?: AbortSignal): AsyncGenerator<string> {
  for (let offset = 0; offset < source.length; offset += TEXT_BLOCK_CHARS) {
    signal?.throwIfAborted();
    yield source.slice(offset, offset + TEXT_BLOCK_CHARS);
  }
  signal?.throwIfAborted();
}

export function contentView(content: string | Uint8Array, signal?: AbortSignal): ProjectFileView {
  return typeof content === "string"
    ? { kind: "text", chunks: textChunks(content, signal) }
    : { kind: "binary", byteLength: content.byteLength };
}

/** Decode the same UTF-8 representation for both consumers, without full-file copies. */
export async function* utf8Chunks(
  bytes: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
  fatal = false
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal });
  for await (const chunk of bytes) {
    for (let start = 0; start < chunk.length; start += TEXT_BLOCK_CHARS) {
      signal?.throwIfAborted();
      yield decoder.decode(chunk.subarray(start, start + TEXT_BLOCK_CHARS), { stream: true });
    }
  }
  yield decoder.decode();
}

/** Existing resident providers use their canonical read, including synthesized text.
 * Providers with remote content can supply an operation-scoped streaming open. */
export async function resolveProjectFile(
  provider: ProjectFileProvider,
  path: string,
  signal?: AbortSignal
): Promise<ProjectFileView> {
  signal?.throwIfAborted();
  let view: ProjectFileView | undefined;
  if (provider.open) view = await abortable(provider.open(path, signal), signal);
  else {
    if (provider.prepare) await abortable(provider.prepare(path, signal), signal);
    signal?.throwIfAborted();
    const content = provider.read(path);
    if (content !== undefined) view = contentView(content, signal);
  }
  signal?.throwIfAborted();
  if (!view) throw new Error(`Unknown project path '${path}'`);
  return view;
}

/** Apply the consumer processing budget once, regardless of mount depth. */
export async function openProjectFile(
  provider: ProjectFileProvider,
  path: string,
  signal?: AbortSignal
): Promise<ProjectFileView> {
  const view = await resolveProjectFile(provider, path, signal);
  return view.kind === "text" ? { kind: "text", chunks: boundedText(view.chunks, signal) } : view;
}

export async function* responseBytes(response: Response, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const result = await abortable(reader.read(), signal);
      signal?.throwIfAborted();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

/** Even a provider that is slow to observe cancellation cannot hold the caller. */
export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
