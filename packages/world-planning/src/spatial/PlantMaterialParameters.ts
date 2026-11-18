import { PLANT_SPECIES, PLANT_SPECIES_MATERIALS } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import {
  NATURAL_VEGETATION_PALETTES,
  SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS
} from "../runtime/NaturalVegetationLayers.ts";
import type { PlanningDocument } from "./PlanningDocument";
import type { PlanningComponentDefinition } from "./PlanningComponents";
import { ComponentRegistry, resolveComponent } from "./SpatialDocument";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import { varyPlantColor, type PlantAppearanceSample } from "@galacean/engine-vegetation/world/VegetationColorVariation";

/** Physical plant parts are separate from the rendering role and content-addressed appearance identity. */
const materialPartNames: Readonly<Record<string, string>> = {
  bark: "bark",
  leaf: "leaves",
  shrub: "foliage",
  grass: "blades",
  flower: "petals",
  mushroom: "cap"
};
function nativeMaterialPart(binding: { role: string; component?: string }): string {
  const part = binding.component
    ? binding.component === "leaf"
      ? "leaves"
      : binding.component
    : materialPartNames[binding.role];
  if (!part) throw new Error(`Unknown native plant material part: ${binding.role}`);
  return part;
}
const vegetationLayers = Object.entries(NATURAL_VEGETATION_PALETTES).map(([key, palette]) => ({ key, palette }));
const materialDirectory = vegetationLayers
  .filter((layer) => layer.key !== "grass")
  .map((layer) => ({
    category: layer.key,
    assets: Object.fromEntries(
      layer.palette
        .filter((id) => SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS.has(id))
        .map((id) => [
          id,
          Object.entries(PLANT_SPECIES_MATERIALS[id] ?? {}).map(([materialId, binding]) => [
            nativeMaterialPart(binding),
            materialId
          ])
        ])
    )
  }));

const PLANT_MATERIALS_FACT =
  "# 植被材质目录\n\n来自实际生态配方和原生材质 manifest。assets 按资产 ID 索引，每项是 [部位, materialId]。对应的确切字段是 <assetId>/<部位>/<materialId>/baseColor.r、.g、.b，其中资产、部位和材质身份分别用 encodeURIComponent 编码。\n\n目录只提供身份和语义。当前颜色要读取，操作是否合法由原生 schema 校验。\n\n```json\n" +
  JSON.stringify(materialDirectory) +
  "\n```\n";

export const PLANT_MATERIAL_DECLARATION: PlanningSystemDeclaration = {
  id: "plant-material",
  title: "植被材质",
  skill: "vegetation",
  components: [
    {
      type: "plantMaterial",
      domain: "vegetation",
      facts: [{ path: "plant-materials.md", content: PLANT_MATERIALS_FACT }],
      knowledge: [
        "plantMaterial 直接编辑现有程序化素材的物种、变体、材质槽的线性 RGB baseColor。世界作用范围可以修改乔木、灌木、草本和花瓣的颜色，同一物种的所有实例和 LOD 共用该槽的覆盖。它已支持树木和灌木配色，不需要单株编辑能力。只有用户要求只改某一株或局部花区时，全局物种覆盖才不能满足这个更窄的范围。reset 清除覆盖并恢复默认来源，明确的 0 会保留。",
        "字段单位是线性 RGB，有限非负值，大于 1 保留 HDR 强度。可用的资产、部位和字段路径见[植被材质目录](declare/editor/world/facts/plant-materials.md)。用 inspect 的 fields 读取相关槽的当前值和来源。声明可以用 describe 的 component=plantMaterial、tags 按真实部位筛选。query 查询作者对象，不查询材质槽。本组件是世界级的，不需要枚举每个 POI。",
        "同类素材可以在一个脚本内批量读取，并按材质槽把三个通道整理成 RGB 返回给模型，保留真实的资产、槽和部位身份。按实际结果预算分页，不返回重复的完整字段说明或不相关的区域。首个分页不是整个目录。",
        "花瓣、茎叶、树叶和树干是不同的材质槽，槽标签来自真实素材。明确指定部位时，只修改该部位。题材或情绪创作可以根据整体配色选择相关槽，不必等用户逐个点名。多色需要不同的真实花变体或材质槽，增加密度或场景饱和度不会产生新的花色。低草铺底由 grassAppearance 对接 Terrain/Grass 的共享色场，不在这个组件内。",
        "整体场景创作要为各层安排配色角色：乔木、灌木、低草、高草与杂草、匍匐地被、野花、落叶与菌类都参与主次、冷暖和饱和度层次。只改 grassAppearance 或两种树叶，不代表其他素材已重新搭配。按方案相关的物种发现和读取材质。可以让主要植物色域和点缀形成对比，用较低饱和度的茎叶、地被或落叶连接它们。蘑菇的菌盖和菌柄、花瓣和茎叶按真实的槽分别设计。保留物种和部位的差异，不要把所有素材统一染色。尺寸和轮廓读 landscape 的功能层共享 plantSizes.<layerKey>.scaleMin/scaleMax、乔木 treeHeight 和低草 grassRelativeHeight，尺寸不逐物种设置。分布和出现比例读实际的生态组件。数值依当前线性 RGB、物种和方案选择，情绪没有固定的颜色配方。",
        "本组件只改变素材颜色，不增加植物实例，不切换物种，也不移动植株。要改变分布或花变体比例时，使用目标实际公开的生态组件和 flowers 组件。",
        "Seed World 草类和地被叶片未编辑的通道跟随 grassAppearance 的草地色场。地被默认在同色相基础上只变化 ±20% 明度，花瓣保留原色。显式的通道仍按本组件覆盖，包括 0。reset 恢复草地继承。Asset Assembly 保留素材原色。"
      ]
    }
  ]
};

type Rgb = readonly [number, number, number];
type Channel = "r" | "g" | "b";
const channels: readonly Channel[] = ["r", "g", "b"];
const activeAssets = new Set(
  vegetationLayers.filter((layer) => layer.key !== "grass").flatMap((layer) => layer.palette)
);
const entries = new Map(PLANT_SPECIES.map((entry) => [entry.id, entry]));
const assetLayers = new Map<string, string[]>();
for (const layer of vegetationLayers)
  for (const assetId of layer.palette) {
    const layers = assetLayers.get(assetId) ?? [];
    layers.push(layer.key);
    assetLayers.set(assetId, layers);
  }

/** Native asset/material identities; colours never enter shared Material or Mesh identities. */
export const PLANT_MATERIAL_SLOTS = Object.entries(PLANT_SPECIES_MATERIALS)
  .sort(([a], [b]) => [...activeAssets].indexOf(a) - [...activeAssets].indexOf(b))
  .flatMap(([assetId, slots]) => {
    if (!activeAssets.has(assetId)) return [];
    const entry = entries.get(assetId);
    return Object.entries(slots).map(([materialId, binding]) => {
      const part = nativeMaterialPart(binding);
      return {
        assetId,
        materialId,
        part,
        role: binding.role,
        component: "component" in binding ? binding.component : undefined,
        layers: assetLayers.get(assetId) ?? [],
        label: `${entry?.displayName ?? assetId} · ${part} · ${materialId}`,
        defaultColor: binding.baseColor as unknown as Rgb
      };
    });
  });

const nativeSlots = new Map(
  PLANT_MATERIAL_SLOTS.map((slot) => [JSON.stringify([slot.assetId, slot.materialId]), slot])
);
export function plantMaterialField(assetId: string, materialId: string, channel: Channel, part?: string): string {
  const nativePart = nativeSlots.get(JSON.stringify([assetId, materialId]))?.part;
  if (part && nativePart && part !== nativePart)
    throw new Error(`Mismatched native plant material part: ${assetId}/${part}/${materialId}`);
  const physicalPart = nativePart ?? part;
  return `${encodeURIComponent(assetId)}/${physicalPart ? encodeURIComponent(physicalPart) + "/" : ""}${encodeURIComponent(materialId)}/baseColor.${channel}`;
}

/** Import old scalar keys without changing native resource identities, authored zeros or source bases. */
const legacyFields = new Map(
  PLANT_MATERIAL_SLOTS.flatMap((slot) =>
    channels.map((channel) => [
      `${slot.assetId}/${slot.materialId}/baseColor.${channel}`,
      plantMaterialField(slot.assetId, slot.materialId, channel)
    ])
  )
);
export function normalizePlantMaterialFields(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [key, value] of Object.entries(values)) {
    const canonical = legacyFields.get(key) ?? key;
    if (result.has(canonical) && result.get(canonical) !== value)
      throw new Error(`Conflicting native plant material channels: ${canonical}`);
    result.set(canonical, value);
  }
  return Object.fromEntries(result);
}

const fieldBindings = new Map(
  PLANT_MATERIAL_SLOTS.flatMap((slot) =>
    channels.map(
      (channel, index) => [plantMaterialField(slot.assetId, slot.materialId, channel), { ...slot, index }] as const
    )
  )
);

export const PLANT_MATERIAL_COMPONENT: PlanningComponentDefinition = {
  type: "plantMaterial",
  label: "树冠、灌木、花瓣与茎叶材质配色",
  version: 2,
  tab: "ecology",
  presentation: true,
  inspector: false,
  description:
    "按真实部位/生态层处理完整材质集合可用 world.parameters.materials.inspect/apply；返回完整分组并原子设置 RGB 向量，无需列举逐通道字段。单槽字段名为物种/部位/材质身份/baseColor.通道；部位来自原生素材：petals 花瓣、stem 茎叶、leaves 树叶、bark 树干、foliage 草本地被、blades 草叶、cap 菌盖。覆盖线性 RGB，有限非负值并支持大于1的HDR强度，可改变素材原色。同一部位多个真实材质用稳定材质身份区分，不依显示名称或颜色推测部位。tags.layer 为生态类别，tags.part 为上述部位，describe.tags 可精确筛选。各槽独立，同一物种所有实例和 LOD 共用；不改变人口，不能限定单株或单个花区。0 有效，reset 恢复默认来源；Seed 草类未覆盖通道继承 grassAppearance，叶片槽恢复目录规则生成色，其他槽恢复素材原色。地表与低草共享色场由 grassAppearance 控制。",
  fields: PLANT_MATERIAL_SLOTS.flatMap((slot) =>
    channels.map((channel, index) => ({
      key: plantMaterialField(slot.assetId, slot.materialId, channel),
      label: `${slot.label} · ${channel.toUpperCase()}`,
      tags: { layer: slot.layers.join("/"), part: slot.part },
      type: "number" as const,
      min: 0,
      step: 0.01,
      unit: "线性 RGB",
      default: slot.defaultColor[index],
      hidden: !SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS.has(slot.assetId),
      combine: "override" as const,
      kinds: ["world"]
    }))
  )
};
// Reuse the same schema and generic resolver without a runtime cycle through PlanningComponents.
const materialRegistry = new ComponentRegistry();
materialRegistry.register(PLANT_MATERIAL_COMPONENT);

/** Only explicitly authored channels override the source renderer, including per-part native colour. */
export type PlantMaterialParameters = Readonly<Record<string, number>>;
export function readPlantMaterialParameters(document: PlanningDocument): PlantMaterialParameters {
  if (!document.entities.world?.components.plantMaterial) return {};
  const { values, sources } = resolveComponent(document, "world", "plantMaterial", materialRegistry);
  // Defaults describe the material slot, but each source part may have its own authored native colour.
  // Only explicit parameters (including a base source) replace that per-part value at runtime.
  return validatePlantMaterialParameters(
    Object.fromEntries(Object.entries(values).filter(([key]) => sources[key]?.length))
  );
}

export function validatePlantMaterialParameters(values: Readonly<Record<string, unknown>>): PlantMaterialParameters {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(normalizePlantMaterialFields(values))) {
    if (!fieldBindings.has(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`程序化植被材质参数无效：${key}`);
    result[key] = value;
  }
  return result;
}

/** Default foliage variation precedes absolute authoring. Petals, fungi and shared grass keep their owners. */
export function resolvePlantMaterialColor(
  values: PlantMaterialParameters,
  assetId: string,
  materialId: string,
  source: Rgb,
  appearance?: PlantAppearanceSample,
  authoredColorScale?: Rgb
): Rgb {
  const role = PLANT_SPECIES_MATERIALS[assetId]?.[materialId]?.role;
  source = varyPlantColor(
    source,
    role === "leaf" || role === "shrub" ? appearance?.foliage : role === "bark" ? appearance?.bark : undefined
  );
  return channels.map((channel, index) => {
    const authored = values[plantMaterialField(assetId, materialId, channel)];
    return authored === undefined ? source[index] : authored * (authoredColorScale?.[index] ?? 1);
  }) as unknown as Rgb;
}

/** Explicit channels retain their override semantics when a grass slot inherits the World palette. */
export function plantMaterialColorOverrideMask(
  values: PlantMaterialParameters,
  assetId: string,
  materialId: string
): Rgb {
  return channels.map((channel) =>
    Object.prototype.hasOwnProperty.call(values, plantMaterialField(assetId, materialId, channel)) ? 1 : 0
  ) as unknown as Rgb;
}
