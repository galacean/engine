import type { RoofSpireAsset } from "./RoofSpireAsset";
import { roofHeight, add, sub, mul, div, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath.ts";
import { isFlatRoofHeight } from "./RoofMode.ts";
import type { ConstructionDecorationPart } from "./ConstructionDecorations.ts";

/** Static realization of instanced_roof_spire.precomp's settled vertex program.
 * Provenance: ../assets/decorations/roof-spire-provenance.md.
 * The original separate profile weights keep the finial fixed while widening its
 * collar to meet the curved roof. Only author edits rebuild these 414 triangles.
 * Host lighting is shared with the other decorations; no frame-time CPU work. */
function jenkins(x: number): number {
  x = (x + (x << 10)) >>> 0;
  x ^= x >>> 6;
  x = (x + (x << 3)) >>> 0;
  x ^= x >>> 11;
  return (x + (x << 15)) >>> 0;
}
function temper(x: number): number {
  x ^= x >>> 11;
  x ^= (x << 7) & 2636928640;
  x ^= (x << 15) & 4022730752;
  return (x ^ (x >>> 18)) >>> 0;
}
function hash(x: number, y: number): number {
  return temper(Math.imul((Math.imul(x, 1664525) + y + 1013904223) >>> 0, 1664525));
}
const fraction = (x: number) => (x & 8388607) / 8388608;
function noise(point: number[], dimensions: 2 | 3, channels: number) {
  const base = point.map(Math.floor),
    weights = point.map((p, i) => {
      const t = p - base[i];
      return t * t * (3 - 2 * t);
    }),
    value = Array(channels).fill(0);
  for (let corner = 0; corner < 1 << dimensions; corner++) {
    const p = base.map((b, i) => b + ((corner >> i) & 1));
    let h = dimensions === 2 ? hash(p[0], jenkins(p[1])) : hash(p[0], hash(p[1], jenkins(p[2])));
    let weight = 1;
    for (let i = 0; i < dimensions; i++) weight *= (corner >> i) & 1 ? weights[i] : 1 - weights[i];
    for (let c = 0; c < channels; c++) {
      value[c] += fraction(h) * weight;
      h = jenkins(h);
    }
  }
  return value;
}
export function deformRoofSpireVertex(
  vertex: readonly number[],
  profileWeight: number,
  radius: number,
  profile: number,
  origin: readonly number[],
  animation = 1
): number[] {
  const collar =
      profileWeight > -0.001
        ? Math.max(0.6, radius * 2 * (0.6 + 0.4 * profileWeight) * (0.4 + 1.1 * (1 - profile)))
        : 1,
    grow = (2 ** (-10 * animation) * Math.sin((animation * 10 - 0.75) * 2.094395160675049) + 1) * 0.5,
    p = [origin[0] + vertex[0] * collar * grow, origin[1] + vertex[1] * grow, origin[2] + vertex[2] * collar * grow];
  p[1] += noise([p[0] * 0.5, p[2] * 0.5], 2, 1)[0] * 0.3;
  const warp = noise(
    p.map((v) => v * 0.4),
    3,
    2
  ).map((v) => Math.min(0.5, Math.max(-0.5, (v - 0.5) * 2.5)) * 0.06);
  p[0] += warp[0];
  p[2] += warp[1];
  return p;
}

/** place_roof_spires -> filter_map closure 0x10056eb9c. Native radius is
 * deliberately .25m, not the building radius. Rectangular roofs qualify only
 * after their ridge collapses to an approximately square cap (ratio <1.01). */
export function profileRoofSpirePlacement(roof: { surface: RoofSurface; footprint: RoofFootprint }) {
  const { surface, footprint } = roof;
  if (isFlatRoofHeight(surface.height_parameter)) return null;
  const baseHeight = surface.base_height;
  let dx: number, dz: number;
  if ("radius" in footprint) {
    dx = mul(mul(surface.tip_offset[0], mul(footprint.radius, 2)), 0.5);
    dz = mul(mul(surface.tip_offset[1], mul(footprint.radius, 2)), 0.5);
  } else {
    const ridge = add(
      mul(sub(1, surface.ridge_parameter), 0.1),
      mul(surface.ridge_parameter, surface.axis ? footprint.depth : footprint.width)
    );
    if (Math.max(div(ridge, 0.1), div(0.1, ridge)) >= Math.fround(1.01)) return null;
    const x = mul(mul(surface.tip_offset[0], footprint.width), 0.5),
      z = mul(mul(surface.tip_offset[1], footprint.depth), 0.5),
      [c, s] = footprint.orientation;
    dx = add(mul(c, x), mul(-s, z));
    dz = add(mul(s, x), mul(c, z));
  }
  return {
    origin: [
      add(footprint.center[0], dx),
      add(baseHeight, roofHeight(surface, footprint)),
      add(footprint.center[1], dz)
    ],
    radius: 0.25,
    profile: surface.profile
  };
}
export function placeProfileRoofSpire(
  ownerId: string,
  placement: NonNullable<ReturnType<typeof profileRoofSpirePlacement>>,
  mesh: RoofSpireAsset | undefined
): ConstructionDecorationPart {
  if (!mesh) throw Error("Missing roof spire mesh in construction library");
  const vertices = mesh.positions.map((p, i) =>
    deformRoofSpireVertex(p, mesh.profileMultipliers[i], placement.radius, placement.profile, placement.origin)
  );
  const part: ConstructionDecorationPart = {
    id: ownerId + "/roof-spire",
    ownerId,
    kind: "roof-spire",
    positions: [],
    normals: [],
    colors: [],
    emission: [],
    indices: [],
    uvs: []
  };
  // The native fragment shader retains the authored normal XZ and replaces Y
  // with the deformed triangle normal only for profile-morphed collar vertices.
  // Splitting corners realizes that same face-owned normal for the host shader.
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3),
      [a, b, c] = ids.map((id) => vertices[id]),
      u = b.map((v, k) => v - a[k]),
      v = c.map((v, k) => v - a[k]),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      length = Math.hypot(...n);
    for (const id of ids) {
      const original = mesh.normals[id],
        normal = [
          original[0],
          mesh.profileMultipliers[id] > -0.001 && length > 1e-15 ? n[1] / length : original[1],
          original[2]
        ],
        magnitude = Math.hypot(...normal);
      part.indices.push(part.positions.length / 3);
      part.positions.push(...vertices[id]);
      part.normals.push(...(magnitude > 0 ? normal.map((v) => v / magnitude) : [0, 1, 0]));
      part.colors.push(...mesh.color);
      part.emission.push(0);
      part.uvs!.push([0, 0]);
    }
  }
  return part;
}
