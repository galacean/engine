import * as z from "zod";
import { AgentCancelledError, defineTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { AgentMessage } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { requestSceneGenerationChat } from "./SceneVisualIntentTransport.ts";
import type { SceneGenerationEvent, SceneGenerationSession } from "./SceneVisualIntentController.ts";
import { PLANT_MATERIAL_SLOTS, plantMaterialField } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { NATURAL_VEGETATION_CONTROLS } from "@galacean/engine-world-planning/planning-data/NaturalVegetationProfile";
import { NATURAL_VEGETATION_LAYER_MEMBERS, vegetationAssetCategories } from "@galacean/engine-world-planning/runtime/NaturalVegetationLayers";
import { FLOWER_ASSET_VARIANTS } from "@galacean/engine-world-planning/planning-data/FlowerAssetWeights";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { PlanningWorldHandoff } from "../../src/planning/spatial/runtime/PlanningWorldSource.ts";
import { readSubjectView, selectSubjectView, selectFlowerView, subjectVolumes } from "@galacean/engine-world-planning/spatial/PlanningSubjectView";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import { PLANNING_REFERENCE } from "@galacean/engine-world-planning/planning-data/PlanningReference";
import { minimumRgbSaturation, recolorRgb } from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";

/** The requested first-generation palette floor; neutral colours have no hue to saturate. */
export const SCENE_GENERATION_MINIMUM_PALETTE_SATURATION = 0.5;
export const SCENE_GENERATION_MINIMUM_SKY_SATURATION = 0.3;

const numericRange = z.strictObject({ min: z.number(), max: z.number() }).nullable();
const publicationSchema = z.strictObject({
  vegetation: z.record(z.string(), numericRange).nullable(),
  flowers: z.strictObject({ regions: z.number().int().nonnegative(), areaM2: z.number().nonnegative(), densityPerM2: numericRange }),
  volumes: z.strictObject({ buildings: z.number().int().nonnegative(), rocks: z.number().int().nonnegative(), heightM: numericRange })
});

/** Facts from the accepted native publication, independent of a model's scene labels. */
export function readSceneGenerationPublication(planning: PlanningSession): z.infer<typeof publicationSchema> | null {
  const plan = planning.result?.plan;
  if (!plan) return null;
  const range = (values: number[]) => values.length ? {
    min: values.reduce((min, value) => Math.min(min, value), Infinity),
    max: values.reduce((max, value) => Math.max(max, value), -Infinity)
  } : null;
  const distribution = plan.naturalVegetation;
  const densities = distribution ? [distribution.world, ...Object.values(distribution.regions)] : [];
  const layers = new Set(densities.flatMap(density => Object.keys(density)));
  const flowers = plan.flowerRegions ?? [];
  const heights = [...plan.buildings, ...plan.rocks].flatMap(volume => volume.boxes?.map(box => box.sizeY) ?? [volume.height]);
  return {
    vegetation: distribution ? Object.fromEntries([...layers].map(layer => [layer,
      range(densities.flatMap(density => density[layer] === undefined ? [] : [density[layer]!]))])) : null,
    flowers: { regions: flowers.length, areaM2: flowers.reduce((area, region) => area + region.areaM2, 0),
      densityPerM2: range(flowers.map(region => region.config.densityPerM2)) },
    volumes: { buildings: plan.buildings.length, rocks: plan.rocks.length, heightM: range(heights) }
  };
}

const rgb = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
const text = z.string().min(1);
const scalar = z.union([z.number(), z.boolean(), z.string()]);
const paletteColor = rgb.describe(`沿用现有 sRGB 颜色输入，三个通道均为0–1。有彩配色的HSV饱和度至少${SCENE_GENERATION_MINIMUM_PALETTE_SATURATION * 100}%，低于下限时程序保持色相和HSV亮度并提升饱和度；黑白灰保持无彩。程序保留各原生素材及色场端点的加权RGB亮度层次，超出色域时等比缩放，不额外转换颜色空间。显式颜色优先于季节调色。`);
const skyColor = z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()])
  .describe(`原生天空渐变的线性 RGB 乘数，允许 HDR 通道大于1。有彩配色的HSV饱和度至少${SCENE_GENERATION_MINIMUM_SKY_SATURATION * 100}%，程序保留色相与最大通道并落实下限；黑白灰保持无彩。这是乘在大气散射上的配色，不是最终屏幕RGB。`);
const skyPalette = z.strictObject({ zenith: skyColor, horizon: skyColor })
  .describe("完整天空渐变：同时指定天顶 zenith 与地平线 horizon，两端独立配色。该配色接管原生两个渐变端点及混合权重1，避免再次混入中性白色稀释饱和度；不修改日照时刻、大气散射底色或曝光。");
const skyPaletteFields = ["customSkyTintStrength", ...["Zenith", "Horizon"].flatMap(region =>
  ["R", "G", "B"].map(channel => `customSky${region}${channel}`))];
const generationInput = z.strictObject({
  excludeCategories: z.array(text).min(1).optional(),
  palette: z.strictObject({ layers: z.record(text, z.record(text, paletteColor)).optional(), sky: skyPalette.optional() }).optional(),
  parameters: z.array(z.strictObject({
    component: text,
    scope: z.union([z.enum(["world", "all"]), z.strictObject({ ids: z.array(text).min(1) })]),
    values: z.record(text, scalar)
  })).optional(),
  focus: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("building").describe("建筑是用户要求的首次画面主体；以已发布建筑体量取景，不要求提供素材模型或主体 ID。"), id: text.optional() }),
    z.strictObject({ kind: z.literal("volume").describe("空间体量是首次画面主体；以已发布完整 OBB 部件取景。"), id: text.optional() }),
    z.strictObject({ kind: z.literal("flowers").describe("花区或成片花丛是首次画面主体；相机进入真实种植区，以人的眼高观察。配色范围或其他环境内容不改变此取景职责。"), id: text.optional() }),
    z.strictObject({ kind: z.literal("environment").describe("用户没有要求具体主体时的环境视角；不会为任何建筑、体量或花区求主体取景。") })
  ]).describe("依据用户要求选择首次画面主体，独立于参数编辑范围。明确主体必须选择对应 kind；world/all 只是修改范围，不能成为选择 environment 的理由。省略 id 由原生算法在本次发布结果中选择主体。")
});

/** The model and local parser share native authoring's writable fields and scopes. */
export function createSceneGenerationInput(planning: PlanningSession): z.ZodType<z.infer<typeof generationInput>> {
  const parameters = sceneParameterDefinitions(planning).flatMap(component => {
    const instanceKinds = new Set(planning.query({ component: component.type }).filter(entity => entity.id !== "world").map(entity => entity.kind));
    const fields = component.fields.filter(field => !field.readonly);
    const schemas = new Map(fields.map(field => {
      let value: z.ZodType<number | boolean | string>;
      if (field.type === "number") {
        let number = z.number();
        if (field.min !== undefined) number = number.min(field.min);
        if (field.max !== undefined) number = number.max(field.max);
        if (field.integer) number = number.int();
        value = number;
      } else if (field.type === "boolean") value = z.boolean();
      else value = field.options?.length ? z.enum(field.options) : z.string();
      return [field.key, value.optional()] as const;
    }));
    const worldFields = fields.filter(field => field.worldWritable);
    const instanceFields = fields.filter(field => [...instanceKinds].some(kind => !field.kinds || field.kinds.includes(kind)));
    const availableFields = fields.filter(field => worldFields.includes(field) || instanceFields.includes(field));
    if (!availableFields.length) return [];
    const values = (selected: typeof fields) => z.strictObject(Object.fromEntries(selected.map(field => [field.key, schemas.get(field.key)!])))
      .pipe(z.record(text, scalar));
    const variant = (scope: z.ZodType<"all" | "world" | { ids: string[] }>, selected: typeof fields) =>
      z.strictObject({ component: z.literal(component.type), scope, values: values(selected) });
    // Identical scopes share one field object; mixed components retain their field-level permissions.
    if (worldFields.length === availableFields.length && !instanceFields.length)
      return [variant(z.enum(["world", "all"]), availableFields)];
    if (!worldFields.length) return [variant(z.union([z.literal("all"), z.strictObject({ ids: z.array(text).min(1) })]), instanceFields)];
    return [variant(z.literal("all"), availableFields), variant(z.literal("world"), worldFields),
      ...(instanceFields.length ? [variant(z.strictObject({ ids: z.array(text).min(1) }), instanceFields)] : [])];
  });
  const categories = [...new Set(scenePopulationBindings(planning).flatMap(binding => binding.categories))];
  return generationInput.extend({ excludeCategories: z.array(z.enum(categories)).min(1).optional(),
    palette: createScenePaletteInput(sceneColorBindings(planning)).optional(),
    parameters: z.array(z.union(parameters)).optional()
      .describe("原生参数修改对象的 JSON 数组，每项直接提供 component、scope、values。必须使用数组和对象本身，不把数组或 values 序列化为字符串。") });
}

/** Resolve absence over every actual population source, including layers containing mixed categories. */
function scenePopulationBindings(planning: PlanningSession) {
  const definitions = planning.describe();
  return [
    ...NATURAL_VEGETATION_LAYER_MEMBERS.map(({ key, categories }) => ({ component: "landscape", field: `vegetation.${key}`, categories })),
    { component: "flowers", field: "densityPerM2", categories: vegetationAssetCategories(FLOWER_ASSET_VARIANTS.map(asset => asset.id)) }
  ].filter(binding => definitions.find(component => component.type === binding.component)?.fields.some(field => field.key === binding.field && !field.readonly));
}

/** Retain the source material's physical part when grouping its native RGB bindings. */
function sceneColorBindings(planning: PlanningSession) {
  const keys = new Set(planning.describe().find(component => component.type === "plantMaterial")?.fields.map(field => field.key));
  const channels = ["r", "g", "b"] as const;
  return [
    ...PLANT_MATERIAL_SLOTS.filter(slot => channels.every(channel => keys.has(plantMaterialField(slot.assetId, slot.materialId, channel))))
      .map(slot => ({ component: "plantMaterial", layers: slot.layers, part: slot.part,
        fields: channels.map(channel => plantMaterialField(slot.assetId, slot.materialId, channel)) })),
    ...["colorA", "colorB"].map(endpoint => ({ component: "grassAppearance", layers: ["grass"], part: "blades",
      fields: channels.map(channel => `${endpoint}.${channel}`) }))
  ];
}

/** Only actual layer/part pairs are writable; a layer alone never implies a colour scope. */
function createScenePaletteInput(bindings: ReturnType<typeof sceneColorBindings>) {
  const layerKeys = [...new Set(bindings.flatMap(binding => binding.layers))];
  const hasValue = (values: Record<string, unknown>) => Object.values(values).some(value => value !== undefined);
  return z.strictObject({ layers: z.strictObject(Object.fromEntries(layerKeys.map(layer => {
    const parts = [...new Set(bindings.filter(binding => binding.layers.includes(layer)).map(binding => binding.part))];
    return [layer, z.strictObject(Object.fromEntries(parts.map(part => [part, paletteColor.optional()])))
      .refine(hasValue, "配色必须指定至少一个真实部位").pipe(z.record(text, paletteColor)).optional()];
  }))).refine(hasValue, "配色必须指定至少一个真实生态层").pipe(z.record(text, z.record(text, paletteColor))).optional(),
    sky: skyPalette.optional() }).refine(hasValue, "配色必须指定植被部位或完整天空渐变")
    .describe("植被按 layers[生态层][真实部位] 分别配色，部位来自 paletteLayers.parts；天空单独使用 sky.zenith 与 sky.horizon。每个部位独立选择颜色，未提供的部位或天空保留来源；生态层本身不接受 RGB，也没有全场统一颜色。共享范围按 paletteSharedScopes 的层与部位共同确定。");
}

function sceneParameterDefinitions(planning: PlanningSession) {
  const boundKeys = new Set(sceneColorBindings(planning).flatMap(binding => binding.fields.map(field => JSON.stringify([binding.component, field]))));
  for (const field of skyPaletteFields) boundKeys.add(JSON.stringify(["lighting", field]));
  return planning.describe().filter(component => component.type !== "subjectView")
    .map(component => ({ ...component, fields: component.fields.filter(field => !boundKeys.has(JSON.stringify([component.type, field.key]))) }))
    .filter(component => component.fields.length);
}

/** Expand declared scope over native bindings once. No text, colour names or style presets enter here. */
export function compileSceneGenerationParameters(planning: PlanningSession, input: z.infer<typeof generationInput>): PlanningParameterCommand[] {
  const definitions = planning.describe();
  const values = new Map<string, { entity: string; component: string; values: Record<string, unknown> }>();
  const write = (entity: string, component: string, patch: Record<string, unknown>) => {
    const identity = JSON.stringify([entity, component]);
    const command = values.get(identity) ?? { entity, component, values: {} };
    for (const [key, value] of Object.entries(patch)) {
      if (key in command.values && command.values[key] !== value) throw new Error(`生成计划对同一参数存在矛盾：${entity}/${component}/${key}`);
      command.values[key] = value;
    }
    values.set(identity, command);
  };
  const bindings = sceneColorBindings(planning);
  const current = new Map(planning.inspect("world").components.map(component => [component.type, component.values]));
  const palette = input.palette && createScenePaletteInput(bindings).parse(input.palette);
  const paletteChanges = Object.entries(palette?.layers ?? {}).flatMap(([layer, parts]) =>
    Object.entries(parts).map(([part, color]) => ({ layer, part, color })));
  for (const change of paletteChanges) {
    const selected = bindings.filter(binding => binding.layers.includes(change.layer) && binding.part === change.part);
    if (!selected.length) throw new Error("配色范围没有公开的原生颜色绑定");
    const target = minimumRgbSaturation(change.color, SCENE_GENERATION_MINIMUM_PALETTE_SATURATION);
    for (const binding of selected) {
      const definition = definitions.find(component => component.type === binding.component)!;
      const source = binding.fields.map(field => Number(current.get(binding.component)?.[field] ??
        definition.fields.find(candidate => candidate.key === field)!.default));
      const color = recolorRgb(source, target);
      write("world", binding.component, Object.fromEntries(binding.fields.map((field, index) => [field, color[index]])));
    }
  }
  if (palette?.sky) {
    const sky: Record<string, number> = { customSkyTintStrength: 1 };
    for (const [region, color] of Object.entries(palette.sky)) {
      // HSV is invariant under a uniform scale. Normalize only for the existing
      // bounded RGB helper, then restore HDR energy without clipping channels.
      const maximum = Math.max(...color);
      const saturated = maximum === 0 ? color : minimumRgbSaturation(color.map(value => value / maximum),
        SCENE_GENERATION_MINIMUM_SKY_SATURATION).map(value => value * maximum);
      const prefix = region === "zenith" ? "customSkyZenith" : "customSkyHorizon";
      ["R", "G", "B"].forEach((channel, index) => { sky[`${prefix}${channel}`] = saturated[index]; });
    }
    write("world", "lighting", sky);
  }
  const populations = scenePopulationBindings(planning);
  const excluded = new Set(input.excludeCategories ?? []);
  if ([...excluded].some(category => !populations.some(binding => binding.categories.includes(category))))
    throw new Error("排除范围包含未公开的素材类别");
  const suppression = populations.filter(binding => binding.categories.some(category => excluded.has(category)))
    .map(binding => ({ component: binding.component, scope: "all" as const, values: { [binding.field]: 0 } }));
  for (const parameter of [...suppression, ...(input.parameters ?? [])]) {
    const definition = definitions.find(component => component.type === parameter.component);
    if (!definition || !Object.keys(parameter.values).length) throw new Error(`生成参数组件或字段为空：${parameter.component}`);
    for (const key of Object.keys(parameter.values)) {
      if (parameter.component === "lighting" && skyPaletteFields.includes(key))
        throw new Error("天空渐变必须通过 palette.sky 成对配色，不能绕过饱和度约束或重复设置混合权重");
      if (!definition.fields.some(field => field.key === key && !field.readonly)) throw new Error(`未公开的生成参数：${parameter.component}/${key}`);
    }
    const instances = planning.query({ component: parameter.component }).filter(entity => entity.id !== "world");
    const authored = new Map(planning.query({ component: parameter.component, authoredOnly: true }).map(entity => [entity.id, entity]));
    for (const [key, value] of Object.entries(parameter.values)) {
      const field = definition.fields.find(candidate => candidate.key === key)!;
      const applicable = instances.filter(entity => !field.kinds || field.kinds.includes(entity.kind));
      const targets = typeof parameter.scope !== "string" ? parameter.scope.ids : parameter.scope === "world" ? ["world"] :
        field.worldWritable ? ["world", ...applicable.filter(entity => authored.get(entity.id)?.authoredFields[parameter.component]?.includes(key)).map(entity => entity.id)] :
        applicable.map(entity => entity.id);
      if (!targets.length) throw new Error(`生成字段范围没有原生作者对象：${parameter.component}/${key}`);
      for (const target of targets) {
        if (target === "world" ? !field.worldWritable : !applicable.some(entity => entity.id === target))
          throw new Error(`生成字段不适用于目标：${parameter.component}/${key}/${target}`);
        write(target, parameter.component, { [key]: value });
      }
    }
  }
  return [...values.values()].map(command => ({ op: "set", ...command }));
}

/** A single ASAP decision prepares native authoring, resolves the first view, then creates Runtime. */
export function createSceneGenerationSession(
  planning: PlanningSession,
  render: (handoff: PlanningWorldHandoff) => Promise<void>,
  viewportAspect: () => number = () => 1
): SceneGenerationSession {
  const preparedTargets = new Set<string>();
  let rendered = false;
  let renderTask: Promise<void> | undefined;
  let generatedSubject: { id: string; representation: "obb"; visibleFraction: number } |
    { id: string; representation: "flowerRegion"; groundAreaM2: number; forwardReachM: number } | undefined;
  const inputSchema = createSceneGenerationInput(planning);
  const generate = defineTool({ name: "scene.generate", input: inputSchema,
    output: z.strictObject({ status: z.literal("ready"), revision: z.number().int().nonnegative(), publication: publicationSchema,
      subject: z.discriminatedUnion("representation", [
        z.strictObject({ id: z.string(), representation: z.literal("obb"), visibleFraction: z.number().min(0).max(1) }),
        z.strictObject({ id: z.string(), representation: z.literal("flowerRegion"), groundAreaM2: z.number().positive(), forwardReachM: z.number().positive() })
      ]).optional() }),
    execute: async (input, { signal }) => {
      if (rendered || renderTask) throw new Error("已开始首次生成；请重新描述以生成新的场景。");
      const commands = compileSceneGenerationParameters(planning, input);
      signal.throwIfAborted();
      if (commands.length) {
        const receipt = await planning.dispatchParameters(commands, planning.document.revision);
        if (receipt.status !== "accepted") throw new Error(receipt.message ?? "原生生成参数未通过检查");
        // Collection expansion and inherited overrides are execution details, not an authored focal subject.
        for (const parameter of input.parameters ?? []) if (typeof parameter.scope !== "string")
          for (const id of parameter.scope.ids) if (id !== "world") preparedTargets.add(id);
      }
      signal.throwIfAborted();
      if (!planning.result?.accepted || planning.pending) throw new Error("生成方案尚未通过原生规划检查。");
      if (!rendered) {
        const entities = new Map(planning.query().map(entity => [entity.id, entity]));
        const inspected = new Map<string, ReturnType<PlanningSession["inspect"]>>();
        const inScope = (subjectId: string, targets: ReadonlySet<string>, explicit: boolean) => {
          const visited = new Set<string>();
          let id: string | undefined = subjectId;
          while (id && !visited.has(id)) {
            if (targets.has(id)) return true;
            visited.add(id);
            const snapshot = inspected.get(id) ?? planning.inspect(id);
            inspected.set(id, snapshot);
            // Parameter sources are separate from spatial parents. A policy edit affects
            // its actual field consumers even though they are not children of the policy.
            for (const component of snapshot.components) {
              if (explicit && component.base && targets.has(component.base.entity)) return true;
              for (const [key, sources] of Object.entries(component.sources))
                if (sources.some(source => targets.has(source) && (explicit || (input.parameters ?? []).some(parameter =>
                  typeof parameter.scope !== "string" && parameter.scope.ids.includes(source) &&
                  parameter.component === component.type && key in parameter.values)))) return true;
            }
            id = entities.get(id)?.parent;
          }
          return false;
        };
        if (!renderTask && (input.focus.kind === "building" || input.focus.kind === "volume")) {
          const plan = planning.result.plan, sample = createPlanningGroundSampler(plan);
          const view = readSubjectView(planning.document);
          const target = input.focus.id ?? (preparedTargets.size ? undefined : (String(view.subjectId ?? "") || undefined));
          const targets = target ? new Set([target]) : preparedTargets;
          const candidates = subjectVolumes(plan).filter(volume => input.focus.kind !== "building" || volume.kind === "building");
          const subjects = targets.size ? candidates.filter(building => inScope(building.id, targets, !!target)).map(building => building.id) : [];
          if (!subjects.length && targets.size)
            throw new Error(`展示目标没有已发布的${input.focus.kind === "building" ? "建筑" : "空间"}体量：${[...targets].join(", ")}；请修正目标范围或元素配置，不能改为展示其他区域。`);
          const selected = selectSubjectView(plan, viewportAspect(), (x, z) => sample({ x, z }),
            PLANNING_REFERENCE.actor.heightM, subjects.length ? subjects : undefined, view, input.focus.kind === "building" ? "building" : "volume");
          signal.throwIfAborted();
          const receipt = await planning.dispatchParameters([
            { op: "set", entity: "world", component: "subjectView", values: {
              subjectId: selected.pose.subjectId, azimuthDegrees: selected.azimuthDegrees } }
          ], planning.document.revision);
          if (receipt.status !== "accepted") throw new Error(receipt.message ?? "首次主体取景事务失败");
          generatedSubject = { id: selected.pose.subjectId, representation: "obb", visibleFraction: selected.visibleFraction };
        }
        if (input.focus.kind === "flowers" && !renderTask) {
          const plan = planning.result.plan, sample = createPlanningGroundSampler(plan);
          const focusId = input.focus.id;
          const targets = focusId ? new Set([focusId]) : preparedTargets;
          const subjects = targets.size ? (plan.flowerRegions ?? []).filter(region => inScope(region.id, targets, !!focusId)).map(region => region.id) : [];
          if (focusId && !subjects.length) throw new Error(`展示目标没有已发布花区：${focusId}`);
          const selected = selectFlowerView(plan, viewportAspect(), (x, z) => sample({ x, z }),
            PLANNING_REFERENCE.actor.heightM, subjects.length ? subjects : undefined, readSubjectView(planning.document));
          signal.throwIfAborted();
          const receipt = await planning.dispatchParameters([{ op: "set", entity: "world", component: "subjectView",
            values: { subjectId: selected.pose.subjectId, azimuthDegrees: selected.azimuthDegrees } }], planning.document.revision);
          if (receipt.status !== "accepted") throw new Error(receipt.message ?? "首次花区取景事务失败");
          generatedSubject = { id: selected.pose.subjectId, representation: "flowerRegion",
            groundAreaM2: selected.groundAreaM2, forwardReachM: selected.forwardReachM };
        }
        signal.throwIfAborted();
        const handoff = { document: structuredClone(planning.document), result: planning.result };
        renderTask ??= Promise.resolve().then(() => render(handoff));
        try {
          await renderTask;
          rendered = true;
        } finally {
          if (!rendered) renderTask = undefined;
        }
      }
      return { status: "ready" as const, revision: planning.document.revision, publication: readSceneGenerationPublication(planning)!,
        ...(generatedSubject ? { subject: generatedSubject } : {}) };
    }
  });
  const listeners = new Set<(event: SceneGenerationEvent) => void>();
  const history: AgentMessage[] = [];
  let active: AbortController | undefined;
  const emit = (event: SceneGenerationEvent) => { for (const listener of listeners) listener(event); };
  return {
    get running() { return !!active; },
    cancel: () => active?.abort(),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    run: async (input, options) => {
      if (active || rendered) throw new Error("首次生成已开始或完成，请重新描述。");
      const controller = active = new AbortController(), taskId = crypto.randomUUID();
      try {
        const bindings = sceneColorBindings(planning);
        const definitions = sceneParameterDefinitions(planning);
        const currentColors = new Map(planning.inspect("world").components.map(component => [component.type, component.values]));
        const context = {
          phase: "before_first_generation", revision: planning.document.revision,
          baselinePublication: readSceneGenerationPublication(planning),
          populationLayers: NATURAL_VEGETATION_LAYER_MEMBERS,
          populationBindings: scenePopulationBindings(planning),
          paletteConstraints: { encodings: { layers: "sRGB", sky: "native_linear_rgb_multiplier" }, saturation: { measure: "HSV",
            minimum: { layers: SCENE_GENERATION_MINIMUM_PALETTE_SATURATION, sky: SCENE_GENERATION_MINIMUM_SKY_SATURATION },
            scope: "selected_chromatic_palette", achromatic: "preserve" } },
          skyPalette: { parts: ["zenith", "horizon"], gradientStrength: 1, scope: "complete_sky_gradient",
            meaning: "天空天顶与地平线的原生线性RGB渐变乘数，允许HDR；不等于大气散射或后处理后的像素颜色" },
          paletteLayers: NATURAL_VEGETATION_CONTROLS.map(({ key, label }) => ({ key, label,
            parts: [...new Set(bindings.filter(binding => binding.layers.includes(key)).map(binding => binding.part))].map(part => {
              const selected = bindings.filter(binding => binding.layers.includes(key) && binding.part === part);
              const colors = selected.map(binding => binding.fields.map(field => Number(currentColors.get(binding.component)?.[field])));
              return { part, colorBindings: selected.length, parameterColorRange: {
                min: [0, 1, 2].map(channel => Math.min(...colors.map(color => color[channel]))),
                max: [0, 1, 2].map(channel => Math.max(...colors.map(color => color[channel])))
              } };
            }) })),
          paletteSharedScopes: [...new Set(bindings.filter(binding => binding.layers.length > 1)
            .map(binding => JSON.stringify({ layers: [...binding.layers].sort(), part: binding.part })))].map(scope =>
              JSON.parse(scope) as { layers: string[]; part: string }),
          representations: { building: "solid_obb_parts", rock: "solid_obb_parts" },
          components: definitions.map(({ type, label, description, fields, scopes, ranges }) => ({ type, label, description, scopes, ranges,
            fields: fields.map(({ key, label, description, type, unit, min, max, integer, options, optionLabels, readonly, worldWritable, kinds, default: defaultValue, visibleWhen }) =>
              ({ key, label, description, type, unit, min, max, integer, options, optionLabels, readonly, worldWritable, kinds, default: defaultValue, visibleWhen })) })),
          authoredScopes: planning.query({ authoredOnly: true }).map(({ id, kind, parent, authoredFields }) => ({ id, kind, parent, authoredFields }))
        };
        const messages: AgentMessage[] = [
          { role: "system", content: "理解完整用户指令与对话上下文。需要执行时使用接口，讨论时直接回复。保留用户指定的作用范围、数量、关系和排除要求；依据实际结果报告完成状态，不能将计划当作已执行结果。" },
          { role: "user", content: JSON.stringify({ contextKind: "native_generation_capabilities", ...context }) },
          ...history, { role: "user", content: input }
        ];
        emit({ type: "model_started", taskId, step: 1 });
        emit({ type: "model_request", taskId, step: 1, attempt: 1, messages });
        const started = performance.now();
        const response = await requestSceneGenerationChat({ ...options, messages, tools: [{ type: "function", function: {
          name: "scene_generate", strict: true, parameters: z.toJSONSchema(inputSchema, { io: "input" }),
          description: [
            "执行首次场景生成。用户在此入口提交的场景、氛围或用途描述即为生成请求，简短或模糊描述也足够，不需要额外说生成、逐项选择参数或确认方案。",
            "保留用户明确要求，依据完整语义、对话和原生能力自主补全未指定的地形、水系、布局、配色与取景，选择一种一致且可实现的解释后在本轮调用 scene_generate；存在多种合理方案本身不是追问理由，不把创作自由度变成确认表。",
            "只有用户明确要求仅讨论或暂不生成、仅询问知识或能力且未要求生成，或关键要求存在无法协调的矛盾或无法支持的能力缺口时才直接文字回复；真正阻塞时仅说明关键缺口或提出最小必要问题。",
            "一次提交整体配色范围、原生参数和展示主体，程序统一展开参数事务、求解布局与取景并等待 Runtime 就绪；一次提交是本会话的执行约束，不是不可逆的外部发布或额外授权要求。",
            "baselinePublication 是供本次创作调整的初始默认规划，尚未按用户描述生成或交付画面；revision 是内部作者版本，不表示用户世界已发布。首次创作需要审视其中各类默认内容与完整场景目标的关系，通过原生参数决定保留、减少或关闭；默认存在不是保留理由。非主体内容的数量、尺度和遮挡也属于本次规划职责，不能只修改主体而把默认环境原样带入。未指定的内容根据目标自主安排，用户明确要求保留的内容仍须保留。",
            "用户要求连续成片或某种主导色的景观时，需要共同协调覆盖面积、种植密度、视野内铺底植被的配色，以及其他植被和空间体量的数量、尺度与遮挡。仅改变少量主体实例的颜色不代表形成连续景观。用户要求草地、地被等也参与主色时，通过其真实部位分别配色；保留各部位独立性，不把主色自动推广到所有部位。原生参数和几何取景可以落实这些修改，不能据此保证最终像素占比或审美达成。",
            "除非用户询问实现细节，文字回复只说明与目标有关的结论，不主动罗列内部版本、对象统计、颜色编码、参数字段或包围盒术语；能力限制用日常语言简短说明。",
            "palette.layers 沿用现有 sRGB 植被配色输入，palette.sky 使用原生线性RGB天空渐变乘数；两者分别遵守 paletteConstraints.saturation.minimum.layers 与 minimum.sky 的有彩配色下限，程序在提交前保持色相和HSV亮度并落实，黑白灰保持无彩。下限不是目标值或上限，已有更高饱和度保持。这约束植被与天空的生成配色，不保证光照后的每个屏幕像素。原生 postProcess.saturation 是全画面相对调节量，不是绝对饱和度百分比，不能用全屏调整替代此约束。程序不额外转换颜色空间，植被仍保留各素材及草地端点原有的加权RGB亮度层次，超出色域时等比缩放；显式配色优先于季节调色。",
            "首次场景创作也需要设计天空：普通白天的天空通常以蓝色为主，尤其天顶；地平线可更浅，与太阳附近的暖色自然过渡。根据完整场景选择时刻、大气散射底色与 palette.sky 的两个端点，使它们共同支持蓝天，不能把偏暖日照叠加一个弱蓝乘数就宣称蓝天。黄昏、夜晚、阴天及用户明确要求的异色天空按场景与原文处理，不固定时刻或同一蓝色数值。天空配色通过 palette.sky 成对提交，程序使用完整混合权重1落实饱和度下限；用户明确要求保留既有天空时可省略。若用户明确指定的精确端点或混合权重与此生成配色约束冲突，应说明冲突，不能静默替换其数值。skyTintR/G/B 是散射波长控制，不是最终天空RGB，仍通过 lighting 原生参数协调；天空曝光、光源与全屏后处理独立，不用全场增饱和替代天空配色。",
            "palette.layers 按生态层和真实部位两级键分别表达 RGB：layers[层][部位]。paletteLayers.parts 提供可用部位及其当前参数颜色范围；花瓣、茎叶、树叶、树皮等部位独立配色。只提交落实用户目标需要改变的部位，未指定部位保留原有颜色与继承；生态层是分类，不意味着所有部位同色。草地 blades 对应地表与低草共享色场。无需枚举素材编号或颜色通道。paletteSharedScopes 明确共用绑定的 layers 与 part，只会连带影响相同部位；同一绑定收到矛盾颜色时拒绝整个计划。",
            "parameters 只提交落实用户目标需要改变的真实组件/字段，未改变的字段省略；不要为凑完整方案枚举无关字段或重写每个默认值。world 只接受 worldWritable=true 的字段并保留局部来源；all 按字段的 worldWritable 与 kinds 分别展开，世界字段同时覆盖支持它的局部作者覆盖，仅实例字段作用于真实适用对象；ids 限定真实对象且每个字段都必须适用于这些对象。integer、类型、范围和枚举必须符合声明，visibleWhen 说明关联开关，范围端点未指定时继承现有值。原生检查拒绝未知字段、空范围或矛盾配色。光照、天空及后处理使用各自原生字段，全画面暖色会影响天空。",
            "focus 指首次要看的主体，building/volume 使用现有 OBB，flowers 展示花区或成片花丛，从已发布花区以人的眼高观察；environment 仅用于没有明确主体的环境视角；可指定真实主体或所属范围 ID。参数准备先于取景；不能通过移动视角替代整片范围生成。",
            "excludeCategories 表达全场完全排除的真实素材类别，类别来自 populationBindings；程序关闭所有包含该类别的原生人口来源并覆盖其局部参数，不能只把同名的单个层设为零。populationLayers 报告各生态层实际包含的素材类别和族群；混合类别的层只能整体关闭，其他层保持。populationBindings 同时包含独立种植区，不只包含自然植被。",
            "首次计划是完整默认世界，明确排除的内容需要在对应人口或覆盖参数中关闭；只修改主体布局不会删除默认环境。baselinePublication 来自当前接受的初始默认规划，生成成功返回的 publication 来自本次执行后的原生计划：vegetation 为全局和区域有效密度范围，max=0 才表示全场关闭；flowers 另报告独立种植花区面积与密度，null 表示未发布而非关闭。",
            "当前建筑/岩石由完整实心 OBB 部件显示，宽深高可改变体量比例，散落、朝向变化或岩石绑定不会自动产生断裂或坍塌，没有专门的部件断裂、挖空、倾倒或表面材质编辑 API。按完整要求落实可支持条件，关键结构缺失时如实说明缺口，不擅自替换目标；就绪只证明画面交付，不代表视觉目标匹配。"
          ].join("\n")
        } }], signal: controller.signal, debugMode: options.debugMode ?? false });
        emit({ type: "generation_model_finished", traceId: response.traceId, model: response.debug?.modelName,
          durationMilliseconds: performance.now() - started });
        controller.signal.throwIfAborted();
        if (response.finishReason !== "stop" && response.finishReason !== "tool_calls") throw new Error("模型没有返回完整的讨论或生成计划。");
        let finalMessage: string;
        if (!response.toolCalls.length) {
          if (response.finishReason !== "stop" || !response.content.trim()) throw new Error("模型没有返回完整的讨论或生成计划。");
          finalMessage = response.content;
        } else {
          if (response.toolCalls.length !== 1 || response.toolCalls[0].function.name !== "scene_generate") throw new Error("首次生成仅接受一个完整原生生成计划。");
          const plan = generate.parseInput(JSON.parse(response.toolCalls[0].function.arguments));
          emit({ type: "tool_started", taskId, step: 1, tool: generate.name, input: plan as z.infer<typeof generationInput> });
          try {
            const result = generate.parseOutput(await generate.execute(plan, { signal: controller.signal }));
            emit({ type: "tool_finished", taskId, step: 1, tool: generate.name, result: { ok: true, value: result as import("@galacean/engine-ai-chat/ai-chat/index").AgentValue } });
            finalMessage = "首次场景已生成，请查看画面是否符合你的描述。";
            if (generatedSubject?.representation === "obb") finalMessage += "主体目前以简化体量展示。";
          } catch (error) {
            emit({ type: "tool_finished", taskId, step: 1, tool: generate.name,
              result: { ok: false, error: { code: "EXECUTION_FAILED", message: error instanceof Error ? error.message : String(error) } } });
            throw error;
          }
        }
        history.push({ role: "user", content: input }, { role: "assistant", content: finalMessage });
        return { finalMessage };
      } catch (error) {
        if (controller.signal.aborted) throw new AgentCancelledError();
        throw error;
      } finally { active = undefined; }
    }
  };
}
