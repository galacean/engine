import { insetMaterialSpan } from "./ConstructionCell";
import { unitFootprintScale } from "./MaterialFootprint";
import { resolvedArrangement, type MasonryBinding } from "./MasonryDocument";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { TerrainHeight } from "./PublishedWallProfile";
/** Strip geometry -> placements. Materials never decide the placement sequence.
 * Host enclosure rules, not a claim of recovered native fence implementation. */
export function enclosureCells(b: ConstructionBuilding, terrain: TerrainHeight, binding?: MasonryBinding) {
  if (!b.kind || !b.rectangle) throw Error("Rectangular enclosure required");
  const {
    center: [cx, cz],
    size: [length, depth],
    rotation
  } = b.rectangle;
  const c = Math.cos(rotation),
    s = Math.sin(rotation),
    cells: any[] = [];
  const point = (x: number): [number, number] => [cx + c * x, cz + s * x];
  const add = (id: string, x: number, y: number, w: number, h: number, d: number, u: number, v: number) => {
    const [wx, wz] = point(x);
    cells.push({
      id: b.id + "/" + id,
      logical_id: b.id + "/" + id,
      anchor_uv: [u, v],
      center: [wx, y, wz],
      tangent: [c, 0, s],
      bitangent: [0, 1, 0],
      normal: [-s, 0, c],
      size: [w, h, d]
    });
  };
  const rule = binding ? resolvedArrangement(binding) : b.kind === "wall" ? "staggered_rows" : "posts_and_rails";
  const scale = unitFootprintScale(binding?.footprint);
  if (rule !== "posts_and_rails") {
    const rowHeight =
        rule === "parallel_rows"
          ? b.height * scale.height
          : rule === "horizontal_rows"
            ? 0.3944 * scale.height
            : (binding?.footprint.height ?? 0.25),
      width =
        rule === "parallel_rows"
          ? 0.22 * scale.width
          : rule === "horizontal_rows"
            ? 1.4 * scale.width
            : (binding?.footprint.width ?? 0.55),
      rows = Math.max(1, Math.ceil(b.height / rowHeight));
    for (let row = 0; row < rows; row++) {
      const h = Math.min(rowHeight * (rule === "overlap_rows" ? 1.15 : 1), b.height - row * rowHeight);
      for (let col = -1; col < Math.ceil(length / width) + 1; col++) {
        const a = Math.max(
            -length / 2,
            -length / 2 + (col + (rule === "staggered_rows" || rule === "overlap_rows" ? row % 2 : 0) * 0.5) * width
          ),
          z = Math.min(
            length / 2,
            -length / 2 + (col + 1 + (rule === "staggered_rows" || rule === "overlap_rows" ? row % 2 : 0) * 0.5) * width
          );
        if (z <= a) continue;
        const x = (a + z) / 2,
          [wx, wz] = point(x);
        add(
          `row-${row}/${col}`,
          x,
          terrain(wx, wz) + row * rowHeight + h / 2,
          insetMaterialSpan(z - a, 0.012),
          insetMaterialSpan(h, 0.012),
          depth * scale.depth,
          (x + length / 2) / length,
          (row + 0.5) / rows
        );
      }
    }
    // Coping follows the same strip, independently of the wall surface units.
  } else {
    const spans = Math.max(1, Math.ceil(length / (1.6 * scale.width))),
      spacing = length / spans,
      post = Math.min(0.16, depth);
    for (let i = 0; i <= spans; i++) {
      const x = -length / 2 + i * spacing,
        [wx, wz] = point(x);
      add(
        `post-${i}`,
        x,
        terrain(wx, wz) + b.height / 2,
        post * scale.width,
        b.height,
        post * scale.depth,
        i / spans,
        0.5
      );
    }
    // Each short rail follows its local ground sample; upright posts stay vertical.
    for (let i = 0; i < spans; i++)
      for (let j = 0; j < 2; j++) {
        const x = -length / 2 + (i + 0.5) * spacing,
          [wx, wz] = point(x);
        const a = point(x - spacing / 2),
          z = point(x + spacing / 2),
          ya = terrain(...a),
          yz = terrain(...z),
          rise = yz - ya,
          railLength = Math.hypot(spacing, rise);
        add(
          `rail-${i}/${j}`,
          x,
          (ya + yz) / 2 + b.height * (j === 0 ? 0.35 : 0.78),
          railLength,
          0.11 * scale.height,
          Math.min(0.1, depth) * scale.depth,
          (i + 0.5) / spans,
          j === 0 ? 0.35 : 0.78
        );
        const cell = cells.at(-1)!;
        cell.tangent = [(c * spacing) / railLength, rise / railLength, (s * spacing) / railLength];
        cell.bitangent = [(-c * rise) / railLength, spacing / railLength, (-s * rise) / railLength];
      }
  }
  return cells;
}
