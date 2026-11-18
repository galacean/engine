import type { PlanningDocument } from "./PlanningDocument";
import { PLANNING_COMPONENTS, planningRegistry } from "./PlanningComponents";
import { resolveComponent, type SpatialDocument } from "./SpatialDocument";
import { planningSeed } from "./PlanningLayoutScope";

/** A system describes the resource shape; the host owns URL/virtual-path resolution. */
export interface PlanningResourceDefinition {
  readonly field: string;
  readonly validate: (data: unknown) => unknown;
}
export type PlanningResourceLoader = (url: string, signal: AbortSignal) => Promise<unknown>;

/** Headless authoring checks data only. Native hosts replace this with their ResourceManager loader. */
export const loadPlanningResourceJSON: PlanningResourceLoader = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Resource request failed: HTTP ${response.status}`);
  return response.json();
};

/** Resolve set/reset/base before comparing references. No author state is mutated during I/O. */
export async function validatePlanningResourceChanges(
  previous: PlanningDocument,
  next: PlanningDocument,
  load: PlanningResourceLoader,
  signal: AbortSignal
): Promise<void> {
  const definitions = PLANNING_COMPONENTS.filter((definition) => definition.resources?.length);
  const pending = new Map<string, Promise<unknown>>();
  const previousSeed = String(planningSeed(previous));
  const scopes = [
    { previous, next },
    ...Object.entries(next.layoutOverrides ?? {}).map(([seed, archive]) => ({
      // Moving the outgoing active Seed into its archive preserves the same author references.
      previous:
        seed === previousSeed
          ? previous
          : previous.layoutOverrides?.[seed]
            ? { ...previous, entities: previous.layoutOverrides[seed].entities }
            : undefined,
      next: { ...next, entities: archive.entities }
    }))
  ];
  for (const scope of scopes)
    for (const entity of Object.values(scope.next.entities))
      for (const definition of definitions) {
        if (!entity.components[definition.type]) continue;
        const values = resolveComponent(scope.next, entity.id, definition.type, planningRegistry).values;
        const prior = scope.previous?.entities[entity.id]?.components[definition.type]
          ? resolveComponent(scope.previous as SpatialDocument, entity.id, definition.type, planningRegistry).values
          : Object.fromEntries(definition.fields.map((field) => [field.key, field.default]));
        for (const resource of definition.resources!) {
          const url = values[resource.field];
          if (url === undefined || url === prior[resource.field]) continue;
          if (typeof url !== "string" || !url.trim())
            throw new Error(`Invalid resource reference: ${definition.type}.${resource.field}`);
          try {
            signal.throwIfAborted();
            let request = pending.get(url);
            if (!request) {
              request = load(url, signal);
              pending.set(url, request);
            }
            const data = await request;
            signal.throwIfAborted();
            resource.validate(data);
          } catch (error) {
            throw new Error(
              `资源验证失败：${definition.type}.${resource.field}（${url}）：${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
}
