import type { LayoutBuildContext, LayoutConstruction } from "./LayoutRules";
import { layoutRegion, LAYOUT_CANDIDATE_BUDGET } from "./LayoutRegion";

/** Fill successive rings over the owned region. Signed spacing and OBB sizes determine population. */
export function buildRadialLayout(c: LayoutBuildContext): LayoutConstruction {
  const q = c.parameters,
    region = layoutRegion(c.region, c.center);
  // Coastal anchors may lie on an edge of their own cell. Derive the organization
  // origin once from the usable region, without searching frames or moving the POI.
  const core = q.openRadiusM + Math.hypot(q.widthMaxM, q.depthMaxM) / 2;
  const origin =
    region.clearance(c.center) < core && region.clearance(region.centroid) > region.clearance(c.center)
      ? region.centroid
      : c.center;
  const radiusLimit = Math.max(0, ...c.region.map((p) => Math.hypot(p.x - origin.x, p.z - origin.z)));
  const sample = (i: number, key: string, a: number, b: number) => a + (b - a) * c.random(`owner:radial:${i}:${key}`);
  const min = q.spacingMinM ?? q.spacingM ?? 0,
    max = q.spacingMaxM ?? q.spacingM ?? min;
  const result: LayoutConstruction = { members: [], center: { ...origin } };
  let ring = q.openRadiusM,
    outer = q.openRadiusM,
    angle = 0;
  let previous: { radius: number; half: number } | undefined, first: typeof previous;
  const bearing = c.random("owner:bearing") * Math.PI * 2;
  const turn = (a: number, b: number, chord: number) =>
    a * b > 0 ? Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - chord * chord) / (2 * a * b)))) : Math.PI;
  let i = 0;
  for (; i < LAYOUT_CANDIDATE_BUDGET; i++) {
    const width = sample(i, "width", q.widthMinM, q.widthMaxM),
      depth = sample(i, "depth", q.depthMinM, q.depthMaxM);
    const half = Math.hypot(width, depth) / 2,
      gap = sample(i, "gap", min, max);
    const jitter = sample(i, "radius", 0, q.radialVariationM ?? 0);
    let radius = ring + half + jitter;
    if (!i && !q.openRadiusM) radius = 0;
    if (previous) {
      const advance = turn(previous.radius, radius, Math.max(0.001, previous.half + half + gap));
      const close = turn(radius, first!.radius, Math.max(0.001, half + first!.half + gap));
      if (
        !previous.radius ||
        previous.half + half + gap > previous.radius + radius ||
        angle + advance + close > Math.PI * 2
      ) {
        ring = Math.max(q.openRadiusM, ring + 0.001, outer + gap);
        radius = ring + half + jitter;
        angle = 0;
        first = undefined;
      } else angle += Math.max(0.000001, advance);
    }
    // Future ring centres can only move outward. No requested count and no fallback relocation.
    if (ring > radiusLimit) break;
    const center = {
      x: origin.x + Math.cos(bearing + angle) * radius,
      z: origin.z + Math.sin(bearing + angle) * radius
    };
    if (region.inside(center))
      result.members.push([
        {
          center,
          width,
          depth,
          height: sample(i, "height", q.heightMinM, q.heightMaxM),
          yaw: q.orientationVariation ? sample(i, "yaw", -0.5, 0.5) * Math.PI * q.orientationVariation : 0,
          elevation: 0
        }
      ]);
    previous = { radius, half };
    first ??= previous;
    outer = Math.max(outer, radius + half);
  }
  result.limited = i === LAYOUT_CANDIDATE_BUDGET;
  return result;
}
