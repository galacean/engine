// A small fingerprint of a mesh, to compare a frozen mesh with a new one within a tolerance: its
// size, center and bounds, and the position, normal and uv of four vertices spread through it.
export interface MeshPrint {
  readonly floats: number;
  readonly center: number[];
  readonly min: number[];
  readonly max: number[];
  readonly samples: { readonly position: number[]; readonly normal: number[]; readonly uv: number[] }[];
}
export function meshPrint(mesh: { positions: number[]; normals: number[]; uvs?: number[][] }): MeshPrint {
  const n = mesh.positions.length / 3;
  const center = [0, 0, 0],
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    const k = i % 3,
      v = mesh.positions[i];
    center[k] += v / n;
    min[k] = Math.min(min[k], v);
    max[k] = Math.max(max[k], v);
  }
  const samples = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i) => ({
    position: mesh.positions.slice(i * 3, i * 3 + 3),
    normal: mesh.normals.slice(i * 3, i * 3 + 3),
    uv: [...(mesh.uvs?.[i] ?? [])]
  }));
  return { floats: mesh.positions.length, center, min, max, samples };
}
