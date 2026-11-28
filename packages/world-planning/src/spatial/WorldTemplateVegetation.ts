import type { SeedWorldAssetCandidate } from "../agent-adapter/SeedWorldAssetManager";
import type { VegetationColorSample } from "./VegetationColors";
import type { WorldTemplateArtDirection } from "./WorldTemplateArtDirection";
import type { ResolvedTemplateNode } from "./WorldTemplateView";

export type TemplateProceduralPlantKind =
  | "dead-wood"
  | "dry-grass"
  | "plume-grass"
  | "desert-shrub"
  | "pastel-flower"
  | "meadow-flower";

export interface TemplateProceduralPlantInstance {
  readonly id: string;
  readonly kind: TemplateProceduralPlantKind;
  readonly x: number;
  readonly z: number;
  readonly heightM: number;
  readonly yawDegrees?: number;
  readonly variant?: number;
  /** Follow the displayed rock ledge rather than the underlying terrain. */
  readonly onRock?: boolean;
  readonly tiltXDegrees?: number;
  readonly tiltZDegrees?: number;
  readonly spreadScale?: number;
}

export function templateProceduralPlants(art: WorldTemplateArtDirection, seed: number) {
  return art.resolveProceduralPlants?.(seed) ?? art.proceduralPlants ?? [];
}

export interface TemplatePlantPlacement {
  entry: TemplateProceduralPlantInstance;
  localX: number;
  localY: number;
  localZ: number;
  height: number;
  spread: number;
  reach: number;
  sample?: VegetationColorSample & { position: [number, number, number] };
}

/** Convert the template's screen-right X axis and ground each stable placement once for rendering and authoring. */
export function placeTemplatePlants(
  entries: readonly TemplateProceduralPlantInstance[],
  anchor: { x: number; y: number; z: number },
  ground: (x: number, z: number) => number | undefined,
  rockGround?: (x: number, z: number, floor: number) => number
): TemplatePlantPlacement[] {
  const plants: TemplatePlantPlacement[] = [];
  for (const entry of entries) {
    const x = anchor.x - entry.x,
      z = anchor.z + entry.z;
    const floor = ground(x, z);
    if (floor === undefined || !Number.isFinite(floor)) continue;
    const y = entry.onRock && rockGround ? rockGround(x, z, floor) : floor;
    if (!Number.isFinite(y)) continue;
    const flower = entry.kind === "pastel-flower" || entry.kind === "meadow-flower";
    const kind = flower
      ? "flower"
      : entry.kind === "desert-shrub"
        ? "shrub"
        : entry.kind === "dead-wood"
          ? "tree"
          : undefined;
    const height = flower ? entry.heightM * 0.78 : entry.heightM;
    const spread = flower ? 1 + ((entry.spreadScale ?? 1) - 1) * 0.55 : (entry.spreadScale ?? 1);
    const reach = entry.kind === "dead-wood" ? height * 0.9 : height * 2.4 * spread;
    plants.push({
      entry,
      localX: -entry.x,
      localY: y - anchor.y,
      localZ: entry.z,
      height,
      spread,
      reach,
      sample: kind && { id: entry.id, assetId: entry.kind, kind, position: [x, y, z] }
    });
  }
  return plants;
}

export function templateVegetationAssets(
  nodes: readonly ResolvedTemplateNode[],
  plants: readonly TemplatePlantPlacement[]
): SeedWorldAssetCandidate[] {
  const assets: SeedWorldAssetCandidate[] = [];
  for (const { node, position, bounds } of nodes) {
    if (node.vegetation)
      assets.push({
        ref: { domain: "vegetation", kind: node.vegetation.kind, source: "natural", id: node.id },
        position,
        bounds: { minimum: bounds.min, maximum: bounds.max },
        properties: { assetKind: node.vegetation.kind, species: node.vegetation.assetId }
      });
  }
  for (const { sample, reach, height } of plants) {
    if (!sample) continue;
    const { id, assetId, kind, position } = sample;
    const assetKind = kind === "flower" ? "flower-field" : kind;
    const [x, y, z] = position;
    assets.push({
      ref: { domain: "vegetation", kind: assetKind, source: "natural", id },
      position,
      bounds: { minimum: [x - reach, y, z - reach], maximum: [x + reach, y + height, z + reach] },
      properties: { assetKind, species: assetId, ...(kind === "flower" && { distribution: "clump" }) }
    });
  }
  return assets;
}
