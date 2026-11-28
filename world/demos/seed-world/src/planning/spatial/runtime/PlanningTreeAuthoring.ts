import { Color } from "@galacean/engine-math";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { beginSeedWorldProjectEdit } from "../../../../agent-adapter/SeedWorldProjectEdit";
import type { SeedWorldAgentApplication } from "../../../../agent-adapter/SeedWorldAgentApplication";
import {
  decodePlantParameters,
  encodePlantParameters,
  resolvePlantJSONReferences
} from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import type {
  PlantInstanceVariation,
  ProceduralPlantAsset
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantAsset";
import { scaleProceduralPlantWood } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantAsset";
import type { PlantMaterialManifest } from "@galacean/engine-vegetation/asset-assembly/PlantMaterialManifest";
import {
  PLANT_MATERIAL_SLOTS,
  plantMaterialField
} from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import type {
  PlanningParameterCommand,
  PlanningSession
} from "@galacean/engine-world-planning/spatial/PlanningSession";
import { planningVegetationReferences } from "./PlanningProjectSource";
import type {
  PlanningNaturalVegetationRuntime,
  PlanningPlantAppearancePreview
} from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import { NATURAL_VEGETATION_CONTROLS } from "@galacean/engine-world-planning/planning-data/NaturalVegetationProfile";
import { NATURAL_VEGETATION_SIZE_CONTROLS } from "@galacean/engine-world-planning/runtime/NaturalVegetationLayers";

type Rgb = readonly [number, number, number];
const plantPartLabels: Readonly<Record<string, string>> = {
  bark: "树干", leaves: "树叶", stem: "茎叶", petals: "花瓣", cap: "菌盖", foliage: "茎叶", blades: "草叶"
};
type ShaderValue = { type: string; value: number | Record<string, number> };
export interface TreeMaterialSource {
  shader: string;
  shaderData: Record<string, ShaderValue>;
  macros: { name: string; value?: string }[];
}
interface Species {
  id: string;
  displayName?: string;
  parameterFile: string;
  instanceScale?: Rgb;
  instanceVariation?: PlantInstanceVariation;
}
interface Catalog {
  assets: Species[];
  treeRecipes: (Species & { trunkMaterialFile: string; leafMaterialFile: string })[];
  shrubRecipes: (Species & { materialFiles: Record<string, string> })[];
}

/** These are the native shader inputs, including the feature switches that consume them. */
export const TREE_MATERIAL_FIELDS = [
  { key: "secondColorEnabled", label: "启用第二色", macro: "MATERIAL_ENABLE_SECOND_COLOR", group: "颜色与层次" },
  { key: "secondColor", label: "第二色", uniform: "material_SecondColor", color: true, group: "颜色与层次" },
  { key: "secondColorOffset", label: "第二色位置", uniform: "material_SecondColorOffset", group: "颜色与层次" },
  { key: "secondColorFade", label: "第二色渐变", uniform: "material_SecondColorFade", group: "颜色与层次" },
  {
    key: "secondColorLevel",
    label: "第二色高度",
    uniform: "material_SecondColorLevel",
    group: "颜色与层次",
    requires: "MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT"
  },
  {
    key: "secondColorGradient",
    label: "第二色高度渐变",
    uniform: "material_SecondColorGradient",
    group: "颜色与层次",
    requires: "MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT"
  },
  {
    key: "albedoBrightness",
    label: "明度",
    uniform: "material_LeafAlbedoBrightness",
    min: 0,
    group: "表面",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "albedoDesaturation",
    label: "去饱和",
    uniform: "material_LeafAlbedoDesaturation",
    min: 0,
    max: 1,
    group: "表面",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "albedoTextureBlend",
    label: "纹理叠加",
    uniform: "material_LeafAlbedoTextureBlend",
    min: 0,
    max: 1,
    group: "表面",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "baseAoInfluence",
    label: "树冠遮蔽",
    uniform: "material_LeafBaseAOInfluence",
    min: 0,
    max: 1,
    group: "表面",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  { key: "smoothness", label: "光滑度", uniform: "material_Smoothness", min: 0, max: 1, group: "表面" },
  {
    key: "normalStrength",
    label: "法线强度",
    uniform: "material_NormalScale",
    min: 0,
    group: "表面",
    requires: "MATERIAL_HAS_NORMALTEXTURE"
  },
  { key: "alphaCutoff", label: "透明裁剪", uniform: "material_AlphaCutoff", min: 0, max: 1, group: "覆盖与法线" },
  {
    key: "glancingAngleCut",
    label: "掠射裁剪",
    uniform: "material_LeafGlancingAngleCut",
    min: 0,
    max: 1,
    group: "覆盖与法线",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "flipBackfaceNormals",
    label: "背面法线翻转",
    uniform: "material_LeafFlipBackfaceNormals",
    boolean: true,
    group: "覆盖与法线",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  { key: "translucencyEnabled", label: "启用透射光", macro: "MATERIAL_ENABLE_TRANSLUCENCY", group: "透射光" },
  { key: "translucencyColor", label: "透射色", uniform: "material_TranslucencyColor", color: true, group: "透射光" },
  {
    key: "translucencyIntensity",
    label: "透射强度",
    uniform: "material_TranslucencyIntensity",
    min: 0,
    group: "透射光"
  },
  {
    key: "translucencyAoInfluence",
    label: "透射遮蔽影响",
    uniform: "material_TranslucencyAOInfluence",
    min: 0,
    max: 1,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "normalDistortion",
    label: "透射法线扰动",
    uniform: "material_TranslucencyNormalDistortion",
    min: 0,
    max: 1,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "scatteringExponent",
    label: "透射散射指数",
    uniform: "material_TranslucencyScattering",
    min: 1,
    max: 50,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "directStrength",
    label: "透射直接光",
    uniform: "material_TranslucencyDirect",
    min: 0,
    max: 1,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "ambientStrength",
    label: "透射环境光",
    uniform: "material_TranslucencyAmbient",
    min: 0,
    max: 1,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_LEAF"
  },
  {
    key: "normalWrap",
    label: "透射法线包裹",
    uniform: "material_TranslucencyNormalWrap",
    min: 0,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_SHRUB"
  },
  {
    key: "backlightThreshold",
    label: "背光起点",
    uniform: "material_TranslucencyBacklightThreshold",
    min: 0,
    max: 0.999,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_SHRUB"
  },
  {
    key: "energyScale",
    label: "透射能量倍率",
    uniform: "material_TranslucencyEnergyScale",
    min: 0,
    group: "透射光",
    requires: "MATERIAL_VEGETATION_CLIMATE_SHRUB"
  },
  {
    key: "shadowStrength",
    label: "透射阴影响应",
    uniform: "material_TranslucencyShadowStrength",
    min: 0,
    max: 1,
    group: "透射光"
  }
] as const;
export type TreeMaterialField = (typeof TREE_MATERIAL_FIELDS)[number];
export type TreeMaterialValues = Record<string, number | boolean | string | Rgb>;

export function treeColorToHex(color: Rgb): string {
  return (
    "#" +
    color
      .map((channel) =>
        Math.round(Math.max(0, Math.min(1, Color.linearToGammaSpace(channel))) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
export function treeHexToColor(hex: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("颜色必须为六位 HEX");
  return [1, 3, 5].map((offset) =>
    Color.gammaToLinearSpace(parseInt(hex.slice(offset, offset + 2), 16) / 255)
  ) as unknown as Rgb;
}

export function treeMaterialValues(material: TreeMaterialSource): TreeMaterialValues {
  return Object.fromEntries(
    TREE_MATERIAL_FIELDS.map((field) => {
      if ("macro" in field) return [field.key, material.macros.some((macro) => macro.name === field.macro)];
      const value = material.shaderData[field.uniform]?.value;
      if ("color" in field) {
        const color = typeof value === "object" ? value : { r: 0, g: 0, b: 0 };
        return [field.key, treeColorToHex([color.r, color.g, color.b])];
      }
      return [field.key, "boolean" in field ? Number(value ?? 0) >= 0.5 : Number(value ?? 0)];
    })
  );
}

/** Change authored Material inputs only; textures, wind, LOD and unrelated macros remain intact. */
export function patchTreeMaterial(source: TreeMaterialSource, changes: TreeMaterialValues): TreeMaterialSource {
  const next = structuredClone(source);
  for (const [key, value] of Object.entries(changes)) {
    const field = TREE_MATERIAL_FIELDS.find((field) => field.key === key);
    if (!field) throw new Error(`未知树木材质参数：${key}`);
    if ("macro" in field) {
      if (typeof value !== "boolean") throw new Error(`无效开关：${key}`);
      next.macros = next.macros.filter((macro) => macro.name !== field.macro);
      if (value) next.macros.push({ name: field.macro });
    } else if ("color" in field) {
      const rgb = typeof value === "string" ? treeHexToColor(value) : value;
      if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every((channel) => Number.isFinite(channel) && channel >= 0))
        throw new Error(`无效颜色：${key}`);
      const [r, g, b] = rgb;
      const previous = next.shaderData[field.uniform]?.value;
      next.shaderData[field.uniform] = {
        type: "Color",
        value: { r, g, b, a: typeof previous === "object" ? (previous.a ?? 1) : 1 }
      };
    } else {
      const numeric = "boolean" in field && typeof value === "boolean" ? Number(value) : value;
      if (
        typeof numeric !== "number" ||
        !Number.isFinite(numeric) ||
        ("min" in field && numeric < field.min) ||
        ("max" in field && numeric > field.max)
      )
        throw new Error(`无效材质数值：${field.label}`);
      next.shaderData[field.uniform] = { type: "Float", value: numeric };
    }
  }
  return next;
}

export interface PlanningTreeSlot {
  id: string;
  part: string;
  label: string;
  materialPath?: string;
  material: TreeMaterialSource;
  baseColor: Rgb;
  sharedSlotCount: number;
}
export interface PlanningTreeSnapshot {
  revision: number;
  assetId: string;
  species: { id: string; label: string }[];
  slots: PlanningTreeSlot[];
  catalogPath: string;
  entry: Species;
  instanceEditable: boolean;
  landscape: Record<string, unknown>;
  layers?: string[];
}

/** The selected plant keeps the density and growth controls of its actual functional layers. */
export function plantLandscapeControls(layers: readonly string[] = ["trees"]) {
  return layers.flatMap((key) => {
    if (key === "trees") return [
      { key: "vegetation.trees", label: "全局树木密度（0–1）", min: 0, max: 1 },
      { key: "treeHeightMinM", label: "全局树高下限（m）", min: Number.MIN_VALUE },
      { key: "treeHeightMaxM", label: "全局树高上限（m）", min: Number.MIN_VALUE }
    ];
    const layer = NATURAL_VEGETATION_CONTROLS.find((layer) => layer.key === key);
    const size = NATURAL_VEGETATION_SIZE_CONTROLS.find((layer) => layer.key === key);
    return layer ? [
      { key: `vegetation.${key}`, label: `${layer.label}密度（0–1）`, min: 0, max: 1 },
      ...(size ? [
        { key: `plantSizes.${key}.scaleMin`, label: `${layer.label}共享尺度下限`, min: Number.MIN_VALUE },
        { key: `plantSizes.${key}.scaleMax`, label: `${layer.label}共享尺度上限`, min: Number.MIN_VALUE }
      ] : [])
    ] : [];
  });
}
export interface PlanningTreeChange {
  appearance?: { slotId: string; baseColor?: Rgb; material?: TreeMaterialValues };
  resetAppearance?: string;
  instance?: {
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    yawDegrees: number;
    leafSize: number;
    leafDensity: number;
  };
  woodThickness?: number;
  resetShape?: boolean;
  landscape?: Record<string, number> | null;
}
export interface PlanningTreeAuthoringOptions {
  project: RuntimeProjectSession;
  editor: RuntimeNativeEditor;
  application: Pick<SeedWorldAgentApplication, "beginEdit" | "stageProjectEdit">;
  planning: PlanningSession;
  readVegetation?(): Pick<PlanningNaturalVegetationRuntime, "previewAppearance" | "appearancePreview"> | undefined;
}

/** UI adapter over the production Source, native assets and the same transaction used by Agent edits. */
export class PlanningTreeAuthoring {
  busy = false;
  status = "";
  private readonly listeners = new Set<() => void>();
  constructor(readonly options: PlanningTreeAuthoringOptions) {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  private async read(path: string): Promise<unknown> {
    const provider = this.options.project.fileProvider();
    await provider.prepare?.(path);
    const content = provider.read(path);
    if (content === undefined) throw new Error(`无法读取植被资产：${path}`);
    return decodePlantParameters(typeof content === "string" ? JSON.parse(content) : content);
  }
  private async original(path: string, signal: AbortSignal): Promise<unknown> {
    const file = this.options.project.projectPackage.project.files.find((file) => file.virtualPath === path);
    if (!file) throw new Error(`植被资产不存在：${path}`);
    const response = await fetch(file.path, { signal });
    if (!response.ok) throw new Error(`无法读取素材默认值：${path} (${response.status})`);
    return response.json();
  }
  async snapshot(assetId?: string, layers: readonly string[] = ["trees", "shrubs"]): Promise<PlanningTreeSnapshot> {
    const { project, planning } = this.options;
    const revision = project.publicationRevision;
    const references = planningVegetationReferences(project.projectPackage);
    if (!references) throw new Error("工程缺少植被资源组件");
    const [catalog, appearance] = await Promise.all([
      this.read(references.catalog).then((value) => resolvePlantJSONReferences(value) as Catalog),
      this.read(references.appearance).then((value) => resolvePlantJSONReferences(value) as PlantMaterialManifest)
    ]);
    const slots = PLANT_MATERIAL_SLOTS.filter((slot) =>
      slot.layers.some((layer) => layers.includes(layer))
    );
    // Structure assets use the appearance manifest. Native tree/shrub recipes
    // own their Material references in the species catalog instead.
    const materialSlots: Record<string, Record<string, { material?: string; baseColor: Rgb }>> = {
      ...appearance.assets
    };
    for (const recipe of catalog.treeRecipes)
      materialSlots[recipe.id] = Object.fromEntries(
        slots
          .filter((slot) => slot.assetId === recipe.id)
          .map((slot) => [
            slot.materialId,
            {
              material: slot.role === "bark" ? recipe.trunkMaterialFile : recipe.leafMaterialFile,
              baseColor: slot.defaultColor
            }
          ])
      );
    for (const recipe of catalog.shrubRecipes)
      materialSlots[recipe.id] = Object.fromEntries(
        slots
          .filter((slot) => slot.assetId === recipe.id)
          .map((slot) => [
            slot.materialId,
            {
              material: recipe.materialFiles[slot.materialId],
              baseColor: slot.defaultColor
            }
          ])
      );
    const entries = [...catalog.assets, ...catalog.treeRecipes, ...catalog.shrubRecipes].filter((entry) =>
      slots.some((slot) => slot.assetId === entry.id)
    );
    const isTree = (entry: Species) => slots.some((slot) => slot.assetId === entry.id && slot.layers.includes("trees"));
    entries.sort((a, b) => Number(isTree(b)) - Number(isTree(a)));
    const species = entries.map((entry) => ({ id: entry.id, label: entry.displayName ?? entry.id }));
    const entry = entries.find((entry) => entry.id === assetId) ?? entries[0];
    if (!entry) throw new Error("工程没有此类别的可编辑植被");
    const parameters = planning.inspect("world").components.find((component) => component.type === "plantMaterial");
    const selectedSlots = slots.filter((slot) => slot.assetId === entry.id);
    const hasCap = selectedSlots.some((slot) => slot.part === "cap");
    const materials = await Promise.all(
      selectedSlots.map(async (slot) => {
        const binding = materialSlots[entry.id]?.[slot.materialId];
        if (!binding?.material) throw new Error(`材质槽缺少原生 Material：${slot.label}`);
        const material = (await this.read(binding.material)) as TreeMaterialSource;
        const preview = this.options.readVegetation?.()?.appearancePreview(entry.id, slot.materialId);
        for (const [property, value] of Object.entries(preview?.shaderData ?? {}))
          material.shaderData[property] =
            typeof value === "number"
              ? { type: "Float", value }
              : { type: "Color", value: { r: value[0], g: value[1], b: value[2], a: value[3] } };
        for (const [name, enabled] of Object.entries(preview?.macros ?? {})) {
          material.macros = material.macros.filter((macro) => macro.name !== name);
          if (enabled) material.macros.push({ name });
        }
        const baseColor = ["r", "g", "b"].map((channel, index) => {
          const key = plantMaterialField(entry.id, slot.materialId, channel as "r" | "g" | "b", slot.part);
          return parameters?.sources[key]?.length ? Number(parameters.values[key]) : binding.baseColor[index];
        }) as unknown as Rgb;
        const partSlots = selectedSlots.filter((candidate) => candidate.part === slot.part);
        const partLabel = slot.part === "stem" && hasCap ? "菌柄" : plantPartLabels[slot.part] ?? slot.part;
        return {
          id: slot.materialId,
          part: slot.part,
          label: `${partLabel}${partSlots.length > 1 ? ` ${partSlots.indexOf(slot) + 1}` : ""}`,
          materialPath: binding.material,
          material,
          baseColor: preview?.baseColor ?? baseColor,
          sharedSlotCount: Object.values(materialSlots)
            .flatMap(Object.values)
            .filter((candidate) => candidate.material === binding.material).length
        };
      })
    );
    if (revision !== project.publicationRevision) return this.snapshot(assetId, layers);
    return {
      revision,
      assetId: entry.id,
      species,
      slots: materials,
      catalogPath: references.catalog,
      entry,
      instanceEditable: selectedSlots.some((slot) => slot.layers.some((layer) => layer === "trees" || layer === "shrubs")) &&
        catalog.assets.some((asset) => asset.id === entry.id),
      layers: [...new Set(selectedSlots.flatMap((slot) => slot.layers))],
      landscape: planning.inspect("world").components.find((component) => component.type === "landscape")?.values ?? {}
    };
  }

  /** Pointer input updates the current vegetation directly; no project edit or world rebuild. */
  previewAppearance(
    snapshot: PlanningTreeSnapshot,
    slotId: string,
    change: { baseColor?: Rgb; material?: TreeMaterialValues }
  ): void {
    const runtime = this.options.readVegetation?.();
    if (!runtime) throw new Error("当前植被尚未就绪");
    const slot = snapshot.slots.find((slot) => slot.id === slotId);
    if (!slot) throw new Error("请选择真实植被材质槽");
    const patch: PlanningPlantAppearancePreview = { ...(change.baseColor ? { baseColor: change.baseColor } : {}) };
    if (change.material) {
      const material = patchTreeMaterial(slot.material, change.material);
      const shaderData: Record<string, number | readonly [number, number, number, number]> = {},
        macros: Record<string, boolean> = {};
      for (const key of Object.keys(change.material)) {
        const field = TREE_MATERIAL_FIELDS.find((field) => field.key === key)!;
        if ("macro" in field) macros[field.macro] = material.macros.some((macro) => macro.name === field.macro);
        else {
          const value = material.shaderData[field.uniform].value;
          shaderData[field.uniform] = typeof value === "number" ? value : [value.r, value.g, value.b, value.a];
        }
      }
      patch.shaderData = shaderData;
      patch.macros = macros;
    }
    runtime.previewAppearance(snapshot.assetId, slotId, patch);
  }

  /** Accept the preview through the same Planning/Material transaction as other authoring. */
  async saveAppearance(snapshot: PlanningTreeSnapshot, slotId: string): Promise<void> {
    const preview = this.options.readVegetation?.()?.appearancePreview(snapshot.assetId, slotId);
    if (
      !preview ||
      (!preview.baseColor && !Object.keys(preview.shaderData ?? {}).length && !Object.keys(preview.macros ?? {}).length)
    )
      throw new Error("没有待保存的配色或材质修改");
    const material: TreeMaterialValues = {};
    for (const field of TREE_MATERIAL_FIELDS) {
      if ("macro" in field) {
        const enabled = preview.macros?.[field.macro];
        if (enabled !== undefined) material[field.key] = enabled;
      } else {
        const value = preview.shaderData?.[field.uniform];
        if (value !== undefined)
          material[field.key] = typeof value === "number" ? value : [value[0], value[1], value[2]];
      }
    }
    await this.apply(snapshot, { appearance: { slotId, baseColor: preview.baseColor, material } });
  }

  async apply(snapshot: PlanningTreeSnapshot, change: PlanningTreeChange): Promise<void> {
    await this.perform(async () => {
      const { editor, application, project } = this.options;
      if (snapshot.revision !== project.publicationRevision) throw new Error("工程已变化，请刷新参数后重试");
      const signal = new AbortController().signal;
      const edit = beginSeedWorldProjectEdit(application, editor, crypto.randomUUID(), signal);
      const commands: PlanningParameterCommand[] = [];
      const update = async (path: string, content: unknown) => {
        await edit.tools
          .find((tool) => tool.name === "asset.update")!
          .execute({ path, content: JSON.stringify(content) }, { signal });
      };
      let committed = false;
      try {
        if (change.appearance || change.resetAppearance) {
          const slot = snapshot.slots.find((slot) => slot.id === (change.appearance?.slotId ?? change.resetAppearance));
          if (!slot?.materialPath) throw new Error("请选择真实植被材质槽");
          const fields = ["r", "g", "b"].map((channel) =>
            plantMaterialField(snapshot.assetId, slot.id, channel as "r" | "g" | "b", slot.part)
          );
          if (change.resetAppearance) {
            commands.push({ op: "reset", entity: "world", component: "plantMaterial", fields });
            await update(slot.materialPath, await this.original(slot.materialPath, signal));
          } else {
            const color = change.appearance!.baseColor;
            if (color) {
              if (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0))
                throw new Error("颜色须包含三个有限非负线性通道");
              commands.push({
                op: "set",
                entity: "world",
                component: "plantMaterial",
                values: Object.fromEntries(fields.map((field, index) => [field, color[index]]))
              });
            }
            const material = change.appearance!.material;
            if (material && Object.keys(material).length)
              await update(
                slot.materialPath,
                patchTreeMaterial((await this.read(slot.materialPath)) as TreeMaterialSource, material)
              );
          }
        }
        if (change.landscape !== undefined)
          commands.push(
            change.landscape === null
              ? {
                  op: "reset",
                  entity: "world",
                  component: "landscape",
                  fields: plantLandscapeControls(snapshot.layers).map((field) => field.key)
                }
              : { op: "set", entity: "world", component: "landscape", values: change.landscape }
          );
        if (commands.length) {
          const receipt = await edit.runPlanning((session) => session.dispatchParameters(commands));
          if (receipt.status !== "accepted") throw new Error(receipt.message ?? "树木参数未被接受");
        }
        if (change.instance || change.resetShape) {
          if (!snapshot.instanceEditable) throw new Error("此树种不使用实例形态参数");
          const catalog = (await this.read(snapshot.catalogPath)) as Catalog;
          const entry = catalog.assets.find((entry) => entry.id === snapshot.assetId)!;
          if (change.resetShape) {
            const original = ((await this.original(snapshot.catalogPath, signal)) as Catalog).assets.find(
              (entry) => entry.id === snapshot.assetId
            );
            if (!original) throw new Error("原素材没有此树种");
            for (const key of ["instanceScale", "instanceVariation"] as const) {
              if (original[key] === undefined) delete entry[key];
              else Object.assign(entry, { [key]: structuredClone(original[key]) });
            }
          } else {
            const shape = change.instance!;
            entry.instanceScale = [shape.scaleX, shape.scaleY, shape.scaleZ];
            if (!entry.instanceScale.every((value) => Number.isFinite(value) && value > 0))
              throw new Error("树形比例必须为正数");
            entry.instanceVariation = {
              leafColor: [1, 1, 1],
              barkTint: [1, 1, 1],
              ...entry.instanceVariation,
              yawDegrees: shape.yawDegrees,
              leafSize: shape.leafSize,
              leafDensity: shape.leafDensity
            };
            if (
              !Number.isFinite(shape.yawDegrees) ||
              !Number.isFinite(shape.leafSize) ||
              shape.leafSize <= 0 ||
              !Number.isFinite(shape.leafDensity) ||
              shape.leafDensity < 0 ||
              shape.leafDensity > 1
            )
              throw new Error("无效的树叶形态参数");
          }
          await update(snapshot.catalogPath, catalog);
        }
        if (change.woodThickness !== undefined) {
          if (!snapshot.instanceEditable) throw new Error("此树种不使用曲面结构资产");
          const factor = change.woodThickness;
          if (!Number.isFinite(factor) || factor <= 0) throw new Error("枝干粗细倍率必须为正数");
          const raw = await this.read(snapshot.entry.parameterFile);
          const asset = decodePlantParameters<ProceduralPlantAsset>(raw);
          const woodySlots = new Set(snapshot.slots.filter((slot) => slot.part === "bark").map((slot) => slot.id));
          const edited = scaleProceduralPlantWood(asset, woodySlots, factor);
          await update(snapshot.entry.parameterFile, encodePlantParameters(edited));
        }
        if (snapshot.revision !== project.publicationRevision) throw new Error("工程已变化，请刷新参数后重试");
        await edit.prepare(signal);
        await edit.commit();
        committed = true;
        await edit.activate(signal);
        await project.flush();
      } catch (error) {
        if (committed) throw new Error(`修改已提交；运行更新或保存失败：${String(error)}`);
        throw error;
      } finally {
        await edit.complete?.();
        edit.discard();
      }
    });
  }
  private async perform(operation: () => Promise<void>): Promise<void> {
    if (this.busy) throw new Error("正在应用树木参数");
    this.busy = true;
    this.status = "正在应用…";
    this.notify();
    try {
      await operation();
      this.status = "已生效并保存";
    } catch (error) {
      this.status = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.busy = false;
      this.notify();
    }
  }
}
