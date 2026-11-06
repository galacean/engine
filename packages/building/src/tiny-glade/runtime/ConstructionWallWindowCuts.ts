import type { ProfileWallGeometry } from "./ProfileWallGeometry";
import type { ConstructionWindowCutAsset } from "./ConstructionWindowCutAsset";
import {
  buildDecorationWindowCutBuffer,
  finalizeDecorationWindowCuts,
  type DecorationWindowCut
} from "./DecorationWindowCutBuffer";
import { nativeWallCells, arrangedWallCells } from "./ConstructionArrangement";
import { compileWallMasonryInFrame } from "./ConstructionWallFrame";
import { resolvedArrangement, type UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
import type { SupportCell } from "./PlacementSupport";

/** The resident and distance paths share the same SDF-cut wall placements. */
export function profileWindowCutWall(
  owner: ProfileWallGeometry,
  binding: MasonryBinding,
  holes: readonly WallConnectionWipHole[],
  intents: readonly { id: string; cut: DecorationWindowCut }[],
  host: boolean
) {
  const cutIds = new Set(intents.map((v) => v.id));
  const woodHoles = holes.filter((h) => !h.decorationId || !cutIds.has(h.decorationId));
  const source =
    resolvedArrangement(binding) === "staggered_rows"
      ? nativeWallCells(
          binding.geometry_id,
          compileWallMasonryInFrame(
            owner.id,
            owner.wallSeed,
            owner.slot,
            owner.shape,
            owner.profile,
            owner.height,
            woodHoles,
            host,
            owner.unitScale,
            owner.variationKey
          ).instances,
          owner.profile
        )
      : arrangedWallCells(binding, owner.profile, woodHoles, owner.wallEnvelope.nominalOuter, owner.wallRoofJoint);
  return source.map((c) => ({
    ...c,
    seed_id: c.seed_id ?? c.logical_id ?? c.id,
    ...(c.lod_seed_id !== undefined ? { lod_seed_id: c.lod_seed_id + "/wood-cut" } : {}),
    id: c.id + "/wood-cut",
    logical_id: c.logical_id + "/wood-cut"
  }));
}
export function wallWindowCutBuffer(
  asset: ConstructionWindowCutAsset | undefined,
  cells: readonly SupportCell[],
  intents: readonly { cut: DecorationWindowCut }[],
  perimeter: number
) {
  return buildDecorationWindowCutBuffer(
    asset,
    finalizeDecorationWindowCuts(
      asset,
      intents.map((v) => v.cut),
      perimeter,
      true
    ),
    cells.map((c) => [
      c.anchor_uv[0] - c.size[0] / 2,
      c.center[1] - c.size[1] / 2,
      c.anchor_uv[0] + c.size[0] / 2,
      c.center[1] + c.size[1] / 2
    ]),
    perimeter
  );
}
