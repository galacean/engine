import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";

type Entry = { content: string; bytes: number; pins: number };
/** Session-owned long text outputs. Screenshots and execution code keep their existing owners. */
export class AgentArtifacts {
  private readonly values = new Map<string, Entry>();
  private bytes = 0;
  private ordinal = 0;
  private disposed = false;
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  readonly provider: ProjectFileProvider = {
    paths: () => this.values.keys(),
    directories: () => [".ai/outputs"],
    missing: (path) => this.assertNotExpired(path),
    read: (path) => this.get(path)?.content,
    open: async (path) => {
      const entry = this.get(path);
      if (!entry) return undefined;
      const values = this.values;
      return {
        kind: "text",
        chunks: (async function* () {
          if (values.get(path) !== entry) throw new Error(`TEMP_FILE_EXPIRED: 临时文件已过期 '${path}'`);
          entry.pins++;
          try {
            yield entry.content;
          } finally {
            entry.pins--;
          }
        })()
      };
    }
  };
  private assertNotExpired(path: string): void {
    const match = /^\.ai\/outputs\/([1-9]\d*)\.json$/.exec(path);
    if (match && +match[1] <= this.ordinal && !this.values.has(path))
      throw new Error(`TEMP_FILE_EXPIRED: 临时文件已过期 '${path}'；请重新执行产生此输出的操作`);
  }
  private get(path: string): Entry | undefined {
    this.assertNotExpired(path);
    const entry = this.values.get(path);
    if (entry) {
      this.values.delete(path);
      this.values.set(path, entry);
    }
    return entry;
  }
  save(_executionId: string, content: string): string {
    if (this.disposed) throw new Error("Session output storage is disposed");
    const path = `.ai/outputs/${this.ordinal + 1}.json`;
    const bytes = (content.length + path.length) * 2 + 128;
    if (bytes > this.maxBytes) throw new Error("Temporary artifact exceeds storage limit");
    const candidates = [...this.values].filter(([, value]) => value.pins === 0);
    if (this.bytes + bytes - candidates.reduce((sum, [, value]) => sum + value.bytes, 0) > this.maxBytes)
      throw new Error("Temporary storage is in use; no unpinned space is available");
    for (const [old, value] of candidates) {
      if (this.bytes + bytes <= this.maxBytes) break;
      this.values.delete(old);
      this.bytes -= value.bytes;
    }
    this.values.set(path, { content, bytes, pins: 0 });
    this.bytes += bytes;
    this.ordinal++;
    return path;
  }
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
  clear(): void {
    this.values.clear();
    this.bytes = 0;
    // Keep the monotonic counter: stale paths never name new outputs after reset.
  }
}
