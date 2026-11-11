/** Authored art direction from 世界引擎模版. Colours are sRGB hex; consumers convert to linear. */
export interface WorldTemplate {
  id: string;
  name: string;
  icon: string;
  family:
    | "sakura"
    | "ice"
    | "forest"
    | "cosmic"
    | "ocean"
    | "palace"
    | "torii"
    | "void"
    | "desert"
    | "arcade"
    | "alley"
    | "titan";
  colors: readonly [string, string, string, string];
  subject: string;
  /** Only clearly frozen, arid, bare or submerged references restrict terrestrial plants. */
  vegetation?: "ice" | "desert" | "bare" | "marine";
  terrain: { heightM: number; widthM: number; count: number; coverage: number };
}
const gentleBaseTerrain = { heightM: 10, widthM: 180 };

export const WORLD_TEMPLATES: readonly WorldTemplate[] = [
  {
    id: "sakura-pearl",
    name: "樱雪仙境",
    icon: "🌸",
    family: "sakura",
    colors: ["#f3b7d1", "#f9e9ed", "#ff58ac", "#b7a4d2"],
    subject: "珍珠神树 · 水晶花冠 · 粉雪花雨",
    terrain: { ...gentleBaseTerrain, widthM: 220, count: 2, coverage: 0.76 }
  },
  {
    id: "aurora-palace",
    name: "极光冰晶",
    icon: "❄️",
    family: "ice",
    vegetation: "ice",
    colors: ["#daeaf0", "#ffffff", "#abdeff", "#17345c"],
    subject: "冰晶穹顶 · 雪白极光 · 世界之眼",
    terrain: { ...gentleBaseTerrain, count: 3, coverage: 0.72 }
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
    id: "amethyst-ruins",
    name: "星海紫晶遗迹",
    icon: "🔮",
    family: "cosmic",
    colors: ["#40306d", "#bca1ec", "#dc86ff", "#12152e"],
    subject: "紫晶遗迹 · 星环 · 深空紫鲸",
    terrain: { ...gentleBaseTerrain, count: 3, coverage: 0.58 }
  },
  {
    id: "cobalt-atlantis",
    name: "蔚蓝水下亚特兰蒂斯",
    icon: "🌊",
    family: "ocean",
    vegetation: "marine",
    colors: ["#153a69", "#3796bc", "#56dfff", "#071b39"],
    subject: "蓝宝石神庙 · 珊瑚 · 旋转鱼群",
    terrain: { ...gentleBaseTerrain, count: 2, coverage: 0.65 }
  },
  {
    id: "golden-palace",
    name: "金炽神辉圣殿",
    icon: "🏺",
    family: "palace",
    colors: ["#b68a42", "#f9d77e", "#fff0b0", "#693b42"],
    subject: "黄金柱廊 · 中央圣杯 · 金辉炽日",
    terrain: { ...gentleBaseTerrain, widthM: 250, count: 2, coverage: 0.8 }
  },
  {
    id: "crimson-torii",
    name: "绯红日蚀鸟居",
    icon: "⛩️",
    family: "torii",
    colors: ["#4c2730", "#d3403e", "#ff714f", "#170f24"],
    subject: "螺旋鸟居 · 绯红日蚀 · 悬钟",
    terrain: { ...gentleBaseTerrain, count: 2, coverage: 0.72 }
  },
  {
    id: "cyber-void",
    name: "暗黑赛博虚空",
    icon: "🕳️",
    family: "void",
    vegetation: "bare",
    colors: ["#10141d", "#30394e", "#72f6ff", "#05070f"],
    subject: "机械立方体 · 能量核心 · 全息数据流",
    terrain: { ...gentleBaseTerrain, heightM: 4, widthM: 240, count: 1, coverage: 0.72 }
  },
  {
    id: "voxel-arcade",
    name: "像素潮玩",
    icon: "🛹",
    family: "arcade",
    colors: ["#263560", "#777bed", "#ff75d9", "#10203d"],
    subject: "体素街机厅 · 霓虹网格 · 微型关卡",
    terrain: { ...gentleBaseTerrain, heightM: 8, widthM: 240, count: 1, coverage: 0.8 }
  },
  {
    id: "cosmic-islets",
    name: "星海孤岛",
    icon: "🌌",
    family: "cosmic",
    colors: ["#34426e", "#b5bded", "#f4d68f", "#0c1635"],
    subject: "浮空石质遗迹 · 银河 · 深空鲸鱼",
    terrain: { ...gentleBaseTerrain, count: 3, coverage: 0.55 }
  },
  {
    id: "neon-alley",
    name: "霓虹雨巷",
    icon: "🌧️",
    family: "alley",
    colors: ["#25314a", "#6586b4", "#ff6eb7", "#111d36"],
    subject: "立体霓虹街区 · 细雨 · 全息贩卖机",
    terrain: { ...gentleBaseTerrain, heightM: 6, widthM: 250, count: 1, coverage: 0.82 }
  },
  {
    id: "titan-wasteland",
    name: "幻兽荒原",
    icon: "🏜️",
    family: "desert",
    vegetation: "desert",
    colors: ["#d89756", "#f4c781", "#ffc474", "#7d456b"],
    subject: "暖橙沙丘 · 巨型机甲残骸 · 落日薄雾",
    terrain: { ...gentleBaseTerrain, widthM: 270, count: 4, coverage: 0.85 }
  },
  {
    id: "luminous-abyss",
    name: "深海秘境",
    icon: "🐙",
    family: "ocean",
    vegetation: "marine",
    colors: ["#18385a", "#9274cd", "#79e8ee", "#091d38"],
    subject: "发光水母森林 · 沉船 · 荧光鱼群",
    terrain: { ...gentleBaseTerrain, count: 3, coverage: 0.66 }
  },
  {
    id: "aurora-glacier",
    name: "极光冰川",
    icon: "🧊",
    family: "ice",
    vegetation: "ice",
    colors: ["#b7cfdc", "#d8eeff", "#86ffc3", "#14273f"],
    subject: "冰晶洞穴 · 绿色极光 · 苍穹之眼",
    terrain: { ...gentleBaseTerrain, count: 3, coverage: 0.7 }
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
