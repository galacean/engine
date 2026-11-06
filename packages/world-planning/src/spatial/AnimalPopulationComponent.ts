import {
  DEFAULT_FIREFLY_SETTINGS,
  validateFireflySettings
} from "@galacean/engine-animals/gameplay/animal/FireflyPopulation";
import animalTypes from "../planning-data/animal-types.json";
import populationDefaults from "../planning-data/animal-population-defaults.json";
import {
  DEFAULT_ANIMAL_INTERACTION,
  animalInteractionConfig
} from "@galacean/engine-animals/gameplay/animal/AnimalInteraction";
import type { AnimalPopulationConfig } from "@galacean/engine-animals/gameplay/animal/AnimalPopulation";
import type { PlanningComponentDefinition } from "./PlanningComponents";
import type { PlanningDocument } from "./PlanningDocument";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import { ComponentRegistry, resolveComponent, type SpatialField } from "./SpatialDocument";

/** Lightweight registration metadata; inspecting configuration never imports GLBs or animation runtimes. */
export const SEED_ANIMAL_TYPES = animalTypes.map((type) => ({ ...type, canEat: type.canEat === true }));
/** Biological species are independent of pack, model/body variant and texture appearance. */
export const SEED_ANIMAL_SPECIES = [...new Set(animalTypes.map((t) => t.speciesId))].sort().map((speciesId) => {
  const types = SEED_ANIMAL_TYPES.filter((t) => t.speciesId === speciesId);
  return {
    speciesId,
    label: types[0].label.split(" · ")[0],
    canFly: types.some((t) => t.canFly),
    flyingTypeIds: types
      .filter((t) => t.canFly)
      .map((t) => t.typeId)
      .sort(),
    eatingTypeIds: types
      .filter((t) => t.canEat && !t.canFly)
      .map((t) => t.typeId)
      .sort(),
    typeIds: types.map((t) => t.typeId).sort()
  };
});
const count = (key: string, label: string, value: number, unit: string): SpatialField => ({
  key,
  label,
  description:
    "按 seed 确定性抽样；最少 ≤ 最多，允许 0～N；0/0 排除该物种。仅指导初始化，运行时新增不受此数量范围限制。",
  type: "number",
  unit,
  integer: true,
  min: 0,
  default: value,
  combine: "override"
});
const number = (key: string, label: string, value: number, description: string, unit = "米"): SpatialField => ({
  key,
  label,
  description,
  type: "number",
  unit,
  min: 0,
  default: value,
  combine: "override"
});
const defaultCounts: Readonly<Record<string, { min: number; max: number }>> = populationDefaults;

/** Animal initialization and explicit-addition guidance for the public parameter tools. */
export const ANIMAL_POPULATION_DECLARATION: PlanningSystemDeclaration = {
  id: "animals",
  title: "Animal population and explicit additions",
  skill: "animals",
  components: [
    {
      type: "animals",
      domain: "composition",
      knowledge: [
        "Animal species and count ranges guide initialization only. Zero-to-positive ranges are valid; set birdCount.min and birdCount.max to 0 for no birds. For a lifeless world such as Mars, set species.min/species.max and birdCount.min/birdCount.max to 0 and fireflies.enabled:false; fireflies are an independent population. Keep enabled:true when later runtime additions should remain available; enabled:false disables the animal system itself. Submit both endpoints together when necessary to keep min <= max. Defaults are not mandatory minimums. Candidate scarcity or an unmet minimumEatingAnimals preference never rejects otherwise valid initialization parameters.",
        "Use world.animals.catalog to discover registered content and world.animals.spawn to explicitly add an animal. Initialization species selection and count ranges never cap these additions. A successful spawn saves stable identity, appearance and birth pose to the current project's database, isolated by seed; refresh and population rebuild restore it. Autonomous movement and animation clocks are not saved as author edits. Reusing the same requestId and input is idempotent across refresh. These additions do not participate in editor.history.undo. An accepted receipt confirms storage, not completion of asynchronous model loading; inspect the returned identity for loading status."
      ]
    }
  ]
};

/** Whole-map population intent. Counts and density are evaluated only during initialization/publication. */
export const ANIMAL_POPULATION_COMPONENT: PlanningComponentDefinition = {
  type: "animals",
  label: "动物分布",
  version: 10,
  tab: "ecology",
  group: "动物",
  runtime: true,
  strict: true,
  kinds: ["world"],
  ranges: [
    ["species.min", "species.max"],
    ["birdCount.min", "birdCount.max"],
    ...SEED_ANIMAL_SPECIES.filter((s) => !s.canFly).map(
      (s) => [`species.${s.speciesId}.min`, `species.${s.speciesId}.max`] as [string, string]
    )
  ],
  fields: [
    { key: "enabled", label: "启用动物", type: "boolean", default: true, combine: "override" },
    { key: "fireflies.enabled", label: "夏夜萤火虫", type: "boolean", default: true, combine: "override" },
    {
      ...number("fireflies.maximumCount", "萤火虫上限", 96, "相机附近的最大活动只数；独立于鸟类额度，0 关闭。", "只"),
      integer: true,
      max: 256
    },
    { ...number("fireflies.radius", "萤火虫显示范围", 48, "世界坐标中的虫群保持原位，范围外淡出。"), min: 8, max: 96 },
    { ...number("fireflies.speed", "萤火虫飞行速度", 0.65, "平滑随机飞行速度；0 保留静止虫群。", "米/秒"), max: 3 },
    { ...number("fireflies.intensity", "萤火虫亮度", 1, "亮核与柔光的发光倍率；0 隐藏。", "倍"), max: 5 },
    ...(
      [
        ["approachDistance", "快速接近感知距离", "米"],
        ["approachSpeed", "接近速度阈值", "米/秒"],
        ["approachCooldown", "避让冷却", "秒"],
        ["clickDistance", "点击驱赶距离", "米"],
        ["biteDistance", "取食距离", "米"],
        ["minimumCropMaturity", "最低可食成熟度", "比例"],
        ["feedingSeconds", "吃掉一株或一颗所需时间", "秒"],
        ["feedingReachHeightRatio", "可达高度与身高比", "倍"]
      ] as const
    ).map(([key, label, unit]) => ({
      ...number(
        `interaction.${key}`,
        label,
        DEFAULT_ANIMAL_INTERACTION[key],
        "仅影响运行时行为；距离为 0 时停用对应交互，配置经作者事务保存。",
        unit
      ),
      ...(key === "minimumCropMaturity" ? { max: 1 } : {})
    })),
    {
      ...count("minimumEatingAnimals", "可进食动物最少数量", 2, "只"),
      description: "在物种数量及各物种数量范围内优先选择具有真实进食动画的模型；条件不足时保留可实现数量，0 关闭偏好。"
    },
    count("species.min", "最少物种数", 14, "种"),
    count("species.max", "最多物种数", 20, "种"),
    count("birdCount.min", "可飞行动物最少总数", 10, "只"),
    count("birdCount.max", "可飞行动物最多总数", 20, "只"),
    number(
      "birdSpawnPointWeight",
      "可飞行动物出生点权重",
      4,
      "只应用于具备可用飞行动画的模型，与草地、河流栖息权重竞争；仅影响出生位置，不保证附近数量。",
      "权重"
    ),
    number(
      "spawnPointRadius",
      "出生点偏好半径",
      96,
      "围绕发布的主角出生点，单位米；仅用于初始化偏好，不限制活动范围。附近候选耗尽后回退全图合法栖息地。"
    ),
    number(
      "activationDistance",
      "显示距离",
      256,
      "距相机的水平米数；缓冲区内预加载并完整模拟，圈外已加载动物继续粗模拟；不受镜头朝向影响。"
    ),
    number(
      "noiseScale",
      "分布噪声尺度",
      160,
      "全图密度斑块的尺度，单位米。只影响初始化位置，不限制运动；同物种各模型共享密度图。"
    ),
    {
      ...number(
        "noiseStrength",
        "分布聚集强度",
        0.8,
        "0 为均匀分布，1 为强聚集。保留非零背景密度，不改变请求数量。",
        "比例"
      ),
      max: 1
    },
    ...SEED_ANIMAL_SPECIES.filter((s) => !s.canFly).flatMap((s) => [
      count(`species.${s.speciesId}.min`, `${s.label} · 最少数量`, defaultCounts[s.speciesId]?.min ?? 1, "只"),
      count(`species.${s.speciesId}.max`, `${s.label} · 最多数量`, defaultCounts[s.speciesId]?.max ?? 2, "只")
    ])
  ],
  validate(values) {
    validateFireflySettings({
      ...DEFAULT_FIREFLY_SETTINGS,
      ...Object.fromEntries(
        Object.keys(DEFAULT_FIREFLY_SETTINGS)
          .filter((key) => values[`fireflies.${key}`] !== undefined)
          .map((key) => [key, values[`fireflies.${key}`]])
      )
    });
    animalInteractionConfig(
      Object.fromEntries(
        Object.keys(DEFAULT_ANIMAL_INTERACTION)
          .filter((key) => values[`interaction.${key}`] !== undefined)
          .map((key) => [key, values[`interaction.${key}`]])
      )
    );
    if (
      values.minimumEatingAnimals !== undefined &&
      (!Number.isSafeInteger(values.minimumEatingAnimals) || Number(values.minimumEatingAnimals) < 0)
    )
      throw new Error("可进食动物最少数量必须为非负整数");
    for (const key of ["activationDistance", "noiseScale", "spawnPointRadius"])
      if (
        values[key] !== undefined &&
        (typeof values[key] !== "number" || !Number.isFinite(values[key]) || Number(values[key]) <= 0)
      )
        throw new Error(`${key} 必须为正的有限米数`);
    if (
      values.birdSpawnPointWeight !== undefined &&
      (!Number.isFinite(values.birdSpawnPointWeight) || Number(values.birdSpawnPointWeight) < 0)
    )
      throw new Error("出生点权重须为非负有限数");
    if (
      values.noiseStrength !== undefined &&
      (!Number.isFinite(values.noiseStrength) || Number(values.noiseStrength) < 0 || Number(values.noiseStrength) > 1)
    )
      throw new Error("聚集强度必须为 0–1");
    for (const prefix of [
      "species",
      "birdCount",
      ...SEED_ANIMAL_SPECIES.filter((s) => !s.canFly).map((s) => `species.${s.speciesId}`)
    ]) {
      const min = values[`${prefix}.min`],
        max = values[`${prefix}.max`];
      for (const value of [min, max])
        if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0))
          throw new Error(`${prefix} 数量必须为非负整数`);
      if (min !== undefined && max !== undefined && Number(min) > Number(max))
        throw new Error(`${prefix} 最少数量不得超过最多数量`);
    }
  }
};
const registry = new ComponentRegistry();
registry.register(ANIMAL_POPULATION_COMPONENT);

/** Resolve sparse settings and inherited values without persisting generated animal instances. */
export function readAnimalPopulationSettings(document: PlanningDocument) {
  const source = document.entities.world.components.animals
    ? document
    : {
        ...document,
        entities: {
          ...document.entities,
          world: {
            ...document.entities.world,
            components: { ...document.entities.world.components, animals: { values: {} } }
          }
        }
      };
  const resolved = resolveComponent(source, "world", "animals", registry);
  registry.validate("animals", resolved.values);
  return resolved;
}

/** Select species without replacement, then counts, body variants and independent appearance streams. */
export function readAnimalPopulationConfig(document: PlanningDocument): AnimalPopulationConfig {
  const { values } = readAnimalPopulationSettings(document);
  const seed = Number(document.entities.world.components.world?.values.seed ?? document.passthrough.parameters.seed);
  const sample = (key: string) => {
    let hash = seed | 0;
    for (const ch of `animal-species-v1:${key}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
  };
  const integer = (prefix: string, key: string) =>
    Number(values[`${prefix}.min`]) +
    Math.floor(sample(key) * (Number(values[`${prefix}.max`]) - Number(values[`${prefix}.min`]) + 1));
  const totalSpecies = integer("species", "count");
  const birdTotal = integer("birdCount", "bird-count");
  const ranked = SEED_ANIMAL_SPECIES.filter((s) =>
    s.canFly ? birdTotal > 0 : Number(values[`species.${s.speciesId}.max`]) > 0
  ).sort((a, b) => sample(a.speciesId) - sample(b.speciesId) || a.speciesId.localeCompare(b.speciesId));
  const flying = ranked.find((s) => s.flyingTypeIds.length);
  const selected = totalSpecies && flying ? [flying] : [];
  const requiredFeeders = new Map<string, number>();
  let unallocatedFeeders = totalSpecies && values.enabled !== false ? Number(values.minimumEatingAnimals) : 0;
  const feederCandidates = ranked
    .filter((s) => !s.canFly && s.eatingTypeIds.length)
    .sort((a, b) => Number(values[`species.${b.speciesId}.max`]) - Number(values[`species.${a.speciesId}.max`]));
  for (const species of feederCandidates) {
    if (unallocatedFeeders <= 0 || selected.length >= totalSpecies) break;
    const count = Math.min(unallocatedFeeders, Number(values[`species.${species.speciesId}.max`]));
    selected.push(species);
    requiredFeeders.set(species.speciesId, count);
    unallocatedFeeders -= count;
  }
  for (const species of ranked) {
    if (selected.length >= totalSpecies) break;
    if (selected.includes(species) || (species.canFly && selected.filter((s) => s.canFly).length >= birdTotal))
      continue;
    selected.push(species);
  }
  const birdSpecies = selected.filter((s) => s.canFly);
  const allocations = new Map(
    selected.map((s) => [
      s.speciesId,
      s.canFly
        ? 1
        : Math.max(requiredFeeders.get(s.speciesId) ?? 0, integer(`species.${s.speciesId}`, `count:${s.speciesId}`))
    ])
  );
  for (let i = birdSpecies.length; birdSpecies.length && i < birdTotal; i++) {
    const s = birdSpecies[Math.floor(sample(`bird:${i}`) * birdSpecies.length)];
    allocations.set(s.speciesId, allocations.get(s.speciesId)! + 1);
  }
  const counts = new Map<string, number>();
  for (const species of selected) {
    for (let i = 0; i < allocations.get(species.speciesId)!; i++) {
      // Every animal in the flight quota must have a registered usable flight clip.
      const pool = species.canFly
        ? species.flyingTypeIds
        : i < (requiredFeeders.get(species.speciesId) ?? 0)
          ? species.eatingTypeIds
          : species.typeIds;
      const id = pool[Math.floor(sample(`model:${species.speciesId}:${i}`) * pool.length)];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  // Seed worlds are square. The authoritative accepted plan replaces these bounds at runtime,
  // so this authoring projection never supplies geometry from an unaccepted draft.
  const width = 1024; // Current SpatialWorld domain; runtime always uses the accepted plan bounds.
  return {
    version: 2,
    enabled: Boolean(values.enabled),
    fireflies: {
      enabled: Boolean(values["fireflies.enabled"]),
      maximumCount: Number(values["fireflies.maximumCount"]),
      radius: Number(values["fireflies.radius"]),
      speed: Number(values["fireflies.speed"]),
      intensity: Number(values["fireflies.intensity"])
    },
    interaction: animalInteractionConfig(
      Object.fromEntries(Object.keys(DEFAULT_ANIMAL_INTERACTION).map((key) => [key, values[`interaction.${key}`]]))
    ),
    spawnRadius: width * Math.SQRT2,
    roamRadius: width * Math.SQRT2,
    activationDistance: Number(values.activationDistance),
    distribution: {
      minX: 0,
      minZ: 0,
      maxX: width,
      maxZ: width,
      noiseScale: Number(values.noiseScale),
      noiseStrength: Number(values.noiseStrength)
    },
    types: SEED_ANIMAL_TYPES.map(({ typeId, speciesId, canFly }) => ({
      typeId,
      densityGroup: speciesId,
      ...(canFly
        ? { spawnPoint: { weight: Number(values.birdSpawnPointWeight), radius: Number(values.spawnPointRadius) } }
        : {}),
      min: counts.get(typeId) ?? 0,
      max: counts.get(typeId) ?? 0
    }))
  };
}
