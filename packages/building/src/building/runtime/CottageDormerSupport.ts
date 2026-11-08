import { add, mul, f32, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import {
  cottageFullDormerFrames,
  cottageDormerWidth,
  type CottageDormerFrameTransform
} from "./RecoveredCottageDormerPlacement";
import { cottageFullDormerHole48 } from "./RecoveredCottageDormerHoles";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import type { UnitFootprintScale } from "./MaterialFootprint";
import { assembleCottageDormerRoof, packCottageStrip64 } from "./RecoveredCottageDormerRoof";

export interface CottageDormerRoofSupport {
  position: number[];
  rank: 1 | 2 | 3;
  width: number;
  rise: number;
  expand: number;
  surface: RoofSurface;
  footprint: RoofFootprint;
}
export interface CottageDormerRoofPlacement {
  id: string;
  variationKey?: string;
  slot: number;
  unitScale?: UnitFootprintScale;
  seed?: bigint;
}
/** Resolve the window mounts and aperture before placing the small roof units. */
export function planCottageDormerSupport(
  spec: {
    id: string;
    hostId: string;
    rank: 1 | 2 | 3;
    transform: CottageDormerFrameTransform;
    scale?: readonly [number, number];
  },
  host: { surface: RoofSurface; footprint: RoofFootprint; renderSlot: number }
) {
  if (!spec.id || !spec.hostId || ![1, 2, 3].includes(spec.rank))
    throw Error("Stable dormer/host identities and rank 1..3 required");
  const [sx, sy] = spec.scale ?? [1, 1];
  if (![sx, sy].every((v) => Number.isFinite(f32(v)) && f32(v) > 0))
    throw Error("Positive finite dormer scale required");
  const roof = new RecoveredCottageRoofSampler(host.surface, host.footprint);
  const frames = cottageFullDormerFrames(spec.transform, spec.rank, roof, mul(cottageDormerWidth(spec.rank), sx));
  for (const frame of frames) frame.scale = frame.scale.map((v, i) => mul(v, i === 1 ? sy : sx));
  return {
    id: JSON.stringify([spec.hostId, spec.id]),
    hostId: spec.hostId,
    sourceId: spec.id,
    rank: spec.rank,
    frames,
    holes48: frames.map((t) => cottageFullDormerHole48(t.position, t.quaternion, host.renderSlot, t.scale)),
    roof: {
      position: spec.transform.position,
      rank: spec.rank,
      width: mul(add(cottageDormerWidth(spec.rank), 0.2), sx),
      rise: f32(sy),
      expand: mul(0.1, sx),
      surface: host.surface,
      footprint: host.footprint
    } satisfies CottageDormerRoofSupport
  };
}
/** Numerical course algorithm; neither discovers a host nor changes apertures. */
export function sampleCottageDormerCourses(support: CottageDormerRoofSupport, params: CottageDormerRoofPlacement) {
  const roof = new RecoveredCottageRoofSampler(support.surface, support.footprint);
  return assembleCottageDormerRoof(
    support.position,
    support.rank,
    support.width,
    support.rise,
    support.expand,
    roof,
    params.slot,
    true,
    params.unitScale,
    params.seed
  );
}
export function placeCottageDormerCourses(support: CottageDormerRoofSupport, params: CottageDormerRoofPlacement) {
  return sampleCottageDormerCourses(support, params).map((strip) => ({
    ...strip,
    id: `${params.id}/${strip.role}/${strip.row}/${strip.column}`,
    initial64: packCottageStrip64(strip)
  }));
}

export interface PlannedCottageDormerRoof {
  decorationId: string;
  support: CottageDormerRoofSupport;
  placement: CottageDormerRoofPlacement;
}
