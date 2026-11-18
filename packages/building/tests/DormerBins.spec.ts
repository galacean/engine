import { describe, expect, it } from "vitest";
import { dormerSelectedBins } from "../src/building/runtime/DormerBins";

/** A 48-byte roof hole: position, slot, size (width, height, depth), outward plan direction. */
function hole(x: number, z: number, width: number, depth: number, angle: number): Uint8Array {
  const bytes = new Uint8Array(48),
    v = new DataView(bytes.buffer);
  [x, 2, z].forEach((value, i) => v.setFloat32(i * 4, value, true));
  [width, 1, depth].forEach((value, i) => v.setFloat32(16 + i * 4, value, true));
  v.setFloat32(32, Math.cos(angle), true);
  v.setFloat32(36, Math.sin(angle), true);
  return bytes;
}
/** The native bin of a plan point, as the roof shader finds it. */
const binOf = (x: number, z: number) =>
  Math.floor((z + 65) * 0.11538460850715637) * 15 + Math.floor((x + 65) * 0.11538460850715637);

describe("Dormer bins", () => {
  it("cover every point of the box the roof shader cuts, whatever its turn", () => {
    for (const [width, depth] of [
      [1.2, 2.4],
      [2.4, 0.6],
      [1, 1]
    ])
      for (let k = 0; k < 24; k++) {
        const angle = (k / 24) * Math.PI * 2,
          [ox, oz] = [Math.cos(angle), Math.sin(angle)];
        // Near a bin corner, so that a box too small in either direction misses a bin.
        const [x, z] = [8.67 * 2 - 65 + 0.3, 8.67 * 3 - 65 - 0.2];
        const bins = new Set(dormerSelectedBins(hole(x, z, width, depth, angle)));
        for (const a of [-0.5, 0, 0.5])
          for (const d of [-0.5, 0, 0.5]) {
            // Across is cross(out, up); out is (ox, oz).
            const px = x + a * width * -oz + d * depth * ox,
              pz = z + a * width * ox + d * depth * oz;
            expect(bins.has(binOf(px, pz)), `w ${width} d ${depth} turn ${k} at ${a},${d}`).toBe(true);
          }
      }
  });
});
