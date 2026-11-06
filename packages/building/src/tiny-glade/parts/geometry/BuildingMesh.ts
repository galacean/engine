import { ModelMesh, Vector2, Vector3 } from "@galacean/engine";
import type { BuildingAlgorithmContext } from "../BuildingAlgorithms";
import { cross, subtract, unit, type BuildingPoint } from "../BuildingLayout";

/** Small geometry writer shared by generators. CPU data remains available for Surface and static batching. */
export class BuildingMeshWriter {
  readonly positions: Vector3[] = [];
  readonly normals: Vector3[] = [];
  readonly uvs: Vector2[] = [];
  readonly indices: number[] = [];
  quad(a: BuildingPoint, b: BuildingPoint, c: BuildingPoint, d: BuildingPoint, uv?: [number, number][]): void {
    const n = unit(cross(subtract(b, a), subtract(d, a))),
      start = this.positions.length;
    [a, b, c, d].forEach((p, i) => {
      this.positions.push(new Vector3(...p));
      this.normals.push(new Vector3(...n));
      this.uvs.push(
        new Vector2(
          ...(uv?.[i] ??
            ([
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1]
            ][i] as [number, number]))
        )
      );
    });
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number): void {
    if (Math.min(w, h, d) <= 1e-8) return;
    const l = x - w / 2,
      r = x + w / 2,
      b = y - h / 2,
      t = y + h / 2,
      f = z + d / 2,
      k = z - d / 2;
    this.quad([l, b, f], [r, b, f], [r, t, f], [l, t, f]);
    this.quad([r, b, k], [l, b, k], [l, t, k], [r, t, k]);
    this.quad([r, b, f], [r, b, k], [r, t, k], [r, t, f]);
    this.quad([l, b, k], [l, b, f], [l, t, f], [l, t, k]);
    this.quad([l, t, f], [r, t, f], [r, t, k], [l, t, k]);
    this.quad([l, b, k], [r, b, k], [r, b, f], [l, b, f]);
  }
  mesh(context: BuildingAlgorithmContext, name: string): ModelMesh {
    if (!this.indices.length) throw Error("Generated geometry is empty");
    const mesh = context.own(new ModelMesh(context.entity.engine, name));
    mesh.setPositions(this.positions);
    mesh.setNormals(this.normals);
    mesh.setUVs(this.uvs);
    mesh.setIndices(new Uint32Array(this.indices));
    mesh.addSubMesh(0, this.indices.length);
    const min = mesh.bounds.min,
      max = mesh.bounds.max;
    min.set(Infinity, Infinity, Infinity);
    max.set(-Infinity, -Infinity, -Infinity);
    for (const p of this.positions) {
      Vector3.min(min, p, min);
      Vector3.max(max, p, max);
    }
    mesh.uploadData(false);
    return mesh;
  }
}
