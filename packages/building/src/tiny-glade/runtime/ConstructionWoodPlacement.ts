import { wallArclengthFromWorld } from "./RecoveredWallSpace";
import type { RoofCurve } from "./RecoveredRoofMath";
import type { HorizontalAffineWoodPiece } from "./RecoveredWoodInstance";
import type { compileHorizontalRectangularWoodWall } from "./RecoveredHorizontalWoodWall";
import { bindDecorationWoodCuts, decorationGableDraws, decorationWoodCutTemplate } from "./DecorationWoodCutAssets";

/** Placement anchors belong to the author's original wall chart. Native boards
 * use an expanded chart for their geometry; that expansion must not move paint. */
export interface WoodPlacementChart {
  geometryId: string;
  variationKey?: string;
  curve: RoofCurve;
  length: number;
  minimumY: number;
}

function woodCell(piece: HorizontalAffineWoodPiece, chart: WoodPlacementChart) {
  const view = new DataView(piece.bytes);
  const axis = (offset: number) => [0, 1, 2].map((i) => view.getFloat32(offset + i * 4, true));
  const along = axis(12),
    up = axis(piece.kind === "gable" ? 0 : 24);
  const across = axis(piece.kind === "gable" ? 24 : 0).map((v) => (piece.kind === "gable" ? -v : v));
  const center = axis(36).map((v, i) => v + along[i] * 0.5);
  const norm = (v: number[]) => {
    const length = Math.hypot(...v);
    if (!(length > 0) || !Number.isFinite(length)) throw Error("Nondegenerate wood placement axes required");
    return v.map((n) => n / length);
  };
  const id = chart.geometryId + "/wood/" + piece.id;
  return {
    id,
    logical_id: id,
    ...(chart.variationKey !== undefined
      ? { seed_id: chart.variationKey + "/wood/" + piece.id, lod_seed_id: chart.variationKey + "/wood/" + piece.id }
      : {}),
    surface_id: chart.geometryId,
    anchor_uv: [
      wallArclengthFromWorld(chart.curve, chart.length, [center[0], center[2]]),
      (piece.cutBounds[1] + piece.cutBounds[3]) / 2 - chart.minimumY
    ],
    center,
    tangent: norm(along),
    bitangent: norm(up),
    normal: norm(across),
    size: [Math.hypot(...along), Math.hypot(...up), Math.hypot(...across)]
  };
}

/** Publish cells and packed records in the SAME draw order. Gable flags choose
 * two meshes, so assigning one combined cell array to both draws is incorrect.
 * This adapter owns the partition; renderers receive ready-to-use group indices.
 * It does not choose the author's arrangement rule or infer published heights. */
export function constructionWoodPlacements(
  publication: ReturnType<typeof compileHorizontalRectangularWoodWall>,
  chart: WoodPlacementChart
) {
  if (!chart.geometryId || !Number.isFinite(chart.minimumY))
    throw Error("Stable wood geometry and finite chart origin required");
  const cells = publication.pieces.map((piece) => woodCell(piece, chart));
  const groups = publication.batches.flatMap((batch) => {
    const draws =
      batch.kind === "gable"
        ? decorationGableDraws(batch.instances, batch.cuts)
        : [
            {
              template: decorationWoodCutTemplate,
              ...bindDecorationWoodCuts(batch.instances, batch.cuts),
              sourceIndices: Uint32Array.from(batch.sourceIndices, (_, i) => i)
            }
          ];
    return draws.map((draw) => {
      const sourceIndices = Uint32Array.from(draw.sourceIndices, (i) => batch.sourceIndices[i]);
      return {
        woodDraw: { template: draw.template, instances: draw.instances, bindings: draw.bindings },
        cells: Array.from(sourceIndices, (i) => cells[i]),
        sourceIndices,
        materialUnits: ["wooden_plank"]
      };
    });
  });
  return { cells, groups };
}
