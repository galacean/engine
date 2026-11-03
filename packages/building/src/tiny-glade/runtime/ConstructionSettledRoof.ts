import { SurfaceProjector } from "./SurfaceProjector.js";
import { roofBasis, roofClipPlane } from "./ConstructionRoof";

/** Original settled roof instances, independent of the decoration family.
 * id is a stable family/owner/element path, never a dense render slot. All
 * arrays are borrowed immutable producer data; consumers publish owned copies.
 */
export interface SettledRoofUnit {
  id: string;
  /** Owning Scene attachment, independent of the host roof/material chart. */
  decorationId?: string;
  position: readonly number[];
  rotation: readonly number[];
  scale: readonly number[];
  initial64: Uint8Array;
}

/** One chart defines local-edit anchors for native tiles and replacement units.
 * A prepared projector must belong to this same immutable geometry generation.
 */
export function settledRoofCells(
  units: readonly SettledRoofUnit[],
  geometry: any,
  preparedProjector?: SurfaceProjector
) {
  if (!units.length) return [];
  const projector = preparedProjector ?? new SurfaceProjector(geometry);
  return units.map((unit) => {
    const [tangent, bitangent, normal] = roofBasis([...unit.rotation]);
    const [uv, anchor] = projector.anchor(unit.position) as [number[], { triangle: number }];
    const id = geometry.id + "/" + unit.id;
    return {
      id,
      logical_id: id,
      surface_id: geometry.id,
      surface_piece: anchor.triangle,
      anchor_uv: uv.slice(),
      center: [...unit.position],
      size: [...unit.scale],
      clip_plane: roofClipPlane(unit.initial64),
      tangent,
      bitangent,
      normal
    };
  });
}

/** Own the upload buffer: the layout stage may update flags without mutating
 * native records retained by the blueprint, preview or a subsequent rebuild. */
export function settledRoofBytes(units: readonly SettledRoofUnit[]): Uint8Array {
  const bytes = new Uint8Array(units.length * 64);
  for (let i = 0; i < units.length; i++) {
    if (units[i].initial64.byteLength !== 64) throw Error("Settled roof unit requires a complete 64-byte record");
    bytes.set(units[i].initial64, i * 64);
  }
  return bytes;
}

/** Keep every small roof under the same pick identity as its window. */
export function settledRoofGroups(units: readonly SettledRoofUnit[]) {
  const groups = new Map<string | undefined, SettledRoofUnit[]>();
  for (const unit of units) {
    let group = groups.get(unit.decorationId);
    if (!group) groups.set(unit.decorationId, (group = []));
    group.push(unit);
  }
  return [...groups].map(([decorationId, units]) => ({ decorationId, units }));
}
