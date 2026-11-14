import type { GrowthCurve, PlantPoint, PlantUV } from "./curves";
import type { PlantMeshOrgan } from "./PlantMeshOrgan";
export type { GrowthCurve, PlantPoint, PlantUV } from "./curves";

export interface PlantAnchorPose {
  readonly offset: PlantPoint;
  readonly azimuth: number;
}
export interface PlantAnchor {
  readonly id: string;
  /** Offsets and azimuths are relative to this anchor; roots use plant-local coordinates. */
  readonly parent?: string;
  readonly poses: GrowthCurve<PlantAnchorPose>;
}
export interface PlantSurface {
  readonly id: string;
  readonly columns: number;
  readonly rows: number;
  readonly uvs: readonly PlantUV[];
  readonly lengthSample: number;
}
export interface PlantStem {
  readonly id: string;
  readonly path: readonly string[];
  /** A radius per path point at each key; taper is data, not a species constant. */
  readonly radii: GrowthCurve<readonly number[]>;
  readonly sides: number;
  readonly startDirection?: PlantPoint;
  readonly uv: PlantUV;
}
export interface PlantLeaf {
  readonly id: string;
  readonly anchor: string;
  readonly surface: string;
  readonly poses: GrowthCurve<readonly PlantPoint[]>;
  /** Optional birth/expansion/senescence curve. Zero scale keeps the topology stable. */
  readonly scale?: GrowthCurve<number>;
}
export interface PlantVolume {
  readonly id: string;
  readonly kind: "fruit" | "root" | "flower" | "organ";
  readonly anchor: string;
  readonly poses: GrowthCurve<{ readonly offset: PlantPoint; readonly radii: PlantPoint }>;
  readonly scale?: GrowthCurve<number>;
  readonly uv: PlantUV;
  readonly tint: boolean;
  /** Optional measured attachment rule: follow leaf expansion until this reference age. */
  readonly followLeaf?: { readonly id: string; readonly untilAge: number };
}
export interface PlantSupport {
  readonly id: string;
  readonly center: PlantPoint;
  readonly size: PlantPoint;
  readonly uv: PlantUV;
}

/** Compiled content contract. No GLB, engine, UI, crop IDs or fixed number of stages. */
export interface PlantGrowthRecipe {
  readonly revision: number;
  readonly id: string;
  readonly anchors: readonly PlantAnchor[];
  readonly surfaces: readonly PlantSurface[];
  readonly stems: readonly PlantStem[];
  readonly leaves: readonly PlantLeaf[];
  readonly volumes: readonly PlantVolume[];
  /** Optional measured organs for source meshes that cannot be represented by grids or ellipsoids. */
  readonly meshes?: readonly PlantMeshOrgan[];
  readonly supports: readonly PlantSupport[];
  readonly maturity: GrowthCurve<number>;
}

export interface PlantShape {
  readonly leafSpread: number;
  readonly stemBend: number;
  readonly fruitScale: number;
}
export const DEFAULT_PLANT_SHAPE: PlantShape = Object.freeze({ leafSpread: 1, stemBend: 1, fruitScale: 1 });
export const PLANT_SHAPE_LIMITS = Object.freeze({
  leafSpread: [0.5, 1.5],
  stemBend: [0, 2],
  fruitScale: [0.5, 1.5]
} as const);

export function validatePlantShape(shape: PlantShape): void {
  for (const key of Object.keys(PLANT_SHAPE_LIMITS) as (keyof PlantShape)[]) {
    const [min, max] = PLANT_SHAPE_LIMITS[key];
    if (!Number.isFinite(shape[key]) || shape[key] < min || shape[key] > max)
      throw new Error(`株型参数 ${key} 超出范围`);
  }
}
