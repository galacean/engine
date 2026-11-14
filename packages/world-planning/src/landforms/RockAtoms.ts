import type { V2Box, V2ColumnRole } from "../spatial/V2Model.ts";
/** Shared V2 responsibilities plus a single-box fill volume. */
export type AtomKind = V2ColumnRole | "mass" | "crown" | "spire";
/** Normalized component: local centre X/Z, bottom, width, depth and height. */
type Part = readonly [number, number, number, number, number, number];
/** Shape catalog entry. Width/depth ratios and metre height scaling stay independent. */
export interface AtomDefinition {
  label: string;
  widthFactor: number;
  depthPerWidth: number;
  heightFactor: number;
  parts: readonly Part[];
}
/** Shared atomic shape recipes; all landforms resolve instances through this catalog.
 * Local X is width/profile progression; local Z is depth. Boxes are coarse structure,
 * not a promise that a single asset has the same filled occupancy.
 */
export const ROCK_ATOMS: Record<AtomKind, AtomDefinition> = {
  crown: {
    label: "冠峰",
    widthFactor: 1.2,
    depthPerWidth: 0.9,
    heightFactor: 1,
    parts: [
      [0, 0, 0, 1, 1, 0.25],
      [0, 0, 0.25, 0.8, 0.8, 0.35],
      [0, 0, 0.6, 0.5, 0.5, 0.4]
    ]
  },
  spire: {
    label: "尖塔",
    widthFactor: 0.8,
    depthPerWidth: 0.8,
    heightFactor: 1.8,
    parts: [
      [0, 0, 0, 1, 1, 0.25],
      [0, 0, 0.25, 0.65, 0.65, 0.3],
      [0, 0, 0.55, 0.35, 0.35, 0.25],
      [0, 0, 0.8, 0.1, 0.1, 0.2]
    ]
  },
  "crown/spire": {
    label: "冠峰／尖塔",
    widthFactor: 1,
    depthPerWidth: 0.8,
    heightFactor: 1.7,
    parts: [
      [0, 0, 0, 1, 1, 0.24],
      [-0.07, 0, 0.24, 0.73, 0.74, 0.29],
      [-0.12, 0.04, 0.53, 0.43, 0.46, 0.27],
      [-0.14, 0.06, 0.8, 0.18, 0.22, 0.2]
    ]
  },
  wall: {
    label: "岩壁",
    widthFactor: 1.45,
    depthPerWidth: 0.36,
    heightFactor: 1,
    parts: [
      [0, 0, 0, 1, 1, 0.78],
      [-0.22, 0.08, 0.78, 0.56, 0.84, 0.22],
      [0.28, -0.05, 0.78, 0.44, 0.9, 0.12]
    ]
  },
  "buttress/shoulder": {
    label: "扶壁／山肩",
    widthFactor: 1.55,
    depthPerWidth: 0.85,
    heightFactor: 0.7,
    parts: [
      [0, 0, 0, 1, 1, 0.25],
      [-0.15, 0, 0.25, 0.7, 0.88, 0.28],
      [-0.32, 0.02, 0.53, 0.36, 0.7, 0.47]
    ]
  },
  "terrace/cap": {
    label: "台地／帽岩",
    widthFactor: 1.8,
    depthPerWidth: 0.85,
    heightFactor: 0.72,
    parts: [
      [0, 0, 0, 1, 1, 0.3],
      [0, 0, 0.3, 0.84, 0.84, 0.32],
      [0, 0, 0.62, 0.68, 0.7, 0.38]
    ]
  },
  "saddle/notch": {
    label: "鞍部／缺口",
    widthFactor: 2.1,
    depthPerWidth: 0.65,
    heightFactor: 1.15,
    parts: [
      [0, 0, 0, 1, 1, 0.12],
      [-0.35, 0, 0.12, 0.3, 1, 0.58],
      [0.35, 0, 0.12, 0.3, 1, 0.58],
      [-0.35, 0.03, 0.7, 0.2, 0.76, 0.3],
      [0.35, -0.03, 0.7, 0.2, 0.76, 0.25]
    ]
  },
  skirt: {
    label: "山脚裙边",
    widthFactor: 1.7,
    depthPerWidth: 0.65,
    heightFactor: 0.18,
    parts: [
      [0, 0, 0, 1, 1, 0.3],
      [-0.17, 0, 0.3, 0.66, 0.86, 0.3],
      [-0.34, 0, 0.6, 0.32, 0.68, 0.4]
    ]
  },
  mass: { label: "普通体量", widthFactor: 1.5, depthPerWidth: 0.85, heightFactor: 0.65, parts: [[0, 0, 0, 1, 1, 1]] }
};
/** One dimensioned atom instance; every box and projection derives from these world values. */
export interface RockAtom {
  id: string;
  kind: AtomKind;
  x: number;
  z: number;
  baseY: number;
  yaw: number;
  width: number;
  depth: number;
  height: number;
  boxes: V2Box[];
}
/** Compile a catalog recipe into ordinary V2 metre boxes.
 * @param instance World dimensions and transform, without derived boxes.
 * @param catalog Shared definitions, optionally replaced to adapt a layout.
 * @returns Instance with exact requested outer dimensions and ordinary V2Box components.
 */
export function compileRockAtom(instance: Omit<RockAtom, "boxes">, catalog = ROCK_ATOMS): RockAtom {
  const d = catalog[instance.kind],
    c = Math.cos(instance.yaw),
    s = Math.sin(instance.yaw);
  if ([instance.width, instance.depth, instance.height].some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("Atom dimensions must be positive metres");
  return {
    ...instance,
    boxes: d.parts.map(([x, z, bottom, w, depth, h], i) => ({
      id: `${instance.id}:${i}`,
      label: d.label,
      center: {
        x: instance.x + c * x * instance.width - s * z * instance.depth,
        z: instance.z + s * x * instance.width + c * z * instance.depth
      },
      sizeX: w * instance.width,
      sizeZ: depth * instance.depth,
      sizeY: h * instance.height,
      elevation: instance.baseY + bottom * instance.height,
      yaw: instance.yaw,
      appearance: instance.kind === "terrace/cap" ? "platform" : "rock",
      collision: true,
      occlusion: true
    }))
  };
}
