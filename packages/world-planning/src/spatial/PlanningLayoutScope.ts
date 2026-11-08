import { planningRegistry } from "./PlanningComponents";
import type { PlanningDocument } from "./PlanningDocument";
import { createSeedPlanningDocument } from "./PlanningInitialization";
import { createWorldStylePlanningDocument } from "./WorldTemplateAuthoring";
import { worldTemplate } from "./WorldTemplateCatalog";
import { resolveComponent } from "./SpatialDocument";

/** World defaults describe generation; all other authoring records address layout instances. */
export function isGlobalPlanningScope(id: string): boolean {
  return id === "world";
}

export function planningSeed(document: PlanningDocument): number {
  return Number(resolveComponent(document, "world", "world", planningRegistry).values.seed);
}

/** Switch only authoring configuration; inactive Seeds never retain generated snapshots. */
export function switchPlanningLayoutScope(draft: PlanningDocument, previousSeed: number): void {
  const nextSeed = planningSeed(draft);
  if (nextSeed === previousSeed) return;
  const archives = draft.layoutOverrides ?? {};
  const outgoing = structuredClone(draft.entities);
  outgoing.world.components.world.values.seed = previousSeed;
  archives[String(previousSeed)] = {
    ...(draft.waterAuthoringVersion === undefined ? {} : { waterAuthoringVersion: draft.waterAuthoringVersion }),
    ...(draft.populationInitialization === undefined
      ? {}
      : { populationInitialization: structuredClone(draft.populationInitialization) }),
    entities: outgoing,
    edits: structuredClone(draft.passthrough.edits),
    parameters: { ...structuredClone(draft.passthrough.parameters), seed: previousSeed },
    ...(draft.authoredResources === undefined ? {} : { authoredResources: structuredClone(draft.authoredResources) })
  };
  const incoming = archives[String(nextSeed)];
  if (incoming?.entities.world) {
    draft.waterAuthoringVersion = incoming.waterAuthoringVersion;
    draft.populationInitialization = structuredClone(incoming.populationInitialization);
    draft.entities = structuredClone(incoming.entities);
    draft.passthrough.edits = structuredClone(incoming.edits);
    draft.passthrough.parameters = structuredClone(incoming.parameters!);
  } else {
    const template = worldTemplate(outgoing.world.components.worldTemplate?.values.id);
    const fresh = template
      ? createWorldStylePlanningDocument(draft, nextSeed, template.id, undefined, true)
      : createSeedPlanningDocument(nextSeed);
    draft.waterAuthoringVersion = fresh.waterAuthoringVersion;
    draft.populationInitialization = structuredClone(fresh.populationInitialization);
    draft.entities = { ...fresh.entities, ...incoming?.entities };
    draft.passthrough = fresh.passthrough;
    draft.passthrough.edits = incoming?.edits ?? {};
    draft.authoredResources = structuredClone(fresh.authoredResources);
    delete draft.placementState;
    // Lighting is presentation, never a seeded spatial variation.
    for (const type of ["lighting", "postProcess", "weather"]) {
      const component = outgoing.world.components[type];
      if (component) draft.entities.world.components[type] = component;
      else delete draft.entities.world.components[type];
    }
  }
  if (incoming?.authoredResources !== undefined) draft.authoredResources = structuredClone(incoming.authoredResources);
  else if (incoming) delete draft.authoredResources;
  draft.entities.world.components.world.values.seed = nextSeed;
  delete archives[String(nextSeed)];
  draft.layoutOverrides = archives;
}
