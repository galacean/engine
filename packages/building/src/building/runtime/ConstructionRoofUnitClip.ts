/** Coarse rest geometry uses the same dot >= 0 half-space as the native roof
 * shader. Interpolate appearance UVs at each new edge; do not regenerate a UV
 * bounding rectangle after clipping. Input arrays remain caller-owned.
 */
export function clipRoofUnitFace(vertices: number[][], uvs: number[][], plane: readonly number[]) {
  if (vertices.length !== uvs.length || plane.length !== 4 || !plane.every(Number.isFinite))
    throw Error("Roof face requires paired vertices/UVs and a finite plane");
  const out: { vertices: number[][]; uvs: number[][] } = { vertices: [], uvs: [] };
  const distance = (p: number[]) => p[0] * plane[0] + p[1] * plane[1] + p[2] * plane[2] + plane[3];
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length,
      a = vertices[i],
      b = vertices[j];
    const da = distance(a),
      db = distance(b);
    if (da >= 0) {
      out.vertices.push(a.slice());
      out.uvs.push(uvs[i].slice());
    }
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.vertices.push(a.map((v, k) => v + (b[k] - v) * t));
      out.uvs.push(uvs[i].map((v, k) => v + (uvs[j][k] - v) * t));
    }
  }
  return out.vertices.length >= 3 ? out : { vertices: [], uvs: [] };
}
