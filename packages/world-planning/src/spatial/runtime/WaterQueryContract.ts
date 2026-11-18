import * as z from "zod";

const target = z.object({ scene: z.string().min(1), id: z.string().min(1) }).strict();
const optionalTarget = z.object({ target: target.optional() }).strict();
const quality = z.enum(["actual", "proxy", "unsupported"]);
const scalar = z.object({ value: z.number().optional(), quality });
const materialProperty = z.object({
  name: z.string(),
  type: z.string(),
  value: z.unknown(),
  label: z.string(),
  group: z.string().optional(),
  showIf: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
  range: z.tuple([z.number(), z.number(), z.number()]).optional(),
  texture: z
    .object({ slot: z.string(), label: z.string(), group: z.string(), isSRGBColorSpace: z.boolean() })
    .optional()
});
const state = z.object({
  target,
  bodyRevision: z.number(),
  published: z.boolean(),
  enabled: z.boolean(),
  active: z.boolean(),
  lastError: z.string().optional()
});
const contract = <const Name extends string, Input extends z.ZodType, Output extends z.ZodType>(
  name: Name,
  description: string,
  input: Input,
  output: Output
) => ({
  name,
  description,
  domain: "water" as const,
  effect: "read" as const,
  inputMode: "required" as "required" | "optional" | "none",
  inputDescription:
    name === "water.verify"
      ? "target 必填，使用 editor.component.query 返回的 scene 和 id；expectedRevision 比较水体的 bodyRevision。"
      : "target 使用 editor.component.query 返回的 scene 和 id；坐标为世界米制。省略 target 查询整个场景。",
  outputDescription:
    name === "water.capabilities"
      ? "材质元数据来自已接受 Source；当前草稿的配置请用 editor.component.read 读取。不提交编辑、不证明保存完成。"
      : "只读当前发布事实，不提交编辑、不证明保存完成；错误会拒绝调用。sample.id 是运行时身份，不能作为 Source target。",
  input,
  output
});

export const WATER_QUERY_CONTRACTS = [
  contract(
    "water.capabilities",
    "读取 Water 的实际作者字段、材质参数和纹理槽元数据；写操作统一使用公共 Editor API。",
    optionalTarget,
    z.object({
      editor: z.literal("public-source"),
      activeOceansPerScene: z.literal(1),
      hostTerrain: z.boolean(),
      oceanDatum: z.number().optional(),
      authoringFields: z.array(z.string()),
      kinds: z.array(
        z.object({
          kind: z.enum(["lake", "river", "ocean"]),
          query: z.boolean(),
          buoyancy: z.boolean(),
          wake: z.boolean(),
          worldPlacement: z.string(),
          connectedWorldPlacement: z.string(),
          cameraCount: z.number()
        })
      ),
      material: z.object({ path: z.string(), properties: z.array(materialProperty) }).optional()
    })
  ),
  contract(
    "water.sample",
    "采样已发布水面、水深、床面、流速和岸距；保留 actual/proxy/unsupported。Ocean 返回基准面，不含可视波峰。",
    optionalTarget.extend({ x: z.number().finite(), z: z.number().finite() }),
    z.object({
      water: z.boolean(),
      revision: z.number(),
      status: z.enum(["unresolved", "resolved"]),
      id: z.string().optional(),
      surfaceElevationMetres: z.number().optional(),
      surfaceModel: z.string().optional(),
      depth: scalar.optional(),
      bed: scalar.optional(),
      shoreDistance: scalar.optional(),
      velocity: z.object({ value: z.array(z.number()).optional(), quality }).optional()
    })
  ),
  contract(
    "water.sampleDrops",
    "查询已发布河流的跌水表面；水帘不是普通湿区。",
    optionalTarget.extend({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
    z.object({ revision: z.number(), drops: z.array(z.record(z.string(), z.unknown())) })
  ),
  contract(
    "water.diagnostics",
    "读取 Water 系统状态、Source 水体发布状态和错误；未发布的水体仍返回身份和原因。",
    optionalTarget,
    z.object({
      revision: z.number(),
      runtime: z.record(z.string(), z.unknown()),
      bodies: z.array(state),
      diagnostics: z.array(z.object({ id: z.string(), occurredAt: z.string(), message: z.string() }))
    })
  ),
  contract(
    "water.verify",
    "验证指定 Source 水体的当前发布状态和可选水体修订号；未发布或存在运行错误时拒绝。",
    z.object({ target, expectedRevision: z.number().int().nonnegative().optional() }).strict(),
    state.extend({ revision: z.number() })
  )
] as const;
