import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { buildRetrievalCatalog } from "../src/build";
import { RetrievalLibrary } from "../src/library";
import { createHttpStorage, readBoundedStream, type ResourceStorage } from "../src/storage";
import { searchAssetsToolContract } from "../src/contracts";
import type { SourceAsset } from "../src/contracts";

const encoder = new TextEncoder();
function source(id: string, name: string, description: string, type = "model"): SourceAsset {
  const dir = `assets/${type}/${id}`,
    file = `${dir}/item.glb`;
  return {
    key: `${dir}/describe.json`,
    metadata: {
      assetType: type,
      assetPaths: [file],
      overview: { name, description, tags: ["示例"] },
      usage: { description: "导入后使用" }
    },
    descriptionUrl: `https://assets.test/${dir}/describe.json`,
    resources: [file, `${dir}/README.md`].map((path) => ({ path, url: `https://assets.test/${path}` }))
  };
}
const sources = () => [
  source("birch", "白桦树", "白色树皮绿色树冠的白桦树，适合森林"),
  source("pine", "松树", "高大的针叶松树，适合山地森林"),
  source("rock", "大石头", "灰色的大石头，适合山地"),
  source("wind", "风声", "树林里的风声", "audio")
];
function fixture(input = sources()) {
  const built = buildRetrievalCatalog(input, { summaryBlockBytes: 1024 });
  const url = "https://catalog.test/manifest.json";
  const files = new Map<string, Uint8Array>([[url, built.manifestBytes]]);
  for (const [path, bytes] of built.artifacts) files.set(new URL(path, url).href, bytes);
  for (const item of input) {
    files.set(item.descriptionUrl, encoder.encode(JSON.stringify(item.metadata, null, 2)));
    files.set(item.resources[1].url, encoder.encode(`# ${item.key}\n使用说明`));
  }
  const reads: string[] = [];
  const storage: ResourceStorage = {
    async read(path, { signal, maxBytes }) {
      signal?.throwIfAborted();
      reads.push(path);
      const bytes = files.get(path);
      if (!bytes) throw new Error(`Unexpected download: ${path}`);
      if (bytes.length > maxBytes) throw new Error("Too large");
      return bytes;
    }
  };
  return { built, url, files, reads, storage };
}

test("search downloads only the index and the selected summary blocks; details and payloads stay lazy", async () => {
  const f = fixture();
  const library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  assert.equal(f.reads.length, 2);
  const index = JSON.parse(gunzipSync(f.built.artifacts.get(f.built.manifest.index.path)!).toString());
  assert.ok(index.entries.every((entry: Record<string, unknown>) => !("metadata" in entry) && !("resources" in entry)));
  const result = await library.searchAssets({ query: "白桦树", maxResults: 1 });
  assert.equal(result.matches[0].name, "白桦树");
  assert.equal(f.reads.length, 3);
  assert.ok(f.reads.every((url) => url.startsWith("https://catalog.test/")));
  await library.searchAssets({ query: "白桦树", maxResults: 1 });
  assert.equal(f.reads.length, 3, "summary cache should avoid repeat downloads");
  const selected = result.matches[0];
  const resolved = await library.resolveResource(`/oss/${selected.assetPaths[0]}`);
  assert.ok(resolved.url.endsWith("item.glb"));
  assert.equal(f.reads.length, 3, "URL resolution must not download the binary");
  const details = await library.readAssetDescriptions({ descriptionPaths: [selected.descriptionPath] });
  assert.equal(details.matches.length, 1);
  assert.equal(f.reads.length, 4);
  assert.equal(f.reads[3], sources()[0].descriptionUrl);
  assert.match(await library.readText(selected.descriptionPath.replace("describe.json", "README.md")), /使用说明/);
  assert.equal(f.reads.length, 5);
});

test("literal keywords rank by coverage, exact name, name, tags, then description", async () => {
  const exact = source("z-exact", "木桌", "家具");
  const name = source("y-name", "复古木桌", "家具");
  const tag = source("x-tag", "工作台", "家具");
  tag.metadata.tags = ["木桌"];
  tag.metadata.technical = { tags: ["静态网格"], note: "不应检索到的技术说明" };
  const description = source("w-description", "家具", "一张木桌");
  const partial = source("v-partial", "木椅", "家具");
  const inputs = [description, partial, tag, name, exact];
  const f = fixture(inputs),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const result = await library.searchAssets({ query: "木桌" });
  assert.deepEqual(
    result.matches.map((item) => item.name),
    ["木桌", "复古木桌", "工作台", "家具"]
  );
  const keywords = await library.searchAssets({ query: "木 桌" });
  assert.deepEqual(
    keywords.matches.map((item) => item.name),
    ["复古木桌", "木桌", "工作台", "家具", "木椅"]
  );
  const deduped = await library.searchAssets({ query: "木 桌 木" });
  assert.deepEqual(deduped.matches, keywords.matches, "repeated terms must not change rank");
  assert.equal(
    (await library.searchAssets({ query: "在我面前放一张木桌" })).matchedCount,
    0,
    "no hidden sentence segmentation"
  );
  assert.equal((await library.searchAssets({ query: ".*" })).matchedCount, 0, "keywords are not regex");
  assert.equal((await library.searchAssets({ query: "木桌", type: "audio" })).matchedCount, 0);
  assert.deepEqual(
    (await library.searchAssets({ query: "静态网格" })).matches.map((item) => item.name),
    ["工作台"]
  );
  assert.equal((await library.searchAssets({ query: "不应检索到的技术说明" })).matchedCount, 0);
  assert.match(searchAssetsToolContract.inputSchema.shape.query.description!, /关键词/);
});

test("keyword normalization and deterministic pagination do not depend on ICU or a dictionary", async () => {
  const input = [source("b", "Wood Table", "家具"), source("a", "Wood Table", "家具")];
  const f = fixture(input),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const normalized = await library.searchAssets({ query: "ＷＯＯＤ\u3000ＴＡＢＬＥ", maxResults: 1 });
  assert.equal(normalized.matchedCount, 2);
  assert.equal(normalized.matches[0].descriptionPath, `/oss/${input[1].key}`);
  const next = await library.searchAssets({
    query: "wood table",
    maxResults: 1,
    offset: 1,
    corpusHash: normalized.corpusHash
  });
  assert.equal(next.matches[0].descriptionPath, `/oss/${input[0].key}`);
  assert.equal((await library.searchAssets({ query: "table", type: "model" })).matchedCount, 2);
});

test("old segmented catalogs are rejected instead of silently using a different search algorithm", async () => {
  const f = fixture();
  f.files.set(f.url, encoder.encode(JSON.stringify({ ...f.built.manifest, version: 1 })));
  await assert.rejects(RetrievalLibrary.open(f.url, { storage: f.storage }));
  f.files.set(f.url, encoder.encode(JSON.stringify({ ...f.built.manifest, searchStrategy: "other" })));
  await assert.rejects(RetrievalLibrary.open(f.url, { storage: f.storage }), /strategy differs/);
});

test("pagination requires the same version and does not silently turn into another page", async () => {
  const f = fixture(),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const first = await library.searchAssets({ query: "示例", maxResults: 1 });
  assert.equal(first.matchedCount, 4);
  assert.equal(first.nextOffset, 1);
  const second = await library.searchAssets({ query: "示例", maxResults: 1, offset: 1, corpusHash: first.corpusHash });
  assert.notEqual(first.matches[0].descriptionPath, second.matches[0].descriptionPath);
  await assert.rejects(library.searchAssets({ query: "示例", offset: 1 }), /Pagination requires/);
  await assert.rejects(library.searchAssets({ query: "示例", offset: 1, corpusHash: "0".repeat(64) }), /changed/);
});

test("changed remote descriptions and corrupt summary blocks fail without cached fake success", async () => {
  const f = fixture(),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const item = sources()[0];
  f.files.set(item.descriptionUrl, encoder.encode(JSON.stringify({ ...item.metadata, extra: "changed" })));
  await assert.rejects(library.readAssetDescriptions({ descriptionPaths: [`/oss/${item.key}`] }), /changed since/);
  const clean = fixture();
  const l2 = await RetrievalLibrary.open(clean.url, { storage: clean.storage });
  for (const block of clean.built.manifest.summaries) {
    const bytes = clean.files.get(new URL(block.path, clean.url).href)!.slice();
    bytes[10] ^= 1;
    clean.files.set(new URL(block.path, clean.url).href, bytes);
  }
  await assert.rejects(l2.searchAssets({ query: "白桦树" }), /integrity/);
});

test("undeclared files, traversal and binary text reads are rejected", async () => {
  const f = fixture(),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  await assert.rejects(library.readText("/oss/assets/model/birch/item.glb"), /not a supported text/);
  await assert.rejects(library.resolveResource("/oss/assets/model/birch/secret.txt"), /not declared/);
  await assert.rejects(library.resolveResource("/oss/assets/../secret.txt"), /canonical/);
  assert.ok(!f.reads.some((url) => url.endsWith(".glb")));
});

test("builder rejects missing resource URLs and duplicate identities", () => {
  const item = sources()[0];
  assert.throws(() => buildRetrievalCatalog([{ ...item, resources: [] }]), /Missing URL/);
  assert.throws(() => buildRetrievalCatalog([item, item]), /Duplicate/);
  assert.throws(
    () =>
      buildRetrievalCatalog([
        { ...item, resources: [{ path: "assets/other/item.glb", url: "https://assets.test/item.glb" }] }
      ]),
    /Invalid/
  );
});

test("HTTP storage checks response status and bounds decompressed response bytes", async () => {
  const failed = createHttpStorage((async () => new Response("failure", { status: 403 })) as typeof fetch);
  await assert.rejects(failed.read("https://assets.test/file", { maxBytes: 100 }), /403/);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(11));
    },
    cancel() {
      cancelled = true;
    }
  });
  await assert.rejects(readBoundedStream(stream, 10), /exceeds/);
  assert.equal(cancelled, true);
});

test("a cancelled query does no summary IO", async () => {
  const f = fixture(),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(library.searchAssets({ query: "白桦树" }, { signal: controller.signal }), /abort/i);
  assert.equal(f.reads.length, 2);
});

test("resolves a selected file or owning directory without downloading payloads", async () => {
  const f = fixture(),
    library = await RetrievalLibrary.open(f.url, { storage: f.storage });
  const candidate = (await library.searchAssets({ query: "白桦树" })).matches[0];
  const before = f.reads.length;
  const set = await library.resourceSet(`/oss/${candidate.assetPaths[0]}`);
  assert.equal(set.root, "/oss/assets/model/birch");
  assert.ok(set.resources.some((file) => file.path.endsWith("/README.md")));
  assert.deepEqual(await library.resourceSet(set.root), set);
  assert.equal(f.reads.length, before);
  await assert.rejects(library.resourceSet("/oss/assets/model/birch/unknown.glb"), /not declared|not in/i);
  await assert.rejects(library.resourceSet("/oss/assets/model"));
});
