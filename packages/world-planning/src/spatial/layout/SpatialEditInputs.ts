import type { PlanningDocument } from "../PlanningDocument";
import { PLANNING_COMPONENTS, planningFieldEditEffect } from "../PlanningComponents";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)] as const)
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Complement the resolved recipe with author inputs that the legacy recipe does not encode.
 * In particular names, anchor, layout, POI and solid fields must never masquerade as a reveal edit.
 * Empty generated entity shells and mapped fields stay out: their effective values are already
 * compared through exportPlanningRecipe, including implicit and explicit component inheritance.
 */
export function spatialRevealInputSignature(document: PlanningDocument): string {
  const { revision, entities, placementState, passthrough, authoredResources, farmInitializationRequests, ...other } =
    document;
  const projected = Object.fromEntries(
    Object.entries(entities).flatMap(([id, entity]) => {
      const components = canonical(
        Object.fromEntries(
          Object.entries(entity.components)
            .filter(([type]) => {
              const definition = PLANNING_COMPONENTS.find((item) => item.type === type);
              return !definition?.presentation && !definition?.runtime;
            })
            .map(([type, component]) => {
              const definition = PLANNING_COMPONENTS.find((item) => item.type === type);
              const binding = id === "world" ? definition?.global : definition?.local;
              const unmapped = (key: string) =>
                definition?.fields.find((field) => field.key === key)?.affectsLayout !== false &&
                !binding?.[key] &&
                (!definition || planningFieldEditEffect(type, key) !== "reveal");
              const values = Object.fromEntries(Object.entries(component.values).filter(([key]) => unmapped(key)));
              const hasUnmappedFields =
                !definition ||
                definition.fields.some(
                  (field) =>
                    unmapped(field.key) &&
                    // World-only fields cannot acquire local meaning through a POI's
                    // implicit component base. Explicit values above remain guarded.
                    (id === "world" || !field.kinds?.every((kind) => kind === "world"))
                );
              return [type, { values, ...(hasUnmappedFields && component.base ? { base: component.base } : {}) }];
            })
        )
      );
      const name = entity.name !== id ? entity.name : undefined;
      return components || name || entity.parent || entity.origin === "authored"
        ? [[id, { components, name, parent: entity.parent, authored: entity.origin === "authored" ? true : undefined }]]
        : [];
    })
  );
  return JSON.stringify(canonical({ ...other, authoredResources: authoredResources ?? [], entities: projected }));
}
