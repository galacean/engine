import type { PlanningComponentDefinition } from "../PlanningComponents";

export interface PlanningFarmingOptions {
  readonly enabled: boolean;
  readonly saveMode: "auto" | "new";
  readonly poiId: string;
  readonly plotCount: number;
  readonly initialContainers: boolean;
}
export const PLANNING_FARMING_DEFAULTS: PlanningFarmingOptions = Object.freeze({
  enabled: true,
  saveMode: "auto",
  poiId: "auto",
  plotCount: 4,
  initialContainers: true
});
/** Authoring belongs to the spatial host. Agricultural dimensions/rules stay in shared Farming. */
export const PLANNING_FARMING_COMPONENT: PlanningComponentDefinition = {
  type: "farming",
  version: 6,
  label: "农场起始区域",
  tab: "world",
  kinds: ["world"],
  description:
    "无存档时在出生点附近的 POI 管理区寻找完整农场，同一距离范围内按坡度选址；不偏好河流，不要求公共道路接入。设施与内部操作通道检查通过才显示起始点；有存档时优先恢复玩家编辑状态。",
  fields: [
    {
      key: "enabled",
      label: "启用农场",
      type: "boolean",
      default: PLANNING_FARMING_DEFAULTS.enabled,
      combine: "override",
      description: "关闭后停止农场选址和运行，保留当前 Seed 的农场存档。"
    },
    {
      key: "saveMode",
      affectsLayout: false,
      label: "存档选择",
      type: "string",
      options: ["auto", "new"],
      optionLabels: { auto: "使用当前 Seed 的存档", new: "不使用存档（按规划生成）" },
      default: "auto",
      combine: "override",
      description: "每个 Seed 保留一份农场存档。默认优先恢复；本次不使用存档时，新农场成功保存后替换当前 Seed 的记录。"
    },
    {
      key: "poiId",
      label: "农场管理 POI",
      type: "string",
      default: "auto",
      combine: "override",
      description:
        "auto 从出生点附近向外搜索主陆地 POI 内的空地；指定稳定 ID 时只在该管理区选址。保留现有地形、体量和道路。"
    },
    {
      key: "plotCount",
      label: "耕地个数",
      type: "number",
      min: 4,
      integer: true,
      default: 4,
      combine: "override",
      description: "起始耕地不少于 4 块，默认 2×2；其他数量按紧凑行列排列，完整占地须通过检查。"
    },
    {
      key: "initialContainers",
      label: "初始容器",
      type: "boolean",
      default: true,
      combine: "override",
      description: "首次创建农场时放置初始推车和篮子；关闭后不预置容器，不删除已有库存。"
    }
  ],
  global: {
    enabled: "farming.enabled",
    saveMode: "farming.saveMode",
    poiId: "farming.poiId",
    plotCount: "farming.plotCount",
    initialContainers: "farming.initialContainers"
  }
};
