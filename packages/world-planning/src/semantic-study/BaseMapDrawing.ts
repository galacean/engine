import { ribbonOutline } from "./WorldRibbon";
import { isGlobalRoadSurface, roadSurfaces, roadSurfaceOwners } from "../spatial/layout/RoadTopology";
import { drawPoiDistribution, drawPoiTerritories, drawPlanningFarm } from "./PoiPlanDrawing";
import { PLANNING_SURFACE_CSS, PLANNING_OBJECT_CSS, PLANNING_MAP_WATER_CSS } from "./PlanningSurfacePalette";
import { drawTerrainBands } from "../spatial/terrain/TerrainBandPreview";
import { drawPlanningTerrain } from "./WorldTerrainMap";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";

/** Fixed approved visual vocabulary; AI reference colours do not override runtime semantics. */
export const BASE_MAP_STYLE = {
  ...PLANNING_OBJECT_CSS,
  ...PLANNING_MAP_WATER_CSS,
  land: PLANNING_SURFACE_CSS.grass,
  soil: PLANNING_SURFACE_CSS.soil,
  coast: "#719994",
  waterEdge: "#729da3",
  road: PLANNING_SURFACE_CSS.soil,
  roadEdge: "#b6a584",
  ridgeRoad: "#c1b4bf"
};
/** Shared legend and focused observation colors. */
export const DEPTH_BAND_STYLE = [
  { id: "near", label: "近", color: "#71b995" },
  { id: "middle", label: "中", color: "#7faecd" },
  { id: "far", label: "远", color: "#ae91c5" }
] as const;

/** Choose an existing observation: explicit sight, related/nearest selected module, then spawn. */
export function focusedObservation(plan: IslandPlan, selected: string | null, preferred: string | null): string | null {
  if (preferred && selected === "visual" && plan.sights.some((s) => s.id === preferred)) return preferred;
  const module = plan.planning?.modules.find((m) => m.id === selected),
    points = module?.outlines?.flat() ?? module?.outline;
  const origin = points?.length
    ? points.reduce((p, q) => ({ x: p.x + q.x / points.length, z: p.z + q.z / points.length }), { x: 0, z: 0 })
    : plan.spawn;
  const related =
    selected && selected !== "visual"
      ? plan.sights.filter((s) => plan.planning?.relations.some((r) => r.id === s.id && r.owners.includes(selected)))
      : [];
  const candidates = related.length ? related : plan.sights;
  return (
    [...candidates].sort(
      (a, b) =>
        Math.hypot(a.from.x - origin.x, a.from.z - origin.z) - Math.hypot(b.from.x - origin.x, b.from.z - origin.z) ||
        a.id.localeCompare(b.id)
    )[0]?.id ?? null
  );
}

const ring = (points: PlanPoint[]) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" ") + " Z";
const text = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const feature = (id: string, label: string, body: string, ownerId = id, nativeTooltip = true, owners: string[] = []) =>
  `<g class="ip-feature" data-feature-id="${text(id)}" data-owner-id="${text(ownerId)}" ${owners.length ? `data-route-owners="${text(owners.join(" "))}"` : ""} role="button" tabindex="0" aria-label="${text(label)}">${nativeTooltip ? `<title>${text(label)}</title>` : ""}${body}</g>`;
const layer = (id: string, body: string) => `<g data-plan-layer="${id}">${body}</g>`;

/** Projects resolved semantic geometry without inventing roads, relief surfaces or director overlays. */
export function drawBaseMap(plan: IslandPlan, omitRocks = false, groundSurface = "", volumeOverlay = ""): string {
  const c = BASE_MAP_STYLE;
  const modules = plan.planning?.modules ?? [];
  const moduleLayer = (kind: string) =>
    ({
      land: "land",
      island: "island",
      mountain: "group",
      valley: "valley",
      water: "water",
      village: "village",
      routes: "route",
      visual: "sight",
      spawn: "spawn",
      teleport: "teleport",
      open: "open",
      landscape: "landscape"
    })[kind] ?? "group";
  const moduleColor = (kind: string) =>
    ({
      land: c.coast,
      island: "#509f9b",
      mountain: c.group,
      valley: "#749951",
      water: c.waterEdge,
      village: c.village,
      routes: "#a66d3b",
      visual: "#ce59b8",
      spawn: "#244e6b",
      teleport: "#b79734",
      open: "#6d9643",
      landscape: c.tree
    })[kind] ?? c.group;
  const moduleRanges = modules.filter(
    (m) =>
      !m.ownerId &&
      (m.outlines?.some((r) => r.length >= 3) || m.outline.length >= 3) &&
      m.kind !== "routes" &&
      m.kind !== "visual" &&
      m.kind !== "landscape"
  );
  const moduleHit = (m: (typeof moduleRanges)[number]) =>
    layer(
      moduleLayer(m.kind),
      feature(
        m.id,
        m.id,
        `<path data-module-hit="true" d="${(m.outlines ?? [m.outline]).map(ring).join(" ")}" fill="transparent" stroke="none" pointer-events="all"/>`
      )
    );
  // Land-domain hit areas are a fallback behind management cells; content stays above them.
  const domainHits = moduleRanges
    .filter((m) => m.kind === "island")
    .map(moduleHit)
    .join("");
  const moduleHits = moduleRanges
    .filter((m) => m.kind !== "land" && m.kind !== "island")
    .map(moduleHit)
    .join("");
  const moduleOutlines = moduleRanges
    .filter((m) => !plan.structures?.some((s) => s.id === m.id || s.waterDomain?.id === m.id))
    .map((m) =>
      layer(
        moduleLayer(m.kind),
        feature(
          m.id,
          m.id,
          `<path class="ip-feature-outline planning-module-outline" data-module-outline="${text(m.id)}" d="${(m.outlines ?? [m.outline]).map(ring).join(" ")}" fill="none" stroke="${moduleColor(m.kind)}" stroke-width="${plan.settlementLayout ? 0.3 : 2}" stroke-dasharray="${plan.settlementLayout ? "2 2" : "12 8"}" pointer-events="stroke"/>`
        )
      )
    )
    .join("");
  const structures = layer(
    "valley",
    (plan.structures ?? [])
      .map((s) => {
        const mid = s.axis[Math.floor(s.axis.length / 2)];
        return (
          feature(
            s.id,
            s.label,
            `<path class="ip-feature-outline" data-structure-region="${text(s.id)}" d="${ring(s.outline)}" fill="#c492dc" fill-opacity=".035" stroke="#8946a8" stroke-width="3" stroke-dasharray="14 7" pointer-events="all"/><text x="${mid.x}" y="${mid.z - 34}" text-anchor="middle" font-size="25" font-weight="700" fill="#6f348c" stroke="#fff8e3" stroke-width="5" paint-order="stroke">${text(s.label)}</text>`
          ) +
          (s.sections ?? [])
            .map(
              (section) =>
                `<text x="${section.center.x}" y="${section.center.z + 22}" text-anchor="middle" font-size="18" fill="#6f348c" stroke="#f9f6e9" stroke-width="3" paint-order="stroke" pointer-events="none">${section.label}</text>`
            )
            .join("")
        );
      })
      .join("")
  );
  const waterDomains = layer(
    "water",
    (plan.structures ?? [])
      .flatMap((s) =>
        s.waterDomain
          ? [
              feature(
                s.waterDomain.id,
                "水系统可编辑域（非真实水面）",
                `<path data-water-edit-domain="true" class="ip-feature-outline" d="${ring(s.waterDomain.outline)}" fill="none" stroke="#008bda" stroke-width="3.5" stroke-dasharray="14 9" pointer-events="stroke"/>`
              )
            ]
          : []
      )
      .join("")
  );
  const landRings = [plan.land, ...plan.islands].map(ring);
  const elevationDef = "";
  const defs = `<defs>${elevationDef}<marker id="water-direction" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#f5ffff"/></marker><clipPath id="base-land">${landRings.map((d) => `<path d="${d}"/>`).join("")}</clipPath><filter id="base-water-edge" x="-5%" y="-5%" width="110%" height="110%"><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded"/><feFlood flood-color="${c.waterEdge}"/><feComposite in2="expanded" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const land = landRings
    .map((d, i) =>
      feature(
        i ? `land-island-${i}` : "land-main",
        i ? "离岸陆地" : "不规则主岛",
        `<path class="ip-feature-outline" d="${d}" fill="${c.land}" stroke="${c.coast}" stroke-width="3.5" stroke-linejoin="round"/>`
      )
    )
    .join("");
  const slopes = plan.planning
    ? ""
    : plan.slopes
        .map((s) =>
          feature(s.id, s.label, `<path d="${ring(s.outer)} ${ring(s.inner)}" fill="${c.soil}" fill-rule="evenodd"/>`)
        )
        .join("");
  const water = plan.waters
    .map((w) => {
      const points = w.centerline ?? [];
      const arrows = (w.bankWidthM === undefined ? [0.25, 0.65] : [])
        .flatMap((t) => {
          const i = Math.floor(t * (points.length - 1));
          if (!points[i + 1]) return [];
          const a = points[i],
            b = points[i + 1];
          return [
            `<path d="M${a.x},${a.z}L${b.x},${b.z}" stroke="#f5ffff" stroke-width="2" marker-end="url(#water-direction)" fill="none" pointer-events="none"/>`
          ];
        })
        .join("");
      return feature(
        w.id,
        w.label,
        `<path class="ip-feature-outline" d="${ring(w.outline)}" fill="${c.water}"/>` + arrows,
        w.systemId ?? w.id
      );
    })
    .join("");
  const rocks = omitRocks
    ? ""
    : plan.rocks
        .map((r) =>
          feature(
            r.id,
            plan.canyonStudy ? `规划 OBB · ${r.role}` : `岩体 ${r.id} · ${Math.round(r.height)} 米`,
            layer(
              "rock",
              `<path class="ip-feature-outline" d="${ring(plan.canyonStudy ? r.obb : r.outline)}" fill="${c.rock}" stroke="${c.rockEdge}" stroke-width="2" stroke-linejoin="round"/>`
            ) +
              layer(
                "obb",
                `<path class="ip-obb" d="${ring(r.obb)}" fill="none" stroke="${c.obb}" stroke-width="1.7"/>`
              ),
            r.groupId
          )
        )
        .join("");
  const groups = plan.mountains
    .map((g) => {
      const boundaries = g.semanticOutlines?.length
          ? g.semanticOutlines
          : (g.densityOutlines ?? g.outlines ?? [g.outline]),
        all = boundaries.flat(),
        x = all.reduce((sum, p) => sum + p.x, 0) / all.length,
        z = Math.min(...all.map((p) => p.z)) - 22;
      return feature(
        g.id,
        g.label,
        layer(
          "group",
          boundaries
            .map(
              (b) =>
                `<path class="ip-feature-outline" pointer-events="all" d="${ring(b)}" fill="${c.group}" fill-opacity=".055" stroke="${c.group}" stroke-width="3" stroke-dasharray="14 9"/>`
            )
            .join("")
        ) + layer("labels", `<text class="base-label base-group-label" x="${x}" y="${z}">${g.label}</text>`)
      );
    })
    .join("");
  const drawRegion = (r: IslandPlan["regions"][number]) => {
    if (r.kind === "teleport") {
      const point = plan.places.find((p) => p.id === r.id)?.center ?? r.outline[0];
      return layer(
        "teleport",
        feature(
          r.id,
          "传送眺望点",
          `<circle data-lookout-point="true" cx="${point.x}" cy="${point.z}" r="9" fill="#f7d16f" stroke="#71501c" stroke-width="3"/><text class="base-label" x="${point.x + 16}" y="${point.z - 15}">眺望点</text>`
        )
      );
    }

    const center = r.outline.reduce((s, p) => ({ x: s.x + p.x / r.outline.length, z: s.z + p.z / r.outline.length }), {
      x: 0,
      z: 0
    });
    const surface =
      !plan.settlementLayout && !groundSurface && r.surface === "road"
        ? `<path data-surface="road" d="${ring(r.navigationArea ?? r.outline)}" fill="${c.road}"/>`
        : "";
    return layer(
      plan.poiDistribution ? "poi-content" : r.kind === "village" ? "village" : r.kind === "open" ? "open" : "island",
      feature(
        r.id,
        r.label,
        surface +
          `<path data-plan-layer="${r.kind === "village" ? "village" : "open"}" class="ip-feature-outline" d="${ring(r.outline)}" fill="${!plan.settlementLayout && !groundSurface && r.kind === "village" && r.surface !== "road" ? c.soil : "none"}" fill-opacity=".45" stroke="${r.kind === "village" ? c.village : "#509f9b"}" stroke-width="${plan.settlementLayout ? 0.35 : 2.5}" stroke-dasharray="${plan.settlementLayout ? "2 2" : "12 8"}" pointer-events="all"/>` +
          (plan.farming && r.id.startsWith(`${plan.farming.farmId}/`)
            ? ""
            : layer(
                "labels",
                `<text class="base-label" style="${plan.settlementLayout ? "font-size:4px" : ""}" x="${center.x}" y="${Math.min(...r.outline.map((p) => p.z)) - (plan.settlementLayout ? 4 : 16)}">${r.label}</text>`
              ))
      )
    );
  };
  const domainRegions = plan.regions
    .filter((r) => r.kind === "island")
    .map(drawRegion)
    .join("");
  const regions = plan.regions
    .filter((r) => r.kind !== "island")
    .map(drawRegion)
    .join("");
  const fences = "";
  const buildings = plan.buildings
    .map((b) => {
      const grid = plan.settlementLayout
        ? `<defs><pattern id="grid-${b.id}" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="${c.buildingEdge}" stroke-opacity=".3" stroke-width=".05"/></pattern></defs><rect x="${-b.width / 2}" y="${-b.depth / 2}" width="${b.width}" height="${b.depth}" transform="translate(${b.center.x} ${b.center.z}) rotate(${(b.yaw * 180) / Math.PI})" fill="url(#grid-${b.id})" pointer-events="none"/>`
        : "";
      return feature(
        b.id,
        ` ${plan.spatialLayout ? "体量" : "建筑"} ${b.id} · ${b.floorCount ? `${b.floorCount}层 · ` : ""}${b.width.toFixed(1)} × ${b.depth.toFixed(1)} × ${b.height.toFixed(1)} 米`,
        `<path class="ip-feature-outline" d="${ring(b.outline)}" fill="${c.building}" stroke="${c.buildingEdge}" stroke-width="${plan.settlementLayout ? 0.22 : 2.5}"/>` +
          grid,
        b.regionId
      );
    })
    .join("");
  const landscapes = drawPlanLandscape(plan);
  const { width, depth } = plan.parameters;
  const access = layer(
    "road-access",
    (plan.roadNetwork?.nodes ?? [])
      .map(
        (n) =>
          `<circle cx="${n.position.x}" cy="${n.position.z}" r="2.5" fill="#e9b766" stroke="#67513a" stroke-width=".8"><title>道路接入点 ${n.id}</title></circle>`
      )
      .join("")
  );
  const boundary = layer(
    "boundary",
    `<g pointer-events="none" fill="none" stroke="#244e6b"><rect data-world-boundary="true" x="0" y="0" width="${width}" height="${depth}" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="M0 24V0H24M${width - 24} 0H${width}V24M0 ${depth - 24}V${depth}H24M${width - 24} ${depth}H${width}V${depth - 24}" stroke-width="4" vector-effect="non-scaling-stroke"/></g><g fill="#244e6b" font-size="24" text-anchor="middle" pointer-events="none"><text x="${width / 2}" y="-22">世界边界 · ${width} × ${depth} 米</text><text x="${width / 2}" y="${depth + 38}">0 — ${width} m</text></g>`
  );
  const components = layer(
    "components",
    (plan.shapeRecipes ?? [])
      .flatMap((g) =>
        g.blocks.map((b) =>
          feature(
            b.id,
            `${g.label}组件 ${b.id}`,
            `<rect class="ip-feature-outline" data-shape-owner="${g.id}" x="${b.x - b.width / 2}" y="${b.z - b.length / 2}" width="${b.width}" height="${b.length}" transform="rotate(${b.yaw} ${b.x} ${b.z})" fill="none" stroke="#9a4b32" stroke-width="2" stroke-dasharray="10 7" pointer-events="all"/>`,
            g.id
          )
        )
      )
      .join("")
  );
  // Surface semantics stay opaque above height/territory tints; the raster is the base, not the final overlay.
  const plazas = layer(
    "route",
    (plan.plazas ?? [])
      .map((p) =>
        feature(
          p.id,
          p.label,
          `<path class="ip-feature-outline" data-plaza-surface="true" data-road-selection="fill" d="${ring(p.outline)}" fill="${c.road}" stroke="none" pointer-events="fill"/>`,
          p.id
        )
      )
      .join("")
  );
  const routes = roadSurfaces(plan)
    .map((r) => {
      const centerline = r.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.z}`).join(" ");
      const outline = r.outline && r.outline.length >= 3;
      const surface = outline
        ? `<path class="ip-feature-outline" data-route-surface="outline" ${plan.settlementLayout ? 'data-road-selection="fill"' : ""} d="${ring(r.outline!)}" fill="${r.kind === "ridge" ? c.ridgeRoad : c.road}" stroke="${r.kind === "ridge" ? "#995d9c" : c.roadEdge}" stroke-width="${plan.settlementLayout ? 0 : 1.2}" stroke-linejoin="round"/>`
        : `<path class="ip-feature-outline" d="${centerline}" fill="none" stroke="${r.kind === "ridge" ? "#995d9c" : c.roadEdge}" stroke-width="${Math.max(5, r.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      return layer(
        r.kind === "ridge" ? "ridgeRoad" : "route",
        layer(
          isGlobalRoadSurface(plan, r) ? "road-world" : "road-local",
          feature(r.id, r.label, surface, r.id, true, roadSurfaceOwners(plan, r))
        )
      );
    })
    .join("");
  const connections = layer(
    "bridge",
    plan.bridges
      .map((b) => {
        const dx = b.b.x - b.a.x,
          dz = b.b.z - b.a.z,
          length = Math.hypot(dx, dz),
          nx = ((-dz / length) * b.width) / 2,
          nz = ((dx / length) * b.width) / 2;
        const corners = [
          { x: b.a.x - nx, z: b.a.z - nz },
          { x: b.b.x - nx, z: b.b.z - nz },
          { x: b.b.x + nx, z: b.b.z + nz },
          { x: b.a.x + nx, z: b.a.z + nz }
        ];
        const slats = Array.from({ length: Math.max(2, Math.ceil(length / 3)) }, (_, i) => {
          const t = i / Math.max(1, Math.ceil(length / 3) - 1),
            p = { x: b.a.x + dx * t, z: b.a.z + dz * t };
          return `<path d="M${p.x - nx},${p.z - nz}L${p.x + nx},${p.z + nz}" stroke="#785b3d" stroke-width=".45" pointer-events="none"/>`;
        }).join("");
        return feature(
          b.id,
          b.label,
          `<path class="ip-feature-outline" data-bridge-deck="true" d="${ring(b.deckPath ? ribbonOutline(b.deckPath, [b.width], undefined, true) : corners)}" fill="#c9ad82" stroke="#685039" stroke-width=".8"/>${slats}`
        );
      })
      .join("")
  );
  const sights = layer(
    "sight",
    plan.sights
      .map((s) => {
        const angle = Math.atan2(s.to.z - s.from.z, s.to.x - s.from.x),
          distance = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z),
          spread = (s.spread * Math.PI) / 360;
        const relation = plan.planning?.relations.find((r) => r.id === `${s.id}-depth`);
        const depths = (relation?.owners ?? [])
          .map((id) => plan.rocks.find((rock) => rock.id === id))
          .filter((rock): rock is IslandPlan["rocks"][number] => !!rock)
          .map((rock) => (rock.center.x - s.from.x) * Math.cos(angle) + (rock.center.z - s.from.z) * Math.sin(angle))
          .filter((d) => d > 0)
          .sort((a, b) => a - b);
        let bands = "";
        if (depths.length >= 3) {
          const levels = [depths[0], depths[Math.floor(depths.length / 2)], depths.at(-1)!],
            bounds = [
              0,
              (levels[0] + levels[1]) / 2,
              (levels[1] + levels[2]) / 2,
              levels[2] + Math.max(12, (levels[2] - levels[1]) * 0.25)
            ],
            half = Math.PI / 6;
          const point = (r: number, a: number) => `${s.from.x + Math.cos(a) * r},${s.from.z + Math.sin(a) * r}`;
          bands = levels
            .map((depth, i) => {
              const inner = bounds[i],
                outer = bounds[i + 1],
                left = angle - half,
                right = angle + half;
              const d = `M${point(outer, left)} A${outer},${outer} 0 0 1 ${point(outer, right)} L${point(inner, right)} ${inner ? `A${inner},${inner} 0 0 0 ${point(inner, left)}` : `L${s.from.x},${s.from.z}`} Z`;
              return `<path data-depth-band="${["near", "middle", "far"][i]}" d="${d}" fill="${DEPTH_BAND_STYLE[i].color}" fill-opacity=".10" stroke="none" pointer-events="none"/><text class="base-height" x="${s.from.x + Math.cos(angle) * depth}" y="${s.from.z + Math.sin(angle) * depth}" font-size="15" pointer-events="none">${["近", "中", "远"][i]} ${Math.round(depth)}m</text>`;
            })
            .join("");
        }
        const cone =
          bands ||
          `<path d="M${s.from.x},${s.from.z}L${s.from.x + Math.cos(angle - spread) * distance},${s.from.z + Math.sin(angle - spread) * distance}L${s.from.x + Math.cos(angle + spread) * distance},${s.from.z + Math.sin(angle + spread) * distance}Z" fill="#d59fc6" fill-opacity=".08" stroke="none" pointer-events="none"/>`;
        return feature(
          s.id,
          `${s.label} · ${relation ? "近中远山群" : "单目标视线"}`,
          `<g data-observation-cone="${text(s.id)}" style="display:none" pointer-events="none">${cone}</g><path data-sight-hit="true" d="M${s.from.x},${s.from.z}L${s.to.x},${s.to.z}" fill="none" stroke="transparent" stroke-width="9" pointer-events="stroke"/><path data-sight-line="true" d="M${s.from.x},${s.from.z}L${s.to.x},${s.to.z}" fill="none" stroke="${s.status === "fail" ? "#c64b34" : "#bc669d"}" stroke-opacity="${s.id === "sight-spawn" ? 0.9 : 0.6}" stroke-width="${s.id === "sight-spawn" ? 2 : 1.2}" stroke-dasharray="7 6" pointer-events="none"/>`,
          modules.some((m) => m.id === "visual") ? "visual" : s.id
        );
      })
      .join("")
  );
  const ridgeSkeleton = layer(
    "ridge",
    plan.ridges
      .map((r) =>
        feature(
          r.id,
          "山脊骨架",
          `<path d="${r.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.z}`).join(" ")}" fill="none" stroke="#955d8f" stroke-width="3" stroke-dasharray="12 8"/>`
        )
      )
      .join("")
  );
  const supports = layer(
    "support",
    plan.supports
      .map((s) =>
        feature(
          s.id,
          "登高承托范围",
          `<path class="ip-feature-outline" d="${ring(s.outline)}" fill="#aed3bc" fill-opacity=".45" stroke="#4f9074" stroke-width="2" stroke-dasharray="9 5"/>`
        )
      )
      .join("")
  );
  const compactSpawn = !!plan.settlementLayout && !plan.poiDistribution;
  const spawn = plan.canyonStudy
    ? ""
    : layer(
        "spawn",
        feature(
          "spawn",
          "出生点",
          `<circle cx="${plan.spawn.x}" cy="${plan.spawn.z}" r="${compactSpawn ? 1 : 10}" fill="#cf3f32" stroke="#fff9e9" stroke-width="${compactSpawn ? 0.2 : 2}"/><text x="${plan.spawn.x + (compactSpawn ? 3 : 18)}" y="${plan.spawn.z - (compactSpawn ? 3 : 20)}" fill="#a72f27" font-size="${compactSpawn ? 4 : 30}" font-weight="700" stroke="#fff9e9" stroke-width="${compactSpawn ? 0.4 : 3}" paint-order="stroke" stroke-linejoin="round">出生点</text>`
        )
      );
  const entryPoints = plan.planning
    ? plan.planning.ports
        .filter((p) => p.kind === "entrance" || plan.buildings.some((b) => p.id === b.id + "-door"))
        .map((p) => ({ id: p.id, owner: p.ownerId, point: p.position }))
    : plan.places.filter((p) => p.id.includes("entrance")).map((p) => ({ id: p.id, owner: p.id, point: p.center }));
  const entrances = layer(
    "entrance",
    entryPoints
      .map((p) => {
        const building = plan.buildings.find((b) => p.id === b.id + "-door");
        if (building) {
          const angle = building.yaw + Math.PI / 2,
            half = (building.doorWidthM ?? 1.3) / 2;
          return feature(
            p.id,
            "建筑门",
            `<path data-building-door="true" class="ip-feature-outline" d="M${p.point.x - Math.cos(angle) * half},${p.point.z - Math.sin(angle) * half}L${p.point.x + Math.cos(angle) * half},${p.point.z + Math.sin(angle) * half}" stroke="${c.door}" stroke-width=".45"/>`,
            building.regionId
          );
        }
        return feature(
          p.id,
          "村落入口",
          `<circle data-port-kind="entrance" cx="${p.point.x}" cy="${p.point.z}" r="${plan.settlementLayout ? 0.9 : 7}" fill="${c.soil}" stroke="${c.buildingEdge}" stroke-width="${plan.settlementLayout ? 0.2 : 2}"/>`,
          p.owner
        );
      })
      .join("")
  );
  return (
    defs +
    layer("ocean", `<rect x="-4000" y="-4000" width="12000" height="12000" fill="${c.ocean}"/>`) +
    layer("land", land + groundSurface) +
    drawPlanningTerrain(plan) +
    domainHits +
    domainRegions +
    drawPoiTerritories(plan) +
    moduleHits +
    (slopes ? layer("slope", `<g clip-path="url(#base-land)">${slopes}</g>`) : "") +
    layer("water", `<g clip-path="url(#base-land)"><g filter="url(#base-water-edge)">${water}</g></g>`) +
    rocks +
    groups +
    regions +
    fences +
    layer("building", buildings) +
    landscapes +
    supports +
    ridgeSkeleton +
    plazas +
    routes +
    connections +
    entrances +
    sights +
    moduleOutlines +
    structures +
    waterDomains +
    components +
    drawPoiDistribution(plan) +
    access +
    drawTerrainBands(plan) +
    boundary +
    volumeOverlay +
    drawPlanningFarm(plan) +
    spawn
  );
}

/** Landscape projection is independently replaceable after a landscape-only transaction. */
export function drawPlanLandscape(plan: IslandPlan): string {
  const groups = (["tree", "rock"] as const)
    .map((kind) =>
      layer(
        kind === "tree" ? "tree" : "landscape-rock",
        (plan.landscapes ?? [])
          .filter((p) => p.kind === kind)
          .map((p) => {
            const label =
              kind === "tree"
                ? `${p.role === "poi" ? "高树 POI" : "景观树"} · ${p.height.toFixed(1)} 米`
                : "景观石 · OBB 占位";
            const attributes = `class="ip-feature ip-landscape-symbol" data-feature-id="${text(p.id)}" data-owner-id="${text(p.ownerId ?? p.id)}" role="button" tabindex="0" aria-label="${text(label)}"`;
            // One simple primitive per instance: geometry and stable IDs stay in the plan.
            if (p.role === "poi")
              return `<path ${attributes} d="${ring(p.outline)}" fill="#416c49" stroke="#294f37" stroke-width=".5"><title>${text(label)}</title></path>`;
            const radius = Math.sqrt((p.width * p.depth) / Math.PI);
            return `<circle ${attributes} cx="${p.center.x}" cy="${p.center.z}" r="${radius.toFixed(2)}" fill="${kind === "tree" ? "#5d7950" : "#87918a"}"><title>${text(label)}</title></circle>`;
          })
          .join("")
      )
    )
    .join("");
  return layer("landscape", drawFlowerRegions(plan) + groups);
}

function drawFlowerRegions(plan: IslandPlan): string {
  return layer(
    "flowers",
    (plan.flowerRegions ?? [])
      .map((f) =>
        feature(
          f.id,
          `${f.label} · ${Math.round(f.areaM2)} ㎡`,
          `<path class="ip-feature-outline" d="${f.outlines.map(ring).join(" ")}" fill="${PLANNING_SURFACE_CSS.flowers}" fill-rule="evenodd" fill-opacity=".7" stroke="none" pointer-events="fill"/>`,
          f.ownerId
        )
      )
      .join("")
  );
}
