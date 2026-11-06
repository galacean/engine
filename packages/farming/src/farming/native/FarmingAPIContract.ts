import type { IrrigationEffectSummary } from "../application/IrrigationEffectSummary";
import { z } from "zod";
import { FARM_ITEM_TYPES } from "../domain/FarmItems";
import { mapApiMethods, type ApiOperation, type ApiInput } from "@galacean/engine-project/api-contract/api-method";
import type { FarmItem, FarmCarry } from "../domain/FarmItems";
import type { CoordinatedItemAction } from "../application/FarmingActionCoordinator";
import type { FarmEnvironmentView } from "../domain/FarmEnvironment";
import type { CropDamageSource } from "../domain/FarmCommands";
import type { CropHealthStatus } from "../domain/FarmQueries";
import type { FarmingStorageDefinitions, StorageContainerQuery, StorageContainerView } from "../storage/StorageTypes";
import type { GroundTarget, CultivationInspection } from "../domain/FarmingGround";
import type { PlotView } from "../domain/PlotQueries";
import type { FarmCommandReceipt, FarmingErrorCode, FarmChange, CommandResult } from "../domain/FarmCommands";
import type { ActionAvailability } from "../domain/FarmActions";
import type { SeedDefinition, CropDefinition } from "../domain/FarmDefinitions";
import type { FieldValueResult } from "../domain/fields/SoilWaterField";
import type { CoordinatedFarmingAction } from "../application/FarmingActionCoordinator";
import type { FarmingDiagnosticReport } from "../domain/FarmingDiagnostics";

/** Stable region and plot identities from API queries. */
export type FarmingScope = Pick<FarmingCommands["get"], "farmId">;
export type FarmingPlotScope = FarmingCommands["getPlot"];
export type FarmingCommands = {
  [K in keyof typeof farmingOperations]: ApiInput<z.output<(typeof farmingOperations)[K]["input"]>>;
};
export type FarmingWriteOptions = z.output<typeof farmingWriteOptionsSchema>;
export type FarmingMutation = {
  [K in keyof typeof farmingOperations]: (typeof farmingOperations)[K]["effect"] extends "command" ? K : never;
}[keyof typeof farmingOperations];
export type FarmingRequest<K extends keyof FarmingCommands = keyof FarmingCommands> = K extends keyof FarmingCommands
  ? { readonly operation: K; readonly input: FarmingCommands[K] } & (K extends FarmingMutation
      ? { readonly options?: FarmingWriteOptions }
      : { readonly options?: never })
  : never;
export interface FarmingContext {
  readonly farmId: string;
  readonly revision: number;
  readonly groundRevision: number;
  /** Milliseconds of simulation, independent of render frame time. */ readonly simulatedTimeMs: number;
}
export interface FarmingAreaInfo {
  readonly farmId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly initialized: boolean;
  readonly revision: number | null;
  readonly groundRevision: number | null;
  readonly simulatedTimeMs: number | null;
  readonly plotCount: number;
  readonly cropCount: number;
  readonly resources: { readonly catalog: string; readonly rules: string };
  readonly error: string | null;
}
export interface FarmingCapabilities {
  /** Omitted farmId queries system defaults, not the aggregate readiness of all farms. */
  readonly scope: { readonly kind: "system" | "farm"; readonly farmId: string | null };
  /** A farm interaction host is bound. null means no farm was selected; it is not an unavailable farm. This is NOT rendering/resource readiness. */
  readonly interactionHostBound: boolean | null;
  /** The bound interaction host supplies camera/point target lookup. */
  readonly targetQueryAvailable: boolean | null;
  readonly operations: readonly (keyof FarmingCommands)[];
  readonly unavailableOperations: readonly (keyof FarmingCommands)[];
  readonly unsupported: readonly string[];
  readonly editablePlotFields: readonly string[];
  /** @deprecated Use interactionHostBound. This legacy alias does not report rendering readiness. */
  readonly presentation: boolean | null;
}
export interface FarmingCatalogView {
  readonly storage: FarmingStorageDefinitions;
  readonly seeds: readonly SeedDefinition[];
  /** Read-only thresholds use the same units as getPlot.crop.factors. Compare observed values with optimalMinimum/optimalMaximum; queries never change rules. */
  readonly crops: readonly Pick<CropDefinition, "id" | "name" | "cycle" | "harvest" | "growthFactors">[];
}
export interface FarmingOutputs {
  list: readonly FarmingAreaInfo[];
  get: FarmingAreaInfo;
  capabilities: FarmingCapabilities;
  getDiagnostics: FarmingDiagnosticReport;
  getCatalog: FarmingCatalogView;
  getTarget: {
    readonly plotId: string | null;
    readonly ground: GroundTarget | null;
    /** Reports a pointed plot, a ground hit, or no current hit. Never implies containment in the nearest farm. */
    readonly targetStatus: "plot" | "ground" | "no-hit";
  };
  queryPlots: readonly PlotView[];
  getPlot: PlotView | null;
  getEnvironment: FarmEnvironmentView;
  damageCrop: {
    readonly receipt: CommandResult;
    readonly request: FarmingRequest<"damageCrop">;
    readonly damage: {
      readonly previousHealthPermille: number;
      readonly actualDamagePermille: number;
      readonly healthPermille: number;
      readonly healthStatus: CropHealthStatus;
      readonly source: CropDamageSource;
    };
  };
  inspectCultivation: CultivationInspection;
  getAvailableActions: readonly ActionAvailability[];
  createPlot: { readonly receipt: CommandResult; readonly request: FarmingRequest<"createPlot"> };
  updatePlot: { readonly receipt: CommandResult; readonly request: FarmingRequest<"updatePlot"> };
  deletePlot: CoordinatedFarmingAction & { readonly request: FarmingRequest<"deletePlot"> };
  plant: CoordinatedFarmingAction & { readonly request: FarmingRequest<"plant"> };
  irrigate: CoordinatedFarmingAction & {
    readonly request: FarmingRequest<"irrigate">;
    readonly effectSummary: IrrigationEffectSummary;
  };
  harvest: CoordinatedFarmingAction & { readonly request: FarmingRequest<"harvest"> };
  hoe: CoordinatedFarmingAction & { readonly request: FarmingRequest<"hoe"> };
  getFieldValues: FieldValueResult;
  getInventory: Readonly<Record<string, number>>;
  getContainers: readonly StorageContainerView[];
  setContainerCount: { readonly receipt: CommandResult; readonly request: FarmingRequest<"setContainerCount"> };
  withdrawInventory: { readonly receipt: CommandResult; readonly request: FarmingRequest<"withdrawInventory"> };
  consumeBasket: { readonly receipt: CommandResult; readonly request: FarmingRequest<"consumeBasket"> };
  queryItems: readonly (FarmItem & { readonly carried: boolean })[];
  getCarry: {
    readonly carried: FarmCarry;
    readonly item: FarmItem | null;
    readonly capacity: number;
    readonly used: number;
    readonly remaining: number;
    readonly capabilities: readonly string[];
  };
  getItemTotals: {
    readonly stored: Readonly<Record<string, number>>;
    readonly pending: Readonly<Record<string, number>>;
    readonly total: Readonly<Record<string, number>>;
  };
  generateItems: CoordinatedItemAction & { readonly request: FarmingRequest<"generateItems"> };
  pickupItem: CoordinatedItemAction & { readonly request: FarmingRequest<"pickupItem"> };
  placeItem: CoordinatedItemAction & { readonly request: FarmingRequest<"placeItem"> };
  useCarriedItem: CoordinatedFarmingAction & { readonly request: FarmingRequest<"useCarriedItem"> };
  unloadBasket: CoordinatedItemAction & { readonly request: FarmingRequest<"unloadBasket"> };
  verify: {
    readonly context: FarmingContext;
    readonly receipt: FarmCommandReceipt | null;
    readonly inventory: Readonly<Record<string, number>>;
    readonly plotCount: number;
    readonly cropCount: number;
  };
}
export type FarmingAPIErrorCode =
  | FarmingErrorCode
  | "INVALID_ARGUMENT"
  | "INVALID_SNAPSHOT"
  | "NOT_SUPPORTED"
  | "MISSING_DEPENDENCY"
  | "NOT_FOUND"
  | "CONFLICT"
  | "NOT_ACTIVE"
  | "EXECUTION_FAILED";
export type FarmingResult<T> =
  | { readonly ok: true; readonly context?: FarmingContext; readonly value: T }
  | {
      readonly ok: false;
      readonly context?: FarmingContext;
      readonly error: {
        readonly code: FarmingAPIErrorCode;
        readonly message: string;
        readonly executed: boolean;
        readonly retryable: boolean;
        readonly details?: {
          readonly capacity?: number;
          readonly used?: number;
          readonly required?: number;
          readonly commandId: string;
          /** Revision of the definitive domain command result, including time advancement on rejection. */
          readonly revision: number;
          readonly replayed: boolean;
          readonly changes: readonly FarmChange[];
          readonly attempt?: CoordinatedFarmingAction["attempt"];
          /** Complete API request including captured versions; use unchanged on storage retries. */ readonly retryRequest?: FarmingRequest<FarmingMutation>;
        };
      };
    };

const id = z.string().regex(/^[a-z0-9][a-z0-9/_-]*$/i);
const integer = z.number().int().nonnegative();
const scope = { farmId: id },
  plot = { ...scope, plotId: id };
const target = z.object({ groundId: id, cellX: z.number().int(), cellZ: z.number().int() }).strict();
const label = z.string().trim().min(1).max(80);
const bounds = z
  .object({
    minimumX: z.number().finite(),
    maximumX: z.number().finite(),
    minimumZ: z.number().finite(),
    maximumZ: z.number().finite()
  })
  .strict()
  .refine((b) => b.minimumX <= b.maximumX && b.minimumZ <= b.maximumZ);
const query = z
  .object({
    groundId: id.optional(),
    bounds: bounds.optional(),
    preparation: z.enum(["leveled"]).optional(),
    availability: z.enum(["available", "blocked", "unloaded"]).optional(),
    occupied: z.boolean().optional(),
    cropId: id.optional()
  })
  .strict();
const position = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const farmingWriteOptionsSchema = z
  .object({
    commandId: id.optional(),
    expectedRevision: integer.optional(),
    expectedCarriedItemId: id.optional(),
    expectedGroundRevision: integer.optional()
  })
  .strict();

/** Authoritative API registration. Types, effects, schemas, routing and declarations consume this table. */
export const farmingOperations = {
  getDiagnostics: {
    effect: "read",
    description:
      "只读查询当前农场状态。current/coverage 只描述发布就绪的 placement/access/runtime/presentation；agronomy 独立汇总当前地块可用性、作物健康和生长、土壤水分与库存数量，并给出真实 findings。no-issues-found 只覆盖该 evidence.checked 范围，不代表外观或未来状态；unavailable 不能当正常。空地和空库存本身不是故障。一般健康询问可依据这两组当前证据回答；有 finding 时按真实 plotId 查询详情，用户要求视觉检查时再取景。不用追查正常的历史候选。farms 保留候选与发布的分阶段证据，用于解释 current 中的问题。可省略 farmId 查询系统；区域未创建、初始化失败时仍可调用，不触发初始化。按 phase、planningRevision/publicationRevision 区分版本，state 为 pending/ready/blocked/failed。道路事实由宿主提供，access.evidence 的 ROAD_CONNECTION 记录入口 target 及实际公共节点、道路段和道路身份 relatedIds；Farming 不解释路网。正常剔除或距离隐藏不是资源失败。",
    input: z.object({ farmId: id.optional() }).strict()
  },
  list: {
    effect: "read",
    description:
      "列出当前 Scene 的种植区域，包括禁用区域；返回各区域自己的版本和资源摘要，不代表已初始化。 无输入、无写入；空 Scene 返回 []。用 get(farmId) 验证区域详情。",
    input: z.object({}).strict()
  },
  get: {
    effect: "read",
    description:
      "按 farmId 读取区域身份、资源哈希、运行状态和错误；不返回可写的服务或资源对象。 输入 farmId 必须来自 list，未知区域 NOT_FOUND；只读完成后可用 capabilities 验证依赖。",
    input: z.object(scope).strict()
  },
  capabilities: {
    effect: "read",
    description:
      "查询当前可执行的操作与依赖；无 farmId 时读取系统通用能力，scope.kind=system；这时 interactionHostBound/targetQueryAvailable/presentation=null 表示未选择农场，不能推断任何农场不可用；用 list 得到 farmId 后再查区域能力。指定 farmId 才查询区域交互宿主，targetQueryAvailable 指示 getTarget 是否可用。presentation 是 interactionHostBound 的兼容别名，不等于诊断中的表现资源就绪。 只读，指定未知区域 NOT_FOUND；operations 是当时的能力事实，执行前仍须校验，不能解锁未初始化或禁用区域。",
    input: z.object({ farmId: id.optional() }).strict()
  },
  getCatalog: {
    effect: "read",
    description:
      "读取真实可用种子、作物、生长周期、growthFactors 生长因素阈值、产物及storage容器类型/逐作物容量（仓储篮子为硬容量，马车为显示容量，上限60份）；播种使用 seedId，收获使用 cropInstanceId。growthFactors 的 minimum/maximum 是生长边界，optimalMinimum/optimalMaximum 是适宜范围，单位与 getPlot.crop.factors 一致；根据实际读回决定是否浇水，不修改目录。farmId 必须已配置资源；资源不一致 INVALID_DEFINITION。只读结果中的 seed.cropId 应能在 crops 中找到。growthTarget 是成长量，baseGrowthUnitsPerSecond 是每秒速率，理想成熟毫秒数为两者之比乘 1000；产物数量为整数。",
    input: z.object(scope).strict()
  },
  getTarget: {
    effect: "read",
    description:
      "读取宿主当前选中地块或待开垦网格；无交互宿主返回 NOT_SUPPORTED，不猜测目标。 前提是区域已初始化；无副作用。对结果用 getPlot 或 inspectCultivation 重新检查，不能把一次选中当成永久授权。",
    input: z.object(scope).strict()
  },
  queryPlots: {
    effect: "read",
    description:
      "按地形、水平米制范围、整备、可用性、占用和 cropId 过滤；成熟判断读 crop.mature，停止生长原因读 pausedReason 和 factors。 输入 farmId/query，cell 为整数，bounds 单位米；只读返回过滤后的地块数组，空结果为 []。可用 getPlot 核验其中实例。",
    input: z.object({ ...scope, query: query.optional() }).strict()
  },
  getEnvironment: {
    effect: "read",
    description:
      "只读返回当前宿主环境（季节、基准温度、雪、气温、光照、雨强）、农业时间及最近结算气温光照；nearWater为宿主缓存刷新诊断（版本、调用数、切片耗时和超预算次数），未接入为null。静态基线明确标记。不推进时间或采样Water。",
    input: z.object(scope).strict()
  },
  damageCrop: {
    effect: "command",
    description:
      "对指定 plotId/cropInstanceId 提交正整数 damagePermille 和 source（animal/pest/storm/wind/other），允许超过1000，实际伤害截断到剩余健康；不接受 pestPressureDeltaUnits。独立于农具和动物系统。返回 receipt（commandId/revision/ok/replayed）及健康前后、实际伤害、派生 healthStatus。健康降至0时在同一事务中自动移除作物并释放耕地，恢复已锄状态，不产生收获物；无论是否成熟都立即清理。原伤害请求可幂等重放；清理后新的伤害请求返回 CROP_NOT_FOUND，已重新种植则返回 CROP_INSTANCE_CHANGED；仍校验实例和版本。CROP_NOT_FOUND/CROP_INSTANCE_CHANGED/INVALID_ARGUMENT/版本冲突明确失败。重试须保留完整 request 和捕获版本；同ID改参拒绝，STORAGE_FAILURE 的 retryRequest 可原样重试。",
    input: z
      .object({
        ...plot,
        cropInstanceId: id,
        damagePermille: z.number().refine((value) => Number.isInteger(value) && value > 0),
        source: z.enum(["pest", "animal", "storm", "wind", "other"])
      })
      .strict(),
    options: farmingWriteOptionsSchema
  },
  getPlot: {
    effect: "read",
    description:
      "返回地块及当前作物实例、成熟度、诊断和版本；不存在返回 null，未加载地形的位置为 null。 输入 farmId/plotId；只读，水分为体积含水率百分点，成长与健康度为千分比，剩余时间为毫秒。waterRates并列返回当前雨水、河湖补水和蒸发速率；nearWater含缓存来源hash、岸距/高差（米）、0..1系数、版本和refreshing标记，刷新中沿用旧完整缓存。查询不采样Water。操作后重查当前实例。",
    input: z.object(plot).strict()
  },
  inspectCultivation: {
    effect: "read",
    description:
      "只读检查 groundId/cellX/cellZ 的完整地形范围和坡度；返回 canCultivate 与阻止原因，不修改地形。 输入整数网格坐标；坡度单位度、bounds/position 单位米。正常返回阻止原因，未知区域 NOT_FOUND；用 getAvailableActions 判断当前规则能力。",
    input: z.object({ ...scope, target }).strict()
  },
  getAvailableActions: {
    effect: "read",
    description:
      "读取当前规则支持的操作与原因，仅为预览；事务执行会结算时间并重新校验。 输入地块 ID 或 groundId/整数网格坐标；只读返回 enabled/reason。不存在目标不授权操作，之后依据实际执行回执验证。",
    input: z.object({ ...scope, target: z.union([id, target]) }).strict()
  },
  createPlot: {
    effect: "command",
    description:
      "注册符合条件的空耕地，用于布局初始化；目标已存在或地形不合格则失败。实际农具开垦使用 hoe。 输入 target 的 groundId/整数网格坐标和可选 label。ok 表示耕地记录已提交到当前状态，后台保存状态由宿主管理；verify(commandId) 后 queryPlots 检查位置与无占用。PLOT_EXISTS、地形错误、版本冲突或提交失败返回证据。",
    input: z.object({ ...scope, target: target.extend({ label: label.optional() }).strict() }).strict(),
    options: farmingWriteOptionsSchema
  },
  updatePlot: {
    effect: "command",
    description:
      "仅修改 label/preparation；整备变化要求空地。禁止直接修改水分、生长量、库存、位置和高度。 输入 patch.label 或 patch.preparation=leveled，空 patch 拒绝。ok 表示记录已提交到当前状态，后台保存状态由宿主管理；verify 后 getPlot 检查字段。PLOT_NOT_FOUND、PLOT_OCCUPIED、版本冲突或提交失败返回证据。",
    input: z
      .object({
        ...plot,
        patch: z
          .object({ label: label.optional(), preparation: z.enum(["leveled"]).optional() })
          .strict()
          .refine((p) => Object.values(p).some((v) => v !== undefined))
      })
      .strict(),
    options: farmingWriteOptionsSchema
  },
  deletePlot: {
    effect: "command",
    description:
      "删除耕地记录，露出宿主原地形但不修改地形。有作物须显式 cascadeCrop=true，一并移除而无收获。 输入 farmId/plotId/cascadeCrop。ok 表示删除已提交到当前状态，后台保存状态由宿主管理；verify 后 getPlot=null 且库存无产出。PLOT_OCCUPIED、PLOT_NOT_FOUND、版本冲突或提交失败返回证据。",
    input: z.object({ ...plot, cascadeCrop: z.boolean().optional() }).strict(),
    options: farmingWriteOptionsSchema
  },
  plant: {
    effect: "command",
    description:
      "使用手上对应种子袋，否则在目标旁生成或复用种子袋并拿起；在已开垦的空耕地播种目录中的 seedId，创建作物实例；检查返回回执及 getPlot.crop。 输入 farmId/plotId/seedId；ok 表示实例已提交到当前状态，后台保存状态由宿主管理，动画状态独立返回。PLOT_OCCUPIED、INVALID_COMMAND、地形错误或版本/提交错误拒绝；verify 后检查新的 crop.instanceId 与 cropId。",
    input: z.object({ ...plot, seedId: id }).strict(),
    options: farmingWriteOptionsSchema
  },
  irrigate: {
    effect: "command",
    description:
      "优先使用手上水壶，否则在目标旁生成或复用空闲水壶并换拿，不限制AI距离。按规则增加体积含水率百分点；余水分配到连通耕地，全部饱和后流失。回执包含 input/absorbed/distributed/lost，仅表示该次灌水的即时吸收、溢流分配和流失；distributed=0 不排除后续模拟的土壤扩散。effectSummary 分开列出即时灌水和回执中的模拟结算；后续状态须重新读取，不能把读数差异全部归因蒸发。不会立即成熟。 输入 farmId/plotId，无用户可编辑的水量；ok 表示水分事务已提交到当前状态，后台保存状态由宿主管理，演出与落地同步。ACTION_UNAVAILABLE、地形/版本/提交错误拒绝；verify 后检查回执与相关地块含水率。",
    input: z.object(plot).strict(),
    options: farmingWriteOptionsSchema
  },
  harvest: {
    effect: "command",
    description:
      "收获 getPlot 返回的成熟 cropInstanceId；必须使用持久收获篮子（优先手上，否则在目标旁生成/复用并换拿），整次产出进入篮子并腾空地块。实例变化或未成熟拒绝。 输入 farmId/plotId/cropInstanceId；ok 表示产物已提交到当前状态，后台保存状态由宿主管理，提交后动画失败不否定产出。篮子容量20，空间不足整次拒绝BASKET_CAPACITY_INSUFFICIENT，包含capacity/used/required；零产量成熟作物满篮可收。固定仓储篮子只在unloadBasket时按需扩容；马车不因装满自动增加。CROP_NOT_MATURE、CROP_INSTANCE_CHANGED、CANCELLED、BUSY 及版本/提交错误返回证据；verify 后检查地块腾空和getCarry/getItemTotals的篮中增量。",
    input: z.object({ ...plot, cropInstanceId: id }).strict(),
    options: farmingWriteOptionsSchema
  },
  hoe: {
    effect: "command",
    description:
      "替玩家使用锄头，按点击时状态锁定清除作物＞还原，未开垦地面直接开垦为 leveled；一次只执行一项，不产生收获。动画前绑定占用实例，地形或实例变化拒绝提交；取消恢复临时显示。 输入 groundId/整数网格坐标及观察到的 expectedCropInstanceId（null 表示空地）；ok 表示整备已提交到当前状态，后台保存状态由宿主管理。CROP_INSTANCE_CHANGED、GROUND_CHANGED、CANCELLED、BUSY 及版本/提交错误返回证据；verify 后检查准备状态及库存不增。",
    input: z.object({ ...scope, target, expectedCropInstanceId: id.nullable().optional() }).strict(),
    options: farmingWriteOptionsSchema
  },
  getFieldValues: {
    effect: "read",
    description:
      "按给定 plotIds 顺序读取 soilMoisture 体积含水率百分点及可用状态，缺项为 null；携带农场和地形版本。 输入 farmId/fieldId/plotIds；只读，未知 fieldId INVALID_ARGUMENT。可与同一版本 getPlot.soil.moistureUnits 对照，不以材质湿度验证。",
    input: z.object({ ...scope, fieldId: z.literal("soilMoisture"), plotIds: z.array(id) }).strict()
  },
  getContainers: {
    effect: "read",
    description:
      "查询真实仓储容器，可按 typeId/cropId 过滤，cropId匹配contents中任一作物。contents返回完整逐作物数量，quantity为总量；混装和空容器的cropId/itemId为null。马车capacity=null表示不设库存容量，displayCapacity是展示上限，超额库存仍可出库；仓储篮子保持硬容量。逐contents汇总等于getInventory。",
    input: z
      .object({ ...scope, query: z.object({ typeId: id.optional(), cropId: id.optional() }).strict().optional() })
      .strict()
  },
  setContainerCount: {
    effect: "command",
    description:
      "按typeId设置非负整数总数及保留数量。增加时寻找合法位置；马车减少可混存合并，有库存至少保留一辆，装满不会自动增车。仓储篮子减少先合并同种作物，容量不足CONTAINER_CAPACITY_INSUFFICIENT；位置不足NO_STORAGE_SPACE，均不部分提交。成功后用getContainers和verify检查。",
    input: z.object({ ...scope, typeId: id, count: integer }).strict(),
    options: farmingWriteOptionsSchema
  },
  withdrawInventory: {
    effect: "command",
    description:
      "按 itemId 出库正整数数量；可选 containerId 只扣指定容器中的对应作物，容器或作物变化返回 ITEM_CHANGED，该容器不足返回 INSUFFICIENT_INVENTORY，绝不挪扣其他容器。省略时优先扣减较晚创建的容器。支持混装马车，回收超过保留数量的空容器，不部分出库。成功后通过 getInventory/getContainers/verify 验证；写入重试保留完整 request。",
    input: z
      .object({ ...scope, itemId: id, quantity: z.number().int().positive(), containerId: id.optional() })
      .strict(),
    options: farmingWriteOptionsSchema
  },
  consumeBasket: {
    effect: "command",
    description:
      "从指定落地收获篮子按 cropId/itemId 原子消费正整数 quantity，不转入仓库。携带中拒绝 ITEM_CHANGED，数量不足拒绝 INSUFFICIENT_INVENTORY，不部分扣除。提交发布 basket-content-changed；用 queryItems 核验余量。宿主负责取食距离及动物资格，传 expectedRevision 防止观察后的移动或拾取。相同 commandId 和完整请求幂等重放。",
    input: z.object({ ...scope, basketId: id, cropId: id, itemId: id, quantity: z.number().int().positive() }).strict(),
    options: farmingWriteOptionsSchema
  },
  getInventory: {
    effect: "read",
    description:
      "读取全部固定仓储设施汇总的产物数量；持久收获篮子的待卸货内容另用getItemTotals，不计入此库存。 输入 farmId；只读返回 itemId 到整数数量的映射，未出现项按零处理。用 unloadBasket 回执与操作前后增量核验。",
    input: z.object(scope).strict()
  },
  queryItems: {
    effect: "read",
    description:
      "只读查询持久道具：按稳定 itemId、类型或世界 XZ 范围筛选，返回位置、种子袋类型、篮中真实内容和是否携带。固定设施用 getContainers 查询，不能拾取。",
    input: z
      .object({
        ...scope,
        query: z
          .object({ itemId: id.optional(), type: z.enum(FARM_ITEM_TYPES).optional(), bounds: bounds.optional() })
          .strict()
          .optional()
      })
      .strict()
  },
  getCarry: {
    effect: "read",
    description:
      "只读返回玩家唯一携带位、工具能力、当前篮子内容、容量20及已用/剩余单位。种子不消耗；种子袋与篮子一样以itemId携带并纳入工程保存，拿起后不留地面副本。",
    input: z.object(scope).strict()
  },
  getItemTotals: {
    effect: "read",
    description: "只读返回 stored 固定设施库存、pending 全部收获篮子待卸货数量与 total 合计；数量以领域状态为准。",
    input: z.object(scope).strict()
  },
  generateItems: {
    effect: "command",
    description:
      "在有效地面附近生成稳定实例；种子袋必须提供 seedId。count 为1到20；同类型达到20个时复用最近空闲实例，回执 item-reused 明确说明，召回不搬动远处物品。保留 commandId 和 request 重试，不重复生成。",
    input: z
      .object({
        ...scope,
        itemType: z.enum(FARM_ITEM_TYPES),
        count: z.number().int().min(1).max(20),
        groundId: id,
        position,
        seedId: id.optional()
      })
      .strict(),
    options: farmingWriteOptionsSchema
  },
  pickupItem: {
    effect: "command",
    description:
      "拾取指定道具，包括整个种子袋；自动更换前校验目标和旧道具落点，篮子内容保留。dropPosition 为旧携带物附近的放置搜索中心，米制世界坐标。不限制AI距离。",
    input: z.object({ ...scope, itemId: id, dropPosition: position }).strict(),
    options: farmingWriteOptionsSchema
  },
  placeItem: {
    effect: "command",
    description:
      "将当前道具放到指定有效世界地面，expectedItemId 锁定携带身份；种子袋与篮子一样移动到该位置，保持原seedId。失败保持携带，篮子内容不变。地面避开耕地、水面、陡坡和设施。",
    input: z.object({ ...scope, expectedItemId: id, groundId: id, position }).strict(),
    options: farmingWriteOptionsSchema
  },
  useCarriedItem: {
    effect: "command",
    description:
      "按当前携带物与 target 网格状态锁定农事意图；锄头顺序为清除作物、还原，空地开垦。一次请求只做一项，捕获版本与携带身份，过期拒绝，不降级。空手不操作。AI可远程指定目标。",
    input: z.object({ ...scope, target }).strict(),
    options: farmingWriteOptionsSchema
  },
  unloadBasket: {
    effect: "command",
    description:
      "携带指定非空篮子向任意固定设施整篮卸货，containerId可省略，仅为触发点。马车作物向已有兼容马车混存，库存可超过显示容量，不自动增车；无马车返回NO_STORAGE_SPACE。仓储篮子保持单作物和硬容量，不够自动生成合法设施；返回basket-unloaded.allocations的设施、数量与created。全部转移和源篮清空同一事务，提交失败保持原状，同ID重试不重复扩容；提交成功后的后台保存状态由宿主管理。",
    input: z.object({ ...scope, basketId: id, containerId: id.optional() }).strict(),
    options: farmingWriteOptionsSchema
  },
  verify: {
    effect: "read",
    description:
      "读取当前版本和可选 commandId 的已提交回执；minimumRevision 是下限，允许时间继续推进。回执不存在或已过保留窗口明确失败，之后用查询检查业务断言。 输入 farmId 与可选 commandId/minimumRevision（非负整数）；只读，低于下限 VERSION_CONFLICT，缺少回执 NOT_FOUND。返回记录只说明提交事实，必须另查当前目标和库存断言。",
    input: z.object({ ...scope, commandId: id.optional(), minimumRevision: integer.optional() }).strict()
  }
} as const satisfies Record<keyof FarmingOutputs, ApiOperation>;

export const farmingInputSchemas = mapApiMethods(farmingOperations, (method) => method.input);
export const FARMING_API_CONTRACT = Object.freeze(mapApiMethods(farmingOperations, (method) => method.description));
export const farmingMutationNames = Object.keys(farmingOperations).filter(isFarmingMutation);
function isFarmingMutation(operation: string): operation is FarmingMutation {
  return (
    Object.hasOwn(farmingOperations, operation) &&
    farmingOperations[operation as keyof typeof farmingOperations].effect === "command"
  );
}
export function isFarmingReadOperation(operation: string): boolean {
  return Object.hasOwn(farmingOperations, operation) && !isFarmingMutation(operation);
}
