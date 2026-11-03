import type { CompiledMasonryLayout } from "./ConstructionLayout";
import type { ConstructionBindings } from "./ConstructionPackage";
import { viewConstants } from "./Camera.js";
import type { PublishedConstructionOwner } from "./ConstructionContacts";
export const bytes = (v: ArrayBufferView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
/** Defaults are authored palette choices. Dense slot arrays are generated from
 * active owners, independently from persistent identity used for seeded noise. */
export function constructionGlobals(layout: CompiledMasonryLayout, frame: ArrayBuffer): ConstructionBindings {
  return {
    ...constructionOwnerGlobals(layout.construction.owners, frame),
    roofCounts: bytes(layout.construction.dormerBins.counts),
    roofHoles: layout.construction.dormerBins.holes
  };
}
/** Shared identity/palette ABI for full construction and its persistent decoration view. */
export function constructionOwnerGlobals(
  owners: readonly PublishedConstructionOwner[],
  frame: ArrayBuffer
): ConstructionBindings {
  const u32 = (f: (o: PublishedConstructionOwner) => number) => bytes(Uint32Array.from(owners, f));
  return {
    view: bytes(viewConstants({ eye: [-8, 9, -13], target: [1.1, 3.6, 0], halfExtent: 6.5 }, "row-major")),
    frame: new Uint8Array(frame.slice(0)),
    frameCounter: new Uint8Array(16),
    identities: u32((o) => Number(o.seed)),
    roofColors: u32((o) => o.building.roof.color),
    wallColors: u32((o) => o.building.wall_color ?? 0),
    stoneFoundation: u32(() => 3),
    woodenColors: u32((o) => o.building.wood_color ?? 0),
    halfTimberColors: u32(() => 0)
  };
}
