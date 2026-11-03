import { plasterPalette } from "./ConstructionPlasterPalette";
export { plasterPalette } from "./ConstructionPlasterPalette";
import { constructionWallEnvelope } from "./ConstructionWallEnvelope";
import type { MasonryDocument } from "./MasonryDocument";
import type { ConstructionPreviewPart } from "./ConstructionPreview";
import { plasterBoundaryDistance, type ConstructionPlasterDomain } from "./ConstructionPlasterSupport";

export interface ConstructionPlasterMetadata {
  wear: number;
  color: number;
  wallLength: number;
  /** Distance to the effective support union boundary at each skin vertex. */
  edgeDistances: number[];
}
/** A finish of the already clipped wall, never a second structural surface.
 * Reusing the surviving polygons preserves openings, arbitrary local masks and
 * neighbor boundaries in every LOD. The .2975m offset follows native plaster's
 * nominal wall skin. A 2cm host clearance avoids intersecting material faces.
 * Subdivision supports the original spatial warp, shared by every LOD. */
export function constructionPlasterParts(
  document: MasonryDocument,
  parts: readonly ConstructionPreviewPart[],
  domains: ReadonlyMap<string, ConstructionPlasterDomain>
): ConstructionPreviewPart[] {
  const result: ConstructionPreviewPart[] = [];
  for (const b of document.construction.buildings) {
    if (!b.plaster?.enabled || b.kind) continue;
    const walls = parts.filter(
      (p) =>
        p.owner === b.id &&
        (p.geometryId === b.id + "-wall" || p.geometryId === b.id + "-parapet-skin") &&
        !p.plaster &&
        !p.decoration &&
        !p.junction
    );
    // Finish noise belongs to the owner, not the surviving paint/mask fragments.
    // Clipping away the chart endpoint must not reseed the rest of the wall.
    const domain = domains.get(b.id);
    if (!domain || !walls.length) continue;
    const wallLength = domain.wallLength;
    const distance = plasterBoundaryDistance(domain);
    const center = b.circle?.center ?? b.rectangle!.center;
    for (const p of walls) {
      const normals = Array(p.positions.length).fill(0);
      for (let t = 0; t < p.indices.length; t += 3) {
        const ia = p.indices[t],
          ib = p.indices[t + 1],
          ic = p.indices[t + 2];
        const a = p.positions.slice(ia * 3, ia * 3 + 3),
          b = p.positions.slice(ib * 3, ib * 3 + 3),
          c = p.positions.slice(ic * 3, ic * 3 + 3);
        const u = b.map((v, k) => v - a[k]),
          v = c.map((n, k) => n - a[k]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const sign = n[0] * (a[0] - center[0]) + n[2] * (a[2] - center[1]) < 0 ? -1 : 1;
        const length = Math.hypot(...n) || 1;
        for (const index of [ia, ib, ic]) for (let k = 0; k < 3; k++) normals[index * 3 + k] += (sign * n[k]) / length;
      }
      for (let i = 0; i < normals.length; i += 3) {
        if (b.circle) {
          normals[i] = p.positions[i] - center[0];
          normals[i + 1] = 0;
          normals[i + 2] = p.positions[i + 2] - center[1];
        }
        const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
        for (let k = 0; k < 3; k++) normals[i + k] /= length;
      }
      const positions = p.positions.slice(),
        uvs = p.uvs.map((uv) => uv.slice());
      const indices: number[] = [],
        midpoints = new Map<string, number>();
      const middle = (a: number, b: number) => {
        const key = a < b ? a + "/" + b : b + "/" + a;
        let index = midpoints.get(key);
        if (index !== undefined) return index;
        index = positions.length / 3;
        for (let k = 0; k < 3; k++) {
          positions.push((positions[a * 3 + k] + positions[b * 3 + k]) / 2);
          normals.push((normals[a * 3 + k] + normals[b * 3 + k]) / 2);
        }
        uvs.push(uvs[a].map((v, k) => (v + uvs[b][k]) / 2));
        midpoints.set(key, index);
        return index;
      };
      const length2 = (a: number, b: number) => {
        let value = 0;
        for (let k = 0; k < 3; k++) value += (positions[a * 3 + k] - positions[b * 3 + k]) ** 2;
        return value;
      };
      // Longest-edge subdivision bounds the warp interpolation error without
      // exploding both dimensions of narrow clipped triangles. It only refines
      // surviving triangles; holes and arbitrary masks cannot be filled back in.
      for (let i = 0; i < p.indices.length; i += 3) {
        const queue = [p.indices.slice(i, i + 3)];
        while (queue.length) {
          const t = queue.pop()!,
            lengths = t.map((v, k) => length2(v, t[(k + 1) % 3]));
          const edge = lengths.indexOf(Math.max(...lengths));
          if (lengths[edge] <= 0.4 * 0.4) {
            indices.push(t[0], t[1], t[2]);
            continue;
          }
          const a = t[edge],
            b = t[(edge + 1) % 3],
            c = t[(edge + 2) % 3],
            m = middle(a, b);
          queue.push([a, m, c], [m, b, c]);
        }
      }
      const binding = document.bindings.find((binding) => binding.geometry_id === b.id + "-wall");
      const envelope = constructionWallEnvelope(b, binding);
      // Circle vertices below are projected back to the native datum. Flat
      // wall facets already lie on the published nominal facade.
      const offset = envelope.plasterOffset - (b.circle ? 0 : envelope.nominalOuter);
      for (let i = 0; i < positions.length; i += 3) {
        if (b.circle) {
          const dx = positions[i] - center[0],
            dz = positions[i + 2] - center[1],
            radius = Math.hypot(dx, dz);
          if (radius > 0) {
            normals[i] = dx / radius;
            normals[i + 1] = 0;
            normals[i + 2] = dz / radius;
            positions[i] = center[0] + normals[i] * b.circle.radius;
            positions[i + 2] = center[1] + normals[i + 2] * b.circle.radius;
          }
        }
        const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
        for (let k = 0; k < 3; k++) {
          normals[i + k] /= length;
          positions[i + k] += normals[i + k] * offset;
        }
      }
      result.push({
        owner: p.owner,
        material: p.material,
        bindingId: p.bindingId,
        geometryId: p.geometryId,
        positions,
        normals,
        indices,
        uvs,
        colors: Array(positions.length).fill(1),
        emission: Array(positions.length / 3).fill(0),
        color: (b.plaster.tint ?? plasterPalette[b.plaster.color]).slice(),
        plaster: { wear: b.plaster.wear, color: b.plaster.color, wallLength, edgeDistances: uvs.map(distance) }
      });
    }
  }
  return result;
}
