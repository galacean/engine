import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { buildKeywordIndex, MAX_INDEX_BYTES } from "./keyword-index";
import { z } from "zod";
import {
  canonicalJson,
  manifestSchema,
  sourceAssetSchema,
  sourceKeySchema,
  summarySchema,
  MAX_DESCRIPTION_BYTES,
  type AssetSummary,
  type SourceAsset
} from "./contracts";

const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const excerpt = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const chars = [...value];
  return chars.length <= 240 ? value : `${chars.slice(0, 239).join("")}…`;
};
const field = (value: unknown, key: string) =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** Build search data only. This function never downloads or embeds an asset, README or full description file. */
export function buildRetrievalCatalog(input: readonly SourceAsset[], options: { summaryBlockBytes?: number } = {}) {
  const blockLimit = options.summaryBlockBytes ?? 256 * 1024;
  if (!Number.isSafeInteger(blockLimit) || blockLimit < 1024 || blockLimit > 1024 * 1024)
    throw new RangeError("summaryBlockBytes must be between 1 KiB and 1 MiB");
  const sources = input
    .map((source) => sourceAssetSchema.parse(source))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const summaries = sources.map((source): AssetSummary => {
    const { metadata, key } = source;
    if (Buffer.byteLength(JSON.stringify(metadata)) > MAX_DESCRIPTION_BYTES)
      throw new Error(`Description exceeds byte budget: ${key}`);
    const directory = key.slice(0, key.lastIndexOf("/") + 1);
    const resources = new Map<string, string>();
    for (const resource of source.resources) {
      if (!resource.path.startsWith(directory) || resource.path === key || resources.has(resource.path)) {
        throw new Error(`Invalid or duplicate resource path for ${key}: ${resource.path}`);
      }
      resources.set(resource.path, resource.url);
    }
    const assetPaths = z.array(sourceKeySchema).min(1).parse(metadata.assetPaths);
    const declaredPaths = [
      ...assetPaths,
      ...(metadata.manifestPath === undefined ? [] : [sourceKeySchema.parse(metadata.manifestPath)])
    ];
    for (const path of declaredPaths) {
      if (!path.startsWith(directory)) throw new Error(`Declared resource is outside its asset directory: ${path}`);
      if (!resources.has(path)) throw new Error(`Missing URL for declared resource: ${path}`);
    }
    return summarySchema.parse({
      candidate: {
        descriptionPath: `/oss/${key}`,
        assetPaths,
        assetType: text(metadata.assetType),
        assetSubType: text(metadata.assetSubType),
        name: text(field(metadata.overview, "name")),
        descriptionExcerpt: excerpt(field(metadata.overview, "description")),
        appearanceExcerpt: excerpt(field(metadata.visualProfile, "description")),
        usageExcerpt: excerpt(field(metadata.usage, "description"))
      },
      descriptionUrl: source.descriptionUrl,
      metadataHash: digest(canonicalJson(metadata)),
      resources: source.resources
    });
  });

  const compact = buildKeywordIndex(sources);
  const indexJson = Buffer.from(JSON.stringify(compact));
  if (indexJson.byteLength > MAX_INDEX_BYTES) throw new Error("Keyword index exceeds 256 MiB");
  const indexBytes = gzipSync(indexJson);
  const artifacts = new Map<string, Uint8Array>();
  const artifact = (folder: "index" | "summaries", bytes: Uint8Array, suffix: string) => {
    const sha256 = digest(bytes),
      path = `${folder}/${sha256}.${suffix}`;
    artifacts.set(path, bytes);
    return { path, sha256, bytes: bytes.byteLength };
  };
  const index = artifact("index", indexBytes, "bin");
  const blocks: { first: number; count: number; path: string; sha256: string; bytes: number }[] = [];
  let first = 0,
    rows: AssetSummary[] = [],
    size = 2;
  const flush = () => {
    if (!rows.length) return;
    blocks.push({ ...artifact("summaries", Buffer.from(JSON.stringify(rows)), "json"), first, count: rows.length });
    first += rows.length;
    rows = [];
    size = 2;
  };
  for (const summary of summaries) {
    const bytes = Buffer.byteLength(JSON.stringify(summary));
    if (bytes + 2 > blockLimit)
      throw new Error(`Asset summary exceeds block budget: ${summary.candidate.descriptionPath}`);
    if (rows.length && (rows.length >= 128 || size + bytes + 1 > blockLimit)) flush();
    size += bytes + (rows.length ? 1 : 0);
    rows.push(summary);
  }
  flush();
  const manifest = manifestSchema.parse({
    version: 2,
    searchStrategy: compact.strategy,
    count: sources.length,
    index,
    summaries: blocks
  });
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  return { manifest, manifestBytes, corpusHash: digest(manifestBytes), artifacts };
}
