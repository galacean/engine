import * as z from "zod";
import { AgentValueError, MAX_SCRIPT_OUTPUT_BYTES, toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract, type SeedWorldCapabilityDomainId } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { jsonObjectSchema } from "./tool-contract.ts";
import { createPlantMaterialTools } from "./plant-material-tools.ts";

/** A system-owned adapter; the Agent and its system prompt know no planner implementation details. */
export interface SeedWorldParameterAuthoring {
  forSession?(session: PlanningSession): SeedWorldParameterAuthoring;
  describe(component?: string): unknown;
  query(filter: Parameters<PlanningSession["query"]>[0]): unknown;
  inspect(id: string): unknown;
  apply(commands: PlanningParameterCommand[], versionToken: string, signal: AbortSignal): Promise<unknown>;
}

/** Retained for host constructor compatibility; config tools now return receipts directly. */
export interface SeedWorldParameterReceipts {
  current?: { id: string; value: unknown };
}

type SystemConfigSpec = Readonly<{
  system: string;
  domain: SeedWorldCapabilityDomainId;
  label: string;
  components: readonly [string, ...string[]];
  defaultComponent?: string;
}>;

export const SEED_WORLD_SYSTEM_CONFIG_SPECS = Object.freeze([
  {
    system: "animals",
    domain: "animals",
    label: "动物种群与激活配置",
    components: ["animals"],
    defaultComponent: "animals"
  },
  {
    system: "vegetation",
    domain: "vegetation",
    label: "植被分布、花区、草地外观与地表配色配置",
    components: [
      "landscape",
      "landscapePopulation",
      "landscapeInfluence",
      "flowers",
      "flowerInfluence",
      "grassAppearance",
      "surfacePalette",
      "plantMaterial"
    ]
  },
  {
    system: "terrain",
    domain: "terrain",
    label: "地形骨架、缓坡、岩石配色与离岛配置",
    components: ["terrain", "relief", "rockFormation", "rockObb", "island"]
  },
  {
    system: "environment",
    domain: "environment",
    label: "环境光照、后处理与云降水配置",
    components: ["lighting", "postProcess", "weather"]
  },
  {
    system: "water",
    domain: "water",
    label: "湖泊与河流规划配置",
    components: ["lakes", "rivers"]
  },
  {
    system: "spatial",
    domain: "spatial",
    label: "世界生成、风格、布局、POI、道路与展示视角配置",
    components: [
      "world",
      "worldTemplate",
      "landscapeComposition",
      "subjectView",
      "population",
      "distribution",
      "poi",
      "anchor",
      "layout",
      "regionalAppearance",
      "network",
      "wayfinding",
      "roadWidth",
      "roadPath",
      "suspensionBridge",
      "solid",
      "farming"
    ]
  }
] as const satisfies readonly SystemConfigSpec[]);

const text = z.string().min(1);
const scalar = z.union([z.number(), z.boolean(), z.string()]);
const parameterValue = z.union([
  scalar,
  z
    .array(z.record(z.string(), scalar))
    .describe("每行须包含唯一非空字符串 id；其余键遵循字段 columns 声明，具体约束由宿主验证")
]);

const fieldSchema = z.object({
  key: text,
  label: text,
  type: z.enum(["number", "boolean", "string", "records"]),
  columns: z
    .array(
      z.object({
        key: text,
        label: text,
        type: z.enum(["number", "boolean", "string"]),
        choices: z.array(z.string()).optional(),
        default: scalar.optional()
      })
    )
    .optional(),
  description: z.string().optional(),
  editEffect: z
    .enum(["reveal", "replan", "instance"])
    .optional()
    .describe("执行语义：reveal 只筛选固定底图候选；replan 允许重建相关布局；instance 直接修改选中单体。"),
  tags: z.record(z.string(), z.string()).optional().describe("所属系统提供的字段分类标签"),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  integer: z.boolean().optional(),
  readonly: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  worldWritable: z.boolean().optional().describe("本字段是否可在世界根对象写入"),
  optionLabels: z.record(z.string(), z.string()).optional(),
  default: parameterValue.optional(),
  kinds: z.array(z.string()).optional(),
  combine: z.enum(["override", "multiply", "add"]).optional()
});

const componentDescriptionSchema = z.object({
  type: text,
  label: text,
  description: z.string().optional(),
  version: z.number(),
  fields: z.array(fieldSchema),
  ranges: z.array(z.tuple([text, text])).optional(),
  scopes: z.object({ world: z.boolean(), instances: z.array(z.string()) })
});

const pageInputShape = {
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("可选的本页完整 JSON UTF-8 字节预算；省略时按内部 Tool 上限自动分页")
};

const pageOutputShape = {
  offset: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  nextOffset: z.number().int().positive().optional().describe("存在时保持筛选条件并用此 offset 读取下一页；缺省表示读完"),
  pageLimitedByBytes: z.literal(true).optional()
};

const rawEntityTarget = z.object({ entity: text, component: text });

const queriedEntitySchema = z.object({
  id: text,
  name: z.string(),
  kind: text,
  parent: text.optional(),
  authoredFields: z.record(z.string(), z.array(text)).optional(),
  authoredBases: z.record(z.string(), rawEntityTarget).optional(),
  components: z.array(text)
});

const inspectedRawEntitySchema = z.object({
  id: text,
  name: z.string(),
  kind: text.optional(),
  parent: text.optional(),
  versionToken: text,
  components: z.array(
    z.object({
      type: text,
      values: jsonObjectSchema,
      sources: z.record(z.string(), z.array(z.string())),
      local: jsonObjectSchema,
      base: rawEntityTarget.optional(),
      limits: jsonObjectSchema,
      assetSources: z.record(z.string(), jsonObjectSchema).optional()
    })
  )
});

const configComponentEntrySchema = z.object({
  type: text,
  label: text,
  description: z.string().optional(),
  scopes: z.object({ world: z.boolean(), instances: z.array(z.string()) }),
  fieldCount: z.number().int().nonnegative(),
  fields: z.array(fieldSchema).optional(),
  ranges: z.array(z.tuple([text, text])).optional(),
  values: jsonObjectSchema.optional(),
  local: jsonObjectSchema.optional(),
  sources: z.record(z.string(), z.array(z.string())).optional(),
  limits: jsonObjectSchema.optional(),
  base: rawEntityTarget.optional(),
  assetSources: z.record(z.string(), jsonObjectSchema).optional()
});

const configGetOutputSchema = z.object({
  ...pageOutputShape,
  system: text,
  mode: z.enum(["components", "inspect", "entities"]),
  versionToken: text,
  availableComponents: z.array(text),
  entity: z
    .object({
      id: text,
      name: z.string(),
      kind: text.optional(),
      parent: text.optional()
    })
    .optional(),
  components: z.array(configComponentEntrySchema).optional(),
  entities: z.array(queriedEntitySchema).optional()
});

const rawReceiptSchema = z.object({
  status: z.enum(["accepted", "rejected", "superseded"]),
  versionToken: text,
  changedIds: z.array(z.string()),
  diagnostics: z.array(jsonObjectSchema),
  message: z.string().optional()
});

const configMutationOutputSchema = z.object({
  status: rawReceiptSchema.shape.status,
  versionToken: text,
  entityId: text,
  component: text.optional(),
  changedIds: z.array(z.string()),
  diagnostics: z.array(jsonObjectSchema),
  message: z.string().optional()
});

function buildSystemConfigContracts(spec: SystemConfigSpec) {
  const componentEnum = z.enum(spec.components);
  const componentListText = spec.components.join(", ");
  const getDefaultHint = spec.defaultComponent
    ? `默认读取 "${spec.defaultComponent}" 组件。`
    : `本系统包含组件：${componentListText}；省略 component 且不传筛选条件时先返回组件目录。`;
  const mutateDefaultHint = spec.defaultComponent
    ? `默认修改 "${spec.defaultComponent}" 组件。`
    : `本系统包含组件：${componentListText}；单组件操作须指定 component。`;

  const getInput = z.strictObject({
    ...pageInputShape,
    entityId: text.optional().describe('目标规划实体 ID；默认 "world"'),
    component: componentEnum.optional().describe(`要读取的组件名（${componentListText}）`),
    fields: z.array(text).optional().describe("按确切字段键筛选；同时筛选 schema 与当前有效值"),
    search: z.string().min(1).optional().describe("按字段键、名称、描述或分类标签子串筛选"),
    tags: z.record(z.string(), z.string()).optional().describe("按系统声明的字段分类标签精确筛选"),
    includeSchema: z.boolean().optional().describe("inspect 模式下是否返回字段 schema 元数据；默认 true"),
    queryEntities: z.boolean().optional().describe("设为 true 时查询拥有本系统组件的规划实体列表（如各 POI），不读取参数值"),
    kind: text.optional().describe("按规划实体类别筛选（如 poi、route、volume）；设置后自动进入实体列表查询模式"),
    name: text.optional().describe("按规划实体名称子串筛选；设置后自动进入实体列表查询模式"),
    parent: text.optional().describe("按父规划实体 ID 筛选；设置后自动进入实体列表查询模式"),
    authoredOnly: z.boolean().optional().describe("仅返回含作者覆盖或明确参数来源的实体；设置后自动进入实体列表查询模式")
  });

  const baseTargetSchema = z.strictObject({
    entityId: text.describe("继承来源的规划实体 ID"),
    component: componentEnum.describe("继承来源的组件名")
  });

  const batchOpSchema = z.discriminatedUnion("op", [
    z.strictObject({
      op: z.literal("set"),
      entityId: text.optional(),
      component: componentEnum.optional(),
      values: z.record(z.string(), parameterValue)
    }),
    z.strictObject({
      op: z.literal("reset"),
      entityId: text.optional(),
      component: componentEnum.optional(),
      fields: z.array(text).optional()
    }),
    z.strictObject({
      op: z.literal("base"),
      entityId: text.optional(),
      component: componentEnum.optional(),
      base: baseTargetSchema.nullable().optional()
    })
  ]);

  const updateInput = z
    .strictObject({
      entityId: text.optional().describe('目标规划实体 ID；默认 "world"'),
      component: componentEnum.optional().describe(
        spec.defaultComponent
          ? `目标组件名；默认 "${spec.defaultComponent}"`
          : `目标组件名（${componentListText}）；单组件更新时必填`
      ),
      values: z.record(z.string(), parameterValue).optional().describe("要设置的字段键值对；使用 config.get 声明的真实字段键（不可与 operations 同时传入）"),
      base: baseTargetSchema.nullable().optional().describe("可选：设置或清除参数继承来源；null 表示清除继承（不可与 operations 同时传入）"),
      operations: z.array(batchOpSchema).min(1).optional().describe("可选：一次原子提交多个本系统组件的 set/reset/base 操作（不可与顶层 values/base 同时传入）"),
      versionToken: text.optional().describe("可选乐观并发令牌；省略时自动读取最新版本")
    })
    .superRefine((value, context) => {
      const hasOperations = Boolean(value.operations?.length);
      const hasValues = Boolean(value.values && Object.keys(value.values).length > 0);
      const hasBase = value.base !== undefined;
      if (hasOperations && (value.values !== undefined || hasBase)) {
        context.addIssue({
          code: "custom",
          path: ["operations"],
          message: "operations 与顶层 values/base 互斥，请将全部写操作合并到 operations 中，或仅使用单组件 values/base。"
        });
        return;
      }
      if (!hasOperations && !hasValues && !hasBase) {
        context.addIssue({
          code: "custom",
          path: ["values"],
          message: `请提供非空的 values、base 或 operations（用于更新 ${spec.system} 系统配置）。`
        });
      }
      if (!spec.defaultComponent) {
        if (!hasOperations) {
          if (!value.component) {
            context.addIssue({
              code: "custom",
              path: ["component"],
              message: `${spec.system} 系统包含多个组件（${componentListText}），单组件更新时必须指定 component。`
            });
          }
        } else {
          value.operations!.forEach((op, index) => {
            if (!(op.component ?? value.component)) {
              context.addIssue({
                code: "custom",
                path: ["operations", index, "component"],
                message: `${spec.system} 系统包含多个组件（${componentListText}），每条操作必须指定 component（或在顶层提供默认 component）。`
              });
            }
          });
        }
      }
    });

  const resetInput = z.strictObject({
    entityId: text.optional().describe('目标规划实体 ID；默认 "world"'),
    component: (spec.defaultComponent ? componentEnum.optional() : componentEnum).describe(
      spec.defaultComponent
        ? `目标组件名；默认 "${spec.defaultComponent}"`
        : `目标组件名（${componentListText}）`
    ),
    fields: z.array(text).optional().describe("要恢复默认的字段键列表；省略时清除该组件全部作者覆盖"),
    versionToken: text.optional().describe("可选乐观并发令牌；省略时自动读取最新版本")
  });

  return {
    spec,
    get: defineSeedWorldApiContract({
      name: `${spec.system}.config.get`,
      domain: spec.domain,
      effect: "read",
      inputMode: "optional",
      description: `读取${spec.label}的字段声明、当前有效值、作者覆盖或规划实体列表。${getDefaultHint}`,
      inputDescription: "可按 component、fields、search、tags 定向读取；传 queryEntities/kind/authoredOnly 查询规划实体；按 nextOffset 分页。",
      outputDescription: "返回 mode（components/inspect/entities）、versionToken、availableComponents，以及对应组件目录、字段声明与有效值或实体列表。",
      input: getInput,
      output: configGetOutputSchema
    }),
    update: defineSeedWorldApiContract({
      name: `${spec.system}.config.update`,
      domain: spec.domain,
      description: `原子更新${spec.label}的作者参数。${mutateDefaultHint}`,
      inputDescription: "提供 values（或 operations，两者互斥）和真实字段键；entityId 默认 world，versionToken 省略时自动读取最新版本号。",
      outputDescription: "返回提交状态（accepted/rejected/superseded）、最新 versionToken、changedIds、diagnostics 和可选 message。",
      input: updateInput,
      output: configMutationOutputSchema
    }),
    reset: defineSeedWorldApiContract({
      name: `${spec.system}.config.reset`,
      domain: spec.domain,
      description: `重置${spec.label}的作者参数覆盖，恢复为系统默认或继承值。${mutateDefaultHint}`,
      inputDescription: "指定 component（单组件系统可省略）及可选 fields；省略 fields 重置该组件全部作者覆盖。",
      outputDescription: "返回提交状态、最新 versionToken、changedIds、diagnostics 和可选 message。",
      input: resetInput,
      output: configMutationOutputSchema
    })
  } as const;
}

const SYSTEM_CONFIG_CONTRACT_SETS = SEED_WORLD_SYSTEM_CONFIG_SPECS.map(buildSystemConfigContracts);

export const SEED_WORLD_PARAMETER_CONTRACTS = Object.freeze(
  SYSTEM_CONFIG_CONTRACT_SETS.flatMap((set) => [set.get, set.update, set.reset])
);

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

export function createSeedWorldParameterTools(
  application: Pick<SeedWorldAgentApplication, "parameterAuthoring">,
  _receipts: SeedWorldParameterReceipts = {}
): readonly AgentTool[] {
  const authoring = application.parameterAuthoring;
  if (!authoring) return [];

  const readDeclared = (allowed: ReadonlySet<string>) =>
    z
      .array(componentDescriptionSchema)
      .parse(json(authoring.describe()))
      .filter((component) => allowed.has(component.type));

  const readVersionToken = (entityId: string) =>
    z.object({ versionToken: text }).parse(json(authoring.inspect(entityId))).versionToken;

  const tools: AgentTool[] = [];

  for (const contractSet of SYSTEM_CONFIG_CONTRACT_SETS) {
    const { spec, get, update, reset } = contractSet;
    const allowed = new Set<string>(spec.components);

    const resolveComponent = (component: string | undefined, available: ReadonlySet<string>): string => {
      const target = component ?? spec.defaultComponent;
      if (!target) {
        throw new Error(`System '${spec.system}' owns multiple components (${[...available].join(", ")}); specify 'component'.`);
      }
      if (!allowed.has(target)) {
        throw new Error(`Component '${target}' does not belong to '${spec.system}.config'.`);
      }
      return target;
    };

    tools.push(
      defineSeedWorldTool(get, {
        execute: async (input = {}, context) => {
          const declared = readDeclared(allowed);
          const declaredByType = new Map(declared.map((component) => [component.type, component]));
          const availableComponents = declared.map((component) => component.type);
          const isEntityQuery =
            input.queryEntities === true ||
            input.kind !== undefined ||
            input.name !== undefined ||
            input.parent !== undefined ||
            input.authoredOnly !== undefined;

          if (isEntityQuery) {
            const declaredFields = new Map(declared.map((c) => [c.type, new Set(c.fields.map((f) => f.key))]));
            const versionToken = readVersionToken("world");
            if (input.component && !declaredByType.has(input.component)) {
              return boundedPage([], input, (entities, pagination) => ({
                ...pagination,
                system: spec.system,
                mode: "entities" as const,
                versionToken,
                availableComponents,
                entities
              }));
            }
            const rawEntities = z
              .array(queriedEntitySchema)
              .parse(
                json(
                  authoring.query({
                    component: input.component,
                    kind: input.kind,
                    name: input.name,
                    parent: input.parent,
                    authoredOnly: input.authoredOnly
                  })
                )
              );
            const entities = rawEntities
              .map((entity) => {
                const authoredFields = entity.authoredFields
                  ? Object.fromEntries(
                      Object.entries(entity.authoredFields)
                        .filter(([type]) => declaredFields.has(type))
                        .map(([type, fields]) => [type, fields.filter((f) => declaredFields.get(type)!.has(f))] as const)
                        .filter(([, fields]) => fields.length > 0)
                    )
                  : undefined;
                const authoredBases = entity.authoredBases
                  ? Object.fromEntries(
                      Object.entries(entity.authoredBases).filter(([type]) => declaredFields.has(type))
                    )
                  : undefined;
                return {
                  ...entity,
                  components: entity.components.filter((type) => declaredFields.has(type)),
                  ...(authoredFields ? { authoredFields } : {}),
                  ...(authoredBases ? { authoredBases } : {})
                };
              })
              .filter((entity) => {
                if (entity.components.length === 0) return false;
                if (!input.authoredOnly) return true;
                const hasAuthoredFields = Object.values(entity.authoredFields ?? {}).some((fields) => fields.length > 0);
                const hasAuthoredBases = Object.keys(entity.authoredBases ?? {}).length > 0;
                return hasAuthoredFields || hasAuthoredBases;
              });
            return boundedPage(entities, input, (page, pagination) => ({
              ...pagination,
              system: spec.system,
              mode: "entities" as const,
              versionToken,
              availableComponents,
              entities: page
            }));
          }

          const effectiveComponent =
            input.component ?? (spec.defaultComponent && declaredByType.has(spec.defaultComponent) ? spec.defaultComponent : undefined);
          const hasFilter = Boolean(effectiveComponent || input.fields || input.search || input.tags || input.entityId);

          if (!hasFilter) {
            const versionToken = readVersionToken("world");
            return boundedPage(
              declared,
              { ...input, maxBytes: input.maxBytes ?? MAX_SCRIPT_OUTPUT_BYTES },
              (page, pagination) => ({
                ...pagination,
                system: spec.system,
                mode: "components" as const,
                versionToken,
                availableComponents,
                components: page.map(({ type, label, description, scopes, fields }) => ({
                  type,
                  label,
                  description,
                  scopes,
                  fieldCount: fields.length
                }))
              })
            );
          }

          const entityId = input.entityId ?? "world";
          const snapshot = inspectedRawEntitySchema.parse(json(authoring.inspect(entityId)));
          const search = input.search?.toLocaleLowerCase();
          const fieldMatches = (candidate: z.output<typeof fieldSchema>) =>
            (!input.fields || input.fields.includes(candidate.key)) &&
            (!input.tags || Object.entries(input.tags).every(([key, value]) => candidate.tags?.[key] === value)) &&
            (!search ||
              [candidate.key, candidate.label, candidate.description, ...Object.values(candidate.tags ?? {})].some((value) =>
                value?.toLocaleLowerCase().includes(search)
              ));

          const targetComponents = snapshot.components.filter(
            (component) => declaredByType.has(component.type) && (!effectiveComponent || component.type === effectiveComponent)
          );
          const snapshotComponentTypes = new Set(targetComponents.map((component) => component.type));
          // Entity-scoped components (e.g. poi, roadPath, rockObb, relief) do not live on "world".
          // When entityId is omitted, still expose their declared field schema without fabricating values.
          if (!input.entityId) {
            for (const definition of declared) {
              if (snapshotComponentTypes.has(definition.type)) continue;
              if (effectiveComponent && definition.type !== effectiveComponent) continue;
              if (!effectiveComponent && !definition.fields.some(fieldMatches)) continue;
              targetComponents.push({
                type: definition.type,
                values: {},
                local: {},
                sources: {},
                limits: {}
              });
            }
          }

          const { readPlanningSystemInherited } = await import("../SeedWorldSystemDeclarations.ts");
          for (const component of targetComponents) {
            if (!snapshotComponentTypes.has(component.type)) continue;
            const definition = declaredByType.get(component.type)!;
            const matchingKeys = definition.fields.filter(fieldMatches).map((f) => f.key);
            const allKeys = new Set([
              ...matchingKeys,
              ...[component.values, component.sources, component.local, component.limits]
                .flatMap((record) => Object.keys(record))
                .filter((key) => (!input.fields || input.fields.includes(key)) && (!search && !input.tags))
            ]);
            const fields = [...allKeys];
            const inherited = await readPlanningSystemInherited(component.type, component.values, fields, context.signal);
            if (!inherited) continue;
            const source = jsonObjectSchema.parse(json(inherited.source));
            for (const [key, value] of Object.entries(inherited.values)) {
              if (!fields.includes(key) || component.values[key] !== undefined) continue;
              Object.assign(component.values, json({ [key]: value }));
              (component.assetSources ??= {})[key] = source;
            }
          }

          type Row = { componentIndex: number; key: string };
          const rows: Row[] = [];
          targetComponents.forEach((component, componentIndex) => {
            const definition = declaredByType.get(component.type)!;
            const schemaKeys = new Set(definition.fields.map((f) => f.key));
            const matchingSchemaFields = definition.fields.filter(fieldMatches);
            const matchedKeys = new Set(matchingSchemaFields.map((f) => f.key));
            if (!search && !input.tags) {
              for (const record of [component.values, component.sources, component.local, component.limits]) {
                for (const key of Object.keys(record)) {
                  if ((!input.fields || input.fields.includes(key)) && (schemaKeys.has(key) || matchedKeys.size === 0)) {
                    matchedKeys.add(key);
                  }
                }
              }
            }
            for (const key of matchedKeys) rows.push({ componentIndex, key });
          });

          const includeSchema = input.includeSchema !== false;
          return boundedPage(rows, input, (page, pagination) => ({
            ...pagination,
            system: spec.system,
            mode: "inspect" as const,
            versionToken: snapshot.versionToken,
            availableComponents,
            entity: {
              id: snapshot.id,
              name: snapshot.name,
              ...(snapshot.kind ? { kind: snapshot.kind } : {}),
              ...(snapshot.parent ? { parent: snapshot.parent } : {})
            },
            components: [...new Set(page.map((row) => row.componentIndex))].map((componentIndex) => {
              const component = targetComponents[componentIndex]!;
              const definition = declaredByType.get(component.type)!;
              const keys = new Set(page.filter((row) => row.componentIndex === componentIndex).map((row) => row.key));
              const select = <T>(record: Record<string, T>) =>
                Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)));
              const fields = definition.fields.filter((f) => keys.has(f.key));
              return {
                type: component.type,
                label: definition.label,
                ...(definition.description ? { description: definition.description } : {}),
                scopes: definition.scopes,
                fieldCount: definition.fields.length,
                ...(includeSchema ? { fields } : {}),
                ...(includeSchema && definition.ranges
                  ? { ranges: definition.ranges.filter((pair) => pair.some((key) => keys.has(key))) }
                  : {}),
                values: select(component.values),
                local: select(component.local),
                sources: select(component.sources),
                limits: select(component.limits),
                ...(component.base ? { base: component.base } : {}),
                ...(component.assetSources ? { assetSources: select(component.assetSources) } : {})
              };
            })
          }));
        }
      }),
      defineSeedWorldTool(update, {
        execute: async (input, context) => {
          const available = new Set(readDeclared(allowed).map((c) => c.type));
          const entityId = input.entityId ?? "world";
          const commands: PlanningParameterCommand[] = [];
          let primaryComponent: string | undefined;

          if (input.operations?.length) {
            for (const op of input.operations) {
              const opEntity = op.entityId ?? entityId;
              const opComponent = resolveComponent(op.component ?? input.component, available);
              primaryComponent ??= opComponent;
              if (op.op === "set") {
                commands.push({ op: "set", entity: opEntity, component: opComponent, values: op.values });
              } else if (op.op === "reset") {
                commands.push({ op: "reset", entity: opEntity, component: opComponent, ...(op.fields ? { fields: op.fields } : {}) });
              } else {
                commands.push({
                  op: "base",
                  entity: opEntity,
                  component: opComponent,
                  ...(op.base ? { base: { entity: op.base.entityId, component: op.base.component } } : {})
                });
              }
            }
          } else {
            const targetComponent = resolveComponent(input.component, available);
            primaryComponent = targetComponent;
            if (input.values && Object.keys(input.values).length > 0) {
              commands.push({ op: "set", entity: entityId, component: targetComponent, values: input.values });
            }
            if (input.base !== undefined) {
              commands.push({
                op: "base",
                entity: entityId,
                component: targetComponent,
                ...(input.base ? { base: { entity: input.base.entityId, component: input.base.component } } : {})
              });
            }
            if (!commands.length) {
              throw new Error(`Provide non-empty 'values', 'base', or 'operations' for ${spec.system}.config.update.`);
            }
          }

          const versionToken = input.versionToken ?? readVersionToken(entityId);
          const value = rawReceiptSchema.parse(json(await authoring.apply(commands, versionToken, context.signal)));
          return {
            status: value.status,
            versionToken: value.versionToken,
            entityId,
            ...(primaryComponent ? { component: primaryComponent } : {}),
            changedIds: value.changedIds,
            diagnostics: value.diagnostics.slice(0, 32),
            ...(value.message ? { message: value.message } : {})
          };
        }
      }),
      defineSeedWorldTool(reset, {
        execute: async (input, context) => {
          const available = new Set(readDeclared(allowed).map((c) => c.type));
          const entityId = input.entityId ?? "world";
          const targetComponent = resolveComponent(input.component, available);
          const versionToken = input.versionToken ?? readVersionToken(entityId);
          const command: PlanningParameterCommand = {
            op: "reset",
            entity: entityId,
            component: targetComponent,
            ...(input.fields ? { fields: input.fields } : {})
          };
          const value = rawReceiptSchema.parse(json(await authoring.apply([command], versionToken, context.signal)));
          return {
            status: value.status,
            versionToken: value.versionToken,
            entityId,
            component: targetComponent,
            changedIds: value.changedIds,
            diagnostics: value.diagnostics.slice(0, 32),
            ...(value.message ? { message: value.message } : {})
          };
        }
      })
    );
  }

  return [...tools, ...createPlantMaterialTools(authoring)];
}

/** Complete-record pagination, with an optional byte budget for direct model-facing pages. */
function boundedPage<T, R>(
  items: readonly T[],
  input: { offset?: number; limit?: number; maxBytes?: number },
  render: (page: T[], pagination: z.output<z.ZodObject<typeof pageOutputShape>>) => R
): R {
  const offset = input.offset ?? 0;
  const requested = Math.min(input.limit ?? items.length, Math.max(0, items.length - offset));
  const candidate = (count: number) =>
    render(items.slice(offset, offset + count), {
      offset,
      matchedCount: items.length,
      ...(offset + count < items.length ? { nextOffset: offset + count } : {}),
      ...(count < requested ? { pageLimitedByBytes: true as const } : {})
    });
  const fits = (value: R) => {
    try {
      const normalized = toAgentValue(value);
      return input.maxBytes === undefined || new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= input.maxBytes;
    } catch (error) {
      if (!(error instanceof AgentValueError)) throw error;
      return false;
    }
  };
  const full = candidate(requested);
  if (fits(full)) return full;
  let low = 0,
    high = requested - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(candidate(middle))) low = middle;
    else high = middle - 1;
  }
  if (!low) {
    throw new AgentValueError(`One parameter record at offset=${offset} exceeds the Agent result budget; narrow the component or field filter.`);
  }
  return candidate(low);
}
