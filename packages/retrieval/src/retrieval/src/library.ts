import { z } from "zod";
import {
  restoreKeywordIndex,
  rankKeywords,
  SEARCH_STRATEGY,
  MAX_INDEX_BYTES,
  type KeywordIndex
} from "./keyword-index";
import {
  canonicalJson,
  descriptionsInputSchema,
  manifestSchema,
  searchInputSchema,
  sourcePathSchema,
  summarySchema,
  MAX_DESCRIPTION_BYTES,
  type AssetResourceSet,
  type AssetSummary,
  type CatalogManifest,
  type DescriptionsInput,
  type DescriptionsResult,
  type SearchInput,
  type SearchResult
} from "./contracts";
import { createHttpStorage, parseJson, readBoundedStream, sha256, type ResourceStorage } from "./storage";

type ReadOptions = { signal?: AbortSignal };
const MAX_SUMMARY_BYTES = 1024 * 1024;
const DESCRIPTION_PAGE_BYTES = 512 * 1024;
const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** A single immutable library version. Construct this inside a Worker, never in the rendering loop. */
export class RetrievalLibrary {
  private readonly summaryCache = new Map<number, AssetSummary[]>();
  private readonly descriptionIds = new Map<string, number>();
  private readonly directoryIds = new Map<string, number>();
  private constructor(
    private readonly manifestUrl: string,
    private readonly storage: ResourceStorage,
    private readonly manifest: CatalogManifest,
    private readonly index: KeywordIndex,
    readonly corpusHash: string,
    private readonly summaryCacheBlocks: number
  ) {
    index.entries.forEach((entry, id) => {
      this.descriptionIds.set(`/oss/${entry.key}`, id);
      this.directoryIds.set(`/oss/${entry.key.slice(0, entry.key.lastIndexOf("/"))}`, id);
    });
  }

  static async open(
    manifestUrl: string,
    options: ReadOptions & { storage?: ResourceStorage; summaryCacheBlocks?: number } = {}
  ) {
    const storage = options.storage ?? createHttpStorage();
    const blocks = options.summaryCacheBlocks ?? 8;
    if (!Number.isInteger(blocks) || blocks < 0 || blocks > 128)
      throw new RangeError("summaryCacheBlocks must be between 0 and 128");
    const raw = await storage.read(manifestUrl, { signal: options.signal, maxBytes: 4 * 1024 * 1024 });
    const manifest = manifestSchema.parse(parseJson(raw));
    if (manifest.searchStrategy !== SEARCH_STRATEGY)
      throw new Error("Catalog search strategy differs from this runtime");
    let count = 0;
    for (const block of manifest.summaries) {
      if (block.first !== count || block.count > 128 || block.bytes > MAX_SUMMARY_BYTES)
        throw new Error("Invalid summary block layout");
      count += block.count;
    }
    if (count !== manifest.count || manifest.index.bytes > MAX_INDEX_BYTES) throw new Error("Invalid catalog size");
    const bytes = await storage.read(new URL(manifest.index.path, manifestUrl).href, {
      signal: options.signal,
      maxBytes: manifest.index.bytes
    });
    await verifyArtifact(bytes, manifest.index);
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
    const decoded = await readBoundedStream(stream, MAX_INDEX_BYTES, options.signal);
    const corpusHash = await sha256(new TextEncoder().encode(canonicalJson(manifest)));
    const index = restoreKeywordIndex(parseJson(decoded));
    if (index.entries.length !== count) throw new Error("Catalog and summary counts differ");
    options.signal?.throwIfAborted();
    return new RetrievalLibrary(manifestUrl, storage, manifest, index, corpusHash, blocks);
  }

  async searchAssets(raw: SearchInput, options: ReadOptions = {}): Promise<SearchResult> {
    const input = searchInputSchema.parse(raw);
    this.assertVersion(input.corpusHash);
    options.signal?.throwIfAborted();
    const scope =
      input.type === undefined ? this.index.entries : this.index.entries.filter((entry) => entry.type === input.type);
    const ranked = rankKeywords(input.query, scope);
    if (input.offset > ranked.length) throw new RangeError("Search offset exceeds the matching candidates");
    const end = input.offset + input.maxResults;
    const ids = ranked.slice(input.offset, end).map((entry) => this.descriptionIds.get(`/oss/${entry.key}`)!);
    const rows = await this.summaries(ids, options);
    return {
      matches: rows.map((row) => structuredClone(row.candidate)),
      scanned: scope.length,
      matchedCount: ranked.length,
      truncated: end < ranked.length,
      nextOffset: end < ranked.length ? end : null,
      corpusHash: this.corpusHash
    };
  }

  async readAssetDescriptions(raw: DescriptionsInput, options: ReadOptions = {}): Promise<DescriptionsResult> {
    const input = descriptionsInputSchema.parse(raw);
    this.assertVersion(input.corpusHash);
    const paths = [...new Set(input.descriptionPaths)];
    const ids = paths.map((path) => this.descriptionId(path));
    if (input.offset > paths.length) throw new RangeError("Description offset exceeds the requested paths");
    const result: DescriptionsResult = { matches: [], nextOffset: null, corpusHash: this.corpusHash };
    // Read sequentially: only this page's descriptions are downloaded, not all requested pages.
    for (let i = input.offset; i < paths.length; i++) {
      const [summary] = await this.summaries([ids[i]], options);
      const metadata = await this.description(summary, options);
      const item = { descriptionPath: paths[i], metadata };
      if (
        encoded({ ...result, matches: [...result.matches, item], nextOffset: i + 1 }).byteLength >
        DESCRIPTION_PAGE_BYTES
      ) {
        if (!result.matches.length) throw new RangeError("Description exceeds page budget");
        result.nextOffset = i;
        break;
      }
      result.matches.push(item);
    }
    return result;
  }

  /** Resolve an authorized source without downloading it. Editor import owns binary reads and project writes. */
  async resolveResource(path: string, options: ReadOptions = {}): Promise<{ path: string; url: string }> {
    const summary = await this.summaryForPath(path, options);
    if (path === summary.candidate.descriptionPath) return { path, url: summary.descriptionUrl };
    const resource = summary.resources.find((resource) => `/oss/${resource.path}` === path);
    if (!resource) throw new Error(`Resource is not declared by this catalog: ${path}`);
    return { path, url: resource.url };
  }

  /** Resolve only the selected asset's file set, including dependency files and README. */
  async resourceSet(path: string, options: ReadOptions = {}): Promise<AssetResourceSet> {
    sourcePathSchema.parse(path);
    const folderDescription = `${path}/describe.json`;
    const summary = this.descriptionIds.has(folderDescription)
      ? (await this.summaries([this.descriptionId(folderDescription)], options))[0]
      : await this.summaryForPath(path, options);
    return {
      root: summary.candidate.descriptionPath.slice(0, -"/describe.json".length),
      candidate: structuredClone(summary.candidate),
      resources: [
        { path: summary.candidate.descriptionPath, url: summary.descriptionUrl },
        ...summary.resources
          .filter((resource) => `/oss/${resource.path}` !== summary.candidate.descriptionPath)
          .map((resource) => ({ path: `/oss/${resource.path}`, url: resource.url }))
      ]
    };
  }

  /** Text primitive for a future source_text/read adapter; no globbing, arbitrary URLs or binary decoding. */
  async readText(path: string, options: ReadOptions & { maxBytes?: number } = {}): Promise<string> {
    const maxBytes = options.maxBytes ?? MAX_DESCRIPTION_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4 * 1024 * 1024)
      throw new RangeError("Invalid text read budget");
    const summary = await this.summaryForPath(path, options);
    if (path === summary.candidate.descriptionPath) {
      const text = JSON.stringify(await this.description(summary, options), null, 2);
      if (new TextEncoder().encode(text).byteLength > maxBytes)
        throw new RangeError("Description exceeds text read budget");
      return text;
    }
    if (!/\.(json|md|txt|ts|js|glsl|shader|mat|mesh)$/i.test(path))
      throw new Error("Source is not a supported text file; resolve its URL for import");
    const { url } = await this.resolveResource(path, options);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await this.storage.read(url, { signal: options.signal, maxBytes })
    );
  }

  private assertVersion(version?: string) {
    if (version !== undefined && version !== this.corpusHash)
      throw new Error("Asset catalog changed; restart pagination");
  }
  private descriptionId(path: string): number {
    const id = this.descriptionIds.get(sourcePathSchema.parse(path));
    if (id === undefined) throw new Error(`Description not in this catalog: ${path}`);
    return id;
  }
  private async description(summary: AssetSummary, options: ReadOptions) {
    const bytes = await this.storage.read(summary.descriptionUrl, {
      signal: options.signal,
      maxBytes: MAX_DESCRIPTION_BYTES
    });
    const metadata = z.record(z.string(), z.unknown()).parse(parseJson(bytes));
    if ((await sha256(new TextEncoder().encode(canonicalJson(metadata)))) !== summary.metadataHash) {
      throw new Error(`Description changed since catalog publication: ${summary.candidate.descriptionPath}`);
    }
    return metadata;
  }
  private async summaryForPath(path: string, options: ReadOptions) {
    sourcePathSchema.parse(path);
    // Exact declared resource lists, not directory access, authorize a read.
    let directory = path.slice(0, path.lastIndexOf("/"));
    while (directory.startsWith("/oss/assets")) {
      const id = this.directoryIds.get(directory);
      if (id !== undefined) {
        const [summary] = await this.summaries([id], options);
        if (
          path === summary.candidate.descriptionPath ||
          summary.resources.some((resource) => `/oss/${resource.path}` === path)
        )
          return summary;
      }
      directory = directory.slice(0, directory.lastIndexOf("/"));
    }
    throw new Error(`Resource is not declared by this catalog: ${path}`);
  }
  private async summaries(ids: number[], options: ReadOptions): Promise<AssetSummary[]> {
    const loaded = new Map<number, AssetSummary[]>();
    const blockId = (id: number) => {
      let low = 0,
        high = this.manifest.summaries.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1,
          block = this.manifest.summaries[mid];
        if (id < block.first) high = mid - 1;
        else if (id >= block.first + block.count) low = mid + 1;
        else return mid;
      }
      throw new Error("Missing summary block");
    };
    for (const id of new Set(ids.map(blockId))) {
      options.signal?.throwIfAborted();
      let rows = this.summaryCache.get(id);
      if (!rows) {
        const block = this.manifest.summaries[id];
        const bytes = await this.storage.read(new URL(block.path, this.manifestUrl).href, {
          signal: options.signal,
          maxBytes: block.bytes
        });
        await verifyArtifact(bytes, block);
        rows = z.array(summarySchema).parse(parseJson(bytes));
        if (
          rows.length !== block.count ||
          rows.some((row, offset) => {
            const entry = this.index.entries[block.first + offset];
            return row.candidate.descriptionPath !== `/oss/${entry.key}` || row.candidate.assetType !== entry.type;
          })
        )
          throw new Error("Summary block does not match the search index");
      }
      this.summaryCache.delete(id);
      if (this.summaryCacheBlocks > 0) {
        this.summaryCache.set(id, rows);
        while (this.summaryCache.size > this.summaryCacheBlocks)
          this.summaryCache.delete(this.summaryCache.keys().next().value!);
      }
      loaded.set(id, rows);
    }
    return ids.map((id) => {
      const block = blockId(id);
      return loaded.get(block)![id - this.manifest.summaries[block].first];
    });
  }
}

async function verifyArtifact(bytes: Uint8Array, expected: { bytes: number; sha256: string }) {
  if (bytes.byteLength !== expected.bytes || (await sha256(bytes)) !== expected.sha256)
    throw new Error("Catalog artifact integrity check failed");
}
