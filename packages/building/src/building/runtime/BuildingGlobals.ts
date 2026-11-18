import type { ConstructionBindings } from "./ConstructionPackage";
import { viewConstants } from "./Camera.js";
export const bytes = (v: ArrayBufferView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
export interface BuildingPaletteSlot {
  seed: number;
  roofColor: number;
  wallColor: number;
  woodColor: number;
}
/** Dense render slots are supplied by implementation, not inferred from houses. */
export function buildingGlobals(slots: readonly BuildingPaletteSlot[], frame: ArrayBuffer): ConstructionBindings {
  const u32 = (f: (slot: BuildingPaletteSlot) => number) => bytes(Uint32Array.from(slots, f));
  return {
    view: bytes(viewConstants({ eye: [-8, 9, -13], target: [1.1, 3.6, 0], halfExtent: 6.5 }, "row-major")),
    frame: new Uint8Array(frame.slice(0)),
    frameCounter: new Uint8Array(16),
    identities: u32((s) => s.seed),
    roofColors: u32((s) => s.roofColor),
    wallColors: u32((s) => s.wallColor),
    stoneFoundation: u32(() => 3),
    woodenColors: u32((s) => s.woodColor),
    halfTimberColors: u32(() => 0)
  };
}
