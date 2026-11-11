import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import type { BuildingCoreDraft, ConnectionDef } from "../../core";
import { validateBuildingDraft } from "./BuildingCpu";

export interface BuildingSourceOptions {
  /** Scene identity of the shared compilation frame. */
  id: string;
  name?: string;
  assetLibrary?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Optional native transforms of the ordinary group nodes. Supports remain
   * local to those nodes; generated geometry is never stored here. */
  groupTransforms?: Record<string, Pick<GalaceanSourceEntitySchema, "position" | "rotation" | "scale">>;
  /** Resolve native resources/nodes through the owning project's Source identity. */
  reference?: (value: object) => GalaceanSourceValue | undefined;
}

/** The part that stores a connection: the guest of an attach, the first part of a join. */
const connectionStart = (c: ConnectionDef) => (c.kind === "attach" ? c.guest : c.parts[0]);
/** Persist author definitions, never a generated mesh or a live engine graph.
 * Runtime Units must have a project reference; JSON cannot silently copy them. */
function sourceValue(
  value: unknown,
  reference: BuildingSourceOptions["reference"],
  parents = new Set<object>()
): GalaceanSourceValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null)
    throw Error("Building Source requires finite, serializable author values");
  if (parents.has(value)) throw Error("Building Source cannot contain cyclic author values");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    const resolved = reference?.(value);
    if (!resolved || typeof resolved !== "object" || !("$ref" in resolved || "$entity" in resolved))
      throw Error("Native building resources and Units require a project $ref or $entity reference");
    return sourceValue(resolved, undefined, parents);
  }
  parents.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => sourceValue(item, reference, parents));
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sourceValue(item, reference, parents)])
    );
  } finally {
    parents.delete(value);
  }
}

/** One native frame with editable group nodes and flat BuildingPartComponents.
 * Node hierarchy owns grouping; there is no recursive architectural recipe. */
export function buildingDraftSource(
  draft: BuildingCoreDraft,
  options: BuildingSourceOptions
): {
  rootEntities: string[];
  entities: GalaceanSourceEntitySchema[];
  components: GalaceanSourceComponentSchema[];
} {
  validateBuildingDraft(draft);
  if (Object.keys(options.groupTransforms ?? {}).some((id) => !draft.groups.some((g) => g.id === id)))
    throw Error("Building Source transform references an unknown group");
  if (!options.id?.trim()) throw Error("Building Source requires a frame identity");
  if (options.assetLibrary !== undefined && !options.assetLibrary.trim())
    throw Error("Invalid building library reference");
  // Typed tuples form disjoint Source namespaces. The caller's root ID is
  // included in every allocated ID; tuple encoding is injective and strictly
  // longer than that root, even when author names contain our encoding syntax.
  const identity = (kind: "group-node" | "group-component" | "part-node" | "part-component", id: string) =>
    JSON.stringify([options.id, kind, id]);
  const frame: GalaceanSourceEntitySchema = {
    id: options.id,
    name: options.name ?? options.id,
    children: [],
    ...(options.position ? { position: [...options.position] } : {}),
    ...(options.rotation ? { rotation: [...options.rotation] } : {})
  };
  const entities = [frame],
    components: GalaceanSourceComponentSchema[] = [];
  for (const group of draft.groups) {
    const parts = draft.parts.filter((p) => p.group === group.id);
    const node: GalaceanSourceEntitySchema = {
      id: identity("group-node", group.id),
      name: group.id,
      components: [identity("group-component", group.id)],
      children: [],
      ...structuredClone(options.groupTransforms?.[group.id] ?? {})
    };
    frame.children!.push(node.id);
    entities.push(node);
    components.push({
      id: identity("group-component", group.id),
      type: "BuildingGroupComponent",
      props: sourceValue(
        {
          definition: group,
          frame: { $entity: frame.id },
          ...(options.assetLibrary ? { assetLibrary: { $ref: options.assetLibrary } } : {})
        },
        options.reference
      ) as GalaceanSourceValueRecord
    });
    for (const part of parts) {
      const entity: GalaceanSourceEntitySchema = {
        id: identity("part-node", part.id),
        name: part.type,
        components: [identity("part-component", part.id)]
      };
      node.children!.push(entity.id);
      entities.push(entity);
      components.push({
        id: identity("part-component", part.id),
        type: "BuildingPartComponent",
        props: sourceValue(
          {
            definition: part,
            frame: { $entity: frame.id },
            connections: (draft.connections ?? []).filter((c) => connectionStart(c) === part.id)
          },
          options.reference
        ) as GalaceanSourceValueRecord
      });
    }
  }
  return { rootEntities: [frame.id], entities, components };
}
