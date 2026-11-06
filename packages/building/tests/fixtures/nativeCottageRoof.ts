import { nativeBytes } from "./nativeBytes";
import { RecoveredCottageRoofSampler } from "../../src/tiny-glade/runtime/RecoveredCottageRoofSampler";
import type { RoofFootprint, RoofSurface } from "../../src/tiny-glade/runtime/RecoveredRoofMath";

// Binary decoding belongs to the oracle adapter, not the production sampler.
export function shape(hex: string): RoofFootprint {
  const bytes = nativeBytes(hex),
    n = (offset: number) => bytes.getFloat32(offset, true);
  return bytes.getUint32(0, true) === 0
    ? { center: [n(4), n(8)], radius: n(12), phase: n(16) }
    : { orientation: [n(4), n(8)], center: [n(12), n(16)], width: n(20), depth: n(24) };
}
export function nativeRoof(hex: string) {
  const bytes = nativeBytes(hex),
    n = (offset: number) => bytes.getFloat32(offset, true);
  const footprint = shape(hex.slice(16, 72));
  const surface: RoofSurface = {
    type: "radius" in footprint ? "native_circular_roof_profile" : "native_rectangular_roof_profile",
    tip_offset: [n(36), n(40)],
    profile: n(44),
    height_parameter: n(48),
    ridge_parameter: n(52),
    eave_parameter: n(56),
    axis: bytes.getUint8(60),
    edge_mode: bytes.getUint8(61),
    base_height: n(76)
  };
  return new RecoveredCottageRoofSampler(surface, footprint);
}
