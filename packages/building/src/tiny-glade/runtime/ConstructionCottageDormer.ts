import { type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import type { UnitFootprintScale } from "./MaterialFootprint";
import { generateCottageDormer } from "./CottageDormerGenerator";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import { roofBasis } from "./ConstructionRoof";
import { SurfaceProjector } from "./SurfaceProjector.js";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import type { CottageDormerFrameTransform } from "./RecoveredCottageDormerPlacement";
import type { SettledRoofUnit } from "./ConstructionSettledRoof";

/** Render adaptation of the original full Cottage blueprint. The caller owns
 * host resolution and clearance/overlap validation before publishing the result.
 * Width is the unfolded group span; frames follow the native section instead of
 * stretching the group's world-space AABB. The host's metric chart owns edit UVs.
 */
export function cottageDormerGeometry(
  assets: ConstructionDecorationMeshes | undefined,
  building: ConstructionBuilding,
  spec: ConstructionDecorationSpec,
  host: {
    surface: RoofSurface;
    footprint: RoofFootprint;
    renderSlot: number;
    tileScale?: UnitFootprintScale;
    tileSeed?: bigint;
  },
  transform: CottageDormerFrameTransform,
  geometry: any,
  preparedProjector?: SurfaceProjector
) {
  const rank = spec.rank ?? 1;
  const recipe = constructionDecorationRecipe(assets, "dormer-cottage", rank)!;
  const assembly = constructionDecorationAssembly(assets, "dormer-cottage", rank)!;
  const blueprint = generateCottageDormer(
    {
      id: spec.id,
      hostId: building.id,
      rank,
      transform,
      scale: [spec.width / recipe.installationSize[0], spec.height / recipe.installationSize[1]]
    },
    host
  );
  const projector = preparedProjector ?? new SurfaceProjector(geometry);
  const parts = blueprint.frames.flatMap((transform, i) => {
    const axes = roofBasis(transform.quaternion).map((axis, j) => axis.map((v) => v * transform.scale[j])) as [
      number[],
      number[],
      number[]
    ];
    return decorationAssemblyGeometry(
      building,
      spec,
      {
        bounds: assembly.bounds,
        parts: assembly.parts.map((source) => ({ ...source, suffix: `${source.suffix}/${i}` }))
      },
      "window",
      {
        origin: transform.position,
        axes,
        editUV: (_source, world) => (projector.anchor(world) as [number[], unknown])[0].slice()
      }
    );
  });
  const roofUnits: SettledRoofUnit[] = blueprint.strips.map((strip) => ({
    id: "cottage/" + strip.id,
    position: strip.position,
    rotation: strip.rotation,
    scale: strip.scale,
    initial64: strip.initial64
  }));
  const roofOpenings = blueprint.holes48.map((raw48, i) => ({
    id: spec.id + "/" + i,
    raw48,
    polygon: [] as number[][]
  }));
  return { parts, roofUnits, roofOpenings };
}
