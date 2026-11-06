import { resolveWatercourse } from "../authoring/river/Watercourse";
import { watercourseGeometry } from "../authoring/river/WatercourseGeometry";
import { sampleWaterTerrainHeight, isWaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import type { WaterBodyAsset } from "../authoring/body/WaterBodyAsset";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import type { WaterQualityPlanV2 } from "../authoring/quality/WaterQualityPlan";
import { WaterBodyComponent, type WaterBodyConfiguration } from "./WaterBodyComponent";
import {
  WaterBodyResource,
  WaterLookResource,
  WaterQualityResource,
  stringifyWaterData,
  parseWaterData
} from "./WaterResources";
import { WaterSystem } from "./WaterSystem";

export type {
  WaterDefinition,
  WaterCommands,
  WaterCommand,
  WaterErrorCode,
  WaterResult,
  WaterInstanceSettings
} from "./WaterAPIContract";
import type {
  WaterDefinition,
  WaterCommands,
  WaterCommand,
  WaterErrorCode,
  WaterResult,
  WaterInstanceSettings
} from "./WaterAPIContract";

/** Runtime-checked metadata: adding an operation requires adding both its implementation and knowledge. */
export const WATER_API_CONTRACT = Object.freeze({
  resolveRiver:
    "按地形或显式高程解析河溪控制点和分段，返回床面修改需求及诊断，不发布场景。雕刻需要 sections.carve 显式授权；宿主接受 Terrain 后用 createWatercourseRiver 构建资产并共同发布。",
  list: "列出当前 Scene 已注册水体的元数据，包含禁用的实例；不含 definition，完整定义从 get 获取。",
  presets: "列出宿主明确提供的完整水体输入预设；create 通过 preset ID 引用。预设必须包含有效地形输入。",
  get: "读取完整 definition、稳定 ID、资源内容哈希、已发布状态与错误；不返回可写的内部对象。",
  capabilities: "先读取能力再编辑。几何编辑传完整 asset，外观编辑传完整 look；两者都创建独立资源修订。",
  create:
    "输入完整 Lake/River/Ocean 描述及 Look/Quality。Lake/River 的地形采样必须已包含在 source 中；不会自动挖湖盆或河床。",
  update: "等待校验、编译和发布成功才返回 ok；失败保持旧版。只支持 asset/look/quality/settings，禁止水量或出水口操作。",
  updateMany:
    "一次修改多个已有水体；全部准备成功才统一发布。任何参数错误、取消或失败均保留所有水体的上一版。每个 ID 只能出现一次。",
  setEnabled: "false 退出运行和查询；true 恢复并等待发布。仅隐藏请 update settings.visible=false。",
  remove: "销毁水体组件并等待资源释放、查询移除；保留调用方 Entity。",
  sampleDrops: "按世界米制 XYZ 查询落水段最近点、距离、宽度和落差；水帘与装饰泡沫不是普通水面，不返回虚假水深。",
  sample:
    "按世界米制 X/Z 采样；id 可限定水体。无命中不代表所有空间字段已解析。检查 quality，不把 proxy 或 unsupported 当作真实值。",
  verify: "读取当前发布事实，可检查 expectedRevision；用于修改后的确定性自测。"
} satisfies Record<keyof WaterCommands, string>);

export const WATER_KNOWLEDGE = Object.freeze({
  version: 3,
  entry: "shared/water/native/index.ts",
  types: [
    "WaterCommands",
    "WaterCommand",
    "WaterResult",
    "WaterDefinition",
    "WaterInstanceSettings",
    "WatercourseAuthoring",
    "WaterTerrainSnapshot"
  ],
  units:
    "长度/床深/岸距为米，速度为米每秒，Entity 使用世界坐标。有限水体支持平移和 Y 轴旋转，禁止缩放或倾斜；Ocean 仅支持后端声明的变换。",
  ownership:
    "资源可共享；update 新建独立修订。保存组件配置与资源引用，编译缓存和纹理对象不入档。Scene/Prefab 使用 Galacean 2.0 格式。",
  transport:
    "JSON 中的数值 TypedArray 使用 {$waterArray:'Float32Array',values:[...]} 等标签；保留标签，只修改 values。通过 get 读回的完整 definition 可直接交回 update；list 只返回元数据。",
  completion:
    "await execute 返回 ok 才表示已完成。updateMany 中所有水体使用同一发布版本。失败、取消、缺少依赖不能报告成功。隐藏保留查询，禁用退出查询，移除释放组件。",
  queries:
    "Ocean 水面返回 datum，不含仅在 Shader 中的 Gerstner 起伏；深度无实测床高时为 proxy，速度不可用时为 unsupported。检查每个字段质量与 revision。",
  integration:
    "空间布局提供已接受的地形和水体描述。宿主协调地形修改、世界时钟、降雨和存储；原生 prepareBatch 支持宿主准备后统一提交。Terrain 局部精细块替换背景床面，水系统只读。",
  authoring:
    "resolveRiver 返回 applied:false 的规划结果；坐标单位米，锚点 ID 必须稳定。普通段和台阶平台有水面及水深，水帘用 sampleDrops 查询。Lake 用 createLakeFromTerrain 读取已有床面；LakeTerrainModifier 只描述挖低意图，水位与 referenceLevel 分离。",
  riverDropPresentation:
    "definition.look.look.riverDrops 控制落水纹理、水色、速度、泡沫和飞溅；speed:0 冻结动画。只对含 RiverDrop 的河流启用，通过独立 Look 修订及 update/updateMany 发布，不改变地形、水量或查询；sampleDrops 不把装饰泡沫算作湿区。",
  deferredHydrology: ["直接调湖水位=一次补排水", "后台时间继续", "普通湖盆编辑保持水位", "撤销重做保持当前水量"],
  unsupported: ["outlet CRUD", "finite volume", "rainfall simulation", "irrigation", "swimming"],
  output:
    "脚本读取完整 definition 后，只向模型返回目标 ID、状态、版本和采样摘要，避免完整地形数组超过通用 Agent 输出限制。",
  workflow: [
    "list 发现 ID → get 获取完整 definition → capabilities",
    "await update/updateMany/create/setEnabled/remove",
    "verify → sample → 检查断言"
  ],
  operations: WATER_API_CONTRACT
});

/** The same checked commands serve application code and a host's generic Agent tool dispatcher. */
export class WaterAPI {
  private readonly presets: Readonly<Record<string, WaterDefinition>>;
  constructor(
    private readonly system: WaterSystem,
    presets: Readonly<Record<string, WaterDefinition>> = {}
  ) {
    this.presets = parseWaterData(stringifyWaterData(presets)) as Readonly<Record<string, WaterDefinition>>;
  }

  async execute(command: WaterCommand, signal?: AbortSignal): Promise<WaterResult<unknown>> {
    try {
      signal?.throwIfAborted();
      if (!command || !Object.prototype.hasOwnProperty.call(WATER_API_CONTRACT, command.operation))
        throw new Error("NOT_SUPPORTED: Unknown Water operation.");
      const input = command.input;
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("INVALID_ARGUMENT: Operation input must be an object.");
      let value: unknown;
      switch (command.operation) {
        case "resolveRiver": {
          this.keys(command.input, ["authoring", "terrain"]);
          if (!isWaterTerrainSnapshot(command.input.terrain))
            throw new Error("INVALID_ARGUMENT: Invalid Terrain snapshot.");
          const course = resolveWatercourse(command.input.authoring, (x, z) =>
            sampleWaterTerrainHeight(command.input.terrain, x, z)
          );
          const geometry = watercourseGeometry(course);
          value = {
            applied: false,
            course,
            terrainModification: {
              mode: "carve-only",
              owner: "Terrain",
              points: geometry.points,
              drops: geometry.drops
            },
            requiresHostAcceptance: true,
            diagnostics: { dropCount: geometry.drops.length, surfaceReachCount: geometry.paths.length }
          };
          break;
        }
        case "list":
          value = this.system.bodies.map((body) => this.describeMetadata(body));
          break;
        case "presets":
          value = Object.entries(this.presets).map(([id, definition]) => ({ id, kind: definition.asset.kind }));
          break;
        case "get":
          value = this.describe(command.input.id);
          break;
        case "capabilities": {
          const body = command.input.id ? this.find(command.input.id) : undefined;
          value = {
            operations: Object.keys(WATER_API_CONTRACT),
            editableFields: [
              "asset",
              "look",
              "quality",
              "settings.visible",
              "settings.priority",
              "settings.interaction",
              "settings.representationState"
            ],
            kind: body?.configuration?.asset.kind,
            limits: { activeOceansPerScene: 1 },
            unsupported: WATER_KNOWLEDGE.unsupported,
            terrainMutation: "host-coordinated",
            query: body ? this.system.inspect(body.waterId).inspection?.capabilities : undefined
          };
          break;
        }
        case "create": {
          const args = command.input;
          this.keys(args, ["id", "name", "definition", "preset", "settings"]);
          if (args.definition && args.preset) throw new Error("INVALID_ARGUMENT: Use definition or preset, not both.");
          const definition =
            args.definition ??
            (args.preset && Object.prototype.hasOwnProperty.call(this.presets, args.preset)
              ? this.presets[args.preset]
              : undefined);
          if (args.id && this.system.bodies.some((b) => b.waterId === args.id))
            throw new Error("CONFLICT: Water ID already exists.");
          const entity = this.system.entity.scene!.createRootEntity(args.name ?? "Water");
          const body = entity.addComponent(WaterBodyComponent);
          const allocated: Array<WaterBodyResource | WaterLookResource | WaterQualityResource> = [];
          try {
            if (args.id !== undefined) body.waterId = args.id;
            const config = this.configuration(definition!, args.settings, undefined, allocated);
            await body.configure(config, signal);
            value = this.describe(body.waterId);
          } catch (error) {
            entity.destroy();
            await body.dispose();
            throw error;
          } finally {
            allocated.forEach((resource) => resource.destroy());
          }
          break;
        }
        case "update": {
          const args = command.input;
          this.keys(args, ["id", "asset", "look", "quality", "settings"]);
          const body = this.find(args.id);
          const allocated: Array<WaterBodyResource | WaterLookResource | WaterQualityResource> = [];
          try {
            const config = this.configuration(args, args.settings, body.configuration, allocated);
            await body.configure(config, signal);
            value = this.describe(args.id);
          } finally {
            allocated.forEach((resource) => resource.destroy());
          }
          break;
        }
        case "updateMany": {
          this.keys(command.input, ["updates"]);
          if (!Array.isArray(command.input.updates) || !command.input.updates.length)
            throw new Error("INVALID_ARGUMENT: updateMany requires a nonempty updates array.");
          const allocated: Array<WaterBodyResource | WaterLookResource | WaterQualityResource> = [];
          let prepared: Awaited<ReturnType<WaterSystem["prepareBatch"]>> | undefined;
          try {
            const updates = command.input.updates.map((args) => {
              this.keys(args, ["id", "asset", "look", "quality", "settings"]);
              const body = this.find(args.id);
              return { body, configuration: this.configuration(args, args.settings, body.configuration, allocated) };
            });
            prepared = await this.system.prepareBatch(updates, signal);
            prepared.commit();
            value = updates.map(({ body }) => this.describe(body.waterId));
          } catch (error) {
            await prepared?.rollback();
            throw error;
          } finally {
            allocated.forEach((resource) => resource.destroy());
          }
          break;
        }
        case "setEnabled": {
          const body = this.find(command.input.id);
          if (typeof command.input.enabled !== "boolean") throw new Error("INVALID_ARGUMENT: enabled must be boolean.");
          const previous = body.enabled;
          const cancel = () => body.cancel();
          signal?.addEventListener("abort", cancel, { once: true });
          try {
            body.enabled = command.input.enabled;
            await body.ready;
          } catch (error) {
            body.enabled = previous;
            await body.ready.catch(() => {});
            throw error;
          } finally {
            signal?.removeEventListener("abort", cancel);
          }
          value = this.describe(body.waterId);
          break;
        }
        case "remove": {
          const body = this.find(command.input.id);
          body.destroy();
          await body.dispose();
          await this.system.detach(body);
          value = { id: command.input.id, removed: true };
          break;
        }
        case "sampleDrops":
          value = this.system.sampleDrops(command.input.x, command.input.y, command.input.z, command.input.id);
          break;
        case "sample":
          value = this.system.sample(command.input.x, command.input.z, command.input.id);
          break;
        case "verify": {
          value = this.describe(command.input.id);
          if (
            command.input.expectedRevision !== undefined &&
            command.input.expectedRevision !== this.find(command.input.id).revision
          )
            throw new Error("CONFLICT: Published body revision does not match expectedRevision.");
          break;
        }
      }
      // Detach values and reject accidental Engine objects at this serializable boundary.
      return { ok: true, revision: this.system.revision, value: JSON.parse(stringifyWaterData(value)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const prefix = message.split(":", 1)[0] as WaterErrorCode;
      const codes: WaterErrorCode[] = [
        "INVALID_ARGUMENT",
        "TERRAIN_CHANGE_REQUIRED",
        "RESOURCE_LIMIT",
        "NOT_FOUND",
        "MISSING_DEPENDENCY",
        "NOT_SUPPORTED",
        "CONFLICT",
        "CANCELLED",
        "DESTROYED"
      ];
      const code: WaterErrorCode =
        signal?.aborted || (error instanceof DOMException && error.name === "AbortError")
          ? "CANCELLED"
          : codes.includes(prefix)
            ? prefix
            : error instanceof TypeError || error instanceof RangeError
              ? "INVALID_ARGUMENT"
              : "EXECUTION_FAILED";
      return { ok: false, revision: this.system.revision, error: { code, message } };
    }
  }

  private find(id: string): WaterBodyComponent {
    if (typeof id !== "string" || !id) throw new Error("INVALID_ARGUMENT: Water ID must be a nonempty string.");
    const body = this.system.bodies.find((body) => body.waterId === id);
    if (!body) throw new Error("NOT_FOUND: Water body does not exist in this Scene.");
    return body;
  }
  private describe(id: string) {
    const body = this.find(id),
      config = body.configuration!;
    return {
      ...this.describeMetadata(body),
      definition: { asset: config.asset.data, look: config.look.data, quality: config.quality.data }
    };
  }
  private describeMetadata(body: WaterBodyComponent) {
    const config = body.configuration!;
    return {
      ...this.system.inspect(body.waterId),
      name: body.entity.name,
      bodyRevision: body.revision,
      terrain: { authority: "host", modifiedByWater: false },
      resources: {
        asset: config.asset.contentHash,
        look: config.look.contentHash,
        quality: config.quality.contentHash
      }
    };
  }
  private keys(input: object, allowed: string[]): void {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("INVALID_ARGUMENT: Configuration must be an object.");
    const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`NOT_SUPPORTED: Unsupported fields: ${unknown.join(", ")}.`);
  }
  private configuration(
    definition: Partial<WaterDefinition>,
    settings: WaterInstanceSettings | undefined,
    current: WaterBodyConfiguration | undefined,
    allocated: Array<WaterBodyResource | WaterLookResource | WaterQualityResource>
  ): WaterBodyConfiguration {
    if (!definition) throw new Error("MISSING_DEPENDENCY: Full Water definition is required.");
    definition = parseWaterData(stringifyWaterData(definition)) as Partial<WaterDefinition>;
    if (settings) this.keys(settings, ["visible", "priority", "interaction", "representationState"]);
    const own = <T extends WaterBodyResource | WaterLookResource | WaterQualityResource>(resource: T): T => {
      allocated.push(resource);
      return resource;
    };
    const asset = definition.asset ? own(new WaterBodyResource(this.system.engine, definition.asset)) : current?.asset;
    const look = definition.look ? own(new WaterLookResource(this.system.engine, definition.look)) : current?.look;
    const quality = definition.quality
      ? own(new WaterQualityResource(this.system.engine, definition.quality))
      : current?.quality;
    if (!asset || !look || !quality) throw new Error("MISSING_DEPENDENCY: Body, Look and Quality are required.");
    return { ...current, ...settings, asset, look, quality };
  }
}
