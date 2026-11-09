export { parseDecorationSpecs as parseConstructionDecorations } from "./DecorationParameters";
import type { DecorationWindowCut } from "./DecorationWindowCutBuffer.ts";
import { type DecorationRoofOpening } from "./ConstructionRoofDecorations.ts";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionWipHole } from "./WallConnectionTypes.ts";
import {
  type DecorationIntent,
  type DecorationHost,
  type ConstructionDecorationIssue
} from "./ConstructionDecorationCatalog.ts";
import { type ConstructionDecorationFrame } from "./ConstructionDecorationFrames.ts";
import type { DecorationStoneInstance } from "./DecorationStoneInstance.ts";
import type { ConstructionWoodArchPillar, ConstructionWoodArchPart } from "./ConstructionWoodArchRender.ts";
import type { WoodArchOpening } from "./RecoveredWoodArchCutouts.ts";
import type { WallInstance } from "./WallTypes.ts";

/** Stable wall attachment, independent of render slots and material instances.
 * u is normalized wall arclength; bottom is metres above the published wall base.
 * Original assets/blueprint separation follows retained decorator loaders and
 * transform cache. This placement policy is the host adapter, not native replay.
 */
export interface ConstructionDecorationSpec {
  /** Stable material variation namespace when attachment identity changes. */
  variationKey?: string;
  id: string;
  kind: DecorationIntent;
  /** Omitted type requests the host default. Explicit choices never fall back. */
  type?: string;
  host?: DecorationHost;
  /** Required on walls. Roof attachments instead use uv. */
  u?: number;
  uv?: [number, number];
  rank?: 1 | 2 | 3;
  /** Wall geometry variation, independent of Scene identity. Generated specs may
   * omit it until their initial owner/local-ID variation is accepted. */
  seed?: number;
  woodColor?: number;
  /** Omitted/wood preserves timber. wall uses the host-owned native frame material. */
  frameMaterial?: "wood" | "wall";
  bottom: number;
  width: number;
  height: number;
  enabled?: boolean;
  lightIntensity?: number;
  /** Original lantern palette, 0..4. Independent of timber color. */
  lightColor?: number;
}
/** Transient producer input; authoring keeps omitted defaults omitted. */
export type ResolvedConstructionDecorationSpec = ConstructionDecorationSpec &
  Required<Pick<ConstructionDecorationSpec, "type" | "host" | "rank">>;

/** Appearance coordinates are original model UVs, never wall editing coordinates.
 * kinds use ConstructionDecorationMaterial; colors belong to that material.
 * centers are unwarped scene-space window origins for native interior parallax. */
export interface ConstructionDecorationAppearance {
  materialUVs: number[][];
  kinds: number[];
  colorIds: number[];
  centers: number[];
}
export interface ConstructionDecorationPart {
  /** Native source unit whose material owns this part. */
  assetUnit?: string;
  /** Editable attachment identity, independent of its material parts and draw owner. */
  decorationId?: string;
  tintRole?: import("./MasonryAppearance").MasonryTintRole;
  /** Original glass mesh contains opaque lattice vertices as well as panes. */
  tintMask?: boolean[];
  id: string;
  ownerId: string;
  kind: string;
  positions: number[];
  normals: number[];
  colors: number[];
  emission: number[];
  indices: number[];
  uvs?: number[][];
  appearance?: ConstructionDecorationAppearance;
  /** Native scene emitter, distinct from the scaled shader filament. */
  lightPosition?: [number, number, number];
}
export interface CompiledConstructionDecorations {
  /** Ground-open structural openings publish one lower boundary for all consumers. */
  wallProfile?: PublishedWallProfile;
  archInstances?: (WallInstance & { decorationId: string })[];
  archOpenings?: WoodArchOpening[];
  woodArchFrames?: ConstructionWoodArchPart[];
  woodArchPillars?: ConstructionWoodArchPillar[];
  roofUnits: import("./ConstructionSettledRoof").SettledRoofUnit[];
  holes: WallConnectionWipHole[];
  /** Stable attachment identity plus its producer-owned SDF pose. These are
   * geometry intents; the selected material determines whether to consume them. */
  windowCuts: { id: string; cut: DecorationWindowCut }[];
  roofOpenings: DecorationRoofOpening[];
  parts: ConstructionDecorationPart[];
  stones: ConstructionDecorationStone[];
  frames: ConstructionDecorationFrame[];
  diagnostics: ConstructionDecorationIssue[];
  resolved: { id: string; type: string; host: DecorationHost; rank: number; frameMaterial?: "wood" | "wall" }[];
}
export interface ConstructionDecorationStone {
  id: string;
  decorationId: string;
  ownerId: string;
  template: string;
  instance: DecorationStoneInstance;
  geometryScale?: readonly [number, number, number];
}
/** Resolve omitted variant/type defaults into the accepted decoration config.
 * Purpose is part of the component contract, so a roof "window" without a type
 * on a flat roof is stored as a hatch rather than remaining an ambiguous wish. */
export {
  normalizeDecorationPlan as normalizeConstructionDecorations,
  planFacadeDecorations as defaultConstructionDecorations
} from "./DecorationPlan";
