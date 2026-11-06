import { nativeBytes } from "./nativeBytes";
import type { DecorationWindowCut } from "../../src/tiny-glade/runtime/DecorationWindowCutBuffer";

/** Captured original blueprint32, decoded only by oracle tests. */
export function nativeWindowCut(hex: string): DecorationWindowCut {
  const b = nativeBytes(hex);
  if (b.byteLength !== 32) throw Error("Native window-cut blueprint32 required");
  return {
    anchor: [b.getFloat32(0, true), b.getFloat32(4, true)],
    normalXZ: [b.getFloat32(8, true), b.getFloat32(12, true)],
    origin: [b.getFloat32(16, true), b.getFloat32(20, true), b.getFloat32(24, true)],
    layer: b.getUint8(28),
    flags: b.getUint8(29)
  };
}
