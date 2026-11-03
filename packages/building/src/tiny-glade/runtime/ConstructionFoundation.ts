import { constructionWallOutlinePoint, type ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import { supportShapeFrame } from "./ConstructionSupportFrame";
import type { WallConnectionShape } from "./WallConnectionTypes";
import { samplePublishedWallPath, type TerrainHeight } from "./PublishedWallProfile";
import { constructionSupport, type SupportCell, type SupportFace } from "./PlacementSupport";
import type { MaterialUnit } from "./MasonryDocument";
import { unitFootprintScale, type MaterialFootprint } from "./MaterialFootprint";
/** Host adaptation of native elevation supports: the placement-center ground is
 * the reference, not the highest perimeter point. Zero means continuous contact,
 * even on negative terrain. Positive values raise the lower boundary; individual
 * terrain samples may still exceed it. This datum is independent of materials. */
export function resolveConstructionFoundation(input: {
  shape: WallConnectionShape;
  height: number;
  terrain: TerrainHeight;
  hostTerrain?: boolean;
}) {
  if (!Number.isFinite(input.height) || input.height < 0) throw Error("Nonnegative foundation height required");
  const profile = samplePublishedWallPath(input.shape, input.terrain, 0, input.hostTerrain ?? true);
  let bottomY = Infinity,
    maxY = -Infinity;
  for (const p of profile.points) {
    bottomY = Math.min(bottomY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const referenceY = input.terrain(input.shape.center[0], input.shape.center[1]);
  if (!Number.isFinite(referenceY)) throw Error("Nonfinite building placement height");
  return { profile, topY: referenceY + input.height, bottomY, maxGround: maxY, referenceY };
}
export type ConstructionFoundationContact = ReturnType<typeof resolveConstructionFoundation>;
export interface ConstructionFoundationInput {
  wallEnvelope?: ConstructionWallEnvelope;
  id: string;
  shape: WallConnectionShape;
  height: number;
  terrain: TerrainHeight;
  material?: MaterialUnit;
  footprint?: MaterialFootprint;
  seed?: number;
  rule?: "grid" | "staggered_rows" | "horizontal_rows" | "parallel_rows" | "overlap_rows";
  mode?: "auto" | "pillars" | "solid";
  contact?: ConstructionFoundationContact;
  /** Published neighboring wall volumes; hidden supports must not pierce them. */
  neighbors?: readonly { shape: WallConnectionShape; bottomY: number; topY: number }[];
}
/** Explicit host foundation component. The recovered native ground-profile sampler
 * is reused; an independently authored height and level top are Seed World policy,
 * not a claim that Tiny Glade stores this exact foundation authoring component.
 * Foundation rows are globally level; only their lowest cells follow terrain.
 */
function unitPhase(seed = 0): number {
  if (!Number.isSafeInteger(seed) || seed < 0) throw Error("Nonnegative support unit seed required");
  if (seed === 0) return 0;
  let h = seed % 4294967296 >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function buildConstructionFoundation(input: ConstructionFoundationInput) {
  const { id, shape, height } = input;
  if (!id || !Number.isFinite(height) || height < 0)
    throw Error("Nonnegative foundation height and stable identity required");
  const contact = input.contact ?? resolveConstructionFoundation(input);
  // Zero is a semantic state, not a clearance test: the wall itself reaches
  // terrain. Do not publish a slab or any supports, even on a steep slope.
  if (height === 0)
    return {
      ...constructionSupport(id, input.material ?? "brick", []),
      ...contact,
      cells: [] as SupportCell[],
      pillars: [],
      rule: input.rule ?? "staggered_rows",
      connection_cells: [] as SupportCell[]
    };
  if (input.mode !== "solid") return buildPillarFoundation(input, contact);
  const { profile, topY, bottomY } = contact,
    points = input.wallEnvelope
      ? profile.points.map((p) => {
          const q = constructionWallOutlinePoint(shape, p, input.wallEnvelope!.finishOuter);
          const ground = input.terrain(q[0], q[2]);
          if (!Number.isFinite(ground)) throw Error("Nonfinite foundation outline terrain");
          return [p[0], Math.min(p[1], ground), p[2]] as [number, number, number];
        })
      : profile.points;
  const cells: SupportCell[] = [],
    faces: SupportFace[] = [];
  const scale = unitFootprintScale(input.footprint);
  const rule = input.rule ?? "staggered_rows",
    pitch = (rule === "parallel_rows" ? 0.22 : rule === "horizontal_rows" ? 1.4 : 0.5) * scale.width,
    rowHeight = (rule === "parallel_rows" ? topY - bottomY : rule === "horizontal_rows" ? 0.3944 : 0.25) * scale.height;
  let u = 0;
  for (let edge = 1; edge < points.length; edge++) {
    const a = points[edge - 1],
      b = points[edge],
      length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length <= 1e-8) continue;
    const tx = (b[0] - a[0]) / length,
      tz = (b[2] - a[2]) / length;
    // Only the exposed part of this edge belongs to the solid base. A slope
    // crossing the elevation plane must produce a triangle, never an inverted quad.
    let left = a,
      right = b;
    if (a[1] >= topY && b[1] >= topY) {
      u += length;
      continue;
    }
    if (a[1] > topY || b[1] > topY) {
      const t = (topY - a[1]) / (b[1] - a[1]);
      const crossing: [number, number, number] = [a[0] + (b[0] - a[0]) * t, topY, a[2] + (b[2] - a[2]) * t];
      if (a[1] > topY) left = crossing;
      else right = crossing;
    }
    const leftU = u + Math.hypot(left[0] - a[0], left[2] - a[2]),
      rightU = u + Math.hypot(right[0] - a[0], right[2] - a[2]);
    const facePoints = [left, right],
      faceUV = [
        [leftU, left[1] - bottomY],
        [rightU, right[1] - bottomY]
      ];
    if (right[1] < topY) {
      facePoints.push([right[0], topY, right[2]]);
      faceUV.push([rightU, topY - bottomY]);
    }
    if (left[1] < topY) {
      facePoints.push([left[0], topY, left[2]]);
      faceUV.push([leftU, topY - bottomY]);
    }
    faces.push({
      points: input.wallEnvelope
        ? facePoints.map((p) => constructionWallOutlinePoint(shape, p, input.wallEnvelope!.finishOuter))
        : facePoints,
      uv: faceUV
    });
    const rows = Math.ceil((topY - Math.min(a[1], b[1])) / rowHeight);
    for (let row = 0; row < rows; row++) {
      const y1 = topY - row * rowHeight,
        offset =
          (unitPhase(input.seed) + (rule === "staggered_rows" || rule === "overlap_rows" ? (row % 2) * 0.5 : 0)) % 1;
      const first = Math.floor(u / pitch - offset),
        last = Math.ceil((u + length) / pitch - offset);
      for (let col = first; col < last; col++) {
        const lo = Math.max(leftU, (col + offset) * pitch),
          hi = Math.min(rightU, (col + offset + 1) * pitch);
        if (hi - lo <= 0.01) continue;
        const t = ((lo + hi) / 2 - u) / length;
        // Bottom extends slightly into the terrain; it never floats over either endpoint.
        const ya = a[1] + ((b[1] - a[1]) * (lo - u)) / length,
          yb = a[1] + ((b[1] - a[1]) * (hi - u)) / length;
        const y0 = Math.max(y1 - rowHeight * (rule === "overlap_rows" ? 1.15 : 1), Math.min(ya, yb) - 0.04);
        if (y1 - y0 <= 0.01) continue;
        const key = `${id}/edge-${edge}/row-${row}/${col}`;
        cells.push({
          id: key,
          logical_id: key,
          surface_id: id,
          anchor_uv: [(lo + hi) / 2, (y0 + y1) / 2 - bottomY],
          center: [a[0] + (b[0] - a[0]) * t, (y0 + y1) / 2, a[2] + (b[2] - a[2]) * t],
          tangent: [tx, 0, tz],
          bitangent: [0, 1, 0],
          normal: [-tz, 0, tx],
          size: [hi - lo, y1 - y0, 2 * (input.wallEnvelope?.finishOuter ?? 0.12 * scale.depth)]
        });
      }
    }
    u += length;
  }
  const cap = points
    .slice(0, -1)
    .map((p) =>
      input.wallEnvelope
        ? constructionWallOutlinePoint(shape, [p[0], topY, p[2]], input.wallEnvelope.finishOuter)
        : [p[0], topY, p[2]]
    );
  for (let i = 0; i < cap.length; i++) {
    const pts = [[shape.center[0], topY, shape.center[1]], cap[i], cap[(i + 1) % cap.length]];
    faces.push({ points: pts, uv: pts.map((p) => [p[0] - shape.center[0], p[2] - shape.center[1]]) });
  }
  return {
    ...constructionSupport(id, input.material ?? "brick", faces),
    profile,
    topY,
    bottomY,
    cells,
    rule,
    connection_cells: [] as SupportCell[]
  };
}

/** Native elevation supports separate a horizontal bottom course from discrete
 * columns. See construct_circle_supports 0x1010a… and rectangle_pillars
 * 0x1010cb0dc. The shared chart/mesh builder below is the host adaptation; it
 * intentionally does not substitute a terrain-following solid skirt for columns.
 */
function buildPillarFoundation(input: ConstructionFoundationInput, contact: ConstructionFoundationContact) {
  const { id, shape, terrain } = input,
    { profile, topY, bottomY } = contact;
  const material = input.material ?? "brick",
    rule = input.rule ?? (material === "wooden_plank" ? "parallel_rows" : "staggered_rows");
  const frame = supportShapeFrame(shape),
    scale = unitFootprintScale(input.footprint);
  const cells: SupportCell[] = [],
    faces: SupportFace[] = [];
  let chartU = 0;
  // Give each face its own stable chart interval. Preview clipping and material
  // units consume the very same UV coordinates, including underside and feet.
  const face = (key: string, points: number[][]) => {
    const a = points[0],
      b = points[1],
      d = points[3];
    const width = Math.hypot(...b.map((v, i) => v - a[i]));
    const height = Math.hypot(...d.map((v, i) => v - a[i]));
    if (width <= 1e-8 || height <= 1e-8) return;
    const tangent = b.map((v, i) => (v - a[i]) / width),
      bitangent = d.map((v, i) => (v - a[i]) / height);
    const normal = [
      tangent[1] * bitangent[2] - tangent[2] * bitangent[1],
      tangent[2] * bitangent[0] - tangent[0] * bitangent[2],
      tangent[0] * bitangent[1] - tangent[1] * bitangent[0]
    ];
    const u = chartU;
    chartU += width;
    faces.push({
      points,
      uv: [
        [u, 0],
        [u + width, 0],
        [u + width, height],
        [u, height]
      ]
    });
    const pitch = (rule === "parallel_rows" ? 0.22 : rule === "horizontal_rows" ? 1.4 : 0.5) * scale.width;
    const rowHeight =
      rule === "parallel_rows" ? height * scale.height : (rule === "horizontal_rows" ? 0.3944 : 0.25) * scale.height;
    for (let row = 0; row < Math.ceil(height / rowHeight); row++) {
      const y0 = row * rowHeight,
        y1 = Math.min(height, (row + (rule === "overlap_rows" ? 1.15 : 1)) * rowHeight);
      const offset =
        (unitPhase(input.seed) + (rule === "staggered_rows" || rule === "overlap_rows" ? (row % 2) * 0.5 : 0)) % 1;
      for (let column = -1; column < Math.ceil(width / pitch); column++) {
        const x0 = Math.max(0, (column + offset) * pitch),
          x1 = Math.min(width, (column + offset + 1) * pitch);
        if (x1 - x0 <= 1e-5 || y1 - y0 <= 1e-5) continue;
        const cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2,
          cellId = `${id}/${key}/${row}/${column}`;
        cells.push({
          id: cellId,
          logical_id: cellId,
          surface_id: id,
          anchor_uv: [u + cx, cy],
          center: a.map((v, i) => v + tangent[i] * cx + bitangent[i] * cy - normal[i] * 0.03),
          tangent,
          bitangent,
          normal,
          size: [x1 - x0, y1 - y0, 0.1 * scale.depth]
        });
      }
    }
  };
  const box = (key: string, x: number, z: number, width: number, y0: number, y1: number) => {
    const corners = [
      [x - width / 2, z - width / 2],
      [x + width / 2, z - width / 2],
      [x + width / 2, z + width / 2],
      [x - width / 2, z + width / 2]
    ];
    for (let side = 0; side < 4; side++) {
      const a = corners[side],
        b = corners[(side + 1) % 4];
      // Clockwise traversal when looking down: left/up normal is exterior.
      face(`${key}/side-${side}`, [
        frame.point(b[0], y0, b[1]),
        frame.point(a[0], y0, a[1]),
        frame.point(a[0], y1, a[1]),
        frame.point(b[0], y1, b[1])
      ]);
    }
    face(`${key}/cap`, [
      frame.point(x - width / 2, y1, z + width / 2),
      frame.point(x + width / 2, y1, z + width / 2),
      frame.point(x + width / 2, y1, z - width / 2),
      frame.point(x - width / 2, y1, z - width / 2)
    ]);
  };
  const slabDepth = 0.24,
    undersideY = topY - slabDepth;
  const ring = profile.points
    .slice(0, -1)
    .map((p) => (input.wallEnvelope ? constructionWallOutlinePoint(shape, p, input.wallEnvelope.finishOuter) : p));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    // Published footprint traverses clockwise in XZ, matching wall frames.
    face(`bearing/edge-${i}`, [
      [a[0], undersideY, a[2]],
      [b[0], undersideY, b[2]],
      [b[0], topY, b[2]],
      [a[0], topY, a[2]]
    ]);
  }
  // Horizontal underside is a real surface: no fake vertical wall between legs.
  const cap = ring.map((p) => [p[0], topY, p[2]]),
    bottom = ring
      .slice()
      .reverse()
      .map((p) => [p[0], undersideY, p[2]]);
  faces.push({
    points: cap,
    uv: cap.map((p) => [chartU + p[0] - shape.center[0] + frame.width / 2, p[2] - shape.center[1] + frame.depth / 2])
  });
  chartU += frame.width;
  faces.push({
    points: bottom,
    uv: bottom.map((p) => [chartU + p[0] - shape.center[0] + frame.width / 2, p[2] - shape.center[1] + frame.depth / 2])
  });
  chartU += frame.width;
  const candidates: number[][] = [];
  const inset = Math.min(0.4, frame.width * 0.15, frame.depth * 0.15);
  if (shape.type === "circle") {
    // Native circle_pillars 0x1010ce7a4–0x1010ce7f0: perimeter fit01
    // over [20,50], interpolate 4..7 and fcvtau (positive ties away).
    const radius = Math.max(0.1, shape.radius - inset),
      count = Math.floor(4 + 3 * Math.min(1, Math.max(0, (Math.PI * 2 * shape.radius - 20) / 30)) + 0.5);
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count;
      candidates.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  } else {
    const w = frame.width / 2 - inset,
      d = frame.depth / 2 - inset;
    const corners = [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d]
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j < n; j++) candidates.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
  }
  const pillars: { id: string; point: number[]; startY: number; endY: number; width: number }[] = [];
  candidates.forEach(([x, z], index) => {
    const point = frame.point(x, 0, z);
    if (
      input.neighbors?.some((neighbor) => {
        if (undersideY < neighbor.bottomY || undersideY > neighbor.topY) return false;
        const other = neighbor.shape,
          dx = point[0] - other.center[0],
          dz = point[2] - other.center[1];
        if (other.type === "circle") return dx * dx + dz * dz < other.radius * other.radius;
        const [c, s] = other.orientation;
        return Math.abs(c * dx + s * dz) < other.width / 2 && Math.abs(-s * dx + c * dz) < other.depth / 2;
      })
    )
      return;
    const ground = terrain(point[0], point[2]);
    if (!Number.isFinite(ground)) throw Error("Nonfinite column contact height");
    if (ground + 0.05 >= undersideY) return;
    const t = Math.min(1, Math.max(0, (undersideY - ground - 5) / 5)),
      smooth = t * t * (3 - 2 * t);
    const width = Math.min(0.7 * (1 + 0.5 * smooth), frame.width * 0.28, frame.depth * 0.28),
      footWidth = width * 1.35;
    // Native find_stone_column_start_y samples all four foot corners, so the
    // lower face reaches ground on the downhill side as well as at its center.
    let startY = ground;
    for (const dx of [-footWidth / 2, footWidth / 2])
      for (const dz of [-footWidth / 2, footWidth / 2]) {
        const p = frame.point(x + dx, 0, z + dz),
          y = terrain(p[0], p[2]);
        if (!Number.isFinite(y)) throw Error("Nonfinite column foot height");
        startY = Math.min(startY, y);
      }
    startY -= 0.04;
    const key = `pillar-${index}`,
      footTop = Math.min(undersideY, startY + 0.18),
      headBottom = Math.max(footTop, undersideY - 0.16);
    box(`${key}/foot`, x, z, footWidth, startY, footTop);
    if (headBottom > footTop) box(`${key}/shaft`, x, z, width, footTop, headBottom);
    if (undersideY > headBottom) box(`${key}/head`, x, z, width * 1.15, headBottom, undersideY);
    pillars.push({ id: `${id}/${key}`, point, startY, endY: undersideY, width });
  });
  return {
    ...constructionSupport(id, material, faces),
    profile,
    topY,
    bottomY,
    cells,
    rule,
    pillars,
    connection_cells: [] as SupportCell[]
  };
}
