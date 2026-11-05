import * as z from "zod";
import { AgentValueError, MAX_SCRIPT_OUTPUT_BYTES, toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
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
const text = z.string().min(1);
const target = { entity: text, component: text };
const scalar = z.union([z.number(), z.boolean(), z.string()]);
const parameterValue = z.union([scalar, z.array(z.record(z.string(), scalar))
  .describe("每行须包含唯一非空字符串 id；其余键遵循字段 columns 声明，具体约束由宿主验证")]);
const command = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("set"), ...target, values: z.record(z.string(), parameterValue) }),
  z.strictObject({ op: z.literal("reset"), ...target, fields: z.array(text).optional() }),
  z.strictObject({ op: z.literal("base"), ...target, base: z.strictObject(target).optional() })
]);
const field = z.object({
  key: text, label: text, type: z.enum(["number", "boolean", "string", "records"]),
  columns: z.array(z.object({ key: text, label: text, type: z.enum(["number", "boolean", "string"]),
    choices: z.array(z.string()).optional(), default: scalar.optional() })).optional(),
  description: z.string().optional(),
  editEffect: z.enum(["reveal", "replan", "instance"]).optional().describe("执行语义：reveal 只筛选固定底图候选；replan 允许重建相关布局；instance 直接修改选中单体，不重建底图、求解生成约束或移动邻居。表现字段另按所属组件契约编辑。"),
  tags: z.record(z.string(), z.string()).optional().describe("所属系统提供的真实字段分类；用于筛选部位/类别，不从显示名称或标识字符串推测分类"),
  unit: z.string().optional(), min: z.number().optional(), max: z.number().optional(), step: z.number().optional(),
  integer: z.boolean().optional(), readonly: z.boolean().optional(), options: z.array(z.string()).optional(),
  worldWritable: z.boolean().optional().describe("本字段是否可在世界根对象写入，依据宿主原生作者绑定声明；false 表示世界作用域不可写，实例作用域仍需遵守组件及字段 kinds。未提供表示宿主未声明，不能视为 true；组件 scopes.world 不保证每个字段都支持世界写入。"),
  optionLabels: z.record(z.string(), z.string()).optional(), default: parameterValue.optional(),
  kinds: z.array(z.string()).optional(), combine: z.enum(["override", "multiply", "add"]).optional()
});
const componentDescription = z.object({
  type: text, label: text, description: z.string().optional(), version: z.number(), fields: z.array(field), ranges: z.array(z.tuple([text, text])).optional(),
  scopes: z.object({ world: z.boolean(), instances: z.array(z.string()) })
});
const pageInput = { offset: z.number().int().nonnegative().optional(), limit: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional().describe("可选的本页完整 JSON UTF-8 字节预算；默认按内部 Tool 上限供脚本计算。直接返回完整页面时设为 main() 的返回预算，多查询汇总时分配总预算；最终投影仍遵守 main() 上限") };
const pageOutput = {
  offset: z.number().int().nonnegative(), matchedCount: z.number().int().nonnegative(),
  nextOffset: z.number().int().positive().optional().describe("存在时保持筛选条件并用此 offset 读取下一页；缺省表示读完"),
  pageLimitedByBytes: z.literal(true).optional()
};
const componentIndex = componentDescription.pick({ type: true, label: true, description: true, scopes: true }).extend({
  fieldCount: z.number().int().nonnegative()
});
const describeOutput = z.discriminatedUnion("view", [
  z.object({ ...pageOutput, view: z.literal("components"), componentTypes: z.array(text), components: z.array(componentIndex) }),
  z.object({ ...pageOutput, view: z.literal("fields"), componentTypes: z.array(text), components: z.array(componentDescription.extend({ fieldCount: z.number().int().nonnegative().describe("该组件全部声明字段数；fields 仅含本页筛选字段") })) })
]);
const queriedEntity = z.object({
  id: text, name: z.string(), kind: text, parent: text.optional(),
  authoredFields: z.record(z.string(), z.array(text)).optional().describe("本对象在作者文档中明确设置的字段索引，不包含生成的有效值；按 component 筛选时只列该组件"),
  authoredBases: z.record(z.string(), z.object(target)).optional().describe("作者明确设置的参数来源；与对象父子归属分开，其他来源在 inspect.sources 中解析"),
  components: z.array(text).describe("本对象适用的公开作者组件，只含 describe.componentTypes 中的类型；不包含内部求解输出")
});
const queryOutput = z.object({ ...pageOutput, entities: z.array(queriedEntity) });
const inspectedEntity = z.object({
  id: text, name: z.string(), kind: text.optional(), parent: text.optional(), versionToken: text,
  components: z.array(z.object({ type: text, values: jsonObjectSchema, sources: z.record(z.string(), z.array(z.string())),
    local: jsonObjectSchema, base: z.object(target).optional(), limits: jsonObjectSchema,
    assetSources: z.record(z.string(), jsonObjectSchema).optional().describe("按字段记录有效值所采样的原生资产及采样条件；与 sources 中的作者实体继承链分开") }))
});
const inspectOutput = inspectedEntity.extend({ ...pageOutput, componentTypes: z.array(text) });
const rawReceipt = z.object({ status: z.enum(["accepted", "rejected", "superseded"]), versionToken: text,
  changedIds: z.array(z.string()), diagnostics: z.array(jsonObjectSchema), message: z.string().optional() });
const applyOutput = z.object({ status: rawReceipt.shape.status, versionToken: text, receiptId: text,
  changedCount: z.number().int().nonnegative(), hasMessage: z.boolean(),
  diagnosticSummary: z.array(z.object({ status: text, required: z.boolean(), count: z.number().int().nonnegative() })) });
const receiptSection = z.enum(["diagnostics", "changedIds", "message"]);
const receiptOutput = z.object({ ...pageOutput, receiptId: text, section: receiptSection,
  items: z.array(z.union([z.string(), jsonObjectSchema])) });
const contract = <N extends string, I extends z.ZodType, O extends z.ZodType>(name: N, description: string, input: I, output: O) =>
  defineSeedWorldApiContract({ name, domain: "world", description,
    inputDescription: "使用发现的组件、实体和字段；所有编辑由系统统一验证。",
    outputDescription: "组件元数据、作者参数或事务结果；versionToken 用于拒绝过期编辑。完整记录供脚本计算，按 nextOffset 继续；maxBytes 可明确限制本页字节，避免完整页面直接返回时超预算。最终汇总仍须筛选并遵守 main() 总预算，不需要为每个字段单独请求模型。",
    input, output });
export const SEED_WORLD_PARAMETER_CONTRACTS = [
  contract("world.parameters.describe", "发现本宿主公开作者能力。无 component/search/fields/tags 时默认 view=components，返回组件名称、职责、作用域和字段数量的目录，不读取全部字段；此时 matchedCount/offset 按组件计数。选择 component、search、fields 或 tags 时默认 view=fields，返回匹配字段的单位、枚举和约束，此时 matchedCount/offset 按字段计数；可显式指定 view。componentTypes 在两种视图中始终是全部公开作者组件的完整索引，不受筛选或分页影响。已提供组件目录时直接复用，从中选择相关字段，用 fields 的确切键或 tags 的真实类别/部位定向查询，不需要取回所有字段。tags 按所属系统公开的分类逐项精确匹配，显示名称不是分类接口。search 仅匹配字段键、名称、描述及分类值的子串，不是题材或素材搜索；零匹配不代表世界没有对象。未公开的组件以及声明中没有的字段不具备作者编辑能力，遍历更多对象不会开放新能力。按 nextOffset 翻页，字段语义和执行条件以返回声明与原生事务诊断为准。", z.strictObject({ ...pageInput, view: z.enum(["components", "fields"]).optional(), component: text.optional(), search: text.optional(), fields: z.array(text).optional(), tags: z.record(z.string(), z.string()).optional() }), describeOutput),
  contract("world.parameters.query", "分页查询真实规划对象的身份与适用的公开作者组件。检查全局参数是否有局部覆盖时，用 component + authoredOnly=true 查询作者文档中明确配置了字段或来源的对象，authoredFields/authoredBases 索引不含生成的有效值；只需 inspect 这些真实覆盖，不能逐个读取全部默认继承对象。components 只包含 describe.componentTypes 已公开的组件，kind 是规划对象类别，不是可切换的素材或造型；内部求解输出不会作为可编辑组件返回。name 是规划对象的显示名称，通常是类别和编号，不是题材或素材目录；查全名称不能判断是否支持某种视觉造型，造型能力以宿主表现及组件声明为准。仅当下一步操作需要真实对象 ID 时，用 component/kind/name/parent 定向定位目标；无需逐个读取所有候选，使用宿主可自动选取目标的 API 时不需要先列举对象。matchedCount 为完整匹配数量，entities 仅含本页；只使用存在的 nextOffset 继续，缺省表示该筛选已经读完，不要换 offset 重读重叠页或读取 matchedCount 之后的空页。生成的花草按区域参数控制。", z.strictObject({ ...pageInput, component: text.optional(), kind: text.optional(), name: text.optional(), parent: text.optional(), authoredOnly: z.boolean().optional().describe("仅返回筛选组件含作者字段或明确参数来源的对象，不含纯生成默认") }), queryOutput),
  contract("world.parameters.inspect", "分页读取对象有效参数、继承来源和 versionToken。values 包含未被作者覆盖的原生资产采样值；local 仍只含作者明确覆盖，sources 是作者实体继承链，assetSources 按字段记录资产来源与采样条件。资源读取失败会报告错误，不将缺失值冒充有效值。时刻或资产引用变化后需重新读取，有效值会随原生曲线改变；读取不写入作者文档。componentTypes 是完整组件索引；components 只含当前页字段，matchedCount/offset 按字段计数。修改前用 component 及 fields（确切字段键）读取目标，或按 nextOffset 翻页，不能把本页未出现的值当成未配置。", z.strictObject({ ...pageInput, id: text, component: text.optional(), fields: z.array(text).optional() }), inspectOutput),
  contract("world.parameters.apply", "原子执行 set/reset/base，等待宿主的参数提交完成；拒绝过期、未知字段及非法作用域。返回状态、诊断统计与 receiptId，详细诊断及变化 ID 用 receipt 分页读取。accepted 仅代表参数事务成功；是否已有 3D 由宿主的生成阶段决定，不代表视觉验收。",
    z.strictObject({ commands: z.array(command).min(1), versionToken: text }), applyOutput),
  contract("world.parameters.receipt", "分页读取最近一次 apply 的详细诊断、变化 ID 或消息，不重复执行修改。hasMessage 为 true 时用 section=message 读取原因，消息按 Unicode 字符分页，items.join('') 得到本页文本。receiptId 必须来自本会话最近一次 apply，可在后续 execute 中读取；新的 apply（包括 rejected）会替换旧回执。它记录参数 apply 的诊断，不表示外层 execute 已提交；最终提交状态以 execute 回执为准。",
    z.strictObject({ ...pageInput, receiptId: text, section: receiptSection }), receiptOutput)
] as const;

/** Bounded diagnostic attempt state. Owned by the live application, shared by its drafts;
 * never persisted or rolled back with world data. An outer execute failure does not
 * erase the diagnostics the caller needs to inspect without repeating the edit. */
export interface SeedWorldParameterReceipts {
  current?: { id: string; value: z.output<typeof rawReceipt> };
}

export function createSeedWorldParameterTools(
  application: Pick<SeedWorldAgentApplication, "parameterAuthoring">,
  receipts: SeedWorldParameterReceipts = {}
) {
  const authoring = application.parameterAuthoring;
  if (!authoring) return [];
  const [describe, query, inspect, apply, receipt] = SEED_WORLD_PARAMETER_CONTRACTS;
  const json = (value: unknown) => JSON.parse(JSON.stringify(value));
  const tools = [
    defineSeedWorldTool(describe, { execute: input => {
      const declared = z.array(componentDescription).parse(json(authoring.describe()));
      const components = declared.filter(component => !input.component || component.type === input.component);
      const search = input.search?.toLocaleLowerCase();
      const matches = (candidate: z.output<typeof field>) => (!input.fields || input.fields.includes(candidate.key)) &&
        (!input.tags || Object.entries(input.tags).every(([key, value]) => candidate.tags?.[key] === value)) &&
        (!search || [candidate.key, candidate.label, candidate.description, ...Object.values(candidate.tags ?? {})]
          .some(value => value?.toLocaleLowerCase().includes(search)));
      const view = input.view ?? (input.component || input.search || input.fields || input.tags ? "fields" : "components");
      if (view === "components") {
        const matching = components.filter(component => (!search && !input.fields && !input.tags) || component.fields.some(matches));
        return boundedPage(matching, { ...input, maxBytes: input.maxBytes ?? MAX_SCRIPT_OUTPUT_BYTES }, (page, pagination) => ({ ...pagination, view,
          componentTypes: declared.map(component => component.type),
          components: page.map(({ type, label, description, scopes, fields }) => ({ type, label, description, scopes, fieldCount: fields.length }))
        }));
      }
      const rows = components.flatMap((component, index) => component.fields
        .filter(matches)
        .map(field => ({ index, field })));
      return boundedPage(rows, input, (page, pagination) => ({ ...pagination, view,
        componentTypes: declared.map(component => component.type),
        components: [...new Set(page.map(row => row.index))].map(index => {
          const fields = page.filter(row => row.index === index).map(row => row.field);
          const keys = new Set(fields.map(field => field.key));
          return { ...components[index], fieldCount: components[index].fields.length, fields,
            ...(components[index].ranges ? { ranges: components[index].ranges!.filter(pair => pair.some(key => keys.has(key))) } : {}) };
        })
      }));
    } }),
    defineSeedWorldTool(query, { execute: ({ offset, limit, maxBytes, ...filter }) => {
      const definitions = z.array(componentDescription).parse(json(authoring.describe()));
      const declared = new Map(definitions.map(component => [component.type, new Set(component.fields.map(field => field.key))]));
      const entities = filter.component && !declared.has(filter.component) ? [] :
        z.array(queriedEntity).parse(json(authoring.query(filter))).map(entity => ({
          ...entity, components: entity.components.filter(component => declared.has(component)),
          ...(entity.authoredFields ? { authoredFields: Object.fromEntries(Object.entries(entity.authoredFields)
            .filter(([type]) => declared.has(type)).map(([type, fields]) => [type, fields.filter(field => declared.get(type)!.has(field))])) } : {}),
          ...(entity.authoredBases ? { authoredBases: Object.fromEntries(Object.entries(entity.authoredBases).filter(([type]) => declared.has(type))) } : {})
        }));
      return boundedPage(entities, { offset, limit, maxBytes }, (entities, pagination) => ({ ...pagination, entities }));
    } }),
    defineSeedWorldTool(inspect, { execute: async (input, context) => {
      const snapshot = inspectedEntity.parse(json(authoring.inspect(input.id)));
      // Asset evaluators belong to execution; serialized contract generation must not load runtime resources.
      const { readPlanningSystemInherited } = await import("../SeedWorldSystemDeclarations.ts");
      for (const component of snapshot.components) {
        if (input.component && component.type !== input.component) continue;
        const keys = new Set([component.values, component.sources, component.local, component.limits].flatMap(value => Object.keys(value)));
        const fields = [...keys].filter(key => !input.fields || input.fields.includes(key));
        const inherited = await readPlanningSystemInherited(component.type, component.values, fields, context.signal);
        if (!inherited) continue;
        const source = jsonObjectSchema.parse(json(inherited.source));
        for (const [key, value] of Object.entries(inherited.values)) {
          if (!fields.includes(key) || component.values[key] !== undefined) continue;
          Object.assign(component.values, json({ [key]: value }));
          (component.assetSources ??= {})[key] = source;
        }
      }
      const rows = snapshot.components.flatMap((component, index) => {
        if (input.component && component.type !== input.component) return [];
        const keys = new Set([component.values, component.sources, component.local, component.limits].flatMap(value => Object.keys(value)));
        return [...keys].filter(key => !input.fields || input.fields.includes(key)).map(key => ({ index, key }));
      });
      return boundedPage(rows, input, (page, pagination) => ({ ...snapshot, ...pagination,
        componentTypes: snapshot.components.map(component => component.type),
        components: [...new Set(page.map(row => row.index))].map(index => {
          const component = snapshot.components[index], keys = new Set(page.filter(row => row.index === index).map(row => row.key));
          const select = <T>(values: Record<string, T>) => Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
          return { ...component, values: select(component.values), sources: select(component.sources),
            local: select(component.local), limits: select(component.limits),
            ...(component.assetSources ? { assetSources: select(component.assetSources) } : {}) };
        })
      }));
    } }),
    defineSeedWorldTool(apply, { execute: async (input, context) => {
      const value = rawReceipt.parse(json(await authoring.apply(input.commands, input.versionToken, context.signal)));
      const lastReceipt = receipts.current = { id: crypto.randomUUID(), value };
      const counts = new Map<string, { status: string; required: boolean; count: number }>();
      for (const diagnostic of value.diagnostics) {
        const status = String(diagnostic.status), required = diagnostic.required === true, key = JSON.stringify([status, required]);
        const summary = counts.get(key) ?? { status, required, count: 0 };
        summary.count++;
        counts.set(key, summary);
      }
      return json({ status: value.status, versionToken: value.versionToken, receiptId: lastReceipt.id,
        changedCount: value.changedIds.length, diagnosticSummary: [...counts.values()], hasMessage: !!value.message });
    } }),
    defineSeedWorldTool(receipt, { execute: input => {
      const lastReceipt = receipts.current;
      if (!lastReceipt || input.receiptId !== lastReceipt.id) throw new Error("Receipt expired or unavailable; do not repeat an edit to retrieve its result.");
      const items: (string | z.output<typeof jsonObjectSchema>)[] = input.section === "message"
        ? Array.from(lastReceipt.value.message ?? "") : lastReceipt.value[input.section];
      return boundedPage(items, input, (items, pagination) => ({ ...pagination, receiptId: input.receiptId, section: input.section, items }));
    } })
  ];
  return [...tools, ...createPlantMaterialTools(authoring, tools.find(tool => tool.name === apply.name)!)];
}

/** Complete-record pagination, with an optional byte budget for direct model-facing pages. */
function boundedPage<T, R>(items: readonly T[], input: { offset?: number; limit?: number; maxBytes?: number }, render: (page: T[], pagination: z.output<z.ZodObject<typeof pageOutput>>) => R): R {
  const offset = input.offset ?? 0;
  const requested = Math.min(input.limit ?? items.length, Math.max(0, items.length - offset));
  const candidate = (count: number) => render(items.slice(offset, offset + count), {
    offset, matchedCount: items.length,
    ...(offset + count < items.length ? { nextOffset: offset + count } : {}),
    ...(count < requested ? { pageLimitedByBytes: true as const } : {})
  });
  const fits = (value: R) => {
    try {
      const normalized = toAgentValue(value);
      return input.maxBytes === undefined || new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= input.maxBytes;
    }
    catch (error) { if (!(error instanceof AgentValueError)) throw error; return false; }
  };
  const full = candidate(requested);
  if (fits(full)) return full;
  let low = 0, high = requested - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(candidate(middle))) low = middle;
    else high = middle - 1;
  }
  if (!low) throw new AgentValueError(`One parameter record at offset=${offset} exceeds the Agent result budget; narrow the component or field filter.`);
  return candidate(low);
}
