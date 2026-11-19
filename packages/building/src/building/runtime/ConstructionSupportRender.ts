import type { ConstructionPreviewPart } from "./ConstructionPreview";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
/** Thin support backs material units, shares UV cutouts with distance geometry.
 * It never reinstates a wall behind an authored hidden region or opening. */
export function constructionSupportParts(parts: ConstructionPreviewPart[]): ConstructionDecorationPart[] {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return parts.map((p, index) => {
    const posLen = p.positions.length;
    const count = posLen / 3;
    const n = new Float32Array(posLen);
    for (let i = 0; i < p.indices.length; i += 3) {
      const ia = p.indices[i]! * 3,
        ib = p.indices[i + 1]! * 3,
        ic = p.indices[i + 2]! * 3;
      const ux = p.positions[ib]! - p.positions[ia]!,
        uy = p.positions[ib + 1]! - p.positions[ia + 1]!,
        uz = p.positions[ib + 2]! - p.positions[ia + 2]!;
      const vx = p.positions[ic]! - p.positions[ia]!,
        vy = p.positions[ic + 1]! - p.positions[ia + 1]!,
        vz = p.positions[ic + 2]! - p.positions[ia + 2]!;
      const qx = uy * vz - uz * vy,
        qy = uz * vx - ux * vz,
        qz = ux * vy - uy * vx;
      const len = Math.hypot(qx, qy, qz) || 1;
      const nx = qx / len,
        ny = qy / len,
        nz = qz / len;
      n[ia] += nx;
      n[ia + 1] += ny;
      n[ia + 2] += nz;
      n[ib] += nx;
      n[ib + 1] += ny;
      n[ib + 2] += nz;
      n[ic] += nx;
      n[ic + 1] += ny;
      n[ic + 2] += nz;
    }
    const inset = p.supportInset ?? 0.035;
    const positions = new Float32Array(posLen);
    for (let i = 0; i < posLen; i += 3) {
      const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
      n[i] /= l;
      n[i + 1] /= l;
      n[i + 2] /= l;
      positions[i] = p.positions[i]! - n[i]! * inset;
      positions[i + 1] = p.positions[i + 1]! - n[i + 1]! * inset;
      positions[i + 2] = p.positions[i + 2]! - n[i + 2]! * inset;
    }
    const color = (p.color ?? [0.55, 0.43, 0.31]).map(linear);
    const colors = new Float32Array(posLen);
    for (let i = 0; i < posLen; i += 3) {
      colors[i] = color[0]!;
      colors[i + 1] = color[1]!;
      colors[i + 2] = color[2]!;
    }
    return {
      id: `support/${p.owner}/${index}`,
      ownerId: p.owner,
      kind: "support",
      tintRole: p.material === "wall" ? "brick" : p.material,
      positions: positions as unknown as number[],
      normals: n as unknown as number[],
      colors: colors as unknown as number[],
      emission: new Float32Array(count) as unknown as number[],
      indices: p.indices,
      uvs: p.uvs
    };
  });
}
