/** Read a Boolean exterior without re-smoothing authored faces across new cuts.
 * Property layout: position.xyz, normal.xyz, surface coverage/role.
 * New planar caps get one exact normal and their own vertices; original surfaces
 * retain interpolated source normals, transformed by Manifold into solid space.
 */
export function readSolidSurface(solid, originalIDs) {
  const mesh = solid.getMesh(0);
  const positions = [],
    normals = [],
    surfaceRoles = [],
    indices = [],
    sourceIDs = [];
  const vertices = new Map();
  for (let run = 0; run < mesh.runOriginalID.length; run++) {
    const source = mesh.runOriginalID[run],
      cap = !originalIDs.has(source);
    for (let t = mesh.runIndex[run]; t < mesh.runIndex[run + 1]; t += 3) {
      const ids = Array.from(mesh.triVerts.subarray(t, t + 3));
      const points = ids.map((v) => mesh.vertProperties.subarray(v * mesh.numProp, v * mesh.numProp + 3));
      const u = points[1].map((x, k) => x - points[0][k]),
        v = points[2].map((x, k) => x - points[0][k]);
      const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...face);
      if (length < 1e-12) continue;
      const flat = face.map((x) => x / length);
      for (let corner = 0; corner < 3; corner++) {
        const id = ids[corner],
          offset = id * mesh.numProp;
        const key = `${id}/${cap ? source : "source"}`;
        let out = vertices.get(key);
        if (out === undefined) {
          out = positions.length / 3;
          vertices.set(key, out);
          positions.push(...points[corner]);
          const normal = cap ? flat : Array.from(mesh.vertProperties.subarray(offset + 3, offset + 6));
          const norm = Math.hypot(...normal);
          normals.push(...(norm > 1e-8 ? normal.map((x) => x / norm) : flat));
          surfaceRoles.push(cap ? 0 : mesh.vertProperties[offset + 6]);
        }
        indices.push(out);
      }
      sourceIDs.push(source);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    surfaceRoles: new Float32Array(surfaceRoles),
    indices: new Uint32Array(indices),
    sourceIDs: new Uint32Array(sourceIDs)
  };
}
