import * as z from "zod";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1);
export const runtimePickIdentitySchema = z.object({
  entityId: id,
  componentId: id,
  componentType: text,
  instanceIndex: z.number().int().nonnegative().optional(),
  instanceKey: z.string().optional()
});
const observation = z.literal("live");
const status = z.enum(["found", "unavailable"]);
const source = z.object({ scene: text, entityId: text, componentId: text.optional() });
const vector = z.array(z.number()).length(3);
const entity = z.object({
  id,
  name: z.string(),
  parentId: id.nullable(),
  childCount: z.number().int(),
  components: z.array(id),
  active: z.boolean(),
  position: vector,
  rotation: vector,
  scale: vector,
  authoring: source.optional()
});
const component = z.object({
  id,
  entityId: id,
  type: text,
  enabled: z.boolean(),
  properties: z.array(z.string()),
  authoring: source.optional()
});
const entityResult = z.object({ status, alive: z.boolean(), observedAt: observation, entity: entity.nullable() });
const common = {
  effect: "read" as const,
  inputDescription:
    "使用命中或查询实际返回的 Engine instanceId（数值）。运行时 ID 与编辑态 ID 不可互换，不从名称猜测身份。",
  outputDescription:
    "主线程 Engine 的可序列化事实，Worker 不持有 Engine 对象。运行时对象销毁后 ID 不复用；alive=false 时不得对替代对象执行原指令。authoring 仅在原生投影确有映射时返回；缺失不代表应改父节点或直接销毁渲染对象。"
};
/** Generic live-query contracts. Application adapters supply the Engine-thread owner. */
export const RUNTIME_INSPECTION_CONTRACTS = [
  {
    ...common,
    name: "runtime.entity.inspect",
    description:
      "按 Engine instanceId 读取节点当前名称、父节点、组件 ID、局部变换及真实作者映射。截图只冻结像素身份，不保存历史节点结构；alive 表示原对象当前是否存活。父子关系不是业务所有权，修改前依据实际组件契约确认目标。",
    input: z.strictObject({ id }),
    output: entityResult
  },
  {
    ...common,
    name: "runtime.entity.children",
    description:
      "分页读取运行时子节点；省略 entityId 返回场景根节点。返回当前运行时关系。按需向上或向下探索，不必返回整个场景。",
    input: z.strictObject({
      entityId: id.optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).optional()
    }),
    output: z.object({
      status,
      observedAt: observation,
      entities: z.array(entityResult),
      matchedCount: z.number().int(),
      nextOffset: z.number().int().optional()
    })
  },
  {
    ...common,
    name: "runtime.component.query",
    description:
      "读取一个运行时节点实际挂载的组件，type 可按真实返回的类型名精确筛选。返回属性名和已有作者映射，不执行组件方法；组件职责和可调用方法通过对应 Engine/项目声明发现。资产种类和项目资源通过原有 editor.asset.list 与文件声明发现。",
    input: z.strictObject({ entityId: id, type: text.optional() }),
    output: z.object({ status, alive: z.boolean(), observedAt: observation, components: z.array(component) })
  },
  {
    ...common,
    name: "runtime.component.read",
    description:
      "按字段读取当前运行时组件的公开属性；先 query 获取 properties，再指定 fields。始终读取当前状态，不冒充截图时字段。Entity/Component 值以身份引用返回；容器按深度及数量有界返回，truncated 标记表示未完整读取。公共 getter 仅在显式选择该字段时读取。此接口不调用方法、不修改状态，也不把任意运行时字段当成可编辑能力。",
    input: z.strictObject({ id, fields: z.array(text).max(32) }),
    output: z.object({ status, component: component.nullable(), values: z.record(z.string(), z.json()) })
  }
] as const;
