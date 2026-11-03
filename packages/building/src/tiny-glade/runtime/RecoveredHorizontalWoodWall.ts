import type { ConstructionWindowCutAsset } from "./ConstructionWindowCutAsset";
import { createBoardWallSpace } from "./RecoveredBoardWallSpace";
import { buildWoodWallSampler } from "./RecoveredWallSampler";
import { initialWoodWallRegions, type WoodWallRegionHost } from "./RecoveredWoodWallRegions";
import { planHorizontalWoodRegions } from "./RecoveredWoodRegions";
import { horizontalWoodCandidates } from "./RecoveredGablePlank";
import {
  buildHorizontalAffineWoodPiece,
  bindHorizontalAffineWoodPiece,
  type HorizontalAffineWoodPiece
} from "./RecoveredWoodInstance";
import {
  finalizeDecorationWindowCuts,
  buildDecorationWindowCutBuffer,
  type DecorationWindowCut
} from "./DecorationWindowCutBuffer";
import { add, mul, type RoofCurve } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler, type RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import type { PlankBounds } from "./RecoveredWoodPlank";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import { isFlatRoofHeight } from "./RoofMode";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";
import { woodArchOpeningBounds, type WoodArchOpening } from "./RecoveredWoodArchCutouts";

export interface HorizontalRectangularWoodSource {
  wallId: bigint;
  colorId: number;
  rectangle: RecoveredCottageRoofSection;
  curve: RoofCurve;
  sourceLength: number;
  contour: readonly (readonly [number, number, number])[];
  tops: readonly number[];
  regionHost: Omit<WoodWallRegionHost, "contourHeights" | "isRegularShape">;
  splitGable: boolean;
  gableSides: readonly [number, number] | null;
  roof: RecoveredCottageRoofSampler | null;
  pitch: number;
  maximumLength: number;
  /** Structural openings already expressed in the board chart. SDF decoration
   * search bounds are a distinct input and must not be subtracted here. */
  boardCutouts: readonly PlankBounds[];
  /** Original ground-open profiles, before board-chart remapping. */
  archOpenings?: readonly WoodArchOpening[];
  windowCuts: readonly DecorationWindowCut[];
  /** Optional host material-size adaptation; not a native author field. */
  unitScale?: UnitFootprintScale;
}

export interface HorizontalWoodBatch {
  kind: "ordinary" | "gable";
  pieces: HorizontalAffineWoodPiece[];
  /** Indices in the original producer order, independent of material/mesh bucket. */
  sourceIndices: Uint32Array;
  instances: Uint8Array;
  cuts: ReturnType<typeof buildDecorationWindowCutBuffer>;
}

/** Adapt the wall owner's current publication, before flat-deck shell trimming.
 * PublicWallState +0x284 is author elevation (Wall112 +0x58), while +0x294
 * is stone_foundation_offset (+0x64). Neither is the host's support lift.
 * The caller chooses those author facts explicitly; derived caps, chart length
 * and gable sides have a single owner here. Inputs are borrowed, never mutated. */
export function horizontalWoodSourceFromPublishedWall(
  input: Omit<
    HorizontalRectangularWoodSource,
    "curve" | "sourceLength" | "contour" | "tops" | "regionHost" | "splitGable" | "gableSides" | "roof"
  > & {
    roof: Pick<RecoveredCottageRoofSampler, "surface" | "footprint"> | null;
    profile: PublishedWallProfile;
    elevation: number;
    stoneFoundationHeight: number;
    isWood: boolean;
  }
): HorizontalRectangularWoodSource {
  const { profile, elevation, stoneFoundationHeight, isWood, ...source } = input;
  if ("radius" in source.rectangle.shape) throw Error("Horizontal rectangular wood source required");
  if (![elevation, stoneFoundationHeight].every((v) => Number.isFinite(Math.fround(v))))
    throw Error("Finite wood elevation and stone foundation height required");
  const flatRoof = !!source.roof && isFlatRoofHeight(source.roof.surface.height_parameter);
  if (profile.gable && (!source.roof || flatRoof)) throw Error("Gable wall publication requires its pitched roof");
  return {
    ...source,
    roof: source.roof && !flatRoof ? new RecoveredCottageRoofSampler(source.roof.surface, source.roof.footprint) : null,
    curve: profile.control,
    sourceLength: profile.control.length,
    contour: profile.points,
    tops: profile.top,
    regionHost: {
      isWood,
      foundationHeight: stoneFoundationHeight,
      floorY: elevation,
      wallBottom: profile.minGround,
      wallTop: profile.topY,
      gableTop: profile.maxYGable,
      flatRoof
    },
    // Horizontal producer passes true to plan_rectangle_wallspace_regions;
    // absence of gable sides makes this inert for flat and hipped roofs.
    splitGable: true,
    gableSides: profile.gable ? (source.roof!.surface.axis === 0 ? [0, 2] : [1, 3]) : null
  };
}

/** Compose the recovered horizontal rectangular producer. Each surviving piece
 * is sampled once; the batch cut builder then supplies tokens and count seeds.
 * Native records and semantic identities remain together through ABI partition. */
export function compileHorizontalRectangularWoodWall(
  asset: ConstructionWindowCutAsset | undefined,
  source: HorizontalRectangularWoodSource
) {
  if ("radius" in source.rectangle.shape) throw Error("Horizontal rectangular wood source required");
  const scale = source.unitScale ?? IDENTITY_UNIT_SCALE;
  const chart = createBoardWallSpace(source.rectangle, source.sourceLength, mul(0.125, scale.depth));
  const sampler = buildWoodWallSampler(source.curve, source.contour, source.tops, chart, true);
  const regionHost: WoodWallRegionHost = {
    ...source.regionHost,
    isRegularShape: true,
    contourHeights: source.contour.map((point) => point[1])
  };
  // Native constructor 0x1010c5418..5444 / 0x1010c82e8..83bc selects
  // flat_roof_y (published max_y - .79), or the sampler's maximum upper
  // channel (empty fallback 1). The .2 extension is applied once at
  // 0x1010c8458..8464 before plan_rectangle_wallspace_regions. Derive this
  // here so edits cannot leave a separately cached region ceiling stale.
  let upper = 1;
  if (regionHost.flatRoof) upper = add(regionHost.wallTop, -0.79);
  else if (sampler.samples.length) {
    upper = sampler.samples[0][4];
    for (let i = 1; i < sampler.samples.length; i++) upper = Math.max(upper, sampler.samples[i][4]);
  }
  const regionTop = add(upper, 0.2);
  const regions = initialWoodWallRegions(regionHost, chart, regionTop, source.splitGable, source.gableSides);
  const archCutouts = woodArchOpeningBounds(
    source.curve,
    source.sourceLength,
    source.regionHost.wallBottom,
    true,
    source.archOpenings ?? []
  ).map((bounds) => chart.remapBounds(bounds));
  const plan = planHorizontalWoodRegions(regions, [...source.boardCutouts, ...archCutouts], source.pitch);
  const rectangle = chart.boardRectangle!;
  const knots = rectangle.cornerParameters();
  const gableRanges = (source.gableSides ?? []).map((side): [number, number] => [
    mul(knots[side], chart.boardLength),
    mul(knots[side + 1], chart.boardLength)
  ]);
  const host = {
    wallId: source.wallId,
    colorId: source.colorId,
    unitScale: scale,
    shape: { kind: "rectangle" as const, rectangle, maxY: source.regionHost.wallTop },
    sampler,
    gableRanges,
    irregularStoneTop: false
  };
  const pieces: HorizontalAffineWoodPiece[] = [];
  for (const candidate of horizontalWoodCandidates(
    plan.boards,
    source.wallId,
    source.maximumLength,
    source.roof,
    { rectangle, length: chart.boardLength },
    sampler
  )) {
    const piece = buildHorizontalAffineWoodPiece(candidate, host, () => 0);
    if (piece) pieces.push(piece);
  }
  const records = finalizeDecorationWindowCuts(asset, source.windowCuts, chart.sourceLength, sampler.closed).map(
    ({ cut, bounds }) => ({ cut, bounds: chart.remapBounds(bounds) })
  );
  const cuts = buildDecorationWindowCutBuffer(
    asset,
    records,
    pieces.map((piece) => piece.cutBounds),
    chart.boardLength
  );
  const bound = pieces.map((piece, i) => bindHorizontalAffineWoodPiece(piece, cuts.lists[i]));
  const batches: HorizontalWoodBatch[] = [];
  for (const kind of ["ordinary", "gable"] as const) {
    const indices: number[] = [];
    bound.forEach((piece, i) => {
      if (piece.kind === kind) indices.push(i);
    });
    if (!indices.length) continue;
    const selected = indices.map((i) => bound[i]);
    const stride = kind === "gable" ? 96 : 80,
      instances = new Uint8Array(selected.length * stride);
    selected.forEach((piece, i) => instances.set(new Uint8Array(piece.bytes), i * stride));
    batches.push({
      kind,
      pieces: selected,
      sourceIndices: Uint32Array.from(indices),
      instances,
      cuts: { ...cuts, lists: Uint32Array.from(indices, (i) => cuts.lists[i]) }
    });
  }
  return { pieces: bound, batches, cuts, regionTop, mergeLimitReached: plan.mergeLimitReached };
}
