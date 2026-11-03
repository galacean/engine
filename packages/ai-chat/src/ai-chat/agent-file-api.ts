import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";

/** Task-lifetime, immutable output artifacts. Separate from writable project documents. */
export class AgentOutputFiles {
  private readonly values = new Map<string, string>();
  private bytes = 0;
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  readonly provider: ProjectFileProvider = { paths: () => this.values.keys(), read: (path) => this.values.get(path) };
  clear() {
    this.values.clear();
    this.bytes = 0;
  }
  save(executionId: string, content: string): string {
    const path = `execution-output/${executionId.replace(/[^\w-]/g, "-")}.json`;
    if (this.values.has(path)) throw new Error(`Output artifact already exists: ${path}`);
    const bytes = content.length * 2; // Conservative retained UTF-16 storage, not token accounting.
    if (this.bytes + bytes > this.maxBytes)
      throw new Error("Task output storage budget exhausted; existing artifacts are retained");
    this.values.set(path, content);
    this.bytes += bytes;
    return path;
  }
}
