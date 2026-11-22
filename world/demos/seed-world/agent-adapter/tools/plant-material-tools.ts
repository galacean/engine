import * as z from "zod";
import { PLANT_MATERIAL_SLOTS, plantMaterialField } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import vegetation from "@galacean/engine-world-planning/planning-data/natural-vegetation.json";
import type { PlanningParameterCommand } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SeedWorldParameterAuthoring } from "./parameter-tools.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { jsonObjectSchema } from "./tool-contract.ts";

const text = z.string().min(1);
const rgb = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
const filter = z.strictObject({
  parts: z.array(text).min(1).optional(), layers: z.array(text).min(1).optional(), assetIds: z.array(text).min(1).optional()
});
const group = z.object({ part: text, layers: z.array(text), slotCount: z.number().int().positive(),
  layerNames: z.array(text).describe("生态层在原生种植配方中的名称，与 layers 的稳定标识逐项对应"),
  parameterColorRange: z.object({ min: rgb, max: rgb }), authoredChannelCount: z.number().int().nonnegative() });
const rawReceipt = z.object({
  status: z.enum(["accepted", "rejected", "superseded"]),
  versionToken: text,
  changedIds: z.array(z.string()),
  diagnostics: z.array(jsonObjectSchema),
  message: z.string().optional()
});
const applyOutput = z.object({
  status: rawReceipt.shape.status,
  versionToken: text,
  changedCount: z.number().int().nonnegative(),
  changedIds: z.array(z.string()),
  diagnostics: z.array(jsonObjectSchema),
  message: z.string().optional(),
  matchedSlotCount: z.number().int().positive()
});
export const SEED_WORLD_PLANT_MATERIAL_CONTRACTS = [
  defineSeedWorldApiContract({
    name: "vegetation.materials.inspect", domain: "vegetation", effect: "read", inputMode: "optional",
    description: "读取全部公开世界级植被材质的原生部位/生态层分组、槽数、当前线性 RGB 参数范围与事务版本。filter 各维度取交集，同一维度取并集。颜色范围包含作者继承与原生槽默认值；未覆盖的草材质实际跟随 grassAppearance。返回参数不代表最终像素。",
    inputDescription: "可按真实 parts、layers、assetIds 限定；省略 filter 表示全部公开世界级植被材质。",
    outputDescription: "完整分组摘要与当前事务版本；不改作者参数或植被分布。",
    input: z.strictObject({ filter: filter.optional() }),
    output: z.object({ scope: z.literal("shared-materials"), instanceSelectionSupported: z.literal(false),
      affectedAssetIds: z.array(text).describe("这些素材的所有实例和LOD共用修改；不是当前画面实例集合。"), versionToken: text, matchedSlotCount: z.number().int().nonnegative(), groups: z.array(group) })
  }),
  defineSeedWorldApiContract({
    name: "vegetation.materials.apply", domain: "vegetation",
    description: "原子设置所选原生植被材质集合的线性 RGB [r,g,b]；null 清除三个通道覆盖，恢复来源。filter 各维度取交集、同一维度取并集，省略表示全部公开槽。空集合或矛盾重叠拒绝；同物种所有实例和 LOD 共用。沿用参数 schema、版本、继承与保存机制；仅编辑材质，不改变草地色场、种植、取景或光照。",
    inputDescription: "使用 inspect 返回的真实部位/生态层，明确本次集合的线性 RGB；versionToken 可选（省略时自动读取最新版本）；没有风格或颜色预设。",
    outputDescription: "原生事务状态、版本、变化实体、诊断与匹配槽数；accepted 仅代表作者事务接受，外层 execute 提交后生效。",
    input: z.strictObject({ versionToken: text.optional(), changes: z.array(z.strictObject({ filter: filter.optional(), baseColor: rgb.nullable() })).min(1) }),
    output: applyOutput
  })
] as const;

type Filter = z.output<typeof filter> | undefined;
const channels = ["r", "g", "b"] as const;
const layerNames = new Map(vegetation.layers.map(layer => [layer.key, layer.id]));
const grouping = (slot: typeof PLANT_MATERIAL_SLOTS[number]) => ({ part: slot.part, layers: slot.layers,
  layerNames: slot.layers.map(layer => layerNames.get(layer) ?? layer), slotCount: 0 });
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

/** A material colour is one RGB vector on a native slot, never three unrelated names. */
export function createPlantMaterialTools(authoring: SeedWorldParameterAuthoring) {
  const slots = () => {
    const definitions = z.array(z.object({ type: text, fields: z.array(z.object({ key: text })) })).parse(json(authoring.describe()));
    const keys = new Set(definitions.find(item => item.type === "plantMaterial")?.fields.map(field => field.key));
    return PLANT_MATERIAL_SLOTS.filter(slot => channels.every(channel => keys.has(plantMaterialField(slot.assetId, slot.materialId, channel))));
  };
  const matches = (slot: typeof PLANT_MATERIAL_SLOTS[number], query: Filter) =>
    (!query?.parts || query.parts.includes(slot.part)) &&
    (!query?.layers || slot.layers.some(layer => query.layers!.includes(layer))) &&
    (!query?.assetIds || query.assetIds.includes(slot.assetId));
  const [inspect, apply] = SEED_WORLD_PLANT_MATERIAL_CONTRACTS;
  return [
    defineSeedWorldTool(inspect, { execute: (input = {}) => {
      const snapshot = z.object({ versionToken: text, components: z.array(z.object({ type: text,
        values: z.record(z.string(), z.unknown()), sources: z.record(z.string(), z.array(z.string())) })) }).parse(json(authoring.inspect("world")));
      const component = snapshot.components.find(item => item.type === "plantMaterial");
      if (!component) throw new Error("World plant material authoring is unavailable");
      const selected = slots().filter(slot => matches(slot, input.filter));
      const groups = new Map<string, z.output<typeof group>>();
      for (const slot of selected) {
        const color = rgb.parse(channels.map((channel, index) => component.values[plantMaterialField(slot.assetId, slot.materialId, channel)] ?? slot.defaultColor[index]));
        const key = JSON.stringify([slot.layers, slot.part]);
        const item = groups.get(key) ?? { ...grouping(slot),
          parameterColorRange: { min: [...color], max: [...color] }, authoredChannelCount: 0 };
        item.slotCount++;
        for (const [index, channel] of channels.entries()) {
          item.parameterColorRange.min[index] = Math.min(item.parameterColorRange.min[index], color[index]);
          item.parameterColorRange.max[index] = Math.max(item.parameterColorRange.max[index], color[index]);
          if (component.sources[plantMaterialField(slot.assetId, slot.materialId, channel)]?.length) item.authoredChannelCount++;
        }
        groups.set(key, item);
      }
      return { scope: "shared-materials" as const, instanceSelectionSupported: false as const, affectedAssetIds: [...new Set(selected.map(slot=>slot.assetId))], versionToken: snapshot.versionToken, matchedSlotCount: selected.length, groups: [...groups.values()] };
    } }),
    defineSeedWorldTool(apply, { execute: async (input, context) => {
      const available = slots(), values = new Map<string, number | null>(), selectedIdentities = new Set<string>();
      for (const change of input.changes) {
        const selected = available.filter(slot => matches(slot, change.filter));
        if (!selected.length) throw new Error(`No publicly editable native material matches ${JSON.stringify(change.filter ?? {})}`);
        for (const slot of selected) {
          selectedIdentities.add(JSON.stringify([slot.assetId, slot.materialId]));
          for (const [index, channel] of channels.entries()) {
            const key = plantMaterialField(slot.assetId, slot.materialId, channel), value = change.baseColor?.[index] ?? null;
            if (values.has(key) && values.get(key) !== value) throw new Error(`Conflicting colours for native material channel: ${key}`);
            values.set(key, value);
          }
        }
      }
      const set = [...values].filter((entry): entry is [string, number] => entry[1] !== null);
      const reset = [...values].filter(([, value]) => value === null).map(([key]) => key);
      const commands: PlanningParameterCommand[] = [
        ...(set.length ? [{ op: "set" as const, entity: "world", component: "plantMaterial", values: Object.fromEntries(set) }] : []),
        ...(reset.length ? [{ op: "reset" as const, entity: "world", component: "plantMaterial", fields: reset }] : [])
      ];
      const versionToken = input.versionToken ?? z.object({ versionToken: text }).parse(json(authoring.inspect("world"))).versionToken;
      const value = rawReceipt.parse(json(await authoring.apply(commands, versionToken, context.signal)));
      return {
        status: value.status,
        versionToken: value.versionToken,
        changedCount: value.changedIds.length,
        changedIds: value.changedIds,
        diagnostics: value.diagnostics.slice(0, 32),
        ...(value.message ? { message: value.message } : {}),
        matchedSlotCount: selectedIdentities.size
      };
    } })
  ];
}
