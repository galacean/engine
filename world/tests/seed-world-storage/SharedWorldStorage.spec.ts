import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedWorldStorage, type WorldDb } from "../../demos/seed-world/storage/SharedWorldStorage";
import { PublishedWorldAssets } from "../../demos/seed-world/storage/PublishedWorldAssets";
import { resolveStorageHost } from "../../demos/seed-world/storage/SeedWorldStorageHost";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

const schema = readFileSync(new URL("../../demos/seed-world/storage/world_save.sql", import.meta.url), "utf8");
const identity = { template: "original", seed: 1223 };
const connections: DatabaseSync[] = [];
const stores: SharedWorldStorage[] = [];
function useStorageClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}
afterEach(() => {
  for (const storage of stores.splice(0)) storage.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const sql of connections.splice(0)) sql.close();
});

function instance() {
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  sql.exec(schema);
  sql.exec(
    "CREATE TRIGGER payload_size BEFORE INSERT ON world_save WHEN length(NEW.payload)>100000 BEGIN SELECT RAISE(ABORT,'payload too large'); END"
  );
  sql.exec(
    "CREATE TRIGGER payload_update_size BEFORE UPDATE ON world_save WHEN length(NEW.payload)>100000 BEGIN SELECT RAISE(ABORT,'payload too large'); END"
  );
  const db: WorldDb = {
    query: vi.fn(async ({ sql: statement, binds }) => ({ success: true, data: sql.prepare(statement).all(...binds) })),
    execute: vi.fn(async ({ sql: statement, binds }) => ({
      success: true,
      data: { rowsAffected: Number(sql.prepare(statement).run(...binds).changes) }
    })),
    role: vi.fn(async () => ({ role: "MANAGER" })),
    persistentTime: async () => Date.now()
  };
  const open = async (readOnly = false, version = "1") => {
    const storage = await SharedWorldStorage.open(db, readOnly, version, identity);
    stores.push(storage);
    return storage;
  };
  return { sql, db, open };
}
function versions(sql: DatabaseSync) {
  sql.exec("ALTER TABLE world_save ADD COLUMN app_version INT NOT NULL DEFAULT 1");
  return async (version: number, readOnly = false) => {
    const visible = (statement: string) => statement.replace(
      / WHERE (.+?)( ORDER BY | LIMIT |$)/,
      (_, condition, suffix) => ' WHERE (' + condition + ') AND app_version <= ' + version + suffix
    );
    const db: WorldDb = {
      query: async ({ sql: statement, binds }) => ({ success: true, data: sql.prepare(visible(statement)).all(...binds) }),
      execute: async ({ sql: statement, binds }) => ({
        success: true,
        data: { rowsAffected: Number(statement.startsWith("INSERT")
          ? sql.prepare("INSERT INTO world_save VALUES (?, ?, ?, ?, ?)").run(...binds, version).changes
          : sql.prepare(visible(statement)).run(...binds).changes) }
      }),
      role: async () => ({ role: "MANAGER" }),
      persistentTime: async () => Date.now()
    };
    const storage = await SharedWorldStorage.open(db, readOnly, String(version), identity);
    stores.push(storage);
    return storage;
  };
}

// Incompressible, printable and deterministic so the DB boundary is actually exercised.
function noise(length: number) {
  return Array.from({ length: Math.ceil(length / 43) }, (_, i) =>
    createHash("sha256").update(String(i)).digest("base64url")
  )
    .join("")
    .slice(0, length);
}
function project(text = "世界 🪴"): RuntimeProjectPackage {
  return {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "entry.scene",
      files: [
        { virtualPath: "entry.scene", type: "Scene", path: "https://example.com/entry.scene", dependencies: [] },
        { virtualPath: "tile.bin", type: "Mesh", path: "https://example.com/tile.bin", dependencies: [] }
      ]
    },
    contents: { "entry.scene": text, "tile.bin": new Uint8Array([0, 254, 255]) },
    documents: { "tile.bin.meta": '{"summary":"地图","usage":"玩家"}' }
  };
}
function stored(pack: RuntimeProjectPackage): RuntimeProjectPackage {
  const result = structuredClone(pack);
  for (const file of result.project.files) {
    if (Object.hasOwn(result.contents, file.virtualPath))
      file.path = "lingguang://world/files/" + file.virtualPath.split("/").map(encodeURIComponent).join("/");
  }
  return result;
}

// Format 1 wrote the entire package as gzip(JSON), wrapping each binary asset as {bytes: base64}.
function seedLegacy(sql: DatabaseSync, pack: RuntimeProjectPackage) {
  const revision = randomUUID();
  const contents = Object.fromEntries(
    Object.entries(pack.contents).map(([key, value]) => [
      key,
      typeof value === "string" ? value : { bytes: Buffer.from(value).toString("base64") }
    ])
  );
  const raw = JSON.stringify({ ...pack, contents });
  const head = {
    ...identity,
    format: 1,
    engineVersion: 12,
    appVersion: "1",
    revision,
    parts: 1,
    digest: createHash("sha256").update(raw).digest("hex")
  };
  const insert = sql.prepare("INSERT INTO world_save VALUES (?,?,?,?)");
  insert.run(revision + "-0", revision, 0, gzipSync(raw).toString("base64"));
  insert.run("world", "head", -1, JSON.stringify(head));
}

function refs(sql: DatabaseSync) {
  const head = JSON.parse(String(sql.prepare("SELECT payload FROM world_save WHERE id='world'").get()!.payload));
  expect(head.format).toBe(2);
  const rows = sql.prepare("SELECT payload FROM world_save WHERE generation=? AND part_no>=0 ORDER BY part_no").all(head.revision);
  const index = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(String(r.payload), "base64")))).toString()
  );
  return new Map<string, { revision: string }>(index.files);
}

describe("Lingguang shared world checkpoints", () => {
  it.each(["failure", "close"])("stops other file reads on restore %s", async (mode) => {
    const { db, sql, open } = instance();
    const owner = await open();
    await owner.load();
    const pack = project();
    pack.documents = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(i), String(i)]));
    await owner.save("", pack);
    const files = new Set([...refs(sql).values()].map((ref) => ref.revision));
    const reader = await open(true);
    const query = db.query;
    const pending: Array<{ resolve(): void; reject(error: Error): void }> = [];
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    let reads = 0;
    db.query = async (req) => {
      if (files.has(String(req.binds[0])) && ++reads <= 4) {
        await new Promise<void>((resolve, reject) => {
          pending.push({ resolve, reject });
          if (pending.length === 4) ready();
        });
      }
      return query(req);
    };
    const restore = reader.load();
    await started;
    try {
      if (mode === "failure") {
        pending[0].reject(new Error("read timeout"));
        await expect(restore).rejects.toThrow("read timeout");
      } else {
        reader.close();
        await expect(restore).rejects.toMatchObject({ name: "AbortError" });
      }
    } finally {
      for (const request of pending) request.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toBe(4);
  });

  it.each([false, true])("round-trips large saves after transfer (worker failure: %s)", async (fail) => {
    useStorageClock();
    const terminate = vi.fn();
    const created = vi.fn();
    const transfer = vi.fn();
    class TestWorker {
      onmessage!: (event: { data: unknown }) => void;
      onerror!: () => void;
      terminate = terminate;
      constructor() {
        created();
      }
      postMessage(job: { id: number; input: Uint8Array }, buffers: ArrayBuffer[]) {
        const { id, input } = structuredClone(job, { transfer: buffers });
        expect(job.input.byteLength).toBe(0);
        transfer();
        queueMicrotask(() => {
          if (fail) this.onerror();
          else this.onmessage({ data: { id, gzip: gzipSync(input) } });
        });
      }
    }
    vi.stubGlobal("Worker", TestWorker);
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    const pack = project();
    await owner.save("", pack);
    expect(created).not.toHaveBeenCalled();
    pack.contents["entry.scene"] = "夜".repeat(100000);
    pack.contents["tile.bin"] = new Uint8Array(300000).fill(155);
    await owner.save("", pack);
    pack.contents["entry.scene"] += "晚";
    await owner.save("", pack);
    vi.mocked(db.execute).mockClear();
    await owner.save("", pack);
    expect(db.execute).not.toHaveBeenCalled();
    const visitor = await open(true);
    const restored = await visitor.load();
    expect(restored?.contents["entry.scene"]).toBe(pack.contents["entry.scene"]);
    expect(
      Buffer.from(restored!.contents["tile.bin"] as Uint8Array).equals(pack.contents["tile.bin"] as Uint8Array)
    ).toBe(true);
    visitor.close();
    expect(created).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledTimes(fail ? 1 : 3);
    owner.close();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("resaves a full checkpoint as references, preserving overwrites, local assets and documents", async () => {
    const { db, open, sql } = instance();
    const pack = project("published scene");
    const [scene, mesh] = pack.project.files;
    const local = { virtualPath: "World/Editor.json", path: "runtime-world:editor", type: "JSON" };
    pack.project.files.push(local);
    pack.contents[local.virtualPath] = "21:00";
    seedLegacy(sql, pack);
    expect(await (await open(true)).load()).toEqual(pack);

    const published = new PublishedWorldAssets(new Map([[scene.path, "published scene"]]), () => false);
    const owner = await SharedWorldStorage.open(db, false, "2", identity, published);
    const restored = (await owner.load())!;
    published.recordRead(mesh, restored.contents[mesh.virtualPath]);
    await owner.save("", restored);
    const sparse = (await (await open(true, "2")).load())!;
    expect(sparse.contents).toEqual({ [local.virtualPath]: "21:00" });
    expect(sparse.project).toEqual(stored({ ...pack, contents: { [local.virtualPath]: "21:00" } }).project);
    expect(sparse.documents).toEqual(pack.documents);
    expect(restored).toEqual(pack);

    restored.contents[scene.virtualPath] = "edited scene at original URL";
    (restored.contents[mesh.virtualPath] as Uint8Array)[0] = 99;
    await owner.save("", restored);
    expect((await (await open(true, "2")).load())!.contents).toEqual(restored.contents);
    restored.project.files[0].path += "?v=2";
    restored.contents[scene.virtualPath] = "published scene";
    expect(published.overrides(restored)[scene.virtualPath]).toBe("published scene");
  });

  it("writes only a changed file and the version index on a second edit; rename and delete retire old entries", async () => {
    const { sql, open, db } = instance();
    const writer = await open();
    await writer.load();
    const pack = project();
    await writer.save("", pack);
    const before = refs(sql);
    vi.mocked(db.execute).mockClear();
    pack.contents["entry.scene"] = "night";
    await writer.save("", pack);
    const after = refs(sql);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [key, ref] of before) {
      if (key === "lingguang://world/files/entry.scene") expect(after.get(key)).not.toEqual(ref);
      else expect(after.get(key)).toEqual(ref);
    }
    expect(vi.mocked(db.execute).mock.calls.filter(([r]) => r.sql.startsWith("INSERT") && !String(r.binds[0]).startsWith("gc-"))).toHaveLength(2);
    const again = await open();
    const restored = (await again.load())!;
    vi.mocked(db.execute).mockClear();
    await again.save("", restored);
    expect(db.execute).not.toHaveBeenCalled();
    restored.project.files[1].virtualPath = "外部/#x %?.bin";
    restored.contents["外部/#x %?.bin"] = restored.contents["tile.bin"];
    delete restored.contents["tile.bin"];
    delete restored.documents!["tile.bin.meta"];
    await again.save("", restored);
    expect((await (await open()).load())!.project.files[1].path).toBe(
      "lingguang://world/files/%E5%A4%96%E9%83%A8/%23x%20%25%3F.bin"
    );
    const keys = refs(sql);
    expect(keys.has("lingguang://world/files/tile.bin")).toBe(false);
    expect(keys.has("document:tile.bin.meta")).toBe(false);
  });

  it("publishes a matching manifest and file set when a visitor opens between independent DB requests", async () => {
    const { open, db, sql } = instance();
    const owner = await open();
    await owner.load();
    const pack = project("day");
    await owner.save("", pack);
    const execute = db.execute;
    let observed = false;
    db.execute = async (req) => {
      if (req.sql.startsWith("UPDATE") && !observed) {
        observed = true;
        const reader = (await (await open(true)).load())!;
        expect(reader.contents["entry.scene"]).toBe("day");
        expect(reader.contents["tile.bin"]).toEqual(new Uint8Array([0, 254, 255]));
      }
      return execute(req);
    };
    pack.contents["entry.scene"] = "night";
    const bytes = new Uint8Array([7, 9]);
    pack.contents["tile.bin"] = bytes;
    const saving = owner.save("", pack);
    bytes.fill(0);
    pack.contents["entry.scene"] = "later edit";
    await saving;
    expect(observed).toBe(true);
    const reopened = (await (await open(true)).load())!;
    expect(reopened.contents["entry.scene"]).toBe("night");
    expect(reopened.contents["tile.bin"]).toEqual(new Uint8Array([7, 9]));
    // Returning to a published URL removes the overwrite from the index.
    delete pack.contents["tile.bin"];
    await owner.save("", pack);
    expect(refs(sql).has("lingguang://world/files/tile.bin")).toBe(false);
    const reset = (await (await open(true)).load())!;
    expect(reset.project.files[1].path).toBe("https://example.com/tile.bin");
    expect(reset.contents["tile.bin"]).toBeUndefined();
  });

  it("fences a late timed-out write when the user reverts to the last saved version", async () => {
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("original"));
    const execute = db.execute;
    let late: (() => ReturnType<WorldDb["execute"]>) | undefined;
    db.execute = async (req) => {
      if (req.sql.startsWith("UPDATE") && !late) {
        late = () => execute(req);
        throw Error("late write");
      }
      return execute(req);
    };
    await expect(owner.save("", project("unconfirmed"))).rejects.toThrow("late write");
    await owner.save("", project("original"));
    expect((await late!()).data?.rowsAffected).toBe(0);
    expect((await (await open(true)).load())!.contents["entry.scene"]).toBe("original");
  });

  it("omits a reproducible hierarchy conversion and retains an edit to the same prefab", () => {
    const pack = project();
    const file = pack.project.files[0];
    file.type = "Prefab";
    const raw = JSON.stringify({ version: "2.0", root: 0, entities: [{ name: "Oak" }], components: [], refs: [] });
    const converted = JSON.stringify({
      asset: { version: "2.0" },
      entities: [{ name: "Oak", id: file.virtualPath + ":entity:0" }],
      components: [],
      root: file.virtualPath + ":entity:0"
    });
    const published = new PublishedWorldAssets(new Map([[file.path, raw]]), () => false);
    pack.contents[file.virtualPath] = converted;
    expect(published.overrides(pack)[file.virtualPath]).toBeUndefined();
    pack.contents[file.virtualPath] = converted.replace("Oak", "Birch");
    expect(published.overrides(pack)[file.virtualPath]).toBe(pack.contents[file.virtualPath]);
  });

  it.each([99999, 100000, 100001, 480000])(
    "restores %i characters, UTF-8, binary and documents after a version upgrade",
    async (length) => {
      const { open, sql } = instance();
      const owner = await open();
      expect(await owner.load()).toBeUndefined();
      const data = project("\uFEFF山🌊" + noise(length));
      data.documents!["tile.bin.meta"] = "legacy \ud800";
      await owner.save("local-key", data);
      expect(sql.prepare("SELECT MAX(length(payload)) AS maximum FROM world_save").get()?.maximum).toBe(100000);
      const visitor = await open(true, "2");
      expect(await visitor.load()).toEqual(stored(data));
      await expect(visitor.save("different-key", data)).rejects.toThrow("不能保存");
    }
  );

  it("keeps the last snapshot visible to an older app after a newer app saves and collects", async () => {
    useStorageClock();
    const { sql } = instance();
    const openVersion = versions(sql);
    const v1 = await openVersion(1);
    await v1.load();
    await v1.save("", project("v1"));
    const v2 = await openVersion(2);
    expect(await v2.load()).toEqual(stored(project("v1")));
    await v2.save("", project("v2 first"));
    await expect(v1.save("", project("stale edit"))).rejects.toThrow("另一会话已保存");
    await v2.save("", project("v2 final"));
    await vi.advanceTimersByTimeAsync(300_010);
    const old = await openVersion(1);
    expect(old.readOnly).toBe(true);
    expect(await old.load()).toEqual(stored(project("v1")));
    await expect(old.save("", project("stale edit"))).rejects.toThrow("不能保存");
    expect(await (await openVersion(2, true)).load()).toEqual(stored(project("v2 final")));
    v2.close();
    const reopened = await openVersion(2);
    await reopened.load();
    await reopened.save("", project("v2 after reconciliation"));
    await vi.advanceTimersByTimeAsync(300_010);
    expect(await (await openVersion(1, true)).load()).toEqual(stored(project("v1")));
  });

  it("keeps the shared publication entry bounded across hundreds of versions", async () => {
    const { sql } = instance();
    const openVersion = versions(sql);
    for (let version = 1; version <= 350; version++) {
      const writer = await openVersion(version);
      await writer.load();
      await writer.save("", project(String(version)));
      writer.close();
    }
    const row = sql.prepare("SELECT length(payload) AS size FROM world_save WHERE id='world'").get()!;
    expect(Number(row.size)).toBeLessThan(1024);
    for (const version of [1, 17, 349, 350])
      expect(await (await openVersion(version, true)).load()).toEqual(stored(project(String(version))));
  }, 120_000);

  it("keeps the final committed snapshot when two upgrades try to seal different observations", async () => {
    const { db, sql, open } = instance();
    const old = await open();
    await old.load();
    await old.save("", project("first"));
    const delayed = await open(false, "2");
    await delayed.load();
    let sealReached!: () => void;
    let releaseSeal!: () => void;
    const atSeal = new Promise<void>(resolve => { sealReached = resolve; });
    const canSeal = new Promise<void>(resolve => { releaseSeal = resolve; });
    const execute = db.execute;
    let firstSeal = true;
    db.execute = async (request) => {
      if (firstSeal && request.sql.includes("part_no < ?")) {
        firstSeal = false;
        sealReached();
        await canSeal;
      }
      return execute(request);
    };
    const delayedResult = expect(delayed.save("", project("losing upgrade"))).rejects.toThrow("另一会话已保存");
    await atSeal;
    try {
      await old.save("", project("last"));
      const upgrade = await open(false, "3");
      await upgrade.load();
      await upgrade.save("", project("new"));
    } finally {
      releaseSeal();
    }
    await delayedResult;
    expect(await (await open(true)).load()).toEqual(stored(project("last")));
    expect(await (await open(true, "2")).load()).toEqual(stored(project("last")));
    expect(await (await open(true, "3")).load()).toEqual(stored(project("new")));
    expect(sql.prepare("SELECT count(*) AS count FROM world_save WHERE generation='archive'").get()!.count).toBe(3);
  });

  it("does not promote an older writer if restore has to retry through a frozen snapshot", async () => {
    useStorageClock();
    const { sql } = instance();
    const openVersion = versions(sql);
    const first = await openVersion(1);
    await first.load();
    await first.save("", project("first"));
    const old = await openVersion(1);
    await first.save("", project("last"));
    first.close();
    const upgrade = await openVersion(2);
    await upgrade.load();
    await upgrade.save("", project("new"));
    await vi.advanceTimersByTimeAsync(300_010);
    expect(await old.load()).toEqual(stored(project("last")));
    await expect(old.save("", project("stale edit"))).rejects.toThrow("另一会话已保存");
    expect(await (await openVersion(2, true)).load()).toEqual(stored(project("new")));
  });

  it("keeps history references live when regenerating an incompatible active checkpoint", async () => {
    useStorageClock();
    const { sql } = instance();
    const openVersion = versions(sql);
    const first = await openVersion(1);
    await first.load();
    await first.save("", project("archived"));
    first.close();
    const second = await openVersion(2);
    await second.load();
    await second.save("", project("incompatible"));
    second.close();
    sql.exec("UPDATE world_save SET payload=json_set(payload,'$.engineVersion',999) WHERE id='world'");
    const restore = await openVersion(2);
    expect(await restore.load()).toBeUndefined();
    await restore.save("", project("regenerated"));
    await vi.advanceTimersByTimeAsync(300_010);
    const reopened = await openVersion(2);
    expect(await reopened.load()).toEqual(stored(project("regenerated")));
    await reopened.save("", project("latest"));
    expect(await (await openVersion(1, true)).load()).toEqual(stored(project("archived")));
  });

  it("authorizes expiration using database time even after device clocks change and the progress row is lost", async () => {
    useStorageClock();
    const { db, sql, open } = instance();
    let dbTime = Date.now();
    db.persistentTime = async () => dbTime;
    const author = await open();
    await author.load();
    await author.save("", project("A"));
    const oldRevision = refs(sql).get("lingguang://world/files/entry.scene")!.revision;
    const visitor = await open(true);
    await author.save("", project("B"));
    await vi.advanceTimersByTimeAsync(1);
    await author.save("", project("C"));
    author.close();
    sql.exec("DELETE FROM world_save WHERE id LIKE 'gc-%'");
    vi.setSystemTime(Date.now() + 360_000);
    const reopened = await open();
    expect(await reopened.load()).toEqual(stored(project("C")));
    await vi.advanceTimersByTimeAsync(300_001);
    const oldChunk = () => sql.prepare("SELECT id FROM world_save WHERE generation=?").get(oldRevision);
    expect(oldChunk()).toBeDefined();
    expect(await visitor.load()).toEqual(stored(project("A")));
    dbTime += 300_001;
    await vi.advanceTimersByTimeAsync(301_000);
    expect(oldChunk()).toBeUndefined();
  });

  it("reopens standalone saves without persisting session-relative deadlines", async () => {
    useStorageClock();
    const { db, open, sql } = instance();
    delete db.persistentTime;
    vi.spyOn(performance, "now").mockReturnValue(4.25);
    const author = await open();
    await author.load();
    await author.save("", project("A"));
    await author.save("", project("B"));
    await vi.advanceTimersByTimeAsync(1);
    await author.save("", project("C"));
    author.close();
    const reopened = await open();
    expect(await reopened.load()).toEqual(stored(project("C")));
    const cursor = sql.prepare("SELECT payload FROM world_save WHERE id LIKE 'gc-%'").get()!;
    expect(JSON.parse(String(cursor.payload))).toEqual({ count: 0 });
  });

  it("publishes the identity of the captured project and opens it under that identity", async () => {
    const { db } = instance();
    const next = { seed: 124, template: "low-poly" };
    const writer = await SharedWorldStorage.open(db, false, "1", identity, undefined, undefined, (pack) =>
      JSON.parse(String(pack.contents["entry.scene"]))
    );
    stores.push(writer);
    await writer.load();
    await writer.save("", project(JSON.stringify(identity)));
    const changed = project(JSON.stringify(next));
    await writer.save("", changed);
    expect((await SharedWorldStorage.select(db, "1"))?.identity).toEqual(next);
    await expect(SharedWorldStorage.open(db, false, "1", identity)).rejects.toThrow("世界已更新");
    const reopened = await SharedWorldStorage.open(db, false, "1", next);
    stores.push(reopened);
    expect(await reopened.load()).toEqual(stored(changed));
  });

  it("splits a large project.json and rejects a missing file while its index remains readable", async () => {
    const { open, sql, db } = instance();
    const pack = project();
    pack.project.files[0].params = { description: noise(240001) };
    const writer = await open();
    await writer.load();
    await writer.save("", pack);
    const index = refs(sql);
    const manifest = index.get("project.json")!;
    const row = sql
      .prepare("SELECT COUNT(*) AS parts, MAX(length(payload)) AS largest FROM world_save WHERE generation=?")
      .get(manifest.revision)!;
    expect(Number(row.parts)).toBeGreaterThan(1);
    expect(Number(row.largest)).toBe(100000);
    expect(await (await open(true)).load()).toEqual(stored(pack));
    sql
      .prepare("DELETE FROM world_save WHERE generation=?")
      .run(index.get("lingguang://world/files/tile.bin")!.revision);
    vi.mocked(db.execute).mockClear();
    await expect((await open(true)).load()).rejects.toThrow("分块缺失");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("opens two new instances independently and leaves the source world intact", async () => {
    const source = instance();
    const owner = await source.open();
    await owner.load();
    await owner.save("", project("A"));
    for (const entry of ["召回", "模板创建"]) {
      const clone = instance();
      expect((await SharedWorldStorage.select(clone.db, "1")).raw).toBeUndefined();
      const own = await clone.open();
      expect(await own.load()).toBeUndefined();
      await own.save("", project(entry));
      expect(await (await clone.open()).load()).toEqual(stored(project(entry)));
    }
    expect(await (await source.open(true)).load()).toEqual(stored(project("A")));
  });

  it("retains the previous publication after a partial write and allows retry", async () => {
    const { db, open, sql } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("first"));
    const oldRows = sql.prepare("SELECT * FROM world_save ORDER BY id").all();
    const execute = db.execute;
    let fail = true;
    db.execute = async (req) => {
      if (fail && req.binds[2] === 1) {
        fail = false;
        return { success: false, message: "offline" };
      }
      return execute(req);
    };
    const large = project(noise(240000));
    await expect(owner.save("", large)).rejects.toThrow("offline");
    expect(sql.prepare("SELECT * FROM world_save ORDER BY id").all()).toEqual(oldRows);
    expect(await (await open(true)).load()).toEqual(stored(project("first")));
    await owner.save("", large);
    expect(await (await open()).load()).toEqual(stored(large));
  });

  it("recognizes a published revision after a lost reply and drops redundant writes", async () => {
    const { db, open } = instance();
    const owner = await open();
    await owner.load();
    const execute = db.execute;
    db.execute = async (req) => {
      const result = await execute(req);
      if (req.binds[0] === "world") throw Error("lost response");
      return result;
    };
    await owner.save("", project());
    const writes = vi.mocked(execute).mock.calls.length;
    await owner.save("", project());
    expect(execute).toHaveBeenCalledTimes(writes);
    expect(await (await open()).load()).toEqual(stored(project()));
  });

  it("keeps staged chunks if the head request times out before the server applies it", async () => {
    const { db, open } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("before"));
    const execute = db.execute;
    let complete!: () => Promise<unknown>;
    db.execute = async (req) => {
      if (req.sql.startsWith("UPDATE")) {
        complete = () => execute(req);
        throw new Error("timeout");
      }
      return execute(req);
    };
    await expect(owner.save("", project("after"))).rejects.toThrow("timeout");
    expect(await (await open(true)).load()).toEqual(stored(project("before")));
    await complete();
    expect(await (await open(true)).load()).toEqual(stored(project("after")));
    await owner.save("", project("after"));
  });

  it.each(["before", "during", "after", "never", "unchanged", "initial"])(
    "reuses the timed-out publication and flushes the latest session edit (%s)",
    async (timing) => {
      const { open, db } = instance();
      const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/", {
        storage: await open()
      });
      const edit = (revision: number) => session.update(pack => ({
        ...pack,
        contents: {
          ...pack.contents,
          "entry.scene": JSON.stringify({ asset: { version: "2.0" }, revision }),
          "tile.bin": new Uint8Array([revision])
        }
      }));
      try {
        if (timing !== "initial") {
          await edit(1);
          await session.flush();
        }
        const execute = db.execute;
        let delayed: Parameters<WorldDb["execute"]>[0] | undefined;
        let attempts = 0;
        db.execute = async req => {
          if (req.binds[0] === "world" || req.binds[1] === "world") {
            attempts++;
            if (!delayed) {
              delayed = req;
              throw Error("lost before acknowledgement");
            }
            if (attempts === 2 && timing !== "before") {
              expect(req).toEqual(delayed);
              if (["during", "unchanged", "initial"].includes(timing))
                expect((await execute(delayed)).data?.rowsAffected).toBe(1);
            }
          }
          return execute(req);
        };
        await edit(2);
        await expect(session.flush()).rejects.toThrow("lost before acknowledgement");
        if (timing === "before") await execute(delayed!);
        const latest = timing === "unchanged" ? 2 : 3;
        if (latest === 3) await edit(latest);
        await session.flush();
        if (timing === "after") expect((await execute(delayed!)).data?.rowsAffected).toBe(0);
        expect(session.persistenceStatus.state).toBe("saved");
        const restored = (await (await open(true)).load())!;
        expect(JSON.parse(String(restored.contents["entry.scene"])).revision).toBe(latest);
        expect(restored.contents["tile.bin"]).toEqual(new Uint8Array([latest]));
      } finally {
        session.dispose();
      }
    }
  );

  it("preserves an unknown head when retrying a timed-out publication", async () => {
    const { open, db } = instance();
    const writer = await open();
    await writer.load();
    await writer.save("", project("A"));
    const execute = db.execute;
    let late!: () => ReturnType<WorldDb["execute"]>;
    db.execute = async req => {
      if (req.binds[1] === "world") {
        late = () => execute(req);
        throw Error("switch timed out");
      }
      return execute(req);
    };
    await expect(writer.save("", project("B"))).rejects.toThrow("switch timed out");
    db.execute = execute;
    const other = await open();
    await other.load();
    await other.save("", project("independent edit"));
    await expect(writer.save("", project("C"))).rejects.toThrow("另一会话已保存世界");
    expect((await late()).data?.rowsAffected).toBe(0);
    expect(await (await open(true)).load()).toEqual(stored(project("independent edit")));
  });

  it("reconciles an interrupted first save, including a generation missing its first block", async () => {
    useStorageClock();
    const { open, sql, db } = instance();
    const put = sql.prepare("INSERT INTO world_save VALUES (?,?,?,?)");
    const partial = randomUUID();
    for (let part = 1; part <= 101; part++) put.run(partial + "-" + part, partial, part, "partial");
    const owner = await open();
    expect(await owner.load()).toBeUndefined();
    await owner.save("", project("A"));
    const hasPartial = () => !!sql.prepare("SELECT id FROM world_save WHERE generation=? LIMIT 1").get(partial);
    expect(hasPartial()).toBe(true);
    vi.mocked(db.query).mockClear();
    await owner.save("", project("B"));
    expect(vi.mocked(db.query).mock.calls.some(([req]) => req.sql.includes("generation > ?"))).toBe(false);
    await vi.advanceTimersByTimeAsync(300_001);
    expect(hasPartial()).toBe(false);
    expect(await (await open(true)).load()).toEqual(stored(project("B")));
  });

  it.each([true, false])("retires unpublished chunks only after fencing a late head update (reopen: %s)", async (reopen) => {
    useStorageClock();
    const { open, db, sql } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const generations = () => sql.prepare("SELECT generation FROM world_save WHERE part_no=0 AND generation<>\'archive\'").all().map(row => row.generation);
    const original = new Set(generations());
    const execute = db.execute;
    let late!: () => ReturnType<WorldDb["execute"]>;
    db.execute = async (req) => {
      if (req.binds[1] === "world") {
        late = () => execute(req);
        throw Error("head timed out");
      }
      return execute(req);
    };
    await expect(owner.save("", project("B"))).rejects.toThrow("head timed out");
    const staged = generations().filter(revision => !original.has(revision));
    expect(staged).toHaveLength(2);
    db.execute = execute;
    if (reopen) owner.close();
    const recovery = reopen ? await open() : owner;
    if (reopen) expect(await recovery.load()).toEqual(stored(project("A")));
    await recovery.save("", project("A"));
    expect((await late()).data?.rowsAffected).toBe(0);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(generations()).toEqual(expect.arrayContaining(staged));
    await vi.advanceTimersByTimeAsync(1);
    expect(generations().filter(revision => staged.includes(revision))).toHaveLength(0);
    expect(await (await open(true)).load()).toEqual(stored(project("A")));
  });

  it("drains expired generations across six-second farm checkpoints and slow deletes", async () => {
    useStorageClock();
    const { open, db, sql } = instance();
    const owner = await open();
    await owner.load();
    const generations = () => sql.prepare("SELECT generation FROM world_save WHERE part_no=0 AND generation<>\'archive\'").all().map(r => String(r.generation));
    for (let i = 0; i < 10; i++) {
      await owner.save("", project(String(i)));
      await vi.advanceTimersByTimeAsync(6000);
    }
    const live = new Set([...refs(sql).values()].map(ref => ref.revision));
    const head = sql.prepare("SELECT payload FROM world_save WHERE id='world'").get()!;
    live.add(JSON.parse(String(head.payload)).revision);
    const expired = generations().filter(id => !live.has(id));
    expect(expired).toHaveLength(18);
    owner.close();
    await vi.advanceTimersByTimeAsync(300_001);

    const execute = db.execute;
    const deleted: string[] = [];
    db.execute = async req => {
      if (req.sql.startsWith("DELETE")) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        deleted.push(String(req.binds[0]));
      }
      return execute(req);
    };
    const resumed = await open();
    await resumed.load();
    for (let i = 10; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(6000);
      await resumed.save("", project(String(i)));
    }
    expect(deleted.sort()).toEqual(expired.sort());
    expect(generations().filter(id => expired.includes(id))).toHaveLength(0);
    expect(await (await open(true)).load()).toEqual(stored(project("19")));
  });

  it("carries deletes confirmed after the next index was staged into the new cursor", async () => {
    useStorageClock();
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    await owner.save("", project("B"));
    const execute = db.execute;
    const deleted: string[] = [];
    db.execute = async req => {
      if (req.binds[1] === "world") {
        // C has captured its retirement list, but B is still the visible head.
        await vi.advanceTimersByTimeAsync(300_001);
        expect(deleted).toHaveLength(2);
      }
      if (req.sql.startsWith("DELETE")) deleted.push(String(req.binds[0]));
      return execute(req);
    };
    await owner.save("", project("C"));
    await vi.advanceTimersByTimeAsync(300_001);
    expect(deleted).toHaveLength(4);
    expect(new Set(deleted).size).toBe(4);
    expect(await (await open(true)).load()).toEqual(stored(project("C")));
  });

  it("opens and saves while a previous generation's background delete is blocked", async () => {
    useStorageClock();
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    await owner.save("", project("B"));
    await vi.advanceTimersByTimeAsync(1);
    owner.close();
    await vi.advanceTimersByTimeAsync(300_001);
    const execute = db.execute;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let deleting = false;
    db.execute = async req => {
      if (req.sql.startsWith("DELETE")) {
        deleting = true;
        await gate;
      }
      return execute(req);
    };
    const resumed = await open();
    expect(await resumed.load()).toEqual(stored(project("B")));
    await vi.advanceTimersByTimeAsync(1);
    expect(deleting).toBe(true);
    try {
      await resumed.save("", project("B"));
      await resumed.save("", project("C"));
      expect(await (await open(true)).load()).toEqual(stored(project("C")));
    } finally {
      release();
      await vi.advanceTimersByTimeAsync(300_002);
    }
    expect(await (await open(true)).load()).toEqual(stored(project("C")));
  });

  it.each([true, false])("rejects a competing publisher, including concurrent creation (empty=%s)", async (empty) => {
    const { open } = instance();
    const first = await open();
    await first.load();
    if (!empty) await first.save("", project("prior"));
    const second = await open();
    await second.load();
    const candidates = [project("one"), project("two")];
    const results = await Promise.allSettled([first.save("", candidates[0]), second.save("", candidates[1])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await (await open()).load()).toEqual(stored(candidates[results.findIndex((r) => r.status === "fulfilled")]));
  });

  it("lets a visitor finish the original scene and its resource across three manager saves", async () => {
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const reader = await open(true);
    const query = db.query;
    let edited = false;
    db.query = async (request) => {
      if (!edited && request.sql.includes("WHERE generation = ?")) {
        edited = true;
        for (const letter of ["B", "C", "D"]) {
          const pack = project(letter);
          pack.contents["tile.bin"] = new Uint8Array([letter.charCodeAt(0)]);
          await owner.save("", pack);
        }
      }
      return query(request);
    };
    expect(await reader.load()).toEqual(stored(project("A")));
    const latest = await (await open(true)).load();
    expect(latest!.contents["entry.scene"]).toBe("D");
    expect(latest!.contents["tile.bin"]).toEqual(new Uint8Array([68]));
    owner.close();
  });

  it("restarts twice when a suspended visitor outlives the retention window twice", async () => {
    const { open, db } = instance();
    useStorageClock();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const visitor = await open(true);
    const query = db.query;
    let switches = 0;
    db.query = async (request) => {
      if (request.sql.includes("WHERE generation = ?") && switches < 2) {
        const next = project(++switches === 1 ? "B" : "C");
        await owner.save("", next);
        await vi.advanceTimersByTimeAsync(300_001);
      }
      return query(request);
    };
    expect(await visitor.load()).toEqual(stored(project("C")));
    expect(switches).toBe(2);
    owner.close();
  });

  it.each([1, 2])("allows one complete fresh read after a long load, and bounds further restarts (%s expirations)", async (expirations) => {
    useStorageClock();
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const { open, db } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const reader = await open(true);
    const query = db.query;
    let switches = 0;
    db.query = async (req) => {
      if (switches < expirations && req.sql.includes("WHERE generation = ?")) {
        switches++;
        await owner.save("", project(switches === 1 ? "B" : "C"));
        await vi.advanceTimersByTimeAsync(300_001);
        elapsed += 300_001;
      }
      return query(req);
    };
    if (expirations === 1) expect(await reader.load()).toEqual(stored(project("B")));
    else await expect(reader.load()).rejects.toThrow("分块缺失");
    expect(switches).toBe(expirations);
  });

  it("recovers expired data in the background while an idle manager keeps the page open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { open, sql } = instance();
    const owner = await open();
    try {
      await owner.load();
      await owner.save("", project("A"));
      const old = refs(sql).get("lingguang://world/files/entry.scene")!.revision;
      const row = () => sql.prepare("SELECT id FROM world_save WHERE generation=?").get(old);
      await owner.save("", project("B"));
      await vi.advanceTimersByTimeAsync(299_999);
      expect(row()).toBeDefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(row()).toBeUndefined();
    } finally {
      owner.close();
      vi.useRealTimers();
    }
  });

  it("publishes related scene and resource changes together through a project transaction", async () => {
    const { db, open } = instance();
    const owner = await RuntimeProjectSession.open("world", project().project, "https://example.com/", { storage: await open() });
    const edit = (revision: number) => owner.update((pack) => ({
      ...pack,
      contents: {
        ...pack.contents,
        "entry.scene": JSON.stringify({ asset: { version: "2.0" }, revision }),
        "tile.bin": new Uint8Array([revision])
      }
    }));
    const read = async () => (await (await open(true)).load())!.contents;
    try {
      await edit(1);
      await owner.flush();
      const before = await read();
      const execute = db.execute;
      db.execute = async (req) => {
        if (req.sql.startsWith("UPDATE") && req.binds[1] === "world") throw Error("world switch failed");
        return execute(req);
      };
      await edit(2);
      await expect(owner.flush()).rejects.toThrow("world switch failed");
      expect(await read()).toEqual(before);
      db.execute = execute;
      await owner.flush();
      const after = await read();
      expect(JSON.parse(String(after["entry.scene"])).revision).toBe(2);
      expect(after["tile.bin"]).toEqual(new Uint8Array([2]));
    } finally { owner.dispose(); }
  });

  it("imports the selected legacy browser project only into an empty local world", async () => {
    const { db, open } = instance();
    const readLegacy = vi.fn(async () => project("legacy"));
    const owner = await SharedWorldStorage.open(db, false, "1", identity, undefined, readLegacy);
    stores.push(owner);
    expect(await owner.load("selected-preview")).toEqual(project("legacy"));
    expect(readLegacy.mock.calls).toEqual([["selected-preview"]]);
    await owner.save("", project("new"));
    const reopened = await SharedWorldStorage.open(db, false, "2", identity, undefined, readLegacy);
    stores.push(reopened);
    expect(await reopened.load("another-preview")).toEqual(stored(project("new")));
    expect(readLegacy).toHaveBeenCalledTimes(1);
    expect(await (await open(true)).load()).toEqual(stored(project("new")));
  });

  it("uses the app template only when the stored project is incompatible", async () => {
    const { db, sql } = instance();
    const appIdentity = { seed: identity.seed, template: "app-template" };
    seedLegacy(sql, project());
    expect((await SharedWorldStorage.select(db, "2", appIdentity.template))?.checkpoint).toBeDefined();
    const wrong = await SharedWorldStorage.open(db, false, "2", appIdentity);
    await expect(wrong.load()).rejects.toThrow("世界模板版本不兼容");
    wrong.close();
    sql.exec("DELETE FROM world_save");
    const old = project();
    Object.assign(old, { version: 6 });
    seedLegacy(sql, old);
    expect((await SharedWorldStorage.select(db, "2", appIdentity.template))?.checkpoint).toBeUndefined();
    const owner = await SharedWorldStorage.open(db, false, "2", appIdentity);
    expect(await owner.load()).toBeUndefined();
    await owner.save("", project("app world"));
    expect((await SharedWorldStorage.select(db, "2"))?.identity).toEqual(appIdentity);
    owner.close();
  });

  it("keeps a retirement list larger than the 100000-character column limit in hashed index blocks", async () => {
    const { sql, open } = instance();
    seedLegacy(sql, project());
    sql.exec("UPDATE world_save SET payload=json_set(payload,'$.engineVersion',999) WHERE id='world'");
    const put = sql.prepare("INSERT INTO world_save VALUES (?,?,0,?)");
    for (let i = 0; i < 4500; i++) {
      const id = randomUUID();
      put.run(id + "-0", id, "old data");
    }
    const owner = await open();
    await owner.load();
    await owner.save("", project("B"));
    const head = JSON.parse(String(sql.prepare("SELECT payload FROM world_save WHERE id='world'").get()!.payload));
    expect(head.parts).toBeGreaterThan(1);
    expect(sql.prepare("SELECT max(length(payload)) AS n FROM world_save").get()!.n).toBeLessThanOrEqual(100000);
    expect(await (await open(true)).load()).toEqual(stored(project("B")));
    owner.close();
  });

  it("isolates retirement progress when a prior manager writes after publication", async () => {
    useStorageClock();
    const { db, open, sql } = instance();
    const author = await open();
    await author.load();
    await author.save("", project("A"));
    const revision = () => JSON.parse(String(sql.prepare("SELECT payload FROM world_save WHERE id='world'").get()!.payload)).revision;
    const execute = db.execute;
    let releaseOld!: () => void;
    const canContinue = new Promise<void>(resolve => { releaseOld = resolve; });
    let oldCursor = "";
    db.execute = async (request) => {
      if (String(request.binds[1]) === oldCursor && request.sql.startsWith("UPDATE")) await canContinue;
      return execute(request);
    };
    await author.save("", project("B"));
    oldCursor = "gc-" + revision();
    await vi.advanceTimersByTimeAsync(1);
    const publisher = await open();
    await publisher.load();
    await publisher.save("", project("C"));
    await vi.advanceTimersByTimeAsync(1);
    const newCursor = "gc-" + revision();
    const cursor = sql.prepare("SELECT payload FROM world_save WHERE id=?");
    const current = cursor.get(newCursor);
    expect(current).toBeDefined();
    releaseOld();
    await vi.advanceTimersByTimeAsync(1);
    expect(cursor.get(oldCursor)).toBeDefined();
    expect(cursor.get(newCursor)).toEqual(current);
  });

  it("does not insert a retirement cursor after the writer closes during an update", async () => {
    useStorageClock();
    const { db, open, sql } = instance();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const execute = db.execute;
    let releaseUpdate!: () => void;
    const canContinue = new Promise<void>(resolve => { releaseUpdate = resolve; });
    let waiting = false;
    db.execute = async (request) => {
      if (String(request.binds[1]).startsWith("gc-") && request.sql.startsWith("UPDATE")) {
        waiting = true;
        await canContinue;
      }
      return execute(request);
    };
    await owner.save("", project("B"));
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting).toBe(true);
    owner.close();
    releaseUpdate();
    await vi.advanceTimersByTimeAsync(1);
    expect(sql.prepare("SELECT id FROM world_save WHERE id LIKE 'gc-%'").get()).toBeUndefined();
  });

  it.each([false, true])("recovers retirement after closing immediately after publication (lost cursor: %s)", async (loseCursor) => {
    const { open, db, sql } = instance();
    useStorageClock();
    const owner = await open();
    await owner.load();
    await owner.save("", project("A"));
    const original = refs(sql).get("lingguang://world/files/entry.scene")!.revision;
    const hasOld = () => !!sql.prepare("SELECT id FROM world_save WHERE generation=?").get(original);
    const execute = db.execute;
    db.execute = async (req) => {
      if (loseCursor && req.binds.some(value => String(value).startsWith("gc-"))) throw Error("offline after world switch");
      return execute(req);
    };
    await owner.save("", project("B"));
    await vi.advanceTimersByTimeAsync(1);
    owner.close();
    await vi.advanceTimersByTimeAsync(300_001);
    let failDelete = true;
    db.execute = async (req) => {
      if (failDelete && req.sql.startsWith("DELETE")) throw Error("temporary cleanup failure");
      return execute(req);
    };
    const resumed = await open();
    expect(await resumed.load()).toEqual(stored(project("B")));
    expect(hasOld()).toBe(true);
    // A missing acknowledgement conservatively starts a fresh grace period.
    await vi.advanceTimersByTimeAsync(loseCursor ? 300_001 : 1);
    await resumed.save("", project("B"));
    expect(hasOld()).toBe(true);
    resumed.close();
    failDelete = false;
    vi.mocked(execute).mockClear();
    expect(await (await open(true)).load()).toEqual(stored(project("B")));
    expect(execute).not.toHaveBeenCalled();
    const final = await open();
    expect(await final.load()).toEqual(stored(project("B")));
    await vi.advanceTimersByTimeAsync(1);
    expect(hasOld()).toBe(false);
    vi.mocked(execute).mockClear();
    await final.save("", project("B"));
    expect(execute).not.toHaveBeenCalled();
    final.close();
  });

  it.each(["engineVersion", "format", "legacy project version", "file index project version"])("regenerates incompatible %s from the template before publishing a replacement", async (field) => {
    const { sql, db, open } = instance();
    useStorageClock();
    const old = project("old");
    if (field.endsWith("project version")) Object.assign(old, { version: 99 });
    if (field === "file index project version") {
      const writer = await open();
      await writer.load();
      await writer.save("", old);
    } else {
      seedLegacy(sql, old);
    }
    if (field === "engineVersion" || field === "format")
      sql.prepare("UPDATE world_save SET payload=json_set(payload, ?, 99) WHERE id='world'").run("$." + field);
    if (field === "format") {
      const insertPart = sql.prepare("INSERT INTO world_save VALUES (?,?,0,?)");
      for (let i = 0; i < 100; i++) {
        const generation = randomUUID();
        insertPart.run(generation + "-0", generation, "retired");
      }
    }
    const oldGenerations = sql.prepare("SELECT generation FROM world_save WHERE part_no=0 AND generation<>\'archive\'").all();
    vi.mocked(db.execute).mockClear();
    expect((await SharedWorldStorage.select(db, "1"))?.identity).toEqual(identity);
    const visitor = await open(true);
    expect(await visitor.load()).toBeUndefined();
    await expect(visitor.save("", project())).rejects.toThrow();
    const owner = await open();
    expect(await owner.load()).toBeUndefined();
    expect(db.execute).not.toHaveBeenCalled();
    const oldHead = () => sql.prepare("SELECT payload FROM world_save WHERE id='world'").get()?.payload;
    const original = oldHead();
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("write failed"));
    await expect(owner.save("", project("regenerated"))).rejects.toThrow("write failed");
    expect(oldHead()).toBe(original);
    expect(sql.prepare("SELECT generation FROM world_save WHERE part_no=0 AND generation<>\'archive\'").all()).toEqual(oldGenerations);
    await owner.save("", project("regenerated"));
    expect(await (await open(true)).load()).toEqual(stored(project("regenerated")));
    for (const { generation } of oldGenerations)
      expect(sql.prepare("SELECT id FROM world_save WHERE generation=?").get(generation)).toBeDefined();
    await vi.advanceTimersByTimeAsync(300_000 + Math.ceil(oldGenerations.length / 16));
    for (const { generation } of oldGenerations)
      expect(sql.prepare("SELECT id FROM world_save WHERE generation=?").get(generation)).toBeUndefined();
    owner.close();
  });

  it.each(["missing", "checksum", "malformed-header", "read-error"])("fails closed on %s", async (problem) => {
    const { open, sql, db } = instance();
    const writer = await open();
    await writer.load();
    await writer.save("", project());
    if (problem === "missing") sql.exec("DELETE FROM world_save WHERE part_no = 0");
    if (problem === "checksum") sql.exec("UPDATE world_save SET payload='YWJj' WHERE part_no=0");
    if (problem === "malformed-header")
      sql.exec("UPDATE world_save SET payload=json_remove(payload,'$.engineVersion') WHERE id='world'");
    if (problem === "read-error") db.query = async () => ({ success: false, message: "timeout" });
    vi.mocked(db.execute).mockClear();
    await expect((async () => (await open()).load())()).rejects.toThrow();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("keeps visitor preparation, edits, flushing and disposal in memory", async () => {
    const { db, open } = instance();
    const manifest = project().project;
    const manager = await RuntimeProjectSession.open("A", manifest, "https://example.com/", { storage: await open() });
    await manager.publishAsset(manifest.files[1], new Uint8Array([44]));
    await manager.flush();
    manager.dispose();
    vi.mocked(db.execute).mockClear();
    const visitor = await RuntimeProjectSession.open("B", manifest, "https://example.com/", {
      storage: await open(true)
    });
    expect(visitor.canSave).toBe(false);
    expect(visitor.projectPackage.contents["tile.bin"]).toEqual(new Uint8Array([44]));
    await visitor.publishAsset(manifest.files[1], new Uint8Array([99]));
    await visitor.save();
    await visitor.flush();
    visitor.dispose();
    expect(db.execute).not.toHaveBeenCalled();
    expect((await (await open()).load())?.contents["tile.bin"]).toEqual(new Uint8Array([44]));
  });

  it("prefers the scaffold role, recognizes wrapped replies and leaves unknown roles read-only", async () => {
    const { db } = instance();
    const scope = { lingguang: { db }, currentRoleReady: Promise.resolve(), currentRole: "USER" };
    expect((await resolveStorageHost(scope))?.readOnly).toBe(true);
    expect(db.role).not.toHaveBeenCalled();
    for (const [response, readOnly] of [
      [{ data: { role: "MANAGER" } }, false],
      [{ role: "MANAGER", success: false }, true],
      [{}, true]
    ] as const) {
      db.role = async () => response;
      expect((await resolveStorageHost({ lingguang: { db } }))?.readOnly).toBe(readOnly);
    }
    db.role = async () => ({ role: "MANAGER" });
    expect((await resolveStorageHost(scope, { source: "local", importLegacyPreview: true })).readOnly).toBe(false);
  });
});
