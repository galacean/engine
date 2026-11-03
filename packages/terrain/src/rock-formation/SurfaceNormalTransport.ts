export interface GuideNormalSource {
  positions: Float32Array;
  indices: Uint32Array;
  guideNormals: Float32Array;
}

/**
 * Transport a smooth guide normal through a sampled displacement field.
 * The existing one-ring edges fit the displacement derivatives in the guide's
 * tangent plane. Inverse squared edge length gives uneven cap/rim sampling a
 * comparable vote without using the original triangle areas as shading weights.
 * Identity displacement preserves the guide; affine deformation is exact on a
 * planar neighborhood. Curved/coarse neighborhoods remain an approximation.
 * This changes normals only, never vertex positions or index connectivity.
 */
export function transportSurfaceNormals(
  source: GuideNormalSource,
  deformedPositions: Float32Array,
  existingNeighbors?: readonly ReadonlySet<number>[]
): Float32Array {
  const { positions, indices, guideNormals } = source,
    count = positions.length / 3;
  if (
    positions.length % 3 ||
    indices.length % 3 ||
    deformedPositions.length !== positions.length ||
    guideNormals.length !== positions.length
  )
    throw Error("Normal transport buffers do not match");
  for (const values of [positions, deformedPositions, guideNormals])
    if (!values.every(Number.isFinite)) throw Error("Normal transport requires finite geometry and guide normals");
  if (existingNeighbors && existingNeighbors.length !== count)
    throw Error("Normal transport adjacency does not match vertices");
  let neighbors = existingNeighbors;
  if (!neighbors) {
    const graph: Set<number>[] = Array.from({ length: count }, () => new Set());
    for (let t = 0; t < indices.length; t += 3)
      for (let j = 0; j < 3; j++) {
        const a = indices[t + j],
          b = indices[t + ((j + 1) % 3)];
        if (a >= count || b >= count) throw Error("Normal transport index is out of range");
        graph[a].add(b);
        graph[b].add(a);
      }
    neighbors = graph;
  }
  const output = new Float32Array(positions.length);
  for (let vertex = 0; vertex < count; vertex++) {
    const i = vertex * 3;
    let nx = guideNormals[i],
      ny = guideNormals[i + 1],
      nz = guideNormals[i + 2];
    const guideLength = Math.hypot(nx, ny, nz);
    if (guideLength > 1e-12) {
      nx /= guideLength;
      ny /= guideLength;
      nz /= guideLength;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    let tx = Math.abs(ny) < 0.9 ? nz : 0;
    let ty = Math.abs(ny) < 0.9 ? 0 : -nz;
    let tz = Math.abs(ny) < 0.9 ? -nx : ny;
    const tangentLength = Math.hypot(tx, ty, tz);
    tx /= tangentLength;
    ty /= tangentLength;
    tz /= tangentLength;
    const bx = ny * tz - nz * ty,
      by = nz * tx - nx * tz,
      bz = nx * ty - ny * tx;
    const dx = deformedPositions[i] - positions[i];
    const dy = deformedPositions[i + 1] - positions[i + 1];
    const dz = deformedPositions[i + 2] - positions[i + 2];
    let uu = 0,
      uv = 0,
      vv = 0,
      ux = 0,
      uy = 0,
      uz = 0,
      vx = 0,
      vy = 0,
      vz = 0;
    for (const neighbor of neighbors[vertex]) {
      const j = neighbor * 3;
      const ex = positions[j] - positions[i],
        ey = positions[j + 1] - positions[i + 1],
        ez = positions[j + 2] - positions[i + 2];
      const lengthSquared = ex * ex + ey * ey + ez * ez;
      if (lengthSquared < 1e-20) continue;
      const weight = 1 / lengthSquared,
        u = ex * tx + ey * ty + ez * tz,
        v = ex * bx + ey * by + ez * bz;
      const qx = deformedPositions[j] - positions[j] - dx;
      const qy = deformedPositions[j + 1] - positions[j + 1] - dy;
      const qz = deformedPositions[j + 2] - positions[j + 2] - dz;
      uu += weight * u * u;
      uv += weight * u * v;
      vv += weight * v * v;
      ux += weight * u * qx;
      uy += weight * u * qy;
      uz += weight * u * qz;
      vx += weight * v * qx;
      vy += weight * v * qy;
      vz += weight * v * qz;
    }
    const determinant = uu * vv - uv * uv,
      trace = uu + vv;
    if (determinant > trace * trace * 1e-10) {
      const ax = tx + (vv * ux - uv * vx) / determinant;
      const ay = ty + (vv * uy - uv * vy) / determinant;
      const az = tz + (vv * uz - uv * vz) / determinant;
      const cx = bx + (uu * vx - uv * ux) / determinant;
      const cy = by + (uu * vy - uv * uy) / determinant;
      const cz = bz + (uu * vz - uv * uz) / determinant;
      const ox = ay * cz - az * cy,
        oy = az * cx - ax * cz,
        oz = ax * cy - ay * cx;
      const length = Math.hypot(ox, oy, oz);
      if (Number.isFinite(length) && length > 1e-12) {
        nx = ox / length;
        ny = oy / length;
        nz = oz / length;
      }
    }
    output[i] = nx;
    output[i + 1] = ny;
    output[i + 2] = nz;
  }
  return output;
}
