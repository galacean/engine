import { isGlobalRoadId } from "../spatial/layout/RoadIdentity";
import { roadSurfaces } from "../spatial/layout/RoadTopology";
import { PLANNING_SURFACE_CSS as palette, PLANNING_MAP_WATER_CSS } from "./PlanningSurfacePalette";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { ribbonOutline } from "./WorldRibbon";
/** Immediate vector preview. Rasterization belongs exclusively to the whitebox consumer. */
export function planningVectorSurface(plan: IslandPlan): string {
  const path = (ring: PlanPoint[]) => ring.map((p, i) => `${i ? "L" : "M"}${p.x},${p.z}`).join(" ") + " Z";
  const lands = [plan.land, ...plan.islands].map(path).join(" ");
  const soil = [
    ...(plan.settlementLayout ? [] : plan.slopes.map((s) => path(s.outer) + path([...s.inner].reverse()))),
    ...(plan.settlementLayout
      ? []
      : plan.regions.filter((r) => r.kind === "village").map((r) => path(r.navigationArea ?? r.outline))),
    ...(plan.plazas ?? []).map((p) => path(p.outline)),
    ...roadSurfaces(plan).map((r) => path(r.outline ?? ribbonOutline(r.points, [r.width])))
  ];
  const roadLayers = plan.poiDistribution
    ? `<g data-plan-layer="route"><g data-plan-layer="road-local">${layerRoad(false)}</g><g data-plan-layer="road-world">${layerRoad(true)}</g></g>`
    : "";
  function layerRoad(global: boolean): string {
    return `<g data-plan-layer="surface-soil" fill="${palette.soil}">${[...(!global ? (plan.plazas ?? []) : []), ...roadSurfaces(plan).filter((r) => isGlobalRoadId(r.id) === global)].map((r) => `<g data-plan-layer="object:${r.id}"><path d="${path(r.outline ?? [])}"/></g>`).join("")}</g>`;
  }

  const courtyardHoles = (plan.courtyards ?? []).map((c) => path(c.outline)).join(" ");
  const courtyardPaths = (plan.courtyards ?? []).map((c) =>
    path(c.path.outline ?? ribbonOutline(c.path.points, [c.path.width]))
  );
  const layer = (id: string, color: string, paths: string[]) =>
    `<g data-plan-layer="surface-${id}" fill="${color}">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  return `<defs><clipPath id="planning-surface-land"><path d="${lands}"/></clipPath></defs><g data-vector-surface="true" clip-path="url(#planning-surface-land)" pointer-events="none"><path d="${lands}" fill="#b9b9b9"/>${layer("grass", palette.grass, [lands])}<defs><mask id="courtyard-soil-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${plan.parameters.width}" height="${plan.parameters.depth}"><rect x="0" y="0" width="${plan.parameters.width}" height="${plan.parameters.depth}" fill="white"/><path d="${courtyardHoles}" fill="black"/></mask></defs><g mask="url(#courtyard-soil-mask)">${roadLayers || layer("soil", palette.soil, soil)}</g>${layer("soil", palette.soil, [...courtyardPaths, ...(plan.courtyards?.length ? roadSurfaces(plan).map((r) => path(r.outline ?? ribbonOutline(r.points, [r.width]))) : [])])}<g data-plan-layer="surface-water" fill="${PLANNING_MAP_WATER_CSS.water}">${plan.waters.map((w) => `<g data-plan-layer="object:${w.id}"><path d="${path(w.outline)}"/></g>`).join("")}</g></g>`;
}
