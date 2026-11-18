import type rockVariants from "../integrations/terrain/rock-formation/RockVariantCatalog.json";

/** Authored art direction from 世界引擎模版. Colours are sRGB hex; consumers convert to linear. */
export interface WorldTemplate {
  id: string;
  name: string;
  icon: string;
  family: "sakura" | "forest" | "low-poly" | "desert";
  colors: readonly [string, string, string, string];
  subject: string;
  /** The desert template uses a sparse shrub habitat. */
  vegetation?: "desert";
  /** Named asset pool, or template-owned placements. Defaults to the project shared pool. */
  rockSource?: keyof typeof rockVariants.pools | "authored";
  /** Overrides the source for small stones independently of the mountain source. */
  stoneSource?: WorldTemplate["rockSource"];
  /** Source of the color on grass-bearing rock tops. */
  rockTopCover?: "grass" | "ground";
  terrain: { heightM: number; widthM: number; count: number; coverage: number };
}
const gentleBaseTerrain = { heightM: 10, widthM: 180 };

export const WORLD_TEMPLATES: readonly WorldTemplate[] = [
  {
    id: "sakura-pearl",
    name: "樱雪仙境",
    icon: "🌸",
    family: "sakura",
    rockSource: "shared",
    colors: ["#f3b7d1", "#f9e9ed", "#ff58ac", "#b7a4d2"],
    subject: "珍珠神树 · 水晶花冠 · 粉雪花雨",
    terrain: { ...gentleBaseTerrain, widthM: 220, count: 2, coverage: 0.76 }
  },
  {
    id: "emerald-forest",
    name: "萤光巨木森林",
    icon: "🌿",
    family: "forest",
    colors: ["#234d3d", "#73ead0", "#a4ffc1", "#102b37"],
    subject: "翡翠巨木 · 发光蘑菇 · 孢子环绕",
    terrain: { ...gentleBaseTerrain, widthM: 190, count: 2, coverage: 0.82 }
  },
  {
    id: "low-poly",
    rockSource: "authored",
    name: "Low Poly",
    icon: "🌲",
    family: "low-poly",
    colors: ["#8e9b47", "#ce985c", "#c8683d", "#70adce"],
    subject: "石拱溪谷 · 橙瓦村庄 · 湖岸麦田",
    terrain: { heightM: 12, widthM: 190, count: 3, coverage: 0.86 }
  },
  {
    id: "titan-wasteland",
    rockSource: "shared",
    rockTopCover: "ground",
    name: "幻兽荒原",
    icon: "🏜️",
    family: "desert",
    vegetation: "desert",
    colors: ["#d89756", "#f4c781", "#207b5d", "#e34f3b"],
    subject: "红岩绿洲 · 绯树砾岸",
    // The oasis is a level floodplain. Its canyon walls and distant benches are separate authored landforms.
    terrain: { ...gentleBaseTerrain, widthM: 270, count: 0, coverage: 0.85 }
  }
];
export function worldTemplate(id: unknown): WorldTemplate | undefined {
  return WORLD_TEMPLATES.find((template) => template.id === id);
}
export function templateBaseSeed(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function templateLinearColor(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}
