import { hashSeed, random } from "./math";
import type { OutlineVertex, V2, VoronoiStart } from "./types";

/** Intersect the half-planes |p|² <= |p-site|² for the site at the origin. */
export function originVoronoiCell(sites: readonly V2[]): V2[] {
  let polygon: V2[] = [
    [-100, -100],
    [100, -100],
    [100, 100],
    [-100, 100]
  ];
  for (const [x, z] of sites.slice(1)) {
    const limit = (x * x + z * z) / 2;
    const clipped: V2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = a[0] * x + a[1] * z - limit,
        db = b[0] * x + b[1] * z - limit;
      if (da <= 0) clipped.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    polygon = clipped.filter((a, i) => {
      const b = clipped[(i + clipped.length - 1) % clipped.length];
      return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9;
    });
  }
  return polygon;
}

/** A real bounded Voronoi cell, with random sites rather than a fixed perimeter template. */
export function seedVoronoiOutline(
  seed: number,
  guideId: string,
  edgeSplits: number
): {
  top: OutlineVertex[];
  voronoi: VoronoiStart;
} {
  const shapeSeed = hashSeed(seed, `${guideId}/voronoi-cell/v1`);
  // Reject only thin/near-degenerate cells and cells exceeding the editable vertex budget.
  // Every accepted edge must come from a site bisector, never the clipping rectangle.
  for (let attempt = 0; attempt < 32; attempt++) {
    const rng = random(hashSeed(shapeSeed, `candidate-${attempt}`));
    let sites: V2[] = [[0, 0]];
    for (let i = 0; i < 24; i++) {
      const angle = rng() * Math.PI * 2,
        radius = Math.sqrt(1 + 15 * rng());
      sites.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    const rotation = rng() * Math.PI * 2;
    // Distant surrounding sites guarantee a finite interior cell. They do not impose box edges.
    for (let i = 0; i < 6; i++) {
      const angle = rotation + ((i + (rng() - 0.5) * 0.4) * Math.PI * 2) / 6;
      const radius = 5 + rng();
      sites.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    let corners = originVoronoiCell(sites);
    if (corners.length < 3 || corners.length > 8) continue;
    const extent = Math.max(...corners.flatMap(([x, z]) => [Math.abs(x), Math.abs(z)]));
    if (!Number.isFinite(extent) || extent >= 99) continue;
    const scale = 0.98 / extent;
    corners = corners.map(([x, z]): V2 => [x * scale, z * scale]);
    const usable = corners.every((a, i) => {
      const b = corners[(i + 1) % corners.length],
        length = Math.hypot(a[0] - b[0], a[1] - b[1]);
      return length >= 0.06 && (a[0] * b[1] - a[1] * b[0]) / length >= 0.16;
    });
    if (!usable) continue;
    const first = corners.reduce(
      (best, p, i) => (Math.atan2(p[1], p[0]) < Math.atan2(corners[best][1], corners[best][0]) ? i : best),
      0
    );
    corners = [...corners.slice(first), ...corners.slice(0, first)];
    sites = sites.map(([x, z]): V2 => [x * scale, z * scale]);
    const top: OutlineVertex[] = [];
    const splits = random(hashSeed(shapeSeed, "subdivisions"));
    for (let edge = 0; edge < corners.length; edge++) {
      const a = corners[edge],
        b = corners[(edge + 1) % corners.length];
      for (let j = 0; j <= edgeSplits; j++) {
        const t = j === 0 ? 0 : (j + (splits() - 0.5) * 0.4) / (edgeSplits + 1);
        top.push({ id: `cell-edge-${edge}-${j}`, uv: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
      }
    }
    return { top, voronoi: { algorithm: "voronoi-cell/v1", seed: shapeSeed, sites, corners, edgeSplits } };
  }
  throw Error(`${guideId}: no usable Voronoi cell within the seeded candidate budget`);
}
