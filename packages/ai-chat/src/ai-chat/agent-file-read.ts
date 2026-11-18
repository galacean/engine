import type { VirtualProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files";
import { buildWindow, type ReadInput } from "./vendor/deepseek-read/read-window";

export const MAX_READ_RESULT_BYTES = 32 * 1024;
export const MAX_READ_PAGE_BYTES = 16 * 1024;
export type AgentFileRead = ReadInput;

/** VFS adapter: return only the requested page, without retaining document content. */
export async function readAgentFile(files: VirtualProjectFiles, read: AgentFileRead, signal?: AbortSignal) {
  // Explicit reads retain the provider's existing preparation/cache semantics:
  // editor validation can consume assets the user has read. Search only opens a view.
  const snapshot = files.snapshot();
  if (snapshot.kind(read.file_path) === "directory") {
    const index = `${read.file_path}/README.md`;
    throw new Error(
      `Cannot read directory '${read.file_path}'; use glob({path: ${JSON.stringify(read.file_path)}, pattern: "*"})` +
        (snapshot.kind(index) === "file" ? ` or read({file_path: ${JSON.stringify(index)}})` : "")
    );
  }
  await snapshot.prepare([read.file_path], signal);
  let observedContent: string | undefined;
  try {
    const content = snapshot.readContent(read.file_path);
    if (typeof content === "string") observedContent = content;
  } catch {
    /* Stream-only providers have no resident document to edit. */
  }
  const file = await snapshot.open(read.file_path, signal);
  signal?.throwIfAborted();
  if (file.kind === "binary") {
    if (read.offset !== 1 || (read.column ?? 1) !== 1) throw new Error("Binary files do not support text windows");
    return {
      result: {
        path: read.file_path,
        ...file,
        metadataPath: snapshot.kind(`${read.file_path}.meta`) === "file" ? `${read.file_path}.meta` : null
      }
    };
  }
  const text = file.chunks;
  async function* chunks() {
    for await (const chunk of text) {
      signal?.throwIfAborted();
      yield chunk;
    }
  }
  const window = await buildWindow(chunks(), { ...read, maxBytes: MAX_READ_PAGE_BYTES }, read.file_path);
  signal?.throwIfAborted();
  const result = {
    path: read.file_path,
    offset: read.offset,
    lines: window.lines,
    totalLines: window.totalLines,
    next: window.next
  };
  if (new TextEncoder().encode(JSON.stringify({ ok: true, result })).byteLength > MAX_READ_RESULT_BYTES) {
    throw new Error("Read result exceeds the transport byte limit");
  }
  return { result, observedContent };
}
