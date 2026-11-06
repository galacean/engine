import type { BuildingDesign } from "./BuildingDesign";
import type { BuildingPaletteSlot } from "../../runtime/BuildingGlobals";
import { normalizeProfileRoof } from "../../runtime/ProfileParameters";

/** Slot order belongs to resolved supports, including temporarily empty draws. */
export function buildingPalette(design: BuildingDesign) {
  const colorOwners = design.profileSupports.map((p) => ({
    id: p.id,
    seed: p.group.seed,
    wallColor: p.group.wallColor,
    woodColor: p.group.woodColor,
    roofColor: p.roofParameters?.color ?? normalizeProfileRoof({}).color
  }));
  const paletteSlots: BuildingPaletteSlot[] = colorOwners.map(({ id: _id, ...slot }) => slot);
  return { colorOwners, paletteSlots };
}
