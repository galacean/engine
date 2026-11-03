import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { PLANNING_OBJECT_CSS as colors } from "./PlanningSurfacePalette";
import { planningVectorSurface } from "./PlanningVectorSurface";

/** Metre-scale parcel drawing; all soil areas use the shared surface geometry. */
export function drawVillagePlan(plan: IslandPlan): string {
  const ring = (points: PlanPoint[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.z}`).join(" ") + "Z";
  const building = plan.buildings
    .map(
      (b) =>
        `<g data-feature-id="${b.regionId}" role="button" aria-label="院落 ${b.regionId}"><path class="ip-feature-outline" d="${ring(b.outline)}" fill="${colors.building}" stroke="${colors.buildingEdge}" stroke-width=".2"/></g>`
    )
    .join("");
  const yards = (plan.courtyards ?? [])
    .map(
      (c, i) =>
        `<g data-feature-id="${c.id}" role="button" aria-label="院落 ${i + 1}"><path class="ip-feature-outline" d="${ring(c.outline)}" fill="transparent" stroke="none"/>${c.fences.map((f) => `<rect x="${f.center.x - f.sizeX / 2}" y="${f.center.z - f.sizeZ / 2}" width="${f.sizeX}" height="${f.sizeZ}" fill="${colors.rock}"/>`).join("")}</g>`
    )
    .join("");
  const labels = (plan.courtyards ?? [])
    .map(
      (c, i) =>
        `<text x="${c.outline[0].x + 2}" y="${c.outline[0].z + 4}" font-size="2.5" fill="${colors.ink}">院落 ${i + 1}</text>`
    )
    .join("");
  const gates = (plan.courtyards ?? [])
    .map(
      (c) =>
        `<path d="M${c.gate.x},${c.gate.z - c.gateWidth / 2}v${c.gateWidth}" stroke="${colors.ink}" stroke-width=".35" stroke-dasharray=".5 .4"/><circle cx="${c.door.x}" cy="${c.door.z}" r=".6" fill="${colors.ink}"/>`
    )
    .join("");
  return (
    planningVectorSurface(plan) +
    `<g data-plan-layer="building">${yards}${building}</g><g data-plan-layer="entrance">${gates}</g><g data-plan-layer="labels" pointer-events="none">${labels}<text x="80" y="21" text-anchor="middle" font-size="3" fill="${colors.ink}">村庄道路 · 泥土地</text></g><g data-plan-layer="spawn"><circle cx="${plan.spawn.x}" cy="${plan.spawn.z}" r="1" fill="#79edc2" stroke="${colors.ink}" stroke-width=".3"/></g><g data-plan-layer="furniture"><path d="M25 143v2h10v-2" fill="none" stroke="${colors.ink}" stroke-width=".3"/><text x="30" y="149" text-anchor="middle" font-size="2.5" fill="${colors.ink}">10 米</text></g>`
  );
}
