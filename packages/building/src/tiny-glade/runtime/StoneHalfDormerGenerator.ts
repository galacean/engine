import { type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import { recoveredGothicWallPlacement, type GothicWallPlacementInput } from "./RecoveredGothicWallPlacement";
import { recoveredArrowWallPlacement } from "./RecoveredArrowWallPlacement";
import { gothicHalfDormerProfiles, stoneHalfDormerHole48, type StoneHalfFamily } from "./RecoveredGothicHalfDormer";
import { gothicRoofTilesFromProfiles } from "./GothicRoofTiles";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";
import { gothicDecorationWallHoles, arrowDecorationWallHoles } from "./RecoveredDecorationWallHoles";
import { add, sub, mul, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import { gothicForward, type GothicTransform } from "./GothicBlueprint";
import type { UnitFootprintScale } from "./MaterialFootprint";

/** Complete stone half-dormer producer. The public host adapter is responsible
 * for crossing the eave, rejecting gable/corner hosts and collision checks.
 * No source executable or cached scene output is required at runtime. */
export function generateStoneHalfDormer(
  collisions: ConstructionDecorationCollisions | undefined,
  assets: ConstructionDecorationMeshes | undefined,
  spec: {
    id: string;
    hostId: string;
    family: StoneHalfFamily;
    placement: GothicWallPlacementInput;
    cachedTransform: GothicTransform;
  },
  host: { surface: RoofSurface; footprint: RoofFootprint; tileScale?: UnitFootprintScale; tileSeed?: bigint }
) {
  const { rank } = spec.placement,
    arrow = spec.family === "arrow";
  if (!spec.id || !spec.hostId || (arrow && rank === 1) || spec.placement.kind === "door")
    throw Error("Supported half-window identity required");
  const scale = spec.placement.sourceScale ?? [1, 1, 1];
  const gothic = arrow
    ? undefined
    : recoveredGothicWallPlacement(collisions, assets, { ...spec.placement, kind: "window", halfDormer: true });
  const slit = arrow ? recoveredArrowWallPlacement(collisions, spec.placement) : undefined;
  const origin = gothic?.frameOrigin ?? slit!.origin;
  const normal = gothic?.normalXZ ?? slit!.normalXZ;
  const instance = gothic?.instance ?? slit!.instance;
  const bodyScale = slit?.scale ?? [...scale];
  const bodyTransform = {
    translation: [...origin],
    rotation: cottageXzProjectiveRotation([normal[0], 0, normal[1]]),
    scale: [...bodyScale]
  };
  const collider = requireDecorationCollision(
    collisions,
    arrow ? `arrow_slit_1x${rank}_collision` : `window_gothic_${rank}x1_collision`
  );
  const extent = collider.max.map((v, i) => mul(sub(v, collider.min[i]), scale[i]));
  const centerY = mul(mul(add(collider.min[1], collider.max[1]), 0.5), scale[1]);
  const hole48 = stoneHalfDormerHole48({
    family: spec.family,
    rank,
    position: origin,
    forward: gothicForward(bodyTransform.rotation),
    collisionCenterY: centerY,
    collisionExtent: extent,
    slot: spec.placement.wallSlot,
    sourceScale: scale
  });
  const profiles = gothicHalfDormerProfiles({
    family: spec.family,
    rank,
    bones: slit?.profileBones ?? instance.bones,
    circle: spec.placement.circleRadius !== undefined,
    wallTop: spec.placement.wallMaxY,
    heightScale: scale[1]
  });
  const id = JSON.stringify([spec.hostId, spec.id]);
  const strips = gothicRoofTilesFromProfiles(
    id,
    profiles,
    spec.cachedTransform,
    host.surface,
    host.footprint,
    spec.placement.wallSlot,
    host.tileScale,
    host.tileSeed
  );
  const template = gothic?.template ?? `arrow_slit_1x${rank}_hat`;
  return {
    id,
    sourceId: spec.id,
    hostId: spec.hostId,
    family: spec.family,
    rank,
    windowCut: gothic?.windowCut ?? slit!.windowCut,
    frameAttributes: {
      wallRange: instance.wallRange,
      meshSizeX: gothic?.meshSizeX ?? slit!.meshSizeX,
      woodenWall: false
    },
    bodyTransform,
    hat: { id: id + "/hat", template, instance, geometryScale: [...bodyScale], visible: gothic?.visibleHat ?? true },
    profiles,
    hole48,
    strips,
    wallHoles: arrow
      ? arrowDecorationWallHoles(rank, spec.placement.wallX, spec.placement.pivotY, scale[0], scale[1])
      : gothicDecorationWallHoles(rank, spec.placement.wallX, spec.placement.pivotY, scale[0], scale[1])
  };
}
