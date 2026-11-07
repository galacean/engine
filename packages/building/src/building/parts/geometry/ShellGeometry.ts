import { buildingGeometryAlgorithms } from "../BuildingAlgorithms";
import { buildingSupportAlgorithms } from "../BuildingAlgorithms";
import { BuildingPath, positive, type BuildingPoint } from "../BuildingLayout";
import { BuildingMeshWriter } from "./BuildingMesh";
export interface ShellParameters {
  width: number;
  length: number;
  rise: number;
  thickness: number;
  segments?: number;
}
export function validateShell(p: ShellParameters): number {
  [p.width, p.length, p.rise, p.thickness].forEach((v) => positive(v, "Shell dimension"));
  const n = p.segments ?? 24;
  if (!Number.isInteger(n) || n < 2 || n > 128) throw Error("Shell segments must be an integer from 2 to 128");
  return n;
}
/** Open arch shell, not an architectural reconstruction of the Sydney Opera House. */
export function shellPoint(p: ShellParameters, u: number, v: number): BuildingPoint {
  return [(u - 0.5) * p.width, Math.sin(Math.PI * u) * p.rise * (1 - 0.25 * v), (v - 0.5) * p.length];
}
export const shellGeometry = buildingGeometryAlgorithms.register("archShell", (p: ShellParameters, context) => {
  const n = validateShell(p),
    g = new BuildingMeshWriter();
  const inner = (a: BuildingPoint): BuildingPoint => [a[0], a[1] - p.thickness, a[2]];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u = i / n,
        v = j / n,
        u1 = (i + 1) / n,
        v1 = (j + 1) / n;
      const a = shellPoint(p, u, v),
        b = shellPoint(p, u, v1),
        c = shellPoint(p, u1, v1),
        d = shellPoint(p, u1, v);
      g.quad(a, b, c, d, [
        [u * p.width, v * p.length],
        [u * p.width, v1 * p.length],
        [u1 * p.width, v1 * p.length],
        [u1 * p.width, v * p.length]
      ]);
    }
  // Outer surface stays submesh 0 so its UV chart has no overlapping inner/edge UVs.
  const outerCount = g.indices.length;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = inner(shellPoint(p, i / n, j / n)),
        b = inner(shellPoint(p, (i + 1) / n, j / n)),
        c = inner(shellPoint(p, (i + 1) / n, (j + 1) / n)),
        d = inner(shellPoint(p, i / n, (j + 1) / n));
      g.quad(a, b, c, d);
    }
  const edge = (a: BuildingPoint, b: BuildingPoint) => g.quad(a, inner(a), inner(b), b);
  for (let i = 0; i < n; i++) {
    edge(shellPoint(p, (i + 1) / n, 0), shellPoint(p, i / n, 0));
    edge(shellPoint(p, i / n, 1), shellPoint(p, (i + 1) / n, 1));
    edge(shellPoint(p, 0, i / n), shellPoint(p, 0, (i + 1) / n));
    edge(shellPoint(p, 1, (i + 1) / n), shellPoint(p, 1, i / n));
  }
  const mesh = g.mesh(context, "Arch shell");
  mesh.clearSubMesh();
  mesh.addSubMesh(0, outerCount);
  mesh.addSubMesh(outerCount, g.indices.length - outerCount);
  return mesh;
});
export const shellEdge = buildingSupportAlgorithms.register("shellEdge", (p: ShellParameters) => {
  const n = validateShell(p);
  return {
    type: "path",
    path: new BuildingPath(
      Array.from({ length: n + 1 }, (_, i) => shellPoint(p, i / n, 0)),
      false
    )
  };
});
