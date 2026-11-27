import type { PlanningComponentDefinition } from "../PlanningComponents";
/** Shared schema: the study and future editor tools use the same component commands. */
export const RELIEF_COMPONENT: PlanningComponentDefinition = {
  type: "relief",
  label: "区域缓坡",
  version: 1,
  tab: "world",
  fields: [
    ["x", "X 位置", 0, 1024, 512],
    ["z", "Z 位置", 0, 1024, 512],
    ["yawDegrees", "坡向", -360, 360, 0],
    ["lengthM", "延伸长度", 40, 800, 240],
    ["leftWidthM", "左侧过渡", 20, 400, 100],
    ["rightWidthM", "右侧过渡", 20, 400, 140],
    ["heightM", "抬升 / 下压", -30, 40, 10],
    ["bendM", "轴线弯曲", -120, 120, 25]
  ].map(([key, label, min, max, initial]) => ({
    key: String(key),
    label: String(label),
    type: "number" as const,
    min: ["lengthM", "leftWidthM", "rightWidthM"].includes(String(key)) ? 0.001 : undefined,
    step: 0.1,
    default: Number(initial),
    unit: key === "yawDegrees" ? "°" : "m"
  }))
};
