import { SUBJECT_VIEW_DECLARATION } from "@galacean/engine-world-planning/spatial/PlanningSubjectView";
import { GRASS_APPEARANCE_DECLARATION } from "@galacean/engine-world-planning/spatial/PlanningGrassAppearance";
import { PLANNING_WEATHER_DECLARATION } from "@galacean/engine-world-planning/spatial/PlanningWeather";
import { PLANNING_LIGHTING_DECLARATION } from "@galacean/engine-world-planning/spatial/PlanningLightingParameters";
import { PLANT_MATERIAL_DECLARATION } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { VEGETATION_SYSTEM_DECLARATION } from "../src/planning/spatial/ecology/VegetationSystemDeclaration.ts";
import type { PlanningSystemDeclaration, PlanningSystemKnowledge } from "@galacean/engine-world-planning/spatial/PlanningSystemDeclaration";

/** App composition only: each system owns its knowledge beside its public parameters. */
export const PLANNING_SYSTEM_DECLARATIONS: readonly PlanningSystemDeclaration[] = [
  PLANNING_LIGHTING_DECLARATION,
  VEGETATION_SYSTEM_DECLARATION,
  PLANT_MATERIAL_DECLARATION,
  GRASS_APPEARANCE_DECLARATION,
  PLANNING_WEATHER_DECLARATION,
  SUBJECT_VIEW_DECLARATION
];

/** Intent execution checks come from the same owner as its public knowledge. */
export function validatePlanningSystemExecution(
  component: string,
  patch: Readonly<Record<string, unknown>>,
  effective: Readonly<Record<string, unknown>>
): string | undefined {
  const owner = PLANNING_SYSTEM_DECLARATIONS.flatMap(system => system.components).find(entry => entry.type === component);
  return owner?.validateExecution?.(patch, effective);
}

/** Asset-derived effective values remain the responsibility of the owning system. */
export async function readPlanningSystemInherited(
  component: string, current: Readonly<Record<string, unknown>>, fields: readonly string[], signal: AbortSignal
) {
  const owner = PLANNING_SYSTEM_DECLARATIONS.flatMap(system => system.components).find(entry => entry.type === component);
  return owner?.readInherited?.(current, fields, signal);
}

/** Neither this registry nor its consumers infer capabilities from theme or mood words. */
export function collectPlanningSystemKnowledge(
  componentTypes: Iterable<string>,
  declarations: readonly PlanningSystemDeclaration[] = PLANNING_SYSTEM_DECLARATIONS
): PlanningSystemKnowledge[] {
  const available = new Set(componentTypes);
  return declarations.flatMap(system => {
    const components = system.components.filter(component => available.has(component.type));
    return components.length ? [{
      id: system.id, title: system.title, knowledgePath: system.knowledgePath,
      components: components.map(component => component.type),
      domains: Object.fromEntries(components.map(component => [component.type, component.domain])),
      knowledge: components.flatMap(component => component.knowledge)
    }] : [];
  });
}
