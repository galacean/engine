import type { IslandPlan } from "./IslandPlanModel";

/** Semantic controls for world-scale generation, expressed in metres or dimensionless tendencies. */
export interface WorldLayoutParameters {
  landformStudy?: number;
  canyonStudy?: number;
  globalElevation?: number;
  elevationAngle?: number;
  draftLayout?: number;
  landAspect?: number;
  landOrientation?: number;
  crossingDetourRatio?: number;
  offshoreCoverage?: number;
  complexity: number;
  contourDetail: number;
  seed: number;
  landSize: number;
  stretch: number;
  coast: number;
  openness: number;
  islands: number;
  rivers: number;
  branches: number;
  riverWidth: number;
  riverBend: number;
  lakeSize: number;
  mountains: number;
  mountainWidth: number;
  mountainHeight: number;
  villages: number;
  villageSize: number;
  buildings: number;
  roadWidth: number;
  roadWidthVariation?: number;
  roadContourDetail?: number;
  loopiness: number;
  climb: number;
  visibility: number;
}
/** Neutral starting world; random streams are keyed by module and object identity. */
export const WORLD_LAYOUT_DEFAULTS: WorldLayoutParameters = {
  complexity: 8,
  contourDetail: 0,
  seed: 1729,
  landSize: 0.85,
  stretch: 1,
  coast: 0.65,
  openness: 0.45,
  islands: 2,
  rivers: 1,
  branches: 2,
  riverWidth: 40,
  riverBend: 0.65,
  lakeSize: 110,
  mountains: 6,
  mountainWidth: 160,
  mountainHeight: 170,
  villages: 3,
  villageSize: 110,
  buildings: 6,
  roadWidth: 8,
  roadWidthVariation: 0.5,
  roadContourDetail: 0.5,
  loopiness: 0.45,
  climb: 0.5,
  visibility: 0.6
};
/** UI description of a semantic control; internal tessellation parameters remain private. */
export interface WorldLayoutControl {
  key: Exclude<
    keyof WorldLayoutParameters,
    | "landformStudy"
    | "canyonStudy"
    | "globalElevation"
    | "elevationAngle"
    | "draftLayout"
    | "seed"
    | "landAspect"
    | "landOrientation"
    | "crossingDetourRatio"
    | "contourDetail"
    | "offshoreCoverage"
    | "roadWidthVariation"
    | "roadContourDetail"
  >;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}
/** Module controls with substantial geometric and topological variation. */
export const WORLD_LAYOUT_CONTROLS: WorldLayoutControl[] = [
  { key: "complexity", label: "形状复杂度", group: "全局与岛岸", min: 5, max: 16, step: 1, unit: "组件" },
  { key: "landSize", label: "陆地规模", group: "全局与岛岸", min: 0.4, max: 1, step: 0.01, unit: "" },
  { key: "stretch", label: "陆地伸展", group: "全局与岛岸", min: 0.6, max: 1.5, step: 0.02, unit: "" },
  { key: "coast", label: "岸线变化", group: "全局与岛岸", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "openness", label: "空间开阔度", group: "全局与岛岸", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "islands", label: "离岸岛数量", group: "全局与岛岸", min: 0, max: 5, step: 1, unit: "座" },
  { key: "rivers", label: "主河数量", group: "水系", min: 1, max: 3, step: 1, unit: "条" },
  { key: "branches", label: "每河支流数量", group: "水系", min: 0, max: 5, step: 1, unit: "条" },
  { key: "riverWidth", label: "河流宽度", group: "水系", min: 8, max: 130, step: 2, unit: "米" },
  { key: "riverBend", label: "河流曲折度", group: "水系", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "lakeSize", label: "湖区尺度", group: "水系", min: 40, max: 240, step: 10, unit: "米" },
  { key: "mountains", label: "山群数量", group: "地貌", min: 2, max: 12, step: 1, unit: "组" },
  { key: "mountainWidth", label: "山群厚度", group: "地貌", min: 60, max: 260, step: 10, unit: "米" },
  { key: "mountainHeight", label: "山群高度", group: "地貌", min: 30, max: 400, step: 10, unit: "米" },
  { key: "villages", label: "村落数量", group: "场所", min: 0, max: 6, step: 1, unit: "处" },
  { key: "villageSize", label: "村落尺度", group: "场所", min: 70, max: 200, step: 10, unit: "米" },
  { key: "buildings", label: "每村建筑数量", group: "场所", min: 2, max: 16, step: 1, unit: "栋" },
  { key: "roadWidth", label: "通路宽度", group: "通行与观察", min: 3, max: 18, step: 1, unit: "米" },
  { key: "loopiness", label: "环路倾向", group: "通行与观察", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "climb", label: "登高倾向", group: "通行与观察", min: 0, max: 1, step: 0.1, unit: "" },
  { key: "visibility", label: "视线展示", group: "通行与观察", min: 0, max: 1, step: 0.1, unit: "" }
];
/** Local overrides are keyed by persistent semantic object ID, not generated rectangle index. */
export type WorldObjectEdits = Record<string, import("./WorldPlanningContract").SemanticEdit>;
/** Snapshot plus explicit local resolution notes; requested parameters are retained. */
export interface WorldLayoutResult {
  plan: IslandPlan;
  notes: string[];
  parameters: WorldLayoutParameters;
}
