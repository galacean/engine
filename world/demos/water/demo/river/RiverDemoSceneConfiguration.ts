import type { RiverDemoScenario } from "./RiverDemoSceneSource.ts";
import { RIVER_HIGH_LOOK_ID } from "@galacean/engine-water/water/presets/river/index";
import { RIVER_VALLEY_CAMERAS, RIVER_VALLEY_LOOK_ID } from "./RiverValleyScene.ts";
export type RiverDemoCameraView =
  | "overview"
  | "detail"
  | "grazing"
  | "bridge"
  | "top"
  | "low2"
  | "low5"
  | "low15"
  | "upstream"
  | "cascade"
  | "downstream";
export interface RiverDemoCameraPose {
  position: readonly number[];
  target: readonly number[];
  fov: number;
}
const legacyCameras: Record<string, RiverDemoCameraPose> = {
  overview: { position: [26, 24, 65], target: [0, 0, -28], fov: 45 },
  detail: { position: [9, 7, 13], target: [0, 0, 0], fov: 45 },
  bridge: { position: [0, 4, 13], target: [0, 0.3, -9], fov: 45 },
  top: { position: [0, 65, 0.01], target: [0, 0.5, 0], fov: 45 },
  grazing: { position: [1, 1.35, 20], target: [0, 0.25, -6], fov: 45 },
  ...Object.fromEntries(
    [2, 5, 15].map((angle) => [
      `low${angle}`,
      { position: [0, 0.5 + 30 * Math.tan((angle * Math.PI) / 180), 22], target: [0, 0.5, -8], fov: 45 }
    ])
  )
};
const descriptions: Record<RiverDemoScenario, string> = {
  valley: "风格化河谷 · 改编自 Stylized Water 2 的原始河谷、岩壁与棕榈布局。切换编辑场景可调整河流与河槽。",
  editing: "河流编辑与河槽 · 编辑控制点、宽度和流速，显式应用河槽修改，并联合撤销水体与地形。",
  calibration: "光学标定河槽 · 0.25／1／3 米水深，用固定床面与标记观察透射和散射。",
  bend: "弯道与宽度过渡 · 观察约 200 米河流中的水流方向、宽度变化与分块连续性。",
  pools: "浅滩与深池 · 对比浅水河床、深水颜色和岸边折射。",
  bridge: "桥岸与反射遮挡 · 观察桥影、前景保护、岩石接触泡沫和屏幕空间反射。"
};
/** Scene-specific presentation stays out of Water authoring and the publication loop. */
export function riverDemoSceneConfiguration(scenario: RiverDemoScenario) {
  const valley = scenario === "valley";
  return {
    lookId: valley ? RIVER_VALLEY_LOOK_ID : RIVER_HIGH_LOOK_ID,
    fixedLayout: valley,
    description: descriptions[scenario],
    initialView: (scenario === "calibration"
      ? "top"
      : scenario === "bridge"
        ? "bridge"
        : "overview") as RiverDemoCameraView,
    probe: valley ? [-28, -71] : [0, 0],
    camera(view: RiverDemoCameraView): RiverDemoCameraPose {
      const cameras: Record<string, RiverDemoCameraPose> = valley ? RIVER_VALLEY_CAMERAS : legacyCameras;
      return cameras[view] ?? cameras.overview;
    }
  };
}
