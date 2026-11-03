import type { ConstructionWindowCutAsset } from "./ConstructionWindowCutAsset";
import type { PublishedConstructionOwner } from "./ConstructionContacts";
import type { MasonryBinding } from "./MasonryDocument";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import { RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import { createBoardWallSpace } from "./RecoveredBoardWallSpace";
import { finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles";
import {
  compileHorizontalRectangularWoodWall,
  horizontalWoodSourceFromPublishedWall
} from "./RecoveredHorizontalWoodWall";
import { constructionWoodPlacements } from "./ConstructionWoodPlacement";
import { mul } from "./RecoveredRoofMath";
import type { WoodArchOpening } from "./RecoveredWoodArchCutouts";

/** Building author facts -> recovered horizontal plank producer. This is a
 * material representation; it does not replace the canonical structural wall.
 * Host lower-lift has already been resolved into the owner's ground contour.
 * This document has no stone/wood trim-height field, so no extra trim is added.
 */
export function constructionHorizontalWoodWall(
  asset: ConstructionWindowCutAsset | undefined,
  owner: PublishedConstructionOwner,
  binding: MasonryBinding,
  holes: readonly WallConnectionWipHole[],
  cuts: readonly { id: string; cut: DecorationWindowCut }[],
  archOpenings: readonly WoodArchOpening[] = []
) {
  if (owner.shape.type !== "rectangle") throw Error("Recovered horizontal wood wall requires a rectangle");
  const profile = owner.profile;
  // Profile and roof are already resolved together by the construction owner.
  // This producer only arranges boards; it must not choose a second wall top.
  const rectangle = new RecoveredCottageRoofSection(owner.roof.footprint);
  const chart = createBoardWallSpace(rectangle, profile.control.length, mul(0.125, owner.unitScale.depth));
  const cutIds = new Set(cuts.map((cut) => cut.id));
  const structural = holes.filter((hole) => !hole.decorationId || !cutIds.has(hole.decorationId));
  const boardCutouts = finalizeWallConnectionHoles([...structural], chart.sourceLength, true).map((hole) =>
    chart.remapBounds([hole.minU, hole.minY, hole.maxU, hole.maxY])
  );
  const source = horizontalWoodSourceFromPublishedWall({
    wallId: owner.wallSeed,
    colorId: owner.slot,
    rectangle,
    profile,
    roof: owner.roof,
    elevation: profile.minGround,
    stoneFoundationHeight: 0,
    isWood: true,
    pitch: mul(0.3944, owner.unitScale.height),
    maximumLength: mul(5, owner.unitScale.width),
    unitScale: owner.unitScale,
    boardCutouts,
    archOpenings,
    windowCuts: cuts.map((cut) => cut.cut)
  });
  return constructionWoodPlacements(compileHorizontalRectangularWoodWall(asset, source), {
    geometryId: binding.geometry_id,
    curve: profile.control,
    length: profile.control.length,
    minimumY: profile.minGround
  });
}
