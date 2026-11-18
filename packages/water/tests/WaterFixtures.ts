import type { WaterShapeAuthoring } from "../src/water/native/WaterAuthoring";

export const lake: WaterShapeAuthoring & { kind: "lake" } = {
  kind: "lake",
  referenceLevel: 0.5,
  levelOffsetM: 0,
  shoreline: [
    [1, 1],
    [7, 1],
    [7, 7],
    [1, 7]
  ].map(([x, z], index) => ({ id: `p${index}`, ring: "shore", x, z }))
};
export const terrain = {
  id: "manual-bed",
  revision: 1,
  origin: [0, 0] as const,
  spacing: 1,
  columns: 9,
  rows: 9,
  heights: Array(81).fill(-1) as number[]
};
export const ledgeTerrain = {
  id: "accepted-ledge",
  revision: 1,
  origin: [0, 0] as const,
  spacing: 0.25,
  columns: 33,
  rows: 33,
  heights: Array.from({ length: 33 * 33 }, (_, index) => (index % 33 <= 16 ? 0 : -2))
};
