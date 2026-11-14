import type { IslandPlan, PlanPoint, PlanRock, PlanSlope } from "./IslandPlanModel";

/** Closed low-frequency shape controlled by extent and roundness, sampled at roughly eight metres. */
export function regionShape(center: PlanPoint, width: number, depth: number, roundness = 0.8, phase = 0): PlanPoint[] {
  const count = Math.max(16, Math.ceil((Math.PI * (width + depth)) / 16));
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const radius = 1 + (1 - roundness) * (0.25 * Math.sin(3 * angle + phase) + 0.13 * Math.cos(5 * angle - phase));
    return {
      x: center.x + Math.cos(angle) * width * 0.5 * radius,
      z: center.z + Math.sin(angle) * depth * 0.5 * radius
    };
  });
}
/** Rectangle in world metres, shared by buildings, rocks and projected inclined supports. */
export function envelope(center: PlanPoint, width: number, depth: number, yaw: number): PlanPoint[] {
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5]
  ].map(([u, v]) => ({
    x: center.x + u * width * Math.cos(yaw) - v * depth * Math.sin(yaw),
    z: center.z + u * width * Math.sin(yaw) + v * depth * Math.cos(yaw)
  }));
}
/** Generates a soil transition strip; normals follow the actual boundary rather than a screen-space stroke. */
export function slopeBand(id: string, label: string, boundary: PlanPoint[], width: number, inward: boolean): PlanSlope {
  const area = boundary.reduce((sum, p, i) => {
    const b = boundary[(i + 1) % boundary.length];
    return sum + p.x * b.z - b.x * p.z;
  }, 0);
  const offset = boundary.map((p, i) => {
    const a = boundary[(i + boundary.length - 1) % boundary.length],
      b = boundary[(i + 1) % boundary.length];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz) || 1;
    const side = (area > 0 ? 1 : -1) * (inward ? 1 : -1);
    const w = width * (1 + 0.18 * Math.sin((i / boundary.length) * Math.PI * 6));
    return { x: p.x - (dz / length) * w * side, z: p.z + (dx / length) * w * side };
  });
  return {
    id,
    label,
    outer: inward ? boundary : offset,
    inner: inward ? offset : boundary,
    width,
    rise: inward ? 6 : 3,
    material: "soil",
    profile: "smoothstep"
  };
}
/** Exact segment versus inflated OBB test, accounting for the width of the road. */
export function routeIntersectsRock(a: PlanPoint, b: PlanPoint, rock: PlanRock, clearance: number): boolean {
  const local = (p: PlanPoint) => ({
    x: (p.x - rock.center.x) * Math.cos(rock.yaw) + (p.z - rock.center.z) * Math.sin(rock.yaw),
    z: -(p.x - rock.center.x) * Math.sin(rock.yaw) + (p.z - rock.center.z) * Math.cos(rock.yaw)
  });
  const p = local(a),
    q = local(b);
  let lo = 0,
    hi = 1;
  for (const [k, half] of [
    ["x", rock.width / 2 + clearance],
    ["z", rock.depth / 2 + clearance]
  ] as const) {
    const d = q[k] - p[k];
    if (Math.abs(d) < 1e-8) {
      if (Math.abs(p[k]) > half) return false;
      continue;
    }
    const t0 = (-half - p[k]) / d,
      t1 = (half - p[k]) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (lo > hi) return false;
  }
  return true;
}
/** Reserve the complete route corridor before committing rock footprints; shrink footprints, never move route endpoints. */
export function reserveRoutes(plan: IslandPlan): void {
  for (const rock of plan.rocks) {
    const intersects = () =>
      plan.routes.some((route) =>
        route.points.slice(1).some((p, i) => routeIntersectsRock(route.points[i], p, rock, route.width / 2 + 5))
      );
    for (let attempt = 0; intersects() && attempt < 24; attempt++) {
      rock.width *= 0.85;
      rock.depth *= 0.85;
      rock.outline = rock.outline.map((p) => ({
        x: rock.center.x + (p.x - rock.center.x) * 0.85,
        z: rock.center.z + (p.z - rock.center.z) * 0.85
      }));
      rock.obb = envelope(rock.center, rock.width, rock.depth, rock.yaw);
    }
    // A candidate centred in the reserved corridor cannot be repaired by shrinking.
    if (intersects()) rock.width = 0;
  }
  plan.rocks = plan.rocks.filter((r) => r.width > 0);
  for (const group of plan.mountains) group.rockIds = group.rockIds.filter((id) => plan.rocks.some((r) => r.id === id));
}
/** Adds independently addressable region, building, island and ascent atoms to the composition. */
export function completePlanAtoms(plan: IslandPlan, islandCount = 3): IslandPlan {
  const { width, depth, seed } = plan.parameters;

  const village = plan.places.find((p) => p.id === "shore-place")!;
  village.label = "临水村落";
  village.purpose = "建筑、公共空地与临水入口组成的村落";
  village.outline = regionShape(village.center, 180, 130, 0.8);
  plan.regions.push({ id: "village-region", label: "村落范围", kind: "village", outline: village.outline });
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * 0.12 + i * Math.PI * 0.2;
    const center = { x: village.center.x + Math.cos(angle) * 64, z: village.center.z + Math.sin(angle) * 43 };
    const w = 18 + (i % 2) * 6,
      d = 22 + (i % 3) * 4,
      yaw = (i - 2) * 0.16;
    plan.buildings.push({
      id: `building-${i}`,
      regionId: "village-region",
      center,
      width: w,
      depth: d,
      height: 9 + (i % 3) * 3,
      yaw,
      outline: envelope(center, w, d, yaw)
    });
  }
  for (const group of plan.mountains) {
    if (group.id === "southwest" || group.id === "southeast") {
      plan.regions.push({
        id: `cluster-${group.id}`,
        label: group.id === "southwest" ? "西南岩石堆" : "南岸岩石堆",
        kind: "rock-cluster",
        outline: group.outline
      });
    } else if (!group.offshore) {
      const members = plan.rocks.filter((r) => r.groupId === group.id).sort((a, b) => a.center.z - b.center.z);
      const points: PlanPoint[] = [];
      for (let i = 0; i < 3; i++) {
        const slice = members.slice(Math.floor((i * members.length) / 3), Math.floor(((i + 1) * members.length) / 3));
        const weight = slice.reduce((sum, r) => sum + r.height, 0);
        points.push({
          x: slice.reduce((sum, r) => sum + r.center.x * r.height, 0) / weight,
          z: slice.reduce((sum, r) => sum + r.center.z * r.height, 0) / weight
        });
      }
      plan.ridges.push({ id: `ridge-${group.id}`, groupId: group.id, points });
      // Broad joining rock envelopes make the mountain a connected mass, unlike a loose cluster.
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
          w = Math.hypot(b.x - a.x, b.z - a.z) + 35,
          d = 90,
          yaw = Math.atan2(b.z - a.z, b.x - a.x);
        const id = `${group.id}-ridge-rock-${i}`;
        plan.rocks.unshift({
          id,
          groupId: group.id,
          center,
          width: w,
          depth: d,
          yaw,
          height: 65,
          role: "shoulder",
          obb: envelope(center, w, d, yaw),
          outline: envelope(center, w * 0.96, d * 0.94, yaw)
        });
        group.rockIds.push(id);
      }
    }
  }
  for (let n = 1; n < Math.min(4, Math.max(1, islandCount)); n++) {
    const center = { x: width * (0.07 + n * 0.22), z: depth * (0.96 - 0.015 * Math.sin(seed + n)) };
    const outline = regionShape(center, 105 + n * 22, 70, 0.58, seed + n);
    plan.islands.push(outline);
    const id = `offshore-${n}`;
    plan.regions.push({ id, label: `离岸小岛 ${n + 1}`, kind: "island", outline });
    for (let i = 0; i < 2; i++) {
      const c = { x: center.x + (i - 0.5) * 35, z: center.z + (i - 0.5) * 12 },
        w = 34 + i * 12,
        d = 30 + i * 6,
        yaw = n * 0.5;
      plan.rocks.push({
        id: `${id}-rock-${i}`,
        groupId: id,
        center: c,
        width: w,
        depth: d,
        yaw,
        height: 28 + i * 28,
        role: "peak",
        obb: envelope(c, w, d, yaw),
        outline: envelope(c, w * 0.82, d * 0.82, yaw)
      });
    }
  }
  reserveRoutes(plan);
  plan.slopes = [
    slopeBand("coast-soil", "海岸泥土缓坡", plan.land, 24, true),
    ...plan.islands.map((boundary, i) => slopeBand(`island-soil-${i}`, "岛岸泥土缓坡", boundary, 12, true)),
    ...plan.waters.map((w) => slopeBand(`bank-${w.id}`, "河湖泥土缓坡", w.outline, 12, false))
  ];
  for (const route of plan.routes.filter((r) => r.id === "climb" || r.kind === "ridge")) {
    const start = route.kind === "ridge" ? 0 : Math.floor(route.points.length * 0.65);
    const step = 8,
      end = route.points.length - 1;
    for (let i = start; i < end; i += step) {
      const a = route.points[i],
        b = route.points[Math.min(i + step, end)],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      const h = (index: number) =>
        route.kind === "ridge" ? 70 - (70 * index) / end : (70 * (index - start)) / Math.max(1, end - start);
      plan.supports.push({
        id: `support-${route.id}-${i}`,
        routeId: route.id,
        a,
        b,
        startHeight: h(i),
        endHeight: h(Math.min(i + step, end)),
        width: 14,
        thickness: 6,
        outline: envelope({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, length + 6, 14, Math.atan2(b.z - a.z, b.x - a.x))
      });
    }
  }
  return plan;
}
