/** Lightweight material helper used only by teaching previews. */
import { Engine, RenderFace, UnlitMaterial } from "@galacean/engine-core";
import { hexToColor } from "../runtime/river/RiverMaterialFactory";

export function createWaterPreviewMaterial(engine: Engine, baseColor: string, alpha: number): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.isTransparent = true;
  material.renderFace = RenderFace.Double;
  material.baseColor = hexToColor(baseColor, alpha);
  return material;
}

export function updateWaterPreviewMaterial(material: UnlitMaterial, baseColor: string, alpha: number): void {
  material.baseColor = hexToColor(baseColor, alpha);
}
