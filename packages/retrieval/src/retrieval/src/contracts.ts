import { z } from "zod";

export const MAX_DESCRIPTION_BYTES = 256 * 1024;

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceKeySchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith("assets/") &&
      !/[\\?#\u0000-\u001f\u007f]/.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Expected a canonical assets/ source key"
  );
export const sourcePathSchema = z
  .string()
  .refine(
    (value) => value.startsWith("/oss/") && sourceKeySchema.safeParse(value.slice(5)).success,
    "Expected a canonical /oss/assets/ source path"
  );
export const resourceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  }, "Resources require an HTTP(S) URL without embedded credentials");

/** Search-visible fields match OasisBE's Agent candidate contract. URLs stay behind the source resolver. */
export const candidateSchema = z
  .object({
    descriptionPath: sourcePathSchema,
    assetPaths: z.array(sourceKeySchema),
    assetType: z.string().nullable(),
    assetSubType: z.string().nullable(),
    name: z.string().nullable(),
    descriptionExcerpt: z.string().nullable(),
    appearanceExcerpt: z.string().nullable(),
    usageExcerpt: z.string().nullable()
  })
  .strict();
export type AssetCandidate = z.infer<typeof candidateSchema>;

/** Authoring input only. Metadata is consumed offline and is not embedded in the runtime search index. */
export const sourceAssetSchema = z
  .object({
    key: sourceKeySchema.refine((value) => value.endsWith("/describe.json")),
    metadata: z.record(z.string(), z.unknown()),
    descriptionUrl: resourceUrlSchema,
    resources: z.array(z.object({ path: sourceKeySchema, url: resourceUrlSchema }).strict())
  })
  .strict();
export type SourceAsset = z.infer<typeof sourceAssetSchema>;

export const summarySchema = z
  .object({
    candidate: candidateSchema,
    descriptionUrl: resourceUrlSchema,
    metadataHash: sha256Schema,
    resources: sourceAssetSchema.shape.resources
  })
  .strict();
export type AssetSummary = z.infer<typeof summarySchema>;

const artifactSchema = z
  .object({
    path: z.string().regex(/^(index|summaries)\/[a-f0-9]{64}\.(json|bin)$/),
    sha256: sha256Schema,
    bytes: z.number().int().positive()
  })
  .strict();
export const manifestSchema = z
  .object({
    version: z.literal(2),
    searchStrategy: z.string().min(1),
    count: z.number().int().positive(),
    index: artifactSchema,
    summaries: z
      .array(artifactSchema.extend({ first: z.number().int().nonnegative(), count: z.number().int().positive() }))
      .min(1)
  })
  .strict();
export type CatalogManifest = z.infer<typeof manifestSchema>;

export const SEARCH_QUERY_DESCRIPTION =
  "使用简短的资产名称或特征关键词，多个关键词用空格分隔，例如：白桦树、木 桌。先从玩家需求中提取关键词，不要传入整句指令或位置、数量、操作要求。先提交一组核心关键词并检查结果，候选不合适时再改词，不要同时提交多组近义查询。没有结果时可减少限定词或更换常见说法；仍无合适候选就说明未找到，不要为了证明不存在而遍历全库。";
export const searchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).describe(SEARCH_QUERY_DESCRIPTION),
    type: z.string().trim().min(1).optional().describe("按资产库的 assetType 精确过滤；不确定类型时省略，不要猜测。"),
    maxResults: z.number().int().min(1).max(20).default(10),
    offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    corpusHash: sha256Schema.optional()
  })
  .strict()
  .refine((value) => value.offset === 0 || Boolean(value.corpusHash), "Pagination requires corpusHash");
/** Reusable Tool metadata; the host owns registration and dispatch to RetrievalClient. */
export const searchAssetsToolContract = {
  name: "search_assets",
  description: `搜索当前项目之外的素材库。当用户寻找可用素材，或当前项目没有合适资产时使用；查询当前世界状态和项目已有资产不使用此工具。返回候选摘要和来源路径，不导入或下载资产。${SEARCH_QUERY_DESCRIPTION} 匹配关键词越多越靠前；部分匹配也会返回，使用前检查候选说明。`,
  inputSchema: searchInputSchema
} as const;
export type SearchInput = z.input<typeof searchInputSchema>;
export interface SearchResult {
  matches: AssetCandidate[];
  scanned: number;
  matchedCount: number;
  truncated: boolean;
  nextOffset: number | null;
  corpusHash: string;
}
export const descriptionsInputSchema = z
  .object({
    descriptionPaths: z.array(sourcePathSchema).min(1).max(20),
    offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    corpusHash: sha256Schema.optional()
  })
  .strict()
  .refine((value) => value.offset === 0 || Boolean(value.corpusHash), "Pagination requires corpusHash");
export type DescriptionsInput = z.input<typeof descriptionsInputSchema>;
export interface DescriptionsResult {
  matches: { descriptionPath: string; metadata: Record<string, unknown> }[];
  nextOffset: number | null;
  corpusHash: string;
}

/** Stable serialization lets a description be pretty-printed without changing its published identity. */
export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, entry]) => [key, normalize(entry)])
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}

/** One selected asset's source files; transport metadata stays outside LLM search output. */
export interface AssetResourceSet {
  root: string;
  candidate: AssetCandidate;
  resources: { path: string; url: string }[];
}
