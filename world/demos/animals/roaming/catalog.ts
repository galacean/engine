import { readAnimalAssetCatalog, type AnimalAssetConfig } from "../application/AnimalAssetCatalog.ts";

/** Offline measurements in glTF metres, before any preview calibration. */
export interface AssetAudit {
  id: string;
  url: string | null;
  source: string;
  bytes: number;
  triangles: number;
  vertices: number;
  primitives: number;
  skins: number;
  joints: number[];
  bounds: [number[], number[]] | null;
  dimensions: number[] | null;
  sampledBounds: [number[], number[]] | null;
  animations: { name: string; duration: number; sampledBounds: [number[], number[]] | null }[];
  textures: { size?: number[]; bytes?: number }[];
  lodNodes: string[];
  lodExtension: boolean;
}

/** Catalog data belongs to the demo/application, separate from the animal simulation. */
export interface AnimalAsset {
  id: string;
  name: string;
  aliases: string[];
  kind: "model";
  family: string;
  /** Proposed uniform scale for visual comparison, not an accepted species measurement. */
  scale: number;
  note: string;
  audit?: AssetAudit;
  config?: AnimalAssetConfig;
}

/** Build the UI catalog exclusively from validated application configuration and offline measurements. */
export function buildCatalog(audits: AssetAudit[], source: unknown): AnimalAsset[] {
  const definitions = readAnimalAssetCatalog(source);
  const catalog: AnimalAsset[] = definitions.animals.map((config) => {
    const audit = audits.find((entry) => entry.id === config.id);
    if (!audit?.url || !audit.bounds || !audit.animations.some((clip) => clip.duration > 0))
      throw new Error(`Missing animated animal: ${config.id}`);
    if (audit.url !== config.modelUrl) throw new Error(`Animal path differs from audit: ${config.id}`);
    for (const binding of config.animations) {
      if (!audit.animations.some((clip) => clip.name === binding.clip && clip.duration > 0))
        throw new Error(`Missing audited animation: ${config.id}/${binding.clip}`);
    }
    return { ...config, kind: "model", audit, config };
  });
  return catalog;
}

/**
 * Local deterministic phrase adapter; production LLMs can submit the same catalog id.
 * @param text A single animal request. Negations, unknown and ambiguous animals are rejected.
 * @param catalog Runtime-available assets, independent from model loading.
 * @returns A catalog entry or a visible error; never silently substitutes an unknown animal.
 */
export function resolveAnimalRequest(text: string, catalog: AnimalAsset[]): AnimalAsset | string {
  const input = text.trim().toLowerCase();
  if (!input) return "请输入你想召唤的动物。";
  if (/不想|不要|不需要|别|取消|移除|删除|清空/.test(input)) return "这不是召唤请求；可使用“请它离开”按钮清空场景。";
  const counts = Array.from(input.matchAll(/(\d+|[一二两三四五六七八九十]+)\s*[只匹头]/g));
  if (counts.some((match) => !["一", "1"].includes(match[1]))) return "请一次指定一只动物。";
  const matches = catalog.flatMap((entry) =>
    entry.aliases.filter((alias) => input.includes(alias)).map((alias) => ({ entry, alias }))
  );
  // Prefer specific species names over substrings, e.g. 小熊猫 over 猫, 剑齿虎 over 虎.
  const specific = matches.filter(
    (match) => !matches.some((other) => other.alias.length > match.alias.length && other.alias.includes(match.alias))
  );
  const ids = new Set(specific.map((match) => match.entry.id));
  const generic = ["狗", "猫", "鸟"].filter(
    (family) => input.includes(family) && !specific.some((match) => match.alias.includes(family))
  );
  if (ids.size > 1 || (ids.size && generic.length)) return "请一次指定一种动物，例如“我想要一只卡斯罗犬”。";
  if (ids.size === 1) return specific[0].entry;
  const defaults: Record<string, string> = { 狗: "labrador", 猫: "cat-orange" };
  if (generic.length === 1 && defaults[generic[0]]) {
    const entry = catalog.find((entry) => entry.id === defaults[generic[0]]);
    if (entry) return entry;
  }
  return "没有找到对应资源，请从下拉框选择素材包中的动物。";
}
