import { generateMerlonWall } from "./RecoveredWallLayout";
import type { BoundaryPlacementUnit } from "./BoundaryPlacement";

/** A metric course arrangement; no building, mesh, shader or world transform.
 * The recovered mode-1 kernel owns rows, empty slots, seed ordering and shape
 * variation. Geometry adapters subsequently map this chart to a line/curve.
 */
export function boundaryCourses(
  length: number,
  height: number,
  unit: BoundaryPlacementUnit,
  seed: number,
  minimumY = 0
) {
  const result = generateMerlonWall(
    {
      id: "boundary",
      slot: 0,
      curve: {
        pointsXZ: [
          [0, 0],
          [length, 0]
        ],
        knots: [0, 1],
        length
      },
      top: [height, height],
      bottom: [0, 0],
      third: [0, 0],
      seed: BigInt(seed),
      parameters: [0, 0, 0, 1, 1],
      mode: 1,
      roof: { height, ranges: [0, 0, 1, 1], kind: 2 },
      widthExtension: false,
      scaleThickness: false,
      extendTop: false,
      holes: [],
      holeLength: length,
      holesClosed: false,
      unitScale: { width: (unit.width ?? 0.46) / 0.46, height: unit.height / 0.46, depth: unit.depth / 0.56 }
    },
    undefined,
    minimumY
  );
  const topRow = result.rows.length - 1;
  return {
    topMinY: result.rows[topRow].y0 * height,
    courses: result.instances.map((instance, piece) => {
      const d = new DataView(instance.domain96.buffer, instance.domain96.byteOffset, 96);
      const y = d.getFloat32(40, true),
        h = d.getFloat32(16, true);
      return {
        piece,
        row: instance.row,
        column: instance.column,
        upper: instance.row === topRow,
        u0: Math.max(0, d.getFloat32(84, true) / length),
        u1: Math.min(1, d.getFloat32(88, true) / length),
        minY: y - h / 2,
        maxY: y + h / 2,
        depth: d.getFloat32(32, true),
        deformation: [48, 52, 56, 60].map((offset) => d.getFloat32(offset, true)),
        flags: d.getUint32(92, true),
        seed: instance.sourceId
      };
    })
  };
}
