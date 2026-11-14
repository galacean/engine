import { requireConstructionStoneMesh, type ConstructionStoneGeometry } from "./ConstructionGeometryAssets";
import type { ConstructionDecorationStone } from "./ConstructionDecorations";

/** Conservative bounds for the original pre-noise warp. Runs only at geometry
 * publication, not per frame. Original bbx_x can extrapolate beyond [0,1]. */
export function decorationStoneBounds(
  geometry: ConstructionStoneGeometry | undefined,
  stone: ConstructionDecorationStone
) {
  const mesh = requireConstructionStoneMesh(geometry, stone.template);
  const { instance } = stone,
    scale = stone.geometryScale ?? [1, 1, 1];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = mesh.positions.slice(i, i + 3).map((v, axis) => v * scale[axis]);
    let world: number[];
    if ((instance.flags & 4) !== 0) {
      world = [0, 1, 2].map(
        (axis) =>
          instance.xform[9 + axis] +
          instance.xform[axis] * p[0] +
          instance.xform[3 + axis] * p[1] +
          instance.xform[6 + axis] * p[2]
      );
    } else {
      const bbx = mesh.bbx?.[i / 3];
      if (!Number.isFinite(bbx)) throw Error("Missing authored Gothic bbx_x");
      const side = bbx! < 0.5 ? 0 : 1,
        t = bbx! < 0.5 ? bbx! * 2 : (bbx! - 0.5) * 2;
      const q = Math.max(0, Math.min(1, t)),
        a = instance.bones[side],
        b = instance.bones[side + 1];
      const nx = a.normalXZ[0] + q * (b.normalXZ[0] - a.normalXZ[0]);
      const nz = a.normalXZ[1] + q * (b.normalXZ[1] - a.normalXZ[1]);
      const length = Math.hypot(nx, nz);
      if (!(length > 0)) throw Error("Gothic attachment normals cancel");
      world = [
        a.position[0] + t * (b.position[0] - a.position[0]) + (nx / length) * p[2],
        a.position[1] + q * (b.position[1] - a.position[1]) + p[1],
        a.position[2] + t * (b.position[2] - a.position[2]) + (nz / length) * p[2]
      ];
    }
    for (let axis = 0; axis < 3; axis++) {
      // Native XZ noise is +/- .03. Extra allowance covers packed half normals
      // and f32 GPU arithmetic at ordinary scene scales; Y is not noise-warped.
      const margin = axis === 1 ? 0.0001 : 0.031 + Math.abs(p[2]) * 0.002;
      bounds.min[axis] = Math.min(bounds.min[axis], world[axis] - margin);
      bounds.max[axis] = Math.max(bounds.max[axis], world[axis] + margin);
    }
  }
  return bounds;
}
