import {
  distance,
  namedRandom,
  curveLine,
  distanceToBox,
  polygonDistance,
  nearestSegment,
  boxFootprint,
  segmentPolygonDistance
} from "./V2Geometry";
import type {
  V2Box,
  V2Group,
  V2POI,
  V2Point,
  V2Route,
  V2RouteKind,
  V2RouteNode,
  WorldRecipe
} from "../spatial/V2Model.ts";

function at(center: V2Point, yaw: number, x: number, z: number): V2Point {
  return { x: center.x + Math.cos(yaw) * x - Math.sin(yaw) * z, z: center.z + Math.sin(yaw) * x + Math.cos(yaw) * z };
}
function mix(a: V2Point, b: V2Point, t: number): V2Point {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
function closestBox(recipe: WorldRecipe, p: V2Point): V2Box | undefined {
  return recipe.boxes.reduce<V2Box | undefined>(
    (best, box) => (!best || distance(box.center, p) < distance(best.center, p) ? box : best),
    undefined
  );
}
function groupBoxes(recipe: WorldRecipe, group: V2Group): V2Box[] {
  const ids = new Set(group.memberIds);
  return recipe.boxes.filter((box) => ids.has(box.id));
}
function outsideGroup(group: V2Group, toward: V2Point, gap: number): V2Point {
  const e = group.envelope!,
    dx = toward.x - group.pivot.x,
    dz = toward.z - group.pivot.z,
    d = Math.max(1, Math.hypot(dx, dz));
  const lx = (Math.cos(e.yaw) * dx + Math.sin(e.yaw) * dz) / d;
  const lz = (-Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d;
  const r = Math.min(e.sizeX / 2 / Math.max(0.0001, Math.abs(lx)), e.sizeZ / 2 / Math.max(0.0001, Math.abs(lz))) + gap;
  return { x: group.pivot.x + (dx / d) * r, z: group.pivot.z + (dz / d) * r };
}

/**
 * Derive connected movement and observation opportunities from actual mountain, opening and water geometry.
 * @param recipe Mutable global layout whose ordinary primitives remain independently editable.
 * @returns Nothing; route controls, support references and POI provenance are written to the recipe.
 */
export function applyV2LevelDesign(recipe: WorldRecipe): void {
  const g = recipe.global;
  if (!g) return;
  const groups = recipe.groups!;
  type Anchor = V2RouteNode & Pick<V2POI, "arrivalRouteIds" | "rewardTargetIds">;
  const anchors: Anchor[] = [];
  recipe.routeNodes = anchors;
  const riverFootprints = recipe.rivers.map((river) => {
    const a = recipe.riverNodes.find((node) => node.id === river.from)!,
      b = recipe.riverNodes.find((node) => node.id === river.to)!;
    return {
      points: curveLine([a, ...river.controls, b], 6),
      radius:
        (Math.max(river.width, river.widthEnd, ...(river.widthSamples?.map((sample) => sample.width) ?? [])) *
          recipe.riverScale) /
        2
    };
  });
  const freeAt = (p: V2Point, clearance: number): boolean => {
    if (Math.abs(p.x) + clearance > recipe.size / 2 - 4 || Math.abs(p.z) + clearance > recipe.size / 2 - 4)
      return false;
    if (recipe.boxes.some((box) => box.collision && distanceToBox(box, p.x, p.z) < clearance)) return false;
    if (recipe.lakes.some((lake) => lake.outline && polygonDistance(p, lake.outline) < clearance + 3)) return false;
    for (const river of riverFootprints)
      for (let i = 1; i < river.points.length; i++) {
        if (nearestSegment(p, river.points[i - 1], river.points[i]).distance < river.radius + clearance + 3)
          return false;
      }
    return true;
  };
  const addNode = (
    id: string,
    label: string,
    position: V2Point,
    sources: string[],
    rewards: string[],
    supportBoxId?: string
  ): Anchor => {
    const poi: Anchor = {
      id,
      label,
      position,
      radius: 8,
      sourceFeatureIds: sources,
      rewardTargetIds: rewards,
      arrivalRouteIds: [],
      supportBoxId
    };
    anchors.push(poi);
    const sourceGroup = groups.find((group) => sources.includes(group.id));
    if (sourceGroup) sourceGroup.memberIds.push(id);
    return poi;
  };
  const pointOf = (id: string): V2Point =>
    id === "spawn" ? recipe.spawn : anchors.find((poi) => poi.id === id)!.position;
  const addRoute = (
    id: string,
    kind: V2RouteKind,
    label: string,
    from: string,
    to: string,
    controls: V2Point[],
    sources: string[],
    supportBoxIds?: string[],
    pointHeights?: number[]
  ) => {
    const route: V2Route = {
      id,
      kind,
      label,
      from,
      to,
      controls,
      sourceFeatureIds: sources,
      width: kind === "ridge-route" ? 4 : g.routeWidth,
      maxSlope: 0.72,
      bendPenalty: 3,
      supportBoxIds,
      pointHeights
    };
    recipe.routes.push(route);
    for (const poi of anchors.filter((item) => item.id === from || item.id === to)) poi.arrivalRouteIds!.push(id);
    return route;
  };
  const connect = (poi: Anchor, source: string, preferSpawn = false) => {
    const existing = anchors.filter((other) => other !== poi && !other.supportBoxId && other.arrivalRouteIds!.length);
    const previous = preferSpawn
      ? undefined
      : existing.sort((a, b) => distance(a.position, poi.position) - distance(b.position, poi.position))[0];
    const from = previous?.id ?? "spawn",
      a = pointOf(from),
      b = poi.position;
    addRoute(`access:${poi.id}`, "branch-road", `${poi.label} · 接入`, from, poi.id, [mix(a, b, 0.5)], [source]);
  };
  const farGroups = groups.filter((group) => group.band === "far");
  const hero = recipe.boxes.filter((box) => box.band === "far").sort((a, b) => b.sizeY - a.sizeY)[0];
  const reward = (p: V2Point): string[] => {
    const lake = [...recipe.lakes].sort((a, b) => distance(a.center, p) - distance(b.center, p))[0];
    return [lake?.id, hero?.id].filter((id): id is string => Boolean(id));
  };

  // Each main line spans both sides of the origin; other flows attach to this connected skeleton.
  for (let line = 0; line < Math.round(g.mainRouteCount); line++)
    for (const side of [-1, 1]) {
      const theta = (line * Math.PI) / Math.max(1, g.mainRouteCount) + (side < 0 ? Math.PI : 0);
      const proposal = { x: Math.cos(theta) * 448, z: Math.sin(theta) * 448 };
      const options = [448, 420, 470, 390, 360, 320, 270, 210, 140, 75].flatMap((radius) =>
        [0, -0.08, 0.08, -0.16, 0.16].map((offset) => ({
          x: Math.cos(theta + offset) * radius,
          z: Math.sin(theta + offset) * radius
        }))
      );
      const end =
        options.filter((p) => freeAt(p, 16)).sort((a, b) => distance(a, proposal) - distance(b, proposal))[0] ??
        proposal;
      const target = closestBox(recipe, end),
        id = `poi-main-${line}-${side}`;
      const poi = addNode(
        id,
        `主线 ${line + 1} · ${side < 0 ? "A" : "B"} 端点`,
        end,
        target ? [target.id] : [],
        reward(end)
      );
      const controls = [0.3, 0.65].map((t, i) => ({
        x: end.x * t - Math.sin(theta) * (i ? -1 : 1) * g.passageWidth * 0.16,
        z: end.z * t + Math.cos(theta) * (i ? -1 : 1) * g.passageWidth * 0.16
      }));
      addRoute(
        `main-${line}-${side}`,
        "main-road",
        `横贯主线 ${line + 1}`,
        "spawn",
        poi.id,
        controls,
        target ? [target.id] : []
      );
    }

  const addOpening = (ordinal: number, canyon: boolean) => {
    const id = `${canyon ? "canyon" : "pass"}-${ordinal}`;
    const theta = (canyon ? Math.PI : Math.PI / 2) + (ordinal * Math.PI) / 2;
    const center = { x: Math.cos(theta) * (canyon ? 275 : 155), z: Math.sin(theta) * (canyon ? 275 : 155) };
    const yaw = theta,
      length = canyon ? 140 : 65,
      depth = canyon ? 45 : 38,
      height = canyon ? g.middleHeight * 0.62 : g.nearHeight * 0.85;
    const opening = g.passageWidth,
      memberIds: string[] = [];
    for (const side of [-1, 1]) {
      const baseId = `${id}:${side}:base`;
      recipe.boxes.push({
        id: baseId,
        label: `${canyon ? "峡谷" : "山口"} · ${side < 0 ? "左" : "右"}山肩基座`,
        center: at(center, yaw, 0, (side * (opening + depth)) / 2),
        sizeX: length,
        sizeZ: depth,
        sizeY: height * 0.22,
        yaw,
        collision: true,
        occlusion: true,
        band: canyon ? "middle" : "near"
      });
      memberIds.push(baseId);
      for (let section = 0; section < 4; section++) {
        const boxId = `${id}:${side}:${section}`;
        const fraction = section / 3;
        recipe.boxes.push({
          id: boxId,
          label: `${canyon ? "峡谷" : "鞍部"} · 连续山肩 ${section + 1}`,
          center: at(center, yaw, (fraction - 0.5) * length * 0.7, (side * (opening + depth)) / 2),
          sizeX: length * 0.34,
          sizeZ: depth * (0.8 + fraction * 0.16),
          sizeY: height * (0.6 + Math.sin(fraction * Math.PI) * 0.4) * (side < 0 ? 1 : 0.85),
          yaw,
          collision: true,
          occlusion: true,
          band: canyon ? "middle" : "near"
        });
        memberIds.push(boxId);
      }
    }
    groups.push({
      id,
      label: canyon ? `峡谷体量 ${ordinal + 1}` : `山口鞍部 ${ordinal + 1}`,
      memberIds,
      pivot: center,
      translation: { x: 0, z: 0 },
      yaw: 0,
      scale: 1,
      silhouetteRole: "saddle/notch",
      band: canyon ? "middle" : "near",
      envelope: { sizeX: length, sizeZ: depth * 2 + opening, height, yaw },
      foundation: { height: height * 0.1, transition: depth }
    });
    const a = at(center, yaw, -length * 0.65, 0),
      b = at(center, yaw, length * 0.65, 0);
    if (canyon) {
      recipe.canyons.push({
        id: `${id}:floor`,
        label: `峡谷通廊 ${ordinal + 1}`,
        points: [a, center, b],
        width: opening,
        depth: 0,
        shoulder: depth
      });
      memberIds.push(`${id}:floor`);
    }
    const sources = canyon ? [id, `${id}:floor`] : [id];
    const start = addNode(`${id}:entry`, canyon ? "峡谷入口 · 收束" : "山口入口 · 收束", a, sources, [memberIds[1]]);
    const end = addNode(`${id}:exit`, canyon ? "峡谷出口 · 展开" : "山口出口 · 展望", b, sources, reward(b));
    connect(start, id);
    addRoute(
      `route:${id}`,
      canyon ? "canyon" : "pass",
      canyon ? "峡谷穿行" : "山口穿行",
      start.id,
      end.id,
      [center],
      sources
    );
  };
  for (let i = 0; i < Math.round(g.passCount); i++) addOpening(i, false);
  for (let i = 0; i < Math.round(g.canyonCount); i++) addOpening(i, true);

  for (let i = 0; i < Math.round(g.shoreRouteCount); i++) {
    const lake = recipe.lakes[i % recipe.lakes.length];
    if (!lake?.outline) break;
    const startIndex = (Math.round(lake.outline.length * 0.4) + i * 13) % lake.outline.length;
    const path = Array.from({ length: 12 }, (_, j) => {
      const source = lake.outline![(startIndex + j) % lake.outline!.length];
      const dx = source.x - lake.center.x,
        dz = source.z - lake.center.z,
        d = Math.max(1, Math.hypot(dx, dz));
      return { x: source.x + (dx / d) * 18, z: source.z + (dz / d) * 18 };
    });
    const a = addNode(`shore-${i}:entry`, "岸线入口", path[0], [lake.id], [lake.id]);
    const b = addNode(`shore-${i}:view`, "湖湾回望", path[path.length - 1], [lake.id], reward(path[path.length - 1]));
    connect(a, lake.id);
    addRoute(`shore-${i}`, "shore-route", `岸线绕行 ${i + 1}`, a.id, b.id, path.slice(1, -1), [lake.id]);
  }

  const ridgeGroups = groups.filter(
    (group) => group.silhouetteRole === "buttress/shoulder" || group.silhouetteRole === "terrace/cap"
  );
  for (let i = 0; i < Math.round(g.ridgeRouteCount); i++) {
    const group = ridgeGroups[(i + 1) % Math.max(1, ridgeGroups.length)];
    if (!group) break;
    const columns = groupBoxes(recipe, group).filter((box) => !box.id.endsWith("base"));
    const highest = Math.max(...columns.map((box) => box.sizeY));
    const peak = columns.findIndex((box) => box.sizeY === highest);
    const forward = peak >= columns.length / 2;
    const climb = forward ? columns.slice(0, peak + 1) : columns.slice(peak).reverse();
    const last = climb[climb.length - 1];
    const entry = outsideGroup(
      group,
      at(group.pivot, group.envelope!.yaw, forward ? -group.envelope!.sizeX : group.envelope!.sizeX, 0),
      18
    );
    const a = addNode(`ridge-${i}:foot`, "登高入口 · 山麓", entry, [group.id], [last.id]);
    const b = addNode(
      `ridge-${i}:crest`,
      "山脊停留 · 高处回报",
      { ...last.center },
      [group.id, last.id],
      reward(last.center),
      last.id
    );
    connect(a, group.id);
    const controls = climb.slice(0, -1).map((box) => ({ ...box.center }));
    const route = addRoute(
      `ridge-${i}`,
      "ridge-route",
      `沿山肩登脊 ${i + 1}`,
      a.id,
      b.id,
      controls,
      [group.id],
      climb.map((box) => box.id),
      [0, ...climb.map((box) => box.sizeY)]
    );
    route.pointSupportIds = [null, ...climb.map((box) => box.id)];
  }

  type CrossingSite = {
    riverId: string;
    systemId?: string;
    center: V2Point;
    a: V2Point;
    b: V2Point;
    span: number;
    score: number;
    diagnostics: NonNullable<V2Route["placementDiagnostics"]>;
  };
  const crossingEndpointClearance = (p: V2Point): number => {
    let margin = Math.min(recipe.size / 2 - Math.abs(p.x), recipe.size / 2 - Math.abs(p.z));
    for (const box of recipe.boxes) if (box.collision) margin = Math.min(margin, distanceToBox(box, p.x, p.z));
    for (const lake of recipe.lakes) if (lake.outline) margin = Math.min(margin, polygonDistance(p, lake.outline));
    for (const footprint of riverFootprints)
      for (let k = 1; k < footprint.points.length; k++)
        margin = Math.min(
          margin,
          nearestSegment(p, footprint.points[k - 1], footprint.points[k]).distance - footprint.radius
        );
    return margin;
  };
  const crossingSites: CrossingSite[] = [];
  if (g.crossingCount > 0)
    for (let reachIndex = 0; reachIndex < riverFootprints.length; reachIndex++) {
      const river = recipe.rivers[reachIndex],
        footprint = riverFootprints[reachIndex],
        path = footprint.points;
      if (path.length < 3) continue;
      for (let station = 1; station <= 9; station++) {
        const k = Math.max(1, Math.min(path.length - 2, Math.round((station * path.length) / 10))),
          center = path[k];
        const tangent = { x: path[k + 1].x - path[k - 1].x, z: path[k + 1].z - path[k - 1].z };
        for (const rotation of [0, -0.25, 0.25]) {
          const yaw = Math.atan2(tangent.z, tangent.x) + Math.PI / 2 + rotation;
          const normal = { x: Math.cos(yaw), z: Math.sin(yaw) };
          const shore = (side: number): V2Point | undefined => {
            const points = [18, 30, 46, 70, 102, 142]
              .map((margin) => ({
                x: center.x + normal.x * (footprint.radius + margin) * side,
                z: center.z + normal.z * (footprint.radius + margin) * side
              }))
              .filter((point) => Math.abs(point.x) < recipe.size / 2 - 4 && Math.abs(point.z) < recipe.size / 2 - 4);
            return (
              points.find((point) => freeAt(point, 12)) ??
              points.sort((a, b) => crossingEndpointClearance(b) - crossingEndpointClearance(a))[0]
            );
          };
          const a = shore(-1),
            b = shore(1);
          if (!a || !b) continue;
          const minimumEndpointClearance = Math.min(crossingEndpointClearance(a), crossingEndpointClearance(b));
          const bridgeLakeClearance = Math.min(
            recipe.size,
            ...recipe.lakes.filter((lake) => lake.outline).map((lake) => segmentPolygonDistance(a, b, lake.outline!))
          );
          const bridgeBodyClearance = Math.min(
            recipe.size,
            ...recipe.boxes.filter((box) => box.collision).map((box) => segmentPolygonDistance(a, b, boxFootprint(box)))
          );
          const clear =
            minimumEndpointClearance >= 12 && bridgeLakeClearance >= 12 && bridgeBodyClearance >= g.routeWidth / 2 + 1;
          const deficit =
            Math.max(0, 12 - minimumEndpointClearance) +
            Math.max(0, 12 - bridgeLakeClearance) +
            Math.max(0, g.routeWidth / 2 + 1 - bridgeBodyClearance);
          const span = distance(a, b);
          const roadDistance = Math.min(
            ...recipe.routes
              .filter((route) => route.kind === "main-road")
              .map((route) => {
                const points = [pointOf(route.from), ...(route.controls ?? []), pointOf(route.to)];
                return Math.min(
                  ...points.slice(1).map((point, index) => nearestSegment(center, points[index], point).distance)
                );
              }),
            distance(center, recipe.spawn)
          );
          crossingSites.push({
            riverId: river.id,
            systemId: river.systemId,
            center,
            a,
            b,
            span,
            score:
              span +
              roadDistance * 0.4 +
              (river.id.includes(":tributary-") ? 25 : 0) +
              (clear ? 0 : 100000 + deficit * 1000),
            diagnostics: {
              status: clear ? "clear" : "proposal",
              minimumEndpointClearance,
              bridgeLakeClearance,
              bridgeBodyClearance,
              message: clear ? undefined : "保留跨越提案：有限候选未同时满足两岸 12 米净空和桥面避让，尚未保证物理通行"
            }
          });
        }
      }
    }
  const selectedCrossings: CrossingSite[] = [];
  for (let i = 0; i < Math.round(g.crossingCount); i++) {
    const systemId = recipe.lakes[i % recipe.lakes.length]?.systemId;
    const ranked = [...crossingSites].sort(
      (a, b) => a.score + (a.systemId === systemId ? 0 : 120) - b.score - (b.systemId === systemId ? 0 : 120)
    );
    const site =
      ranked.find((candidate) =>
        selectedCrossings.every((previous) => distance(candidate.center, previous.center) >= 24)
      ) ?? ranked[0];
    selectedCrossings.push(site);
    const a = addNode(`crossing-${i}:entry`, "河道跨越 · 此岸", site.a, [site.riverId], [site.riverId]);
    const b = addNode(`crossing-${i}:exit`, "河道跨越 · 彼岸", site.b, [site.riverId], reward(site.b));
    connect(a, site.riverId);
    const route = addRoute(`crossing-${i}`, "crossing", `跨越河道 ${i + 1}`, a.id, b.id, [site.center], [site.riverId]);
    route.placementDiagnostics = site.diagnostics;
    a.slots = [
      {
        id: `${route.id}:bridge-slot`,
        label: "跨河桥面预留",
        purpose: "跨河连接设施",
        boxId: `bridge:${route.id}:deck`,
        center: mix(site.a, site.b, 0.5),
        sizeX: site.span,
        sizeZ: route.width,
        sizeY: 0.8,
        yaw: Math.atan2(site.b.z - site.a.z, site.b.x - site.a.x)
      }
    ];
  }

  const tributary = recipe.rivers.find((river) => river.id.includes(":tributary-"));
  if (tributary) {
    const from = recipe.riverNodes.find((node) => node.id === tributary.from)!,
      to = recipe.riverNodes.find((node) => node.id === tributary.to)!;
    const path = curveLine([from, ...tributary.controls, to], 16);
    const bank = path.map((p, index) => {
      const a = path[Math.max(0, index - 1)],
        b = path[Math.min(path.length - 1, index + 1)],
        d = Math.max(1, distance(a, b));
      const offset = Math.max(tributary.width, tributary.widthEnd) / 2 + 14;
      return { x: p.x - ((b.z - a.z) / d) * offset, z: p.z + ((b.x - a.x) / d) * offset };
    });
    const a = addNode(
      "tributary-bank:source",
      "支谷源头 · 山麓",
      bank[0],
      [tributary.id, ...(from.sourceGroupId ? [from.sourceGroupId] : [])],
      [tributary.id]
    );
    const b = addNode(
      "tributary-bank:join",
      "支谷汇流 · 回报",
      bank[bank.length - 1],
      [tributary.id],
      [tributary.lakeId!]
    );
    connect(a, tributary.id);
    addRoute("tributary-bank", "tributary", "支谷沿河下行", a.id, b.id, bank.slice(1, -1), [tributary.id]);
  }

  const nearestMainRoad = (p: V2Point): { point: V2Point; distance: number } => {
    let closest = { point: recipe.spawn as V2Point, distance: distance(p, recipe.spawn) };
    for (const route of recipe.routes.filter((route) => route.kind === "main-road")) {
      const path = [pointOf(route.from), ...(route.controls ?? []), pointOf(route.to)];
      for (let i = 1; i < path.length; i++) {
        const hit = nearestSegment(p, path[i - 1], path[i]);
        if (hit.distance < closest.distance) closest = hit;
      }
    }
    return closest;
  };
  const choosePlace = (
    preferred: V2Point,
    sourceIds: string[],
    signX: number,
    signZ: number
  ): { center: V2Point; yaw: number } | undefined => {
    const candidates: V2Point[] = [{ ...preferred }];
    const lake = recipe.lakes.find((item) => sourceIds.includes(item.id));
    if (lake?.outline)
      for (let i = 0; i < lake.outline.length; i += 3) {
        const edge = lake.outline[i],
          yaw = Math.atan2(edge.z - lake.center.z, edge.x - lake.center.x);
        for (const margin of [38, 60, 85]) candidates.push(at(edge, yaw, margin, 0));
      }
    const canyon = recipe.canyons.find((item) => sourceIds.includes(item.id));
    if (canyon)
      for (const endpoint of [canyon.points[0], canyon.points[canyon.points.length - 1]])
        for (const radius of [40, 70, 100])
          for (let i = 0; i < 16; i++) candidates.push(at(endpoint, (i * Math.PI) / 8, radius, 0));
    for (const radius of [40, 75, 110, 150])
      for (let i = 0; i < 16; i++) candidates.push(at(preferred, (i * Math.PI) / 8, radius, 0));
    // This finite fallback covers open ground in the same region without rerolling any world identity.
    for (const x of [55, 120, 190, 265, 340, 420, 465])
      for (const z of [55, 120, 190, 265, 340, 420, 465]) candidates.push({ x: x * signX, z: z * signZ });
    let best: { center: V2Point; yaw: number; score: number } | undefined;
    for (const center of candidates) {
      if (center.x * signX < 32 || center.z * signZ < 32 || !freeAt(center, 31)) continue;
      const road = nearestMainRoad(center);
      if (road.distance < 31 + g.routeWidth / 2) continue;
      const yaw = Math.atan2(center.z - road.point.z, center.x - road.point.x);
      const approach = at(center, yaw, -45, 0),
        entry = at(center, yaw, -24.2, 0);
      if (!freeAt(approach, g.routeWidth / 2 + 1) || !freeAt(entry, g.routeWidth / 2 + 1)) continue;
      if (
        recipe.boxes.some(
          (box) => box.collision && segmentPolygonDistance(approach, entry, boxFootprint(box)) < g.routeWidth / 2 + 1
        )
      )
        continue;
      let featureDistance = distance(center, preferred);
      if (canyon) {
        featureDistance = Infinity;
        for (let i = 1; i < canyon.points.length; i++)
          featureDistance = Math.min(
            featureDistance,
            nearestSegment(center, canyon.points[i - 1], canyon.points[i]).distance
          );
        if (featureDistance > 115) continue;
      }
      const score = distance(center, preferred) * 0.6 + road.distance * 0.35 + featureDistance * 0.4;
      if (!best || score < best.score) best = { center, yaw, score };
    }
    return best;
  };
  for (let i = 0; i < Math.round(g.poiCount); i++) {
    const quadrant = i % 4,
      signX = quadrant === 0 || quadrant === 3 ? 1 : -1,
      signZ = quadrant < 2 ? 1 : -1;
    const matchesQuadrant = (p: V2Point) => p.x * signX > 0 && p.z * signZ > 0;
    const lake = recipe.lakes.find((item) => matchesQuadrant(item.center));
    const canyon = recipe.canyons.find((item) => item.points[item.points.length - 1].x * signX > 0);
    const regionalGroups = farGroups.filter((item) => matchesQuadrant(item.pivot));
    const group =
      regionalGroups[Math.floor(i / 4) % Math.max(1, regionalGroups.length)] ??
      groups.find((item) => matchesQuadrant(item.pivot)) ??
      groups[0];
    let center: V2Point, yaw: number, sourceIds: string[], label: string, variant: number;
    if (quadrant === 0 && lake?.outline) {
      yaw = Math.atan2(-lake.center.z, -lake.center.x);
      const edge = lake.outline.reduce((best, p) =>
        distance(p, recipe.spawn) < distance(best, recipe.spawn) ? p : best
      );
      center = at(edge, yaw, 33, 0);
      sourceIds = [lake.id];
      label = "湖岸资源场所";
      variant = 2;
    } else if (quadrant === 1 && canyon) {
      const end = canyon.points[canyon.points.length - 1],
        before = canyon.points[canyon.points.length - 2];
      yaw = Math.atan2(end.z - before.z, end.x - before.x);
      center = at(end, yaw, 30, -signZ * 26);
      sourceIds = [canyon.id];
      label = "谷地停留营地";
      variant = 1;
    } else if (group) {
      center = outsideGroup(group, recipe.spawn, 48);
      yaw = Math.atan2(group.pivot.z - center.z, group.pivot.x - center.x);
      sourceIds = [group.id];
      label = "山麓观景台地";
      variant = 0;
    } else {
      center = { x: signX * 80, z: signZ * 80 };
      yaw = 0;
      sourceIds = recipe.lakes.length ? [recipe.lakes[0].id] : [];
      label = "开阔停留场所";
      variant = 0;
    }
    let placement = choosePlace(center, sourceIds, signX, signZ);
    if (!placement && group) {
      center = outsideGroup(group, recipe.spawn, 48);
      sourceIds = [group.id];
      label = "山麓观景台地";
      variant = 0;
      placement = choosePlace(center, sourceIds, signX, signZ);
    }
    if (!placement) continue;
    center = placement.center;
    yaw = placement.yaw;
    const id = `place-${i}`,
      width = 44,
      depth = 34;
    const outline = [
      [-0.5, -0.4],
      [-0.12, -0.55],
      [0.48, -0.42],
      [0.55, 0.23],
      [0.16, 0.5],
      [-0.48, 0.4]
    ].map(([x, z]) => at(center, yaw, x * width, z * depth));
    const entrancePosition = at(center, yaw, -width * 0.55, 0);
    const entrance = addNode(`${id}:entrance`, `${label} · 入口`, entrancePosition, sourceIds, reward(center));
    const approach = at(center, yaw, -45, 0),
      approachNear = at(center, yaw, -34, 0);
    const previous = anchors
      .filter(
        (node) =>
          node !== entrance &&
          !node.supportBoxId &&
          node.arrivalRouteIds!.length &&
          freeAt(node.position, g.routeWidth / 2)
      )
      .sort((a, b) => distance(a.position, approach) - distance(b.position, approach))[0];
    const from = previous?.id ?? "spawn";
    addRoute(
      `access:${entrance.id}`,
      "branch-road",
      `${label} · 入口接入`,
      from,
      entrance.id,
      [mix(pointOf(from), approach, 0.5), approach, approachNear],
      sourceIds
    );
    const slots = [
      { suffix: "platform", purpose: "观景平台占位", x: 10, z: 10, sx: 17, sz: 10, sy: variant === 0 ? 2.5 : 1.2 },
      { suffix: "landmark", purpose: "入口地标占位", x: -11, z: -12, sx: 6, sz: 6, sy: g.pullHeight },
      {
        suffix: "activity-edge",
        purpose: variant === 1 ? "营地设施占位" : variant === 2 ? "资源体量占位" : "休憩边界占位",
        x: 11,
        z: -10,
        sx: 12,
        sz: 8,
        sy: 3.5
      }
    ].map((slot) => {
      const boxId = `${id}:${slot.suffix}`,
        position = at(center, yaw, slot.x, slot.z);
      recipe.boxes.push({
        id: boxId,
        label: `${label} · ${slot.purpose}`,
        center: position,
        sizeX: slot.sx,
        sizeZ: slot.sz,
        sizeY: slot.sy,
        yaw,
        collision: true,
        occlusion: true
      });
      return {
        id: `${boxId}:slot`,
        label: slot.purpose,
        purpose: slot.purpose,
        boxId,
        center: position,
        sizeX: slot.sx,
        sizeZ: slot.sz,
        sizeY: slot.sy,
        yaw
      };
    });
    const activity = [
      [-11, -6],
      [4, -7],
      [7, 4],
      [-10, 6]
    ].map(([x, z]) => at(center, yaw, x, z));
    const poi: V2POI = {
      id,
      label: `${label} ${i + 1}`,
      purpose: label,
      position: center,
      radius: 10,
      markerHeight: 2,
      markerWidth: 1,
      outline,
      entrances: [{ id: `${id}:entry`, routeNodeId: entrance.id, position: entrancePosition }],
      activityAreas: [
        {
          id: `${id}:activity`,
          label: "可用活动空地",
          purpose: variant === 1 ? "停留与营地活动" : "观察与停留",
          outline: activity
        }
      ],
      slots,
      sourceFeatureIds: sourceIds,
      arrivalRouteIds: [...entrance.arrivalRouteIds!],
      rewardTargetIds: reward(center)
    };
    recipe.pois.push(poi);
    const sourceGroup = groups.find((item) => sourceIds.includes(item.id));
    if (sourceGroup) sourceGroup.memberIds.push(id, ...slots.map((slot) => slot.boxId));
  }
  const groundPOIs = anchors.filter((poi) => !poi.supportBoxId);
  for (let i = 0; i < Math.round(g.routeCount) && groundPOIs.length > 2; i++) {
    const a = groundPOIs[i % groundPOIs.length],
      b = groundPOIs[(i + Math.ceil(groundPOIs.length / 3)) % groundPOIs.length];
    addRoute(
      `branch-${i}`,
      "branch-road",
      `联络支路 ${i + 1}`,
      a.id,
      b.id,
      [mix(a.position, b.position, 0.5)],
      [...a.sourceFeatureIds!, ...b.sourceFeatureIds!]
    );
  }
  for (const route of recipe.routes) {
    const end = anchors.find((node) => node.id === route.to);
    const source = end?.sourceFeatureIds?.[0];
    const group = groups.find((item) => item.id === source);
    const target = group
      ? groupBoxes(recipe, group).sort((a, b) => b.sizeY - a.sizeY)[0]?.id
      : recipe.boxes.some((box) => box.id === source) ||
          recipe.lakes.some((lake) => lake.id === source) ||
          recipe.rivers.some((river) => river.id === source)
        ? source
        : hero?.id;
    if (target)
      recipe.views.push({
        id: `pull:${route.id}`,
        label: `${route.label} · Pull 目标`,
        from: route.from,
        target,
        mode: "visible",
        minimum: 0.25,
        maximum: 1,
        hard: false
      });
  }
  for (const poi of recipe.pois) {
    const landmark = poi.slots!.find((slot) => slot.purpose === "入口地标占位")!;
    for (const entrance of poi.entrances!)
      recipe.views.push({
        id: `entrance:${poi.id}`,
        label: `${poi.label} · 入口识别`,
        from: entrance.routeNodeId,
        target: landmark.boxId!,
        mode: "visible",
        minimum: 0.3,
        maximum: 1,
        hard: false
      });
    for (const target of poi.rewardTargetIds ?? [])
      recipe.views.push({
        id: `reward:${poi.id}:${target}`,
        label: `${poi.label} · 到达视野`,
        from: poi.id,
        target,
        mode: "visible",
        minimum: 0.2,
        maximum: 1,
        hard: false
      });
  }
}
