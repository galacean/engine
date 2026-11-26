import type { ShaderData } from "@galacean/engine";
import type { BuildingLampMaterial } from "./BuildingLampMaterial";

export type BuildingLampMaterials = ReadonlyMap<string, BuildingLampMaterial>;

/** The same absolute linear radiance drives the filament and its baked receivers. */
export function bindBuildingFilament(data: ShaderData, lamp: BuildingLampMaterial): () => void {
  data.enableMacro("MATERIAL_MASONRY_LAMP_HDR");
  const update = () => data.setVector3("material_MasonryLampHDR", lamp.hdr);
  update();
  return lamp.subscribe(update);
}
