export interface BeveledBrickGeometryData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly isBevel: Float32Array;
  readonly indices: Uint16Array;
  readonly vertexCount: number;
  readonly indexCount: number;
}

/**
 * Generates a closed, outward-wound (CCW) 44-triangle chamfered unit brick in [-0.5, +0.5]^3
 * matching the native brick.mesh attribute ABI (Vertex_Position, Vertex_Normal, is_bevel)
 * and flat-face bevel inset (~0.10).
 *
 * Bevel strips and corner caps use smoothly interpolated vertex normals (matching brick.mesh's
 * rounded edge shading) while keeping CullMode.Back and full hardware Early-Z (no gl_FragDepth).
 */
export function buildBeveledBrickGeometry(inset = 0.1): BeveledBrickGeometryData {
  const h = 0.5;
  const a = h - Math.max(0.01, Math.min(0.2, inset));

  const pos: number[] = [];
  const norm: number[] = [];
  const bev: number[] = [];
  const idx: number[] = [];

  const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
    const len = Math.hypot(x, y, z) || 1;
    return [x / len, y / len, z / len];
  };

  const pushVertex = (p: readonly [number, number, number], n: readonly [number, number, number], isBevel: number) => {
    const id = pos.length / 3;
    pos.push(p[0], p[1], p[2]);
    norm.push(n[0], n[1], n[2]);
    bev.push(isBevel);
    return id;
  };

  const pushTri = (
    p0: readonly [number, number, number],
    p1: readonly [number, number, number],
    p2: readonly [number, number, number],
    n0: readonly [number, number, number],
    n1: readonly [number, number, number],
    n2: readonly [number, number, number],
    outwardRef: readonly [number, number, number],
    isBevel: number
  ) => {
    const ax = p1[0] - p0[0],
      ay = p1[1] - p0[1],
      az = p1[2] - p0[2];
    const bx = p2[0] - p0[0],
      by = p2[1] - p0[1],
      bz = p2[2] - p0[2];
    const cx = ay * bz - az * by,
      cy = az * bx - ax * bz,
      cz = ax * by - ay * bx;
    const flip = cx * outwardRef[0] + cy * outwardRef[1] + cz * outwardRef[2] < 0;
    const i0 = pushVertex(p0, n0, isBevel);
    const i1 = pushVertex(p1, n1, isBevel);
    const i2 = pushVertex(p2, n2, isBevel);
    if (flip) idx.push(i0, i2, i1);
    else idx.push(i0, i1, i2);
  };

  const pushQuad = (
    p0: readonly [number, number, number],
    p1: readonly [number, number, number],
    p2: readonly [number, number, number],
    p3: readonly [number, number, number],
    n0: readonly [number, number, number],
    n1: readonly [number, number, number],
    n2: readonly [number, number, number],
    n3: readonly [number, number, number],
    outwardRef: readonly [number, number, number],
    isBevel: number
  ) => {
    const ax = p1[0] - p0[0],
      ay = p1[1] - p0[1],
      az = p1[2] - p0[2];
    const bx = p2[0] - p0[0],
      by = p2[1] - p0[1],
      bz = p2[2] - p0[2];
    const cx = ay * bz - az * by,
      cy = az * bx - ax * bz,
      cz = ax * by - ay * bx;
    const flip = cx * outwardRef[0] + cy * outwardRef[1] + cz * outwardRef[2] < 0;
    const i0 = pushVertex(p0, n0, isBevel);
    const i1 = pushVertex(p1, n1, isBevel);
    const i2 = pushVertex(p2, n2, isBevel);
    const i3 = pushVertex(p3, n3, isBevel);
    if (flip) {
      idx.push(i0, i2, i1, i0, i3, i2);
    } else {
      idx.push(i0, i1, i2, i0, i2, i3);
    }
  };

  // 1. Six flat faces (12 triangles, isBevel = 0)
  for (const s of [-1, 1] as const) {
    const nx: [number, number, number] = [s, 0, 0];
    pushQuad([s * h, -a, -a], [s * h, a, -a], [s * h, a, a], [s * h, -a, a], nx, nx, nx, nx, nx, 0);
    const ny: [number, number, number] = [0, s, 0];
    pushQuad([-a, s * h, -a], [-a, s * h, a], [a, s * h, a], [a, s * h, -a], ny, ny, ny, ny, ny, 0);
    const nz: [number, number, number] = [0, 0, s];
    pushQuad([-a, -a, s * h], [a, -a, s * h], [a, a, s * h], [-a, a, s * h], nz, nz, nz, nz, nz, 0);
  }

  // 2. Twelve beveled edge strips (24 triangles, isBevel = 1) with smooth edge normals
  // Matching brick.mesh's ~0.92 / 0.38 smooth bevel normal transition across each adjacent face.
  const wMaj = 0.92;
  const wMin = 0.39;
  for (const s1 of [-1, 1] as const) {
    for (const s2 of [-1, 1] as const) {
      // Edges parallel to Z (between ±X and ±Y)
      const nXY_x = normalize3(s1 * wMaj, s2 * wMin, 0);
      const nXY_y = normalize3(s1 * wMin, s2 * wMaj, 0);
      const refXY = normalize3(s1, s2, 0);
      pushQuad(
        [s1 * h, s2 * a, -a],
        [s1 * h, s2 * a, a],
        [s1 * a, s2 * h, a],
        [s1 * a, s2 * h, -a],
        nXY_x,
        nXY_x,
        nXY_y,
        nXY_y,
        refXY,
        1
      );
      // Edges parallel to Y (between ±X and ±Z)
      const nXZ_x = normalize3(s1 * wMaj, 0, s2 * wMin);
      const nXZ_z = normalize3(s1 * wMin, 0, s2 * wMaj);
      const refXZ = normalize3(s1, 0, s2);
      pushQuad(
        [s1 * h, -a, s2 * a],
        [s1 * h, a, s2 * a],
        [s1 * a, a, s2 * h],
        [s1 * a, -a, s2 * h],
        nXZ_x,
        nXZ_x,
        nXZ_z,
        nXZ_z,
        refXZ,
        1
      );
      // Edges parallel to X (between ±Y and ±Z)
      const nYZ_y = normalize3(0, s1 * wMaj, s2 * wMin);
      const nYZ_z = normalize3(0, s1 * wMin, s2 * wMaj);
      const refYZ = normalize3(0, s1, s2);
      pushQuad(
        [-a, s1 * h, s2 * a],
        [a, s1 * h, s2 * a],
        [a, s1 * a, s2 * h],
        [-a, s1 * a, s2 * h],
        nYZ_y,
        nYZ_y,
        nYZ_z,
        nYZ_z,
        refYZ,
        1
      );
    }
  }

  // 3. Eight beveled corner triangles (8 triangles, isBevel = 1) with smooth vertex normals
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const refC = normalize3(sx, sy, sz);
        const nCx = normalize3(sx * 0.9, sy * 0.3, sz * 0.3);
        const nCy = normalize3(sx * 0.3, sy * 0.9, sz * 0.3);
        const nCz = normalize3(sx * 0.3, sy * 0.3, sz * 0.9);
        pushTri([sx * h, sy * a, sz * a], [sx * a, sy * h, sz * a], [sx * a, sy * a, sz * h], nCx, nCy, nCz, refC, 1);
      }
    }
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(norm),
    isBevel: new Float32Array(bev),
    indices: new Uint16Array(idx),
    vertexCount: pos.length / 3,
    indexCount: idx.length
  };
}
