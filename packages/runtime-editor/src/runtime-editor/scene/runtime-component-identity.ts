import type {} from "../generated/editor-source-schema";

/** Persisted Scene identity. Engine instanceId and names are never editing identities. */
export interface RuntimeComponentIdentity {
  readonly scene: string;
  readonly entityId: string;
  readonly id: string;
  readonly type: string;
}
export interface RuntimeComponentSelector {
  readonly entityId?: string;
  readonly id?: string;
  readonly type?: string;
}

export function runtimeComponentIdentities(
  source: GalaceanSourceSceneFile,
  scene: string,
  selector: RuntimeComponentSelector = {}
): RuntimeComponentIdentity[] {
  const owners = new Map<string, string>();
  for (const entity of source.entities) {
    for (const id of entity.components ?? []) {
      if (owners.has(id)) throw new Error(`Ambiguous component owner: ${id}`);
      owners.set(id, entity.id);
    }
  }
  const seen = new Set<string>();
  const result: RuntimeComponentIdentity[] = [];
  for (const component of source.components) {
    if (seen.has(component.id)) throw new Error(`Duplicate component identity: ${component.id}`);
    seen.add(component.id);
    const entityId = owners.get(component.id);
    if (entityId === undefined) throw new Error(`Component has no owning entity: ${component.id}`);
    if (selector.id !== undefined && selector.id !== component.id) continue;
    if (selector.entityId !== undefined && selector.entityId !== entityId) continue;
    if (selector.type !== undefined && selector.type !== component.type) continue;
    result.push({ scene, entityId, id: component.id, type: component.type });
  }
  return result;
}
