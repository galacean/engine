import { gunzipSync } from "fflate";
import { abortable } from "@galacean/engine-project/project-files/project-file-view";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectBackend,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

import { sameRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import {
  captureFiles,
  restoreFiles,
  type BlockRef,
  type Content,
  type FileIndex,
  type RetiredGeneration,
  type FileRef
} from "./SharedWorldFiles";
import { WorldSaveCompression } from "./WorldSaveCompression";
import type { PublishedWorldAssets } from "./PublishedWorldAssets";

export interface WorldDb {
  query(input: Statement, signal?: AbortSignal): Promise<{ success: boolean; data?: Record<string, unknown>[]; message?: string }>;
  execute(input: Statement): Promise<{ success: boolean; data?: { rowsAffected?: number }; message?: string }>;
  role(): Promise<{ success?: boolean; role?: string; data?: { role?: string } }>;
  /** Shared database time, in Unix milliseconds. Standalone previews use session time. */
  persistentTime?(): Promise<number>;
}
interface Statement {
  sql: string;
  binds: (string | number)[];
  timeoutMs: number;
}
export interface WorldIdentity {
  template: string;
  seed: number;
}
interface Head extends WorldIdentity {
  contentDigest?: string;
  format: number;
  engineVersion: number;
  appVersion: string;
  sequence?: number;
  pinned?: BlockRef;
  revision: string;
  parts: number;
  digest: string;
}
export interface WorldSelection {
  readonly raw?: string;
  readonly olderApp: boolean;
  readonly identity?: WorldIdentity;
  readonly checkpoint?: Head;
  readonly restoreFailed?: boolean;
}

export const WORLD_SAVE_VERSION = 12;

// Initial budgets for hosted worlds. A reader that outlives retention can restart at a newer head.
const restoreRetryBudgetMs = 120_000;
const retentionMs = 300_000;
const cleanupBatchSize = 16;
const revisionPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const pageSize = 4;
const bytesPerPart = 75000; // Base64 encodes three bytes as four ASCII characters.
const archiveGeneration = "archive";
const selectArchive =
  "SELECT payload AS payload FROM world_save WHERE generation = ? AND id <= ? AND part_no > ? ORDER BY id DESC LIMIT 1";
const sealArchive = "UPDATE world_save SET payload = ?, part_no = ? WHERE id = ? AND part_no < ?";
const selectHead = "SELECT payload AS payload FROM world_save WHERE id = ? LIMIT 2";
const insert = "INSERT INTO world_save (id, generation, part_no, payload) VALUES (?, ?, ?, ?)";
const removeParts = "DELETE FROM world_save WHERE generation = ?";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
function decodeLegacyPackage(bytes: Uint8Array): RuntimeProjectPackage | undefined {
  const pack = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!supportsProjectVersion(pack?.version)) return undefined;
  for (const key of Object.keys(pack.contents)) {
    const value = pack.contents[key];
    if (typeof value !== "string") {
      if (typeof value?.bytes !== "string") throw new Error("世界存档的二进制资源无效");
      pack.contents[key] = fromBase64(value.bytes);
    }
  }
  return pack;
}
function supportsProjectVersion(version: number): boolean {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("世界存档工程版本无效");
  return version === RUNTIME_PROJECT_SAVE_VERSION;
}

function appVersionNumber(version: string): number {
  const value = Number(version);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("闪应用版本号无效");
  return value;
}

function parseStoredHead(raw: string): Head {
  const head: Head = JSON.parse(raw);
  appVersionNumber(head?.appVersion);
  if (head.pinned !== undefined && !validRef(head.pinned)) throw new Error("旧版世界存档引用无效");
  if (head.sequence !== undefined &&
      (!Number.isSafeInteger(head.sequence) || head.sequence < 1 || head.sequence > 0x7fffffff))
    throw new Error("世界存档提交序号无效");
  return head;
}

function archiveId(version: number): string {
  return "archive-" + String(version).padStart(16, "0");
}

// Identity can survive a breaking change even when its file index cannot be read.
function parseHead(h: Head): { identity?: WorldIdentity; checkpoint?: Head } {
  if (!Number.isSafeInteger(h?.format) || h.format < 1 || !Number.isSafeInteger(h.engineVersion) || h.engineVersion < 1)
    throw new Error("世界存档索引损坏");
  const identity =
    typeof h.template === "string" && h.template && Number.isInteger(h.seed) && h.seed >= 0 && h.seed <= 0xffffffff
      ? { template: h.template, seed: h.seed }
      : undefined;
  if ((h.format !== 1 && h.format !== 2) || h.engineVersion !== WORLD_SAVE_VERSION) return { identity };
  if (!identity || !validRef(h)) throw new Error("世界存档索引损坏");
  return { identity, checkpoint: h };
}

function validRef(ref: BlockRef | undefined): boolean {
  return (
    !!ref &&
    revisionPattern.test(ref.revision) &&
    Number.isSafeInteger(ref.parts) &&
    ref.parts >= 1 &&
    /^[a-f0-9]{64}$/.test(ref.digest)
  );
}
type Baseline = Map<string, { ref: FileRef; content: Content }>;
interface Publication {
  head: string;
  // Offset in the previous retirement list at the instant this index was captured.
  retiredOffset: number;
  baseline: Baseline;
  retired: RetiredGeneration[];
}
interface Collection {
  head: string;
  revision: string;
  retired: RetiredGeneration[];
  collected: number;
  notBefore: number;
  clockTime: number;
  observedAt: number;
  restoreCursor: boolean;
  superseded?: boolean;
  recordedCount?: number;
  retryAt: number;
}
function canRetire(revision: unknown): revision is string {
  return (
    typeof revision === "string" &&
    revision.length > 0 &&
    revision.length <= 64 &&
    revision !== "head" &&
    revision !== archiveGeneration
  );
}
const utf8 = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export class SharedWorldStorage implements RuntimeProjectBackend {
  private readonly compression = new WorldSaveCompression();
  private baseline: Baseline = new Map();
  private pending?: Publication;
  private collection?: Collection;
  private collecting = false;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  // Reconcile after a fresh open or uncertain write, before staging anything in this session.
  private reconcileGenerations = true;
  private pinned?: { revision: string; generations: ReadonlySet<string> };
  private superseded = false;
  private loaded = false;
  private deferredWrites?: Promise<void>;
  private readonly lifetime = new AbortController();
  private get closed(): boolean {
    return this.lifetime.signal.aborted;
  }
  private constructor(
    private readonly db: WorldDb,
    readonly readOnly: boolean,
    private readonly appVersion: number,
    private head: string | undefined,
    private checkpoint: Head | undefined,
    readonly identity: WorldIdentity,
    private readonly published?: PublishedWorldAssets,
    private readonly readLegacyPreview?: (id: string) => Promise<RuntimeProjectPackage | undefined>,
    private readonly identityFromProject?: (pack: RuntimeProjectPackage) => WorldIdentity | undefined
  ) {}

  private static async rows(db: WorldDb, sql: string, binds: Statement["binds"], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const r = await abortable(db.query({ sql, binds, timeoutMs: 30000 }, signal), signal);
    if (!r?.success || !Array.isArray(r.data)) throw new Error(r?.message || "读取世界存档失败");
    return r.data;
  }
  private static async readHead(db: WorldDb, signal?: AbortSignal) {
    const rows = await this.rows(db, selectHead, ["world"], signal);
    if (!rows.length) return undefined;
    if (rows.length !== 1 || typeof rows[0].payload !== "string") throw new Error("世界存档索引无效");
    return rows[0].payload;
  }
  private static async visibleHead(db: WorldDb, head: Head, version: number, signal?: AbortSignal) {
    if (appVersionNumber(head.appVersion) <= version) return head;
    const [row] = await this.rows(db, selectArchive, [archiveGeneration, archiveId(version), 0], signal);
    if (!row) return undefined;
    if (typeof row.payload !== "string") throw new Error("旧版世界存档索引无效");
    const archived = parseStoredHead(row.payload);
    if (appVersionNumber(archived.appVersion) > version) throw new Error("旧版世界存档版本无效");
    return archived;
  }

  static async select(db: WorldDb, appVersion: string, entryTemplate?: string): Promise<WorldSelection> {
    const raw = await this.readHead(db);
    if (raw === undefined) return { olderApp: false };
    const current = parseStoredHead(raw);
    const version = appVersionNumber(appVersion);
    const olderApp = appVersionNumber(current.appVersion) > version;
    const head = await this.visibleHead(db, current, version);
    if (!head) return { raw, olderApp };
    const { identity, checkpoint } = parseHead(head);
    if (entryTemplate && (!checkpoint || identity?.template !== entryTemplate)) {
      return { raw, olderApp, identity, restoreFailed: true };
    }
    return { raw, olderApp, identity, checkpoint };
  }

  static async open(
    db: WorldDb,
    readOnly: boolean,
    appVersion: string,
    identity: WorldIdentity,
    published?: PublishedWorldAssets,
    readLegacyPreview?: (id: string) => Promise<RuntimeProjectPackage | undefined>,
    identityFromProject?: (pack: RuntimeProjectPackage) => WorldIdentity | undefined,
    selection?: WorldSelection
  ) {
    const version = appVersionNumber(appVersion);
    const chosen = selection ?? await this.select(db, appVersion);
    if (chosen.checkpoint && identity.seed !== chosen.checkpoint.seed) throw new Error("世界已更新，请重新打开");
    return new SharedWorldStorage(
      db, readOnly || chosen.olderApp, version, chosen.raw, chosen.checkpoint, identity,
      published, readLegacyPreview, identityFromProject
    );
  }
  private async execute(sql: string, binds: Statement["binds"]) {
    const r = await this.db.execute({ sql, binds, timeoutMs: 30000 });
    const n = r?.data?.rowsAffected;
    if (!r?.success || typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
      throw new Error(r?.message || "世界存档写入失败");
    return n;
  }
  async load(id?: string): Promise<RuntimeProjectPackage | undefined> {
    const lifetime = this.lifetime.signal;
    lifetime.throwIfAborted();
    let pack: RuntimeProjectPackage | undefined;
    let checkpoint = this.checkpoint;
    let observedHead = this.head;
    let retryDeadline: number | undefined;
    while (checkpoint) {
      lifetime.throwIfAborted();
      const attempt = new AbortController();
      const cancel = () => attempt.abort();
      lifetime.addEventListener("abort", cancel);
      try {
        pack = await this.loadGeneration(checkpoint, attempt.signal);
        break;
      } catch (error) {
        cancel();
        // A newer checkpoint can retire these chunks while a viewer is paging through them.
        const latest = await SharedWorldStorage.readHead(this.db, lifetime);
        if (!latest || latest === observedHead) throw error;
        const now = performance.now();
        retryDeadline ??= now + restoreRetryBudgetMs;
        if (now >= retryDeadline) throw error;
        const active = parseStoredHead(latest);
        this.superseded = appVersionNumber(active.appVersion) > this.appVersion;
        const nextVisible = await SharedWorldStorage.visibleHead(this.db, active, this.appVersion, lifetime);
        if (!nextVisible || nextVisible.revision === checkpoint.revision) throw error;
        const next = parseHead(nextVisible);
        if (next.identity?.seed !== this.identity.seed || next.identity.template !== this.identity.template)
          throw error;
        checkpoint = next.checkpoint;
        observedHead = latest;
        if (!this.superseded) this.head = latest;
      } finally {
        lifetime.removeEventListener("abort", cancel);
      }
    }
    if (pack && checkpoint?.template !== this.identity.template) throw new Error("世界模板版本不兼容");
    if (!pack) this.baseline.clear();
    if (id && this.head === undefined && !this.readOnly) pack = await this.readLegacyPreview?.(id);
    lifetime.throwIfAborted();
    this.checkpoint = checkpoint;
    this.loaded = true;
    this.scheduleMaintenance();
    return pack;
  }
  private async loadGeneration(h: Head, signal: AbortSignal): Promise<RuntimeProjectPackage | undefined> {
    const bytes = await SharedWorldStorage.readBlocks(this.db, h, signal);
    signal.throwIfAborted();
    if (h.format === 1) {
      const pack = decodeLegacyPackage(bytes);
      this.baseline.clear();
      return pack;
    }
    const index: FileIndex = JSON.parse(textDecoder.decode(bytes));
    if (!supportsProjectVersion(index?.version)) return undefined;
    if (!Array.isArray(index.files) || typeof index.hasDocuments !== "boolean") throw new Error("世界文件索引无效");
    const baseline: Baseline = new Map();
    const files = new Map<string, Content>();
    let cursor = 0;
    // Bound bridge requests when a world contains many edited files.
    await Promise.all(
      Array.from({ length: Math.min(4, index.files.length) }, async () => {
        while (cursor < index.files.length) {
          signal.throwIfAborted();
          const [key, ref] = index.files[cursor++];
          if (typeof key !== "string" || !validRef(ref) || !["utf8", "binary", "json-string"].includes(ref.encoding))
            throw new Error("世界文件引用无效");
          const bytes = await SharedWorldStorage.readBlocks(this.db, ref, signal);
          let content: Content = ref.encoding === "binary" ? bytes : textDecoder.decode(bytes);
          if (ref.encoding === "json-string") {
            content = JSON.parse(content as string);
            if (typeof content !== "string") throw new Error("世界文件文本无效");
          }
          if (files.has(key)) throw new Error("世界文件重复");
          files.set(key, content);
          if (!this.readOnly) baseline.set(key, { ref, content });
        }
      })
    );
    signal.throwIfAborted();
    const pack = restoreFiles(index, files, this.readOnly);
    this.baseline = baseline;
    if (!this.readOnly && !this.superseded) {
      const retired = index.retired ?? [];
      if (
        !Array.isArray(retired) ||
        retired.some(
          (entry) =>
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            !Number.isSafeInteger(entry[0]) ||
            entry[0] < 0 ||
            !canRetire(entry[1])
        )
      )
        throw new Error("世界存档回收清单无效");
      // Standalone previews may restart after the device clock changes. Re-observe outstanding
      // retirements on this session's monotonic clock while preserving acknowledged deletes.
      this.setCollection(h.revision, this.db.persistentTime ? retired : retired.map(([, revision]) => [0, revision]), true);
    }
    return pack;
  }
  private static async readBlocks(db: WorldDb, h: BlockRef, signal?: AbortSignal): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (chunks.length < h.parts) {
      const rows = await SharedWorldStorage.rows(
        db,
        "SELECT part_no AS partNo, payload AS payload FROM world_save WHERE generation = ? AND part_no >= ? ORDER BY part_no ASC LIMIT ?",
        [h.revision, chunks.length, Math.min(pageSize, h.parts - chunks.length)],
        signal
      );
      if (!rows.length) throw new Error("世界存档分块缺失，请重新打开");
      for (const row of rows) {
        if (
          row.partNo !== chunks.length ||
          typeof row.payload !== "string" ||
          !row.payload.length ||
          row.payload.length > 100000
        )
          throw new Error("世界存档分块无效");
        const bytes = fromBase64(row.payload);
        size += bytes.length;
        chunks.push(bytes);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const decoded = gunzipSync(bytes);
    if ((await sha256(decoded)) !== h.digest) throw new Error("世界存档校验失败");
    return decoded;
  }
  private async stage(bytes: Uint8Array, digest: string, staged: string[], text?: string): Promise<BlockRef> {
    const revision = crypto.randomUUID();
    const compressed = await this.compression.compress(bytes, text);
    const parts = Math.ceil(compressed.length / bytesPerPart);
    staged.push(revision);
    for (let i = 0; i < parts; i++) {
      const payload = toBase64(compressed.subarray(i * bytesPerPart, (i + 1) * bytesPerPart));
      if ((await this.execute(insert, [revision + "-" + i, revision, i, payload])) !== 1)
        throw new Error("存档分块未写入");
    }
    return { revision, parts, digest };
  }
  private async readPins(ref?: BlockRef): Promise<ReadonlySet<string>> {
    if (!ref) return new Set();
    if (this.pinned?.revision === ref.revision) return this.pinned.generations;
    const pinned: unknown = JSON.parse(textDecoder.decode(await SharedWorldStorage.readBlocks(this.db, ref)));
    if (!Array.isArray(pinned) || pinned.some((revision) => typeof revision !== "string" || !revisionPattern.test(revision)))
      throw new Error("旧版世界存档引用无效");
    const generations = new Set<string>(pinned);
    this.pinned = { revision: ref.revision, generations };
    return generations;
  }

  private async reserveArchive(version: number) {
    const id = archiveId(version);
    try {
      if (await this.execute(insert, [id, archiveGeneration, 0, "{}"]) !== 1)
        throw new Error("世界版本入口未写入");
    } catch (error) {
      const rows = await SharedWorldStorage.rows(this.db, selectHead, [id]);
      if (rows.length !== 1) throw error;
    }
  }

  private async archivePrevious(head: Head, existingPins: ReadonlySet<string>): Promise<ReadonlySet<string>> {
    const sequence = head.sequence!;
    const version = appVersionNumber(head.appVersion);
    // Archive only a committed head observed in the shared row. A delayed upgrader
    // cannot replace a newer observation, even if its request arrives after publication.
    const { pinned: _currentPins, ...snapshot } = head;
    const changed = await this.execute(sealArchive, [JSON.stringify(snapshot), sequence, archiveId(version), sequence]);
    if (!changed) {
      const rows = await SharedWorldStorage.rows(this.db, selectHead, [archiveId(version)]);
      if (rows.length !== 1 || typeof rows[0].payload !== "string" ||
          (parseStoredHead(rows[0].payload).sequence ?? 0) < sequence)
        throw new Error("旧版世界存档未封存");
    }
    const pinned = new Set(existingPins);
    pinned.add(head.revision);
    const index: FileIndex = JSON.parse(textDecoder.decode(await SharedWorldStorage.readBlocks(this.db, head)));
    if (!Array.isArray(index?.files)) throw new Error("旧版世界文件索引无效");
    for (const [, ref] of index.files) {
      if (!validRef(ref)) throw new Error("旧版世界文件引用无效");
      pinned.add(ref.revision);
    }
    return pinned;
  }

  private async unreferencedGenerations(
    pinned: ReadonlySet<string>,
    checkpoint?: Head,
    pinSet?: BlockRef
  ): Promise<string[]> {
    const known = new Set([...this.baseline.values()].map(({ ref }) => ref.revision));
    for (const revision of pinned) known.add(revision);
    if (checkpoint) known.add(checkpoint.revision);
    if (pinSet) known.add(pinSet.revision);
    const collection = this.collection;
    if (collection) {
      for (const [, revision] of collection.retired.slice(collection.collected)) known.add(revision);
    }
    const generations: string[] = [];
    const limit = 100;
    let after = "";
    // Page by generation, including partial writes whose first block was already removed.
    for (;;) {
      const rows = await SharedWorldStorage.rows(
        this.db,
        "SELECT generation AS generation FROM world_save WHERE generation > ? ORDER BY generation ASC LIMIT ?",
        [after, limit]
      );
      for (const { generation } of rows) {
        if (typeof generation !== "string" || generation < after) throw new Error("世界存档分块标识无效");
        if (generation !== after && canRetire(generation) && !known.has(generation)) generations.push(generation);
        after = generation;
      }
      if (rows.length < limit) return generations;
    }
  }
  private retirementList(
    baseline: Baseline,
    unreferenced: string[],
    pinned: ReadonlySet<string>,
    previous?: Head
  ): RetiredGeneration[] {
    const retired = new Set(unreferenced);
    for (const { ref } of this.baseline.values()) retired.add(ref.revision);
    for (const { ref } of baseline.values()) retired.delete(ref.revision);
    if (previous) retired.add(previous.revision);
    for (const revision of pinned) retired.delete(revision);
    const collection = this.collection;
    const remaining =
      collection?.retired
        .slice(collection.collected)
        .map(([after, revision]): RetiredGeneration => [after || collection.notBefore, revision]) ?? [];
    for (const revision of retired) remaining.push([0, revision]);
    return remaining;
  }

  // A cursor belongs to one immutable index. A delayed write can only update its own
  // cursor, and retiring that index also removes its cursor.
  private async recordProgress(state: Collection, count: number) {
    const id = "gc-" + state.revision;
    const payload = JSON.stringify({ count, notBefore: this.db.persistentTime ? state.notBefore : undefined });
    const updated = await this.execute("UPDATE world_save SET payload = ? WHERE id = ?", [payload, id]);
    if (!updated && !this.closed && this.collection === state)
      await this.execute(insert, [id, state.revision, -1, payload]);
  }

  private setCollection(revision: string, retired: RetiredGeneration[], restoreCursor: boolean, collected = 0) {
    this.collection = retired.length
      ? {
          head: this.head!,
          revision,
          retired,
          restoreCursor,
          notBefore: 0,
          clockTime: 0,
          observedAt: 0,
          collected,
          retryAt: 0
        }
      : undefined;
  }

  private async maintain(state: Collection) {
    if (state.restoreCursor) {
      const rows = await SharedWorldStorage.rows(this.db, selectHead, ["gc-" + state.revision]);
      let progress;
      try {
        progress = rows.length ? JSON.parse(String(rows[0].payload)) : undefined;
      } catch {
        // The immutable index still owns every retirement. Replay it after a fresh grace period.
      }
      if (
        Number.isSafeInteger(progress?.count) &&
        progress.count >= 0 &&
        progress.count <= state.retired.length
      ) {
        if (this.db.persistentTime && Number.isSafeInteger(progress.notBefore) && progress.notBefore > 0)
          state.notBefore = progress.notBefore;
        state.collected = progress.count;
        state.recordedCount = progress.count;
      }
      state.restoreCursor = false;
    }
    if (this.closed || this.collection !== state) return;
    const first = state.retired[state.collected];
    if (first) {
      const now = this.db.persistentTime ? await this.db.persistentTime() : performance.now();
      state.notBefore ||= now + retentionMs;
      state.clockTime = now;
      state.observedAt = performance.now();
    }
    if (this.closed || this.collection !== state) return;
    if ((await SharedWorldStorage.readHead(this.db, this.lifetime.signal)) !== state.head) {
      state.superseded = true;
      return;
    }
    if (this.closed || this.collection !== state) return;
    if (first && (first[0] || state.notBefore) <= state.clockTime) {
      const live = new Set([...this.baseline.values()].map(({ ref }) => ref.revision));
      live.add(state.revision);
      if (this.checkpoint?.pinned) live.add(this.checkpoint.pinned.revision);
      const stop = Math.min(state.collected + cleanupBatchSize, state.retired.length);
      while (state.collected < stop && !this.closed && this.collection === state) {
        const [after, revision] = state.retired[state.collected];
        if ((after || state.notBefore) > state.clockTime) break;
        if (!live.has(revision)) {
          try {
            await this.execute(removeParts, [revision]);
          } catch (error) {
            state.retryAt = performance.now() + 5000;
            console.warn("旧分块删除失败，将保留回收进度", error);
            break;
          }
        }
        // A new publication can inherit this in-flight delete. Advance only its matching entry.
        const current = this.collection;
        if (current && current.retired[current.collected]?.[1] === revision) current.collected++;
      }
    }
    const count = state.collected;
    if (!this.closed && this.collection === state && state.recordedCount !== count) {
      await this.recordProgress(state, count);
      state.recordedCount = count;
    }
  }

  private scheduleMaintenance() {
    clearTimeout(this.cleanupTimer);
    const state = this.collection;
    if (this.closed || this.deferredWrites || this.collecting || !state || state.superseded) return;
    const next = state.retired[state.collected];
    if (!next && state.recordedCount === state.collected) return;
    const due = next && state.recordedCount === state.collected ? next[0] || state.notBefore : 0;
    const now = performance.now();
    // Local elapsed time only schedules a check. It never authorizes a hosted delete.
    const delay = Math.max(0, due ? due - state.clockTime - (now - state.observedAt) : 0, state.retryAt - now);
    this.cleanupTimer = setTimeout(
      async () => {
        this.collecting = true;
        try {
          await this.maintain(state);
        } catch (error) {
          if (this.closed) return;
          state.retryAt = performance.now() + 5000;
          console.warn("世界存档回收将在后台重试", error);
        } finally {
          this.collecting = false;
          this.scheduleMaintenance();
        }
      },
      Math.min(delay, 2_147_483_647)
    );
  }

  private accept(publication: Publication) {
    this.head = publication.head;
    this.baseline = publication.baseline;
    // Deletes acknowledged during staging or a timed-out head switch belong to the inherited prefix.
    const collected = (this.collection?.collected ?? 0) - publication.retiredOffset;
    this.checkpoint = parseStoredHead(publication.head);
    this.setCollection(this.checkpoint.revision, publication.retired, false, collected);
    this.scheduleMaintenance();
    this.pending = undefined;
  }
  /** Keep startup migrations and maintenance from changing a checkpoint until its project has opened. */
  deferWrites(): () => void {
    let resume!: () => void;
    this.deferredWrites = new Promise<void>((resolve) => { resume = resolve; });
    return () => {
      this.deferredWrites = undefined;
      resume();
      this.scheduleMaintenance();
    };
  }

  async save(_id: string, pack: RuntimeProjectPackage) {
    if (!this.loaded || this.readOnly || this.closed) throw new Error("当前会话不能保存世界");
    const identity = this.identityFromProject?.(pack) ?? this.identity;
    const files = captureFiles(pack, this.baseline, this.published);
    const index: FileIndex = { version: pack.version, hasDocuments: pack.documents !== undefined, files: [] };
    if (this.deferredWrites) await abortable(this.deferredWrites, this.lifetime.signal);
    try {
      await this.publish(files, index, identity);
    } catch (error) {
      this.reconcileGenerations = true;
      throw error;
    }
  }

  private async publish(files: Map<string, Content>, index: FileIndex, identity: WorldIdentity) {
    const remote = await SharedWorldStorage.readHead(this.db);
    if (this.pending && remote === this.pending.head) {
      this.accept(this.pending);
    } else {
      if (remote !== this.head) throw new Error("另一会话已保存世界，请重新打开");
      // Resolve the original conditional write before staging the latest edits.
      if (this.pending) await this.confirmPublication(this.pending);
    }
    const baseline: Baseline = new Map();
    const row = this.head === undefined ? undefined : parseStoredHead(this.head);
    if (row && appVersionNumber(row.appVersion) > this.appVersion)
      throw new Error("另一会话已保存世界，请重新打开");
    const previous = row && parseHead(row).checkpoint;
    const previousSequence = row && appVersionNumber(row.appVersion) === this.appVersion ? row.sequence : undefined;
    const newVersion = previousSequence === undefined;
    const sequence = (previousSequence ?? 0) + 1;
    if (sequence > 0x7fffffff) throw new Error("此版本存档已达到提交上限，请打开新版本");
    const existingPins = await this.readPins(row?.pinned);
    const pinned = row?.sequence && newVersion ? await this.archivePrevious(row, existingPins) : existingPins;
    const unreferenced = this.reconcileGenerations ? await this.unreferencedGenerations(pinned, previous, row?.pinned) : [];
    this.reconcileGenerations = false;
    const staged: string[] = [];
    let next: string;
    let retired: RetiredGeneration[];
    let retiredOffset: number;
    try {
      for (const [key, content] of files) {
        let entry = this.baseline.get(key);
        if (!entry || !sameRuntimeProjectContent(entry.content, content)) {
          // TextEncoder replaces lone UTF-16 surrogates. Preserve these legacy JS strings losslessly.
          const encoding =
            typeof content !== "string" ? "binary" : /[\uD800-\uDFFF]/u.test(content) ? "json-string" : "utf8";
          const source = encoding === "json-string" ? JSON.stringify(content) : content;
          const text = typeof source === "string" ? source : undefined;
          const bytes = typeof source === "string" ? utf8.encode(source) : source;
          const ref = await this.stage(bytes, await sha256(bytes), staged, text);
          entry = { content, ref: { ...ref, encoding } };
        }
        baseline.set(key, entry);
        index.files.push([key, entry.ref]);
      }
      index.files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const indexText = JSON.stringify(index);
      const bytes = utf8.encode(indexText);
      const digest = await sha256(bytes);
      if (
        !newVersion &&
        !unreferenced.length &&
        previous &&
        previous.seed === identity.seed &&
        previous.template === identity.template &&
        (previous.contentDigest ?? previous.digest) === digest
      ) return;
      retiredOffset = this.collection?.collected ?? 0;
      retired = this.retirementList(baseline, unreferenced, pinned, previous);
      let pinRef = row?.pinned;
      if (pinned !== existingPins) {
        const pinText = JSON.stringify([...pinned]);
        const pinBytes = utf8.encode(pinText);
        const nextPinRef = await this.stage(pinBytes, await sha256(pinBytes), staged, pinText);
        const oldPins = pinRef?.revision;
        if (oldPins && !retired.some(([, revision]) => revision === oldPins)) retired.push([0, oldPins]);
        pinRef = nextPinRef;
      }
      // A local session keeps its deadlines in memory. A future browser session
      // can load its acknowledged progress, then observe a fresh grace period.
      if (retired.length)
        index.retired = this.db.persistentTime ? retired : retired.map(([, revision]) => [0, revision]);
      const extended = retired.length;
      const text = extended ? JSON.stringify(index) : indexText;
      const data = extended ? utf8.encode(text) : bytes;
      const ref = await this.stage(data, extended ? await sha256(data) : digest, staged, text);
      if (newVersion) await this.reserveArchive(this.appVersion);
      next = JSON.stringify({
        ...identity,
        format: 2,
        engineVersion: WORLD_SAVE_VERSION,
        appVersion: String(this.appVersion),
        sequence,
        ...(pinRef ? { pinned: pinRef } : {}),
        contentDigest: digest,
        ...ref
      } satisfies Head);
    } catch (error) {
      for (const revision of staged) await this.cleanup(revision);
      throw error;
    }
    this.pending = { head: next, baseline, retired, retiredOffset };
    await this.confirmPublication(this.pending);
  }

  private async confirmPublication(publication: Publication) {
    const previous = this.head;
    const next = publication.head;
    try {
      const changed =
        previous === undefined
          ? await this.execute(insert, ["world", "head", -1, next])
          : await this.execute("UPDATE world_save SET payload = ? WHERE id = ? AND payload = ?", [
              next,
              "world",
              previous
            ]);
      if (changed !== 1) throw new Error("世界存档索引未更新");
    } catch (error) {
      // A zero-row retry or duplicate initial INSERT can mean the first request already committed.
      const actual = await SharedWorldStorage.readHead(this.db);
      if (actual !== next) {
        if (actual !== previous) throw new Error("另一会话已保存世界，请重新打开");
        throw error;
      }
    }
    this.accept(publication);
  }
  private async cleanup(revision: string) {
    try {
      await this.execute(removeParts, [revision]);
    } catch (error) {
      console.warn("世界存档分块清理失败", error);
    }
  }
  close() {
    this.lifetime.abort();
    clearTimeout(this.cleanupTimer);
    this.compression.close();
  }
}
