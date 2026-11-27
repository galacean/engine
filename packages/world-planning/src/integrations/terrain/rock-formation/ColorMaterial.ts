import { Color } from "@galacean/engine-math";
import type { PBRMaterial } from "@galacean/engine";
import type { RockColorBlend } from "./ColorPalette.ts";

/** One uniform shared by planned rocks and streamed companion stones. */
export function setRockColorBlend(material: PBRMaterial, settings: RockColorBlend): void {
  material.baseColor = new Color(...settings.color, 1);
}
