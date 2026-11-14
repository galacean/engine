import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type { RuntimeProjectUndo } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { queryPage, type QueryPageOptions } from "../runtime-editor/query-page.ts";

export type HistoryDirection = "undo" | "redo";
export interface ProjectHistoryEntry {
  transactionId: string;
  paths: string[];
  runtime: "pending" | "applied" | "failed";
  runtimeErrors: string[];
}
interface RecordEntry extends ProjectHistoryEntry {
  before: RuntimeProjectUndo;
  after: RuntimeProjectUndo;
}
export interface HistoryMove {
  direction: HistoryDirection;
  transactionIds: readonly string[];
}

/** Session authoring history. Simulation writes and resource-cache fills are not edits. */
export class RuntimeProjectHistory {
  private undo: RecordEntry[] = [];
  private redo: RecordEntry[] = [];
  query() {
    const view = (entries: RecordEntry[]) =>
      entries
        .slice()
        .reverse()
        .map(({ before, after, ...entry }) => structuredClone(entry));
    return { undo: view(this.undo), redo: view(this.redo) };
  }
  page(options: QueryPageOptions & { direction?: HistoryDirection } = {}) {
    const direction = options.direction ?? "undo";
    const rows = this[direction]
      .slice()
      .reverse()
      .map((entry) => ({
        transactionId: entry.transactionId,
        paths: entry.paths.slice(0, 3).map((path) => path.slice(0, 256)),
        pathCount: entry.paths.length,
        pathsTruncated: entry.paths.length > 3 || entry.paths.some((path) => path.length > 256),
        runtime: entry.runtime,
        errorCount: entry.runtimeErrors.length
      }));
    return queryPage(rows, direction, options);
  }
  read(transactionId: string): ProjectHistoryEntry {
    const entry = [...this.undo, ...this.redo].find((entry) => entry.transactionId === transactionId);
    if (!entry) throw new Error(`Unknown history transaction '${transactionId}'`);
    const { before, after, ...details } = entry;
    return structuredClone(details);
  }
  patch(move: HistoryMove): RuntimeProjectUndo {
    const stack = this[move.direction];
    if (
      !move.transactionIds.length ||
      move.transactionIds.some((id, i) => stack[stack.length - 1 - i]?.transactionId !== id)
    )
      throw new Error(
        `History ${move.direction} requires the contiguous next transaction IDs in execution order; query history first`
      );
    return structuredClone(
      compact(
        move.transactionIds.flatMap((_, i) => {
          const entry = stack[stack.length - 1 - i]!;
          return move.direction === "undo" ? entry.before : entry.after;
        })
      )
    );
  }
  async resolve(
    move: HistoryMove,
    load: (file: RuntimeProjectManifest["files"][number]) => Promise<string | Uint8Array>
  ): Promise<RuntimeProjectUndo> {
    this.patch(move);
    const entries = move.transactionIds.map((_, i) => this[move.direction][this[move.direction].length - 1 - i]!);
    for (const item of compact(entries.flatMap((entry) => (move.direction === "undo" ? entry.before : entry.after)))) {
      // Unloaded sources retain their original immutable VFS location. Resolve
      // only when needed; replacing a source must not wait for its obsolete load.
      if ("path" in item && item.file && item.content === undefined) item.content = await load(item.file);
    }
    return this.patch(move);
  }
  accept(transactionId: string, before: RuntimeProjectUndo, after: RuntimeProjectUndo, move?: HistoryMove): void {
    if (move) {
      this.patch(move);
      const from = this[move.direction],
        to = this[move.direction === "undo" ? "redo" : "undo"];
      for (const _ of move.transactionIds) to.push(from.pop()!);
    } else if (before.length) {
      if ([...this.undo, ...this.redo].some((entry) => entry.transactionId === transactionId))
        throw new Error(`Duplicate history transaction '${transactionId}'`);
      this.undo.push({
        transactionId,
        paths: before.map((entry) =>
          "path" in entry ? entry.path : "document" in entry ? entry.document : "project.directories"
        ),
        before: structuredClone(before),
        after: structuredClone(after),
        runtime: "pending",
        runtimeErrors: []
      });
      this.redo = [];
    }
  }
  assertNew(id: string) {
    if ([...this.undo, ...this.redo].some((entry) => entry.transactionId === id))
      throw new Error(`Duplicate history transaction '${id}'`);
  }
  activated(ids: readonly string[], errors: readonly string[]) {
    for (const entry of [...this.undo, ...this.redo])
      if (ids.includes(entry.transactionId)) {
        entry.runtime = errors.length ? "failed" : "applied";
        entry.runtimeErrors = [...errors];
      }
  }
}

/** Compare author contents; an unloaded immutable source gaining a cache entry is unchanged. */
export function projectHistoryPatch(
  from: RuntimeProjectPackage,
  to: RuntimeProjectPackage,
  excluded: ReadonlySet<string> = new Set(),
  authoredContentPaths: ReadonlySet<string> = new Set()
): RuntimeProjectUndo {
  const patch: RuntimeProjectUndo = [];
  if (JSON.stringify(from.project.directories) !== JSON.stringify(to.project.directories))
    patch.push({ directories: to.project.directories?.slice() });
  const a = new Map(from.project.files.map((file) => [file.virtualPath, file]));
  const b = new Map(to.project.files.map((file) => [file.virtualPath, file]));
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    if (excluded.has(path)) continue;
    const left = from.contents[path],
      right = to.contents[path];
    const equal =
      left === right ||
      (left instanceof Uint8Array &&
        right instanceof Uint8Array &&
        left.length === right.length &&
        left.every((n, i) => n === right[i]));
    if (
      JSON.stringify(a.get(path)) === JSON.stringify(b.get(path)) &&
      (equal || (!authoredContentPaths.has(path) && (left === undefined || right === undefined)))
    )
      continue;
    patch.push({
      path,
      file: b.get(path) && structuredClone(b.get(path)!),
      content: right === undefined ? undefined : structuredClone(right)
    });
  }
  for (const document of new Set([...Object.keys(from.documents ?? {}), ...Object.keys(to.documents ?? {})]))
    if (from.documents?.[document] !== to.documents?.[document])
      patch.push({ document, content: to.documents?.[document] });
  return patch;
}

function compact(patch: RuntimeProjectUndo): RuntimeProjectUndo {
  return [
    ...new Map(
      patch.map((item) => [
        "path" in item ? `asset:${item.path}` : "document" in item ? `document:${item.document}` : "directories",
        item
      ])
    ).values()
  ];
}
