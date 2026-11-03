import { decorationMesh, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { decorationAssemblyGeometry, type DecorationPlacementFrame } from "./ConstructionDecorationGeometry";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import { roofBasis } from "./ConstructionRoof";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";
import type { generateCottageHalfDormer } from "./CottageHalfDormerGenerator";
import type { SettledRoofUnit } from "./ConstructionSettledRoof";

/** Adapt the complete half-dormer blueprint once. Host placement and occupancy
 * must be accepted before publishing any of its parts or apertures. Original
 * material UVs stay intact; the host provides the common wall edit chart.
 */
export function cottageHalfDormerGeometry(
  assets: ConstructionDecorationMeshes | undefined,
  building: ConstructionBuilding,
  spec: ConstructionDecorationSpec,
  blueprint: ReturnType<typeof generateCottageHalfDormer>,
  editUV: DecorationPlacementFrame["editUV"]
) {
  if (blueprint.hostId !== building.id || blueprint.sourceId !== spec.id || blueprint.rank !== (spec.rank ?? 1))
    throw Error("Half-dormer blueprint does not belong to this decoration");
  const assembly = constructionDecorationAssembly(assets, "dormer-cottage-half", blueprint.rank)!;
  const models = [
    ...assembly.parts.map((source) => ({
      id: `${blueprint.id}/${source.suffix}`,
      source,
      transform: source.binding.role === "glass" ? blueprint.placements.glass : blueprint.placements.body
    })),
    ...blueprint.shutters.map((body) => ({
      ...body,
      source: {
        name: body.mesh,
        suffix: `shutter/${body.side}`,
        mesh: decorationMesh(assets, body.mesh),
        material: DecorationMaterial.frame,
        binding: { role: "body" as const }
      }
    }))
  ];
  const parts = models.flatMap(({ id, source, transform }) =>
    decorationAssemblyGeometry(
      building,
      spec,
      { bounds: assembly.bounds, parts: [{ ...source, suffix: id.slice(blueprint.id.length + 1) }] },
      "window",
      {
        origin: transform.position,
        axes: roofBasis(transform.quaternion).map((axis, i) => axis.map((v) => v * transform.scale[i])) as [
          number[],
          number[],
          number[]
        ],
        editUV
      }
    )
  );
  const roofUnits: SettledRoofUnit[] = blueprint.strips.map((strip) => ({
    id: "cottage-half/" + strip.id,
    position: strip.position.slice(),
    rotation: strip.rotation.slice(),
    scale: strip.scale.slice(),
    initial64: strip.initial64.slice()
  }));
  return {
    parts,
    roofUnits,
    holes: blueprint.wallHoles.map((h) => ({ ...h })),
    roofOpenings: blueprint.holes48.map((raw48, i) => ({
      id: spec.id + "/" + i,
      raw48: raw48.slice(),
      polygon: [] as number[][]
    }))
  };
}
