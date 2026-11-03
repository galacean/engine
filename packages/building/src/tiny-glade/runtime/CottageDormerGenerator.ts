import type { UnitFootprintScale } from "./MaterialFootprint";
import { add, mul, f32 } from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import {
  cottageFullDormerFrames,
  cottageDormerWidth,
  type CottageDormerFrameTransform
} from "./RecoveredCottageDormerPlacement";
import { assembleCottageDormerRoof, packCottageStrip64 } from "./RecoveredCottageDormerRoof";
import { cottageFullDormerHole48 } from "./RecoveredCottageDormerHoles";

/** Full Cottage native blueprint. The host owns resolving the attachment to
 * the original trigger surface and checking installation clearance. This core
 * consumes that resolved transform once for frames, cuts and roof assembly.
 * It returns repeated installation frames, without selecting any model parts.
 */
export function generateCottageDormer(
  spec: {
    id: string;
    hostId: string;
    rank: 1 | 2 | 3;
    transform: CottageDormerFrameTransform;
    /** Host extension: XZ and Y scales relative to the original specification.
     * Frames follow the real roof section rather than stretching world positions.
     */
    scale?: readonly [number, number];
  },
  host: {
    surface: RoofSurface;
    footprint: RoofFootprint;
    renderSlot: number;
    tileScale?: UnitFootprintScale;
    tileSeed?: bigint;
  }
) {
  if (!spec.id || !spec.hostId || ![1, 2, 3].includes(spec.rank))
    throw Error("Stable dormer/host identities and rank 1..3 required");
  const [sx, sy] = spec.scale ?? [1, 1];
  if (![sx, sy].every((v) => Number.isFinite(f32(v)) && f32(v) > 0))
    throw Error("Positive finite dormer scale required");
  const roof = new RecoveredCottageRoofSampler(host.surface, host.footprint);
  const frames = cottageFullDormerFrames(spec.transform, spec.rank, roof, mul(cottageDormerWidth(spec.rank), sx));
  for (const frame of frames) frame.scale = frame.scale.map((v, i) => mul(v, i === 1 ? sy : sx));
  const id = JSON.stringify([spec.hostId, spec.id]);
  const holes48 = frames.map((transform) =>
    cottageFullDormerHole48(transform.position, transform.quaternion, host.renderSlot, transform.scale)
  );
  const strips = assembleCottageDormerRoof(
    spec.transform.position,
    spec.rank,
    mul(add(cottageDormerWidth(spec.rank), 0.2), sx),
    f32(sy),
    mul(0.1, sx),
    roof,
    host.renderSlot,
    true,
    host.tileScale,
    host.tileSeed
  );
  return {
    id,
    hostId: spec.hostId,
    sourceId: spec.id,
    rank: spec.rank,
    frames,
    holes48,
    strips: strips.map((strip) => ({
      ...strip,
      id: `${id}/${strip.role}/${strip.row}/${strip.column}`,
      initial64: packCottageStrip64(strip)
    }))
  };
}
