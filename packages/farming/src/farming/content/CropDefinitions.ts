import type { CropDefinition } from "../domain/FarmDefinitions";
import { FARM_CROP_CONTENT } from "./CropContent";
import { getCropGrowthProfile } from "../profiles/CropGrowthProfiles";

type Milestone = readonly [id: string, name: string, age: number];
const foliage: Milestone = ["vegetative", "茎叶扩展", 0.2];
const root: readonly Milestone[] = [
  ["vegetative", "展叶", 0.2],
  ["swelling", "肉质根膨大", 0.45]
];
const fruit: readonly Milestone[] = [
  foliage,
  ["flowering", "开花", 0.38],
  ["fruiting", "果实膨大", 0.45],
  ["ripening", "成熟中", 0.75]
];
const milestones: Readonly<Record<string, readonly Milestone[]>> = {
  beetroot: root,
  carrot: root,
  radish: root,
  potato: [foliage, ["tuber", "块茎膨大", 0.45]],
  cabbage: [
    ["rosette", "外叶展开", 0.2],
    ["heading", "内叶形成与结球", 0.45]
  ],
  tomato: fruit,
  melon: fruit,
  pumpkin: fruit,
  watermelon: fruit,
  grapevine: [
    ["vegetative", "枝蔓与展叶", 0.2],
    ["fruiting", "葡萄串膨大", 0.45],
    ["ripening", "转色", 0.75]
  ],
  wheat: [
    ["jointing", "展叶与拔节", 0.2],
    ["heading", "抽穗", 0.45],
    ["filling", "灌浆", 0.66]
  ],
  rice: [
    ["tillering", "分蘖", 0.18],
    ["jointing", "拔节", 0.45],
    ["heading", "抽穗灌浆", 0.7]
  ],
  canola: [
    ["vegetative", "抽薹与展叶", 0.2],
    ["flowering", "开花", 0.38],
    ["pods", "结荚与灌浆", 0.65]
  ],
  sunflower: [foliage, ["flowering", "花盘展开", 0.38], ["filling", "籽实形成与下垂", 0.78]]
};

/** Current balance values belong to content; no simulation/renderer species branches. */
export const CROP_DEFINITIONS: readonly CropDefinition[] = FARM_CROP_CONTENT.map((entry) => {
  const profile = getCropGrowthProfile(entry.id);
  if (!profile || !milestones[entry.id]) throw new Error(`缺少物种配置：${entry.id}`);
  const keys: readonly Milestone[] = [
    ["seeded", "已播种", 0],
    ["seedling", "出苗", 0],
    ...milestones[entry.id],
    ["mature", "成熟", 1]
  ];
  return {
    id: entry.id,
    version: 2,
    name: entry.name,
    cycle: {
      id: `${entry.id}-growth`,
      revision: 1,
      growthTarget: entry.idealSeconds * 1000,
      baseGrowthUnitsPerSecond: 1000,
      stages: keys.map(([id, name, age], i) => ({ id, name, minimumProgress: i === 0 ? 0 : 0.2 + age * 0.8 }))
    },
    growthFactors: profile.factors,
    appearance: {
      plantId: entry.assetId,
      plantRevision: 1,
      recipeRevision: 1,
      ageByStage: keys.map(([stageId, , age]) => ({ stageId, age })),
      emergence: { start: 0.15, end: 0.2 }
    },
    harvest: { itemId: `${entry.id}-fruit`, itemName: entry.produce, quantity: entry.quantity }
  };
});
