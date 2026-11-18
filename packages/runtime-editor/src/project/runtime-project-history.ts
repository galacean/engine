import { sameRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type {
  RuntimeProjectUndo,
  RuntimeSceneChangeSet,
  RuntimeSceneMutation
} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
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
  mutations: Record<string, RuntimeSceneMutation>;
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
        .map(({ before, after, mutations, ...entry }) => structuredClone(entry));
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
    const { before, after, mutations, ...details } = entry;
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
          const target = move.direction === "undo" ? entry.before : entry.after;
          const from = new Map(
            (move.direction === "undo" ? entry.after : entry.before).flatMap((item) =>
              "path" in item ? [[item.path, item.content] as const] : []
            )
          );
          return target.map((item) => {
            if (!("path" in item)) return item;
            const mutation = entry.mutations[item.path],
              fromContent = from.get(item.path);
            return mutation && typeof fromContent === "string"
              ? {
                  ...item,
                  sceneChanges: { ...mutation, fromContent }
                }
              : item;
          });
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
    for (const item of compact(
      entries.flatMap((entry) => (move.direction === "undo" ? entry.before : entry.after)),
      false
    )) {
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
      const mutations: Record<string, RuntimeSceneMutation> = {};
      const afterAssets = new Map(after.flatMap((item) => ("path" in item ? [[item.path, item] as const] : [])));
      for (const item of before) {
        if (!("path" in item) || !item.sceneChanges) continue;
        const counterpart = afterAssets.get(item.path);
        if (
          counterpart?.content === item.sceneChanges.fromContent &&
          counterpart.sceneChanges?.fromContent === item.content
        ) {
          const { fromContent, ...mutation } = item.sceneChanges;
          mutations[item.path] = mutation;
        }
      }
      // The paired snapshots already retain both versions. Store only IDs in
      // history; construct the source guard lazily when producing an undo patch.
      const withoutGuards = (patch: RuntimeProjectUndo): RuntimeProjectUndo =>
        patch.map((item) => {
          if (!("path" in item)) return item;
          const { sceneChanges, ...snapshot } = item;
          return snapshot;
        });
      this.undo.push({
        transactionId,
        paths: before.map((entry) =>
          "path" in entry ? entry.path : "document" in entry ? entry.document : "project.directories"
        ),
        before: structuredClone(withoutGuards(before)),
        after: structuredClone(withoutGuards(after)),
        mutations: structuredClone(mutations),
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
  authoredContentPaths: ReadonlySet<string> = new Set(),
  sceneChanges: Readonly<Record<string, RuntimeSceneChangeSet>> = {}
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
    const equal = sameRuntimeProjectContent(left, right);
    if (
      JSON.stringify(a.get(path)) === JSON.stringify(b.get(path)) &&
      (equal || (!authoredContentPaths.has(path) && (left === undefined || right === undefined)))
    )
      continue;
    const changes = sceneChanges[path];
    const tracked =
      changes &&
      typeof left === "string" &&
      typeof right === "string" &&
      ((changes.before === left && changes.after === right) || (changes.after === left && changes.before === right));
    patch.push({
      ...(tracked
        ? {
            sceneChanges: {
              fromContent: left,
              entities: changes.entities.slice(),
              components: changes.components.slice(),
              roots: changes.roots
            }
          }
        : {}),
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

function compact(patch: RuntimeProjectUndo, mergeChanges = true): RuntimeProjectUndo {
  const entries = new Map<string, RuntimeProjectUndo[number]>();
  for (const item of patch) {
    const key =
      "path" in item ? `asset:${item.path}` : "document" in item ? `document:${item.document}` : "directories";
    const previous = entries.get(key);
    if (mergeChanges && previous && "path" in previous && "path" in item) {
      const a = previous.sceneChanges,
        b = item.sceneChanges;
      // A contiguous history move restores several snapshots of one Scene. The
      // final snapshot needs every touched ID, not only the last history entry.
      const sceneChanges =
        a && b && b.fromContent === previous.content
          ? {
              fromContent: a.fromContent,
              entities: [...new Set([...(a.entities ?? []), ...(b.entities ?? [])])],
              components: [...new Set([...(a.components ?? []), ...(b.components ?? [])])],
              roots: !!(a.roots || b.roots)
            }
          : undefined;
      entries.set(key, { ...item, sceneChanges });
    } else entries.set(key, item);
  }
  return [...entries.values()];
}
