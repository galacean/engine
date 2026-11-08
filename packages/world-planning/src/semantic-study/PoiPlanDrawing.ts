import { poiTerritories } from "../spatial/ecology/PoiTerritories";
import type { IslandPlan } from "./IslandPlanModel";
import { POI_STYLE } from "./PoiLayoutPanel";
import { terrainColor } from "./WorldTerrainMap";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { poiContentLabel } from "./PoiContents";
export const FARM_MAP_COLOR = "#cba957";
/** Draw active POI anchors; marker size is symbolic and is not an occupancy boundary. */
export function drawPoiDistribution(plan: IslandPlan): string {
  const distribution = plan.poiDistribution;
  if (!distribution) return "";
  const style = POI_STYLE;
  return `<g data-plan-layer="poi-anchors"><g data-plan-layer="poi-sites">${distribution.sites
    .filter((site) => site.active)
    .map(
      (site) =>
        `<g class="ip-feature" data-feature-id="${site.id}" role="button" tabindex="0" aria-label="${poiContentLabel(plan, site)}"><title>${poiContentLabel(plan, site)}</title><circle class="ip-feature-outline" data-poi-site="${site.id}" data-marker-radius="${style.radius}" cx="${site.center.x}" cy="${site.center.z}" r="${style.radius}" fill="${site.memberIds.length ? style.color : "#f5f2e5"}" fill-opacity=".9" stroke="${style.color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></g>`
    )
    .join("")}</g></g>`;
}

/** Uniform borders project the same weighted management cells consumed by generation. */
export function drawPoiTerritories(plan: IslandPlan): string {
  const height = plan.regionFields?.elevation ? createPlanningGroundSampler(plan) : undefined;
  const path = (points: { x: number; z: number }[]) =>
    points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" ") + " Z";
  return (
    "<g>" +
    poiTerritories(plan)
      .map((t, i) => {
        const domain = plan.poiDistribution!.domains.find((d) => d.id === t.domainId)!;
        const site = plan.poiDistribution!.sites.find((site) => site.id === t.poiId)!,
          altitude = height?.(site.center),
          style = POI_STYLE,
          farm = plan.farming?.poiId === t.poiId;
        const tint =
          altitude === undefined
            ? ""
            : `<g data-plan-layer="height" pointer-events="none"><path data-region-elevation="${t.poiId}" data-height-m="${altitude.toFixed(2)}" d="${path(t.outline)}" fill="${terrainColor(altitude)}" fill-opacity=".48"/></g>`;
        return `<defs><clipPath id="territory-clip-${i}"><path d="${path(domain.outline)}"/></clipPath></defs><g data-plan-layer="territory:${t.poiId}" clip-path="url(#territory-clip-${i})">${tint}<g data-plan-layer="territories"><g class="ip-feature" data-feature-id="${t.poiId}" data-owner-id="${t.poiId}" role="button" tabindex="0" aria-label="${farm ? "农场管理区域" : `${t.poiId} 管理区域`}"><title>${farm ? "农场" : style.label} 管理区域${altitude === undefined ? "" : ` · 分区中心海拔 ${altitude.toFixed(1)} 米`}</title><path class="ip-feature-outline" data-poi-territory="true" data-farming-region="${farm}" d="${path(t.outline)}" fill="${farm ? FARM_MAP_COLOR : style.color}" fill-opacity="${farm ? 0.32 : style.territoryOpacity}" stroke="${farm ? FARM_MAP_COLOR : style.color}" stroke-opacity=".85" stroke-width="${farm ? 2 : style.borderWidth}" vector-effect="non-scaling-stroke" pointer-events="fill"/></g></g></g>`;
      })
      .join("") +
    "</g>"
  );
}

export function drawPlanningFarm(plan: IslandPlan): string {
  const farm = plan.farming;
  if (!farm) return "";
  const site = plan.poiDistribution?.sites.find((s) => s.id === farm.poiId);
  if (!site) return "";
  const ready = farm.placementCheck.state === "ready" && farm.accessCheck.state === "ready";
  if (!ready) return "";
  const label = "农场";
  const diagnostic = [...farm.placementCheck.issues, ...farm.accessCheck.issues].map((i) => i.message).join("；");
  const position = farm.entrance ?? site.center;
  return `<g data-plan-layer="farming" data-farming-status="${ready ? "ready" : "blocked"}" pointer-events="none"><title>${label}${diagnostic ? "：" + diagnostic : ""}</title>${ready ? `<circle data-farming-entrance="true" cx="${position.x}" cy="${position.z}" r="8" fill="#4d914f" stroke="#fff9e9" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ""}<text x="${position.x + 14}" y="${position.z + 24}" fill="${ready ? "#284a21" : "#85502c"}" font-size="16" font-weight="500" stroke="#fff9e9" stroke-width="2" paint-order="stroke" stroke-linejoin="round">${label}</text></g>`;
}
