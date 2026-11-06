import type { ConstructionPreviewPart } from "./ProfilePreview";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
/** Thin support backs material units, shares UV cutouts with distance geometry.
 * It never reinstates a wall behind an authored hidden region or opening. */
export function constructionSupportParts(parts: ConstructionPreviewPart[]): ConstructionDecorationPart[] {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return parts.map((p, index) => {
    const n = Array(p.positions.length).fill(0);
    for (let i = 0; i < p.indices.length; i += 3) {
      const [a, b, c] = p.indices.slice(i, i + 3).map((k) => p.positions.slice(k * 3, k * 3 + 3));
      const u = b.map((x, j) => x - a[j]),
        v = c.map((x, j) => x - a[j]),
        q = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
        len = Math.hypot(...q) || 1;
      for (const k of p.indices.slice(i, i + 3)) for (let j = 0; j < 3; j++) n[k * 3 + j] += q[j] / len;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(...n.slice(i, i + 3)) || 1;
      for (let j = 0; j < 3; j++) n[i + j] /= l;
    }
    const color = (p.color ?? [0.55, 0.43, 0.31]).map(linear);
    return {
      id: `support/${p.owner}/${index}`,
      ownerId: p.owner,
      kind: "support",
      tintRole: p.material === "wall" ? "brick" : p.material,
      positions: p.positions.map((x, i) => x - n[i] * (p.supportInset ?? 0.035)),
      normals: n,
      colors: Array.from({ length: p.positions.length / 3 }, () => color).flat(),
      emission: Array(p.positions.length / 3).fill(0),
      indices: p.indices,
      uvs: p.uvs
    };
  });
}
