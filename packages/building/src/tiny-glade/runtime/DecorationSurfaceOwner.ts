import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import type { ConstructionWallEnvelope } from "./ConstructionWallEnvelope";

/** Resolved installation context. Geometry and palette are published by the
 * host parts; attachments do not reconstruct a house or generate its roof. */
export interface DecorationSurfaceOwner {
  id: string;
  variationKey?: string;
  seed: number;
  wallMaterial: number;
  woodColor: number;
  roof: { surface: RoofSurface; footprint: RoofFootprint };
  wallEnvelope: ConstructionWallEnvelope;
}
