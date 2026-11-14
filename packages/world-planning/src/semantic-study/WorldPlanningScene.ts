import { watercourseGeometry } from "@galacean/engine-water/water/index";
import { planningLakeMesh } from "./PlanningLakeMesh";
import { isGlobalRoadSurface, roadSurfaces, roadSurfaceOwners } from "../spatial/layout/RoadTopology";
import { poiRangeOutline } from "./PoiFootprint";
import { planningWaterHeight } from "./WorldPlanningTerrain";
import { planningWhiteboxes } from "./PlanningWhiteboxes";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { V2Mesh, V2Box } from "../spatial/V2Model.ts";
import { triangulatePolygon } from "../geometry/V2Geometry";
import { whiteboxGeometry } from "../geometry/V2WhiteboxGeometry";
import { planningGroundSurface } from "./PlanningHeightmap";
import {
  PLANNING_OBJECT_CSS as palette,
  PLANNING_SURFACE_CSS as surfaces,
  planningColor
} from "./PlanningSurfacePalette";
import { ribbonOutline } from "./WorldRibbon";

/** One selectable published GPU surface; layer and owner match the 2D planning map. */
export interface PlanningScenePart {
  id: string;
  owners?: string[];
  layer: string;
  color: [number, number, number];
  mesh: V2Mesh;
  boxes?: V2Box[];
  lines?: number[];
  selectable?: boolean;
  pickOnly?: boolean;
  selectionOnly?: boolean;
}
const surfaceMeshes = new Map<string, V2Mesh>();
let groundKey = "";
/** Build GPU geometry from the published plan, without regenerating any layout.
 * Every vertex is in metres. The camera never rescales these coordinates.
 */
export function compilePlanningScene(plan: IslandPlan): PlanningScenePart[] {
  const nextGround = JSON.stringify(
    plan.settlementLayout || plan.landformStudy || plan.canyonStudy
      ? [
          plan.parameters,
          plan.parameters.terrainPatches?.length ||
          plan.parameters.worldElevation?.riseM ||
          plan.regionFields?.elevation
            ? plan.buildings
            : null,
          plan.regionFields?.elevation,
          plan.land,
          plan.islands,
          plan.waters,
          plan.bridges,
          plan.planning?.profiles
        ]
      : plan
  );
  if (nextGround !== groundKey) {
    surfaceMeshes.clear();
    groundKey = nextGround;
  }
  const sample = planningGroundSurface(plan).sample,
    roadSample = sample,
    parts: PlanningScenePart[] = [],
    rings = [plan.land, ...plan.islands];
  const surface = (id: string, layer: string, ring: PlanPoint[], color: PlanningScenePart["color"], offset = 0) => {
    if (ring.length < 3) return;
    const key = JSON.stringify([id, layer, offset, ring]);
    let mesh = surfaceMeshes.get(key);
    if (!mesh) {
      mesh = subdividePlanningSurface(
        triangulatePolygon(ring, 0),
        plan.parameters.terrainPatches?.length
          ? 4
          : plan.villageStudy
            ? 4
            : layer === "land"
              ? plan.poiDistribution && plan.waters.length
                ? 8
                : 24
              : 8
      );
      for (let i = 0; i < mesh.positions.length; i += 3)
        mesh.positions[i + 1] =
          (layer === "surface-water"
            ? (planningWaterHeight(plan, id, { x: mesh.positions[i], z: mesh.positions[i + 2] }) ??
              sample({ x: mesh.positions[i], z: mesh.positions[i + 2] }))
            : (layer === "road-world" ? roadSample : sample)({ x: mesh.positions[i], z: mesh.positions[i + 2] })) +
          offset;
      surfaceMeshes.set(key, mesh);
      if (surfaceMeshes.size > 256) surfaceMeshes.delete(surfaceMeshes.keys().next().value!);
    }
    parts.push({ id, layer, color, mesh });
  };
  const line = (
    id: string,
    layer: string,
    points: PlanPoint[],
    color: PlanningScenePart["color"],
    closed = false,
    dashed = false
  ) => {
    if (points.length < 2) return;
    const lines: number[] = [];
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z),
        count = Math.max(1, Math.ceil(length / 6));
      for (let j = 0; j < count; j++) {
        if (dashed && j % 2) continue;
        const u = j / count,
          v = (j + 1) / count,
          pa = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u },
          pb = { x: a.x + (b.x - a.x) * v, z: a.z + (b.z - a.z) * v };
        lines.push(pa.x, sample(pa) + 1, pa.z, pb.x, sample(pb) + 1, pb.z);
      }
    }
    parts.push({ id, layer, color, mesh: { positions: [], indices: [] }, lines });
  };
  const box = (id: string, layer: string, boxes: V2Box[], color: PlanningScenePart["color"]) =>
    parts.push({
      id,
      layer,
      color,
      boxes,
      mesh: whiteboxGeometry(boxes.map((b) => ({ ...b, baseY: b.elevation ?? 0, y: (b.elevation ?? 0) + b.sizeY / 2 })))
    });
  const { width, depth } = plan.parameters;
  parts.push({
    id: "ocean",
    layer: "ocean",
    color: planningColor(palette.ocean),
    mesh: triangulatePolygon(
      [
        { x: -width, z: -depth },
        { x: width * 2, z: -depth },
        { x: width * 2, z: depth * 2 },
        { x: -width, z: depth * 2 }
      ],
      0
    ),
    selectable: false
  });
  // Subdivide the exact coastline triangulation: one terrain surface, no overlapping flat cap.
  for (const [i, ring] of rings.entries())
    surface(i ? `offshore-${i - 1}` : "land-main", "land", ring, planningColor(surfaces.grass));

  for (const r of plan.regions) {
    line(r.id, r.kind === "village" ? "village" : "island", r.outline, planningColor(palette.village), true);
  }

  for (const site of plan.poiDistribution?.sites ?? [])
    if (site.radiusM !== undefined) {
      line(site.id, "poi-range", poiRangeOutline(site), [0.93, 0.64, 0.2], true, true);
      parts[parts.length - 1].selectionOnly = true;
      parts[parts.length - 1].selectable = false;
    }
  // Ground materials come from the alphamap; selected roads add their own matching highlight surface.
  for (const water of plan.waters) {
    const id = plan.poiDistribution ? water.id : (water.systemId ?? water.id),
      color = planningColor(surfaces.water);
    if (water.course?.drops.length) {
      const geometry = watercourseGeometry(water.course);
      for (const path of geometry.paths)
        surface(
          id,
          "surface-water",
          ribbonOutline(
            path,
            path.map((p) => p.width),
            { start: "butt", end: "butt" },
            true
          ),
          color
        );
      for (const drop of geometry.drops) {
        const positions = [drop.upper, drop.lower].flatMap((p) =>
          [-1, 1].flatMap((sign) => [
            p[0] + ((drop.across[0] * drop.width) / 2) * sign,
            p[1],
            p[2] + ((drop.across[1] * drop.width) / 2) * sign
          ])
        );
        parts.push({ id, layer: "surface-water", color, mesh: { positions, indices: [0, 2, 1, 1, 2, 3] } });
      }
    } else if (water.lake) {
      const key = JSON.stringify(["lake-wet", water.id, water.lake, water.outline]);
      let mesh = surfaceMeshes.get(key);
      if (!mesh) {
        mesh = planningLakeMesh(plan, water);
        surfaceMeshes.set(key, mesh);
      }
      parts.push({ id, layer: "surface-water", color, mesh });
    } else surface(id, "surface-water", water.outline, color, 0);
    for (const part of parts)
      if (part.id === id && part.layer === "surface-water") part.pickOnly = !plan.poiDistribution;
  }
  for (const plaza of plan.plazas ?? []) {
    surface(plaza.id, "route", plaza.outline, planningColor(surfaces.soil), 0.14);
    parts[parts.length - 1].selectionOnly = !plan.poiDistribution;
  }
  for (const route of roadSurfaces(plan)) {
    surface(
      route.id,
      plan.poiDistribution ? (isGlobalRoadSurface(plan, route) ? "road-world" : "road-local") : "route",
      route.outline ?? ribbonOutline(route.points, [route.width]),
      planningColor(surfaces.soil),
      0.15
    );
    parts[parts.length - 1].owners = roadSurfaceOwners(plan, route);
    parts[parts.length - 1].selectionOnly = !plan.poiDistribution;
  }
  for (const region of plan.regions)
    if (region.kind === "village") {
      surface(region.id, "village", region.navigationArea ?? region.outline, [0, 0, 0], 0.1);
      parts[parts.length - 1].pickOnly = true;
    }
  for (const mountain of plan.mountains) {
    const rocks = plan.rocks.filter((r) => r.groupId === mountain.id);
    const boxes = rocks.flatMap(
      (r) =>
        r.boxes ?? [
          {
            id: r.id,
            label: r.id,
            center: r.center,
            sizeX: r.width,
            sizeY: r.height,
            sizeZ: r.depth,
            yaw: r.yaw,
            elevation: r.baseHeight ?? 0,
            collision: true,
            occlusion: true
          }
        ]
    );

    for (const ring of mountain.outlines ?? [mountain.outline])
      line(mountain.id, "group", ring, [0.68, 0.25, 0.83], true, true);
    // Wireframes use the same 8 world vertices as each solid.
    const lines: number[] = [];
    for (const b of boxes) {
      const c = Math.cos(b.yaw),
        s = Math.sin(b.yaw),
        pts = Array.from({ length: 8 }, (_, i) => {
          const x = ((i & 1 ? 1 : -1) * b.sizeX) / 2,
            z = ((i & 2 ? 1 : -1) * b.sizeZ) / 2;
          return [b.center.x + c * x - s * z, (b.elevation ?? 0) + (i & 4 ? b.sizeY : 0), b.center.z + s * x + c * z];
        });
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) lines.push(...pts[i], ...pts[i | bit]);
    }
    parts.push({ id: mountain.id, layer: "obb", color: [0, 0.72, 0.8], mesh: { positions: [], indices: [] }, lines });
  }
  for (const part of planningWhiteboxes(plan, sample))
    box(
      part.id,
      part.layer,
      part.boxes,
      planningColor(part.layer === "tree" ? palette.tree : part.layer === "building" ? palette.building : palette.rock)
    );
  for (const b of plan.bridges.filter((b) => b.deckY === undefined))
    surface(b.id, "bridge", ribbonOutline([b.a, b.b], [b.width]), [0.58, 0.42, 0.25], 1.3);
  for (const structure of plan.structures ?? [])
    if (structure.waterDomain)
      line(structure.waterDomain.id, "water", structure.waterDomain.outline, [0.08, 0.5, 0.87], true, true);
  for (const p of plan.villageStudy ? [] : (plan.planning?.ports ?? [])) {
    const building = plan.buildings.find((b) => p.id === b.id + "-door");
    if (building) {
      box(
        building.id,
        "entrance",
        [
          {
            id: p.id,
            label: "建筑门",
            center: p.position,
            sizeX: 0.15,
            sizeZ: building.doorWidthM ?? 1.3,
            sizeY: building.doorHeightM ?? 2.1,
            elevation: building.baseHeight ?? sample(p.position),
            yaw: building.yaw,
            collision: false,
            occlusion: false
          }
        ],
        planningColor(palette.door)
      );
      continue;
    }
    if (p.kind !== "entrance") continue;
    const size = plan.settlementLayout ? 0.35 : 3;
    box(
      p.ownerId,
      p.kind === "entrance" ? "entrance" : "ports",
      [
        {
          id: p.id,
          label: p.id,
          center: p.position,
          sizeX: size,
          sizeZ: size,
          sizeY: size,
          elevation: sample(p.position),
          yaw: 0,
          collision: false,
          occlusion: false
        }
      ],
      planningColor(palette.village)
    );
  }
  for (const r of plan.regions.filter((r) => r.kind === "teleport")) {
    const p = plan.places.find((p) => p.id === r.id)?.center ?? r.outline[0];
    if (p)
      box(
        r.id,
        "teleport",
        [
          {
            id: r.id,
            label: r.label,
            center: p,
            sizeX: 6,
            sizeZ: 6,
            sizeY: 12,
            elevation: sample(p),
            yaw: 0,
            collision: false,
            occlusion: false
          }
        ],
        [0.88, 0.65, 0.16]
      );
  }
  box(
    "spawn",
    "spawn",
    [
      {
        id: "spawn",
        label: "出生点",
        center: plan.spawn,
        sizeX: plan.villageStudy || plan.settlementLayout ? 0.5 : 5,
        sizeZ: plan.villageStudy || plan.settlementLayout ? 0.5 : 5,
        sizeY: plan.villageStudy || plan.settlementLayout ? 1.8 : 6,
        elevation: sample(plan.spawn),
        yaw: 0,
        collision: false,
        occlusion: false
      }
    ],
    [0.13, 0.85, 0.61]
  );
  for (const structure of plan.structures ?? [])
    line(structure.id, "valley", structure.outline, [0.54, 0.27, 0.66], true, true);
  for (const recipe of plan.shapeRecipes ?? [])
    for (const b of recipe.blocks) {
      const angle = (b.yaw * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
      line(
        recipe.id,
        "components",
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ].map(([u, v]) => ({
          x: b.x + ((u * b.width) / 2) * c - ((v * b.length) / 2) * s,
          z: b.z + ((u * b.width) / 2) * s + ((v * b.length) / 2) * c
        })),
        [0.6, 0.29, 0.2],
        true
      );
    }
  line(
    "scale",
    "furniture",
    [
      { x: 0, z: plan.parameters.depth + 30 },
      { x: 100, z: plan.parameters.depth + 30 }
    ],
    [0.1, 0.35, 0.56]
  );
  for (const sight of plan.sights) line("visual", "sight", [sight.from, sight.to], [0.85, 0.33, 0.65]);
  line(
    "world-boundary",
    "boundary",
    [
      { x: 0, z: 0 },
      { x: plan.parameters.width, z: 0 },
      { x: plan.parameters.width, z: plan.parameters.depth },
      { x: 0, z: plan.parameters.depth }
    ],
    [0.14, 0.28, 0.4],
    true
  );
  // Batch diagnostic lines per owner/layer instead of allocating a draw call per rectangle.
  const grouped = new Map<string, PlanningScenePart>(),
    batched: PlanningScenePart[] = [];
  for (const part of parts) {
    if (!part.lines) {
      batched.push(part);
      continue;
    }
    const key = part.id + ":" + part.layer + ":" + part.color.join(",");
    const previous = grouped.get(key);
    if (previous) previous.lines!.push(...part.lines);
    else {
      grouped.set(key, part);
      batched.push(part);
    }
  }
  for (const part of batched) if (part.mesh.indices.length) meshPickBounds(part.mesh);
  return batched;
}
// Published meshes are immutable. Cache bounds per mesh, never per mutable selection/layer.
const pickBounds = new WeakMap<V2Mesh, number[]>();
function meshPickBounds(mesh: V2Mesh): number[] {
  let bounds = pickBounds.get(mesh);
  if (bounds) return bounds;
  bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3)
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[i + axis];
      bounds[axis] = Math.min(bounds[axis], value);
      bounds[axis + 3] = Math.max(bounds[axis + 3], value);
    }
  pickBounds.set(mesh, bounds);
  return bounds;
}
function intersectsPickBounds(
  bounds: number[],
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  nearest: number
): boolean {
  let near = 0,
    far = nearest;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z,
      d = axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
    if (d === 0) {
      if (o < bounds[axis] || o > bounds[axis + 3]) return false;
      continue;
    }
    const a = (bounds[axis] - o) / d,
      b = (bounds[axis + 3] - o) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return true;
}
/** Broad-phase bounds then allocation-free triangle picking, retaining nonselectable occluders. */
export function pickPlanningScene(
  parts: PlanningScenePart[],
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  layers: Record<string, boolean>
): string | null {
  let nearest = Infinity,
    id: string | null = null;
  const dx = direction.x,
    dy = direction.y,
    dz = direction.z;
  for (const part of parts) {
    if (
      layers[part.layer] === false ||
      layers[`object:${part.id}`] === false ||
      !part.mesh.indices.length ||
      !intersectsPickBounds(meshPickBounds(part.mesh), origin, direction, nearest)
    )
      continue;
    const p = part.mesh.positions,
      indices = part.mesh.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const e1x = p[b] - p[a],
        e1y = p[b + 1] - p[a + 1],
        e1z = p[b + 2] - p[a + 2],
        e2x = p[c] - p[a],
        e2y = p[c + 1] - p[a + 1],
        e2z = p[c + 2] - p[a + 2];
      const hx = dy * e2z - dz * e2y,
        hy = dz * e2x - dx * e2z,
        hz = dx * e2y - dy * e2x,
        det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-9) continue;
      const sx = origin.x - p[a],
        sy = origin.y - p[a + 1],
        sz = origin.z - p[a + 2],
        u = (sx * hx + sy * hy + sz * hz) / det;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y,
        qy = sz * e1x - sx * e1z,
        qz = sx * e1y - sy * e1x,
        v = (dx * qx + dy * qy + dz * qz) / det;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (t >= 0 && t < nearest) {
        nearest = t;
        id = part.selectable === false ? null : part.id;
      }
    }
  }
  return id;
}

/** Split long edges before height sampling so roads and water follow the same FBM ground. */
export function subdividePlanningSurface(source: V2Mesh, maxEdge: number): V2Mesh {
  const mesh: V2Mesh = { positions: [...source.positions], indices: [] };
  const midpoints = new Map<string, number>();
  const split = (a: number, b: number, c: number): void => {
    const p = mesh.positions,
      edges: [[number, number, number], [number, number, number], [number, number, number]] = [
        [a, b, c],
        [b, c, a],
        [c, a, b]
      ];
    const lengths = edges.map(([u, v]) => Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 2] - p[v * 3 + 2]));
    const index = lengths.indexOf(Math.max(...lengths));
    if (lengths[index] <= maxEdge) {
      mesh.indices.push(a, b, c);
      return;
    }
    const [u, v, w] = edges[index],
      key = Math.min(u, v) + ":" + Math.max(u, v);
    let m = midpoints.get(key);
    if (m === undefined) {
      m = p.length / 3;
      p.push((p[u * 3] + p[v * 3]) / 2, 0, (p[u * 3 + 2] + p[v * 3 + 2]) / 2);
      midpoints.set(key, m);
    }
    split(u, m, w);
    split(m, v, w);
  };
  for (let i = 0; i < source.indices.length; i += 3)
    split(source.indices[i], source.indices[i + 1], source.indices[i + 2]);
  return mesh;
}
