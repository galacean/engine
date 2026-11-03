import type { ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";

/** Shared diagnostic codes from placement producers to public API receipts. */
export const constructionDecorationIssueCodes = [
  "UNSUPPORTED_ATTACHMENT",
  "UNIMPLEMENTED_TYPE",
  "INSUFFICIENT_SPACE",
  "HOST_REMOVED",
  "CROSSES_CORNER",
  "OVERLAP",
  "CLIPPING_CAPACITY"
] as const;
export type ConstructionDecorationIssueCode = (typeof constructionDecorationIssueCodes)[number];
/** Failed comparisons measured by the placement producer, not suggestions or
 * invented limits. World Y is an absolute height; roof axes are host-local.
 * Squared-radius comparisons retain the exact native boundary arithmetic. */
export const decorationConstraintMetrics = [
  "wall_attachment_span",
  "roof_attachment_span",
  "wall_top_world_y",
  "roof_footprint_abs_x",
  "roof_footprint_abs_z",
  "roof_footprint_radius_squared",
  "roof_center_abs_x",
  "roof_center_abs_z",
  "roof_center_radius"
] as const;
export interface DecorationPlacementConstraint {
  metric: (typeof decorationConstraintMetrics)[number];
  /** null preserves an unrepresentable numerical result rather than inventing a bound. */
  measured: number | null;
  limit: number | null;
  relation: "<=" | "<";
  unit: "m" | "m2";
}
export type MeasuredDecorationConstraint = Omit<DecorationPlacementConstraint, "measured" | "limit"> & {
  measured: number;
  limit: number;
};
/** Normalize only diagnostic transport, after the unchanged geometric test. */
export function decorationConstraintFact(value: MeasuredDecorationConstraint): DecorationPlacementConstraint {
  return {
    ...value,
    measured: Number.isFinite(value.measured) ? value.measured : null,
    limit: Number.isFinite(value.limit) ? value.limit : null
  };
}
export interface ConstructionDecorationIssue {
  id: string;
  reason: string;
  code: ConstructionDecorationIssueCode;
  relatedIds?: string[];
  constraints?: DecorationPlacementConstraint[];
}
/** Public decoration facts. No meshes or GPU resources are loaded by discovery. */
export type DecorationHost = "wall" | "roof";
export type DecorationRank = 1 | 2 | 3;
export interface DecorationTypeInfo {
  id: string;
  label: string;
  description: string;
  purpose: "window" | "door" | "opening" | "hatch" | "light";
  hosts: readonly DecorationHost[];
  ranks: readonly DecorationRank[];
  defaultRank: DecorationRank;
  implemented: boolean;
  frameMaterials: readonly ("wood" | "wall")[];
  /** Suggested original installation sizes in metres; not enforced limits. */
  dimensions: readonly { rank: number; width: number; height: number; depth: number }[];
}
const type = (
  id: string,
  label: string,
  description: string,
  purpose: DecorationTypeInfo["purpose"],
  hosts: readonly DecorationHost[],
  ranks: readonly [DecorationRank, ...DecorationRank[]],
  implemented = false
): Omit<DecorationTypeInfo, "dimensions"> =>
  Object.freeze({
    id,
    frameMaterials: Object.freeze<readonly ("wood" | "wall")[]>(
      purpose !== "window"
        ? []
        : [
              "window-gothic",
              "window-arrow-slit",
              "dormer-gothic-half",
              "dormer-arrow-slit-half",
              "dormer-gothic"
            ].includes(id)
          ? ["wood", "wall"]
          : ["wood"]
    ),
    label,
    description,
    purpose,
    hosts: Object.freeze(hosts),
    ranks: Object.freeze(ranks),
    defaultRank: ranks[0],
    implemented
  });
const constructionDecorationDefinitions: readonly Omit<DecorationTypeInfo, "dimensions">[] = Object.freeze([
  type(
    "window-cottage",
    "木框菱格窗",
    "木框与菱格玻璃；rank 表示原始单、双、三联规格，不是合并操作。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "window-gothic",
    "尖拱窗",
    "尖拱窗框、玻璃及沿墙弯曲的石帽，适合高挑的墙面开口；窗框默认木材，可用 frameMaterial:wall 使用宿主墙体石材色，木墙上也保留石框；woodColor 在木材模式生效并保留。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "window-arrow-slit",
    "狭长箭孔",
    "带玻璃的箭孔；rank 1 为短孔，2 为竖长孔，3 为十字孔，并非窗户合并数量。窗框默认 wood；wall 使用宿主石材色，木墙上也保留石框，这是原始箭孔材质分支。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "window-cottage-corner",
    "转角木框窗",
    "跨矩形墙角的整体木框和玻璃，带两侧窗楣；u 必须指向墙角，不能放在普通墙面或圆墙。width/height 指主窗框尺寸，窗楣净空另行检查。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "dormer-cottage",
    "木框屋顶窗",
    "坡屋顶上的独立木框窗体；rank 1/2/3 沿屋顶截面排列单、双、三联窗。width 是展开的窗框总宽，height 是窗框高度，小屋顶和收边占地需另行校验。",
    "window",
    ["roof"],
    [1, 2, 3],
    true
  ),
  type(
    "dormer-cottage-half",
    "檐口木框窗",
    "安装在墙面、越过檐口的半屋顶窗；需要坡屋顶和足够檐口净空，不能放在山墙端。width/height 为整套窗框的尺寸；rank2 可按稳定种子生成同色百叶窗。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "dormer-gothic-half",
    "檐口尖拱窗",
    "墙面尖拱窗延伸至坡屋顶檐口，使用沿墙弯曲的石帽；需要坡屋顶、跨过檐口且不能位于山墙端。width/height 包含石帽尺寸。frameMaterial 默认 wood，wall 使用宿主墙体石材色，木墙上也保留石框。",
    "window",
    ["wall"],
    [1, 2, 3],
    true
  ),
  type(
    "dormer-arrow-slit-half",
    "檐口箭孔",
    "位于坡屋顶檐口的箭孔；rank 2 为竖长孔，3 为十字孔。原始生成器不生成 rank 1 的檐口短孔。frameMaterial 默认 wood，wall 采用宿主石材色，木墙上也保留石框；石帽独立适配木墙。",
    "window",
    ["wall"],
    [2, 3],
    true
  ),
  type(
    "dormer-gothic",
    "尖拱屋顶窗",
    "坡屋顶上的尖拱窗与独立小屋顶；rank 1/2/3 为原始不同规格。安装需要避开山墙端和屋面转角，并为窗体及小屋脊保留主屋顶净空。width/height 为原始窗体尺寸，小屋顶占地另行检查。显式调整尺寸时窗体、洞口和小屋顶同步调整。frameMaterial 默认 wood，wall 使用宿主石材色，木墙上也保留石框。",
    "window",
    ["roof"],
    [1, 2, 3],
    true
  ),
  type("door-cottage", "木板门", "带木纹门板与边框，rank 表示原始规格。", "door", ["wall"], [1, 2, 3], true),
  type("door-gothic", "尖拱门", "尖拱轮廓的门板与收边。", "door", ["wall"], [1, 2, 3], true),
  type(
    "opening-arch",
    "拱形洞口",
    "接地洞口，不装门板。石墙使用拱砖与石柱，木墙使用水平木梁、弯曲撑件与木柱。bottom 必须为 0；width 为两端柱轴之间的沿墙跨度，height 为墙中心地面至目标拱顶或横梁的高度。柱体和顶部构件另外占位；底部随地形适配。需避开墙角、连接缺口和其他装饰，并为顶部构件留出净空。",
    "opening",
    ["wall"],
    [1],
    true
  ),
  type("hatch-cottage", "木制屋顶活板门", "平屋顶的盖板或出入口；不等同于透明采光天窗。", "hatch", ["roof"], [1], true),
  type(
    "hatch-gothic",
    "尖拱风格屋顶盖板",
    "平屋顶盖板的另一种原始款式；不等同于透明采光天窗。",
    "hatch",
    ["roof"],
    [1],
    true
  ),
  type("roof-lantern", "平屋顶灯笼", "平屋顶专用灯体与安装支架，区别于壁挂款式。", "light", ["roof"], [1], true),
  type("wall-lantern", "壁挂灯笼", "壁挂金属灯体与发光内芯；支持灯色与亮度。", "light", ["wall"], [1], true)
]);
export function constructionDecorationDefinition(id: string) {
  return constructionDecorationDefinitions.find((type) => type.id === id);
}
/** Suggested dimensions come from this project's current mesh vertices. */
export function constructionDecorationType(
  assets: ConstructionDecorationMeshes | undefined,
  id: string
): DecorationTypeInfo | undefined {
  const definition = constructionDecorationDefinition(id);
  if (!definition) return undefined;
  return {
    ...definition,
    dimensions: definition.ranks.flatMap((rank) => {
      const recipe = constructionDecorationRecipe(assets, id, rank);
      if (!recipe) return [];
      const [width, height, depth] = recipe.installationSize;
      return [{ rank, width, height, depth }];
    })
  };
}
export function constructionDecorationTypes(assets: ConstructionDecorationMeshes | undefined): DecorationTypeInfo[] {
  return constructionDecorationDefinitions.map((definition) => constructionDecorationType(assets, definition.id)!);
}

export type DecorationIntent = "door" | "window" | "wall-lamp" | "lantern" | "opening" | "hatch";
export interface DecorationDefault {
  kind: DecorationIntent;
  host: DecorationHost;
  roof?: "flat" | "pitched";
  type: string;
}
/** One source for runtime resolution and discoverable API/Knowledge defaults.
 * A missing combination is unsupported, never an implicit change of purpose. */
export const constructionDecorationDefaults: readonly DecorationDefault[] = Object.freeze(
  [
    { kind: "window", host: "wall", type: "window-cottage" },
    { kind: "window", host: "roof", roof: "flat", type: "hatch-cottage" },
    { kind: "window", host: "roof", roof: "pitched", type: "dormer-cottage" },
    { kind: "door", host: "wall", type: "door-cottage" },
    { kind: "opening", host: "wall", type: "opening-arch" },
    { kind: "hatch", host: "roof", roof: "flat", type: "hatch-cottage" },
    { kind: "wall-lamp", host: "wall", type: "wall-lantern" },
    { kind: "lantern", host: "wall", type: "wall-lantern" },
    { kind: "wall-lamp", host: "roof", roof: "flat", type: "roof-lantern" },
    { kind: "lantern", host: "roof", roof: "flat", type: "roof-lantern" }
  ].map((value) => Object.freeze(value as DecorationDefault))
);
export function resolveConstructionDecorationType(
  request: { kind: DecorationIntent; type?: string; host?: DecorationHost },
  flatRoof: boolean
): string | undefined {
  if (request.type !== undefined) return request.type;
  return constructionDecorationDefaults.find(
    (value) =>
      value.kind === request.kind &&
      value.host === (request.host ?? "wall") &&
      (value.roof === undefined || value.roof === (flatRoof ? "flat" : "pitched"))
  )?.type;
}
