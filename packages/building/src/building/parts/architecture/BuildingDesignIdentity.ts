import { buildingGroupKey, buildingPartKey } from "../../runtime/BuildingObjectIdentity";
import { validateBuildingAppearance, type BuildingBasePart, type BuildingDraft } from "./BuildingDraft";

/** Design identities never share a namespace with persisted author IDs. */
export type BuildingDesignIdentity =
  | { kind: "author"; id: string }
  | {
      kind: "derived";
      producer: string;
      source: { kind: "relation"; id: string } | { kind: "parts"; ids: string[] };
      localId: string;
    };
export type BuildingSelection = { kind: "part" | "group"; id: string };
export interface BuildingDesignPart extends Omit<BuildingBasePart, "id"> {
  identity: BuildingDesignIdentity;
  /** The editable author object selected when this result is picked. */
  selection: BuildingSelection;
  publication?: { format: string; candidate?: number; decorationId?: string; colorId?: number };
}
/** A rule names results only within its own invocation, never in the author namespace. */
export interface BuildingDerivedPart extends Omit<BuildingBasePart, "id"> {
  localId: string;
  selection: BuildingSelection;
}
declare const designKey: unique symbol;
export type BuildingDesignKey = string & { readonly [designKey]: true };
export function buildingDesignKey(identity: BuildingDesignIdentity): BuildingDesignKey {
  return JSON.stringify(
    identity.kind === "author"
      ? ["author", identity.id]
      : [
          "derived",
          identity.producer,
          identity.source.kind,
          identity.source.kind === "relation" ? identity.source.id : identity.source.ids,
          identity.localId
        ]
  ) as BuildingDesignKey;
}
export function buildingAuthorKey(id: string): BuildingDesignKey {
  return buildingDesignKey({ kind: "author", id });
}
export function authoredDesignPart(part: BuildingBasePart): BuildingDesignPart {
  const { id, ...definition } = part;
  return { ...definition, identity: { kind: "author", id }, selection: { kind: "part", id } };
}
export function buildingSelectionKey(selection: BuildingSelection): string {
  return selection.kind === "part" ? buildingPartKey(selection.id) : buildingGroupKey(selection.id);
}
export function validateDesignParts(parts: readonly BuildingDesignPart[], draft: BuildingDraft): void {
  const keys = new Set<BuildingDesignKey>();
  const authorIds = new Set(draft.parts.map((p) => p.id));
  const groupIds = new Set(draft.groups.map((g) => g.id));
  const relationIds = new Set(draft.relations.map((r) => r.id));
  for (const part of parts) {
    validateBuildingAppearance(part.appearance);
    const identity = part.identity;
    if (identity.kind === "author") {
      if (!authorIds.has(identity.id)) throw Error("Unknown author part in design");
    } else {
      if (
        typeof identity.producer !== "string" ||
        !identity.producer ||
        typeof identity.localId !== "string" ||
        !identity.localId
      )
        throw Error("Derived identity requires a producer and local ID");
      if (identity.source.kind === "relation") {
        if (!relationIds.has(identity.source.id)) throw Error("Unknown derived source relation");
      } else if (!identity.source.ids.length || identity.source.ids.some((id) => !authorIds.has(id))) {
        throw Error("Unknown derived source part");
      }
    }
    const key = buildingDesignKey(identity);
    if (keys.has(key)) throw Error("Duplicate design identity: " + key);
    keys.add(key);
    if (!groupIds.has(part.group)) throw Error("Unknown design group: " + part.group);
    const selection = part.selection;
    if (
      !selection ||
      !["part", "group"].includes(selection.kind) ||
      !(selection.kind === "part" ? authorIds : groupIds).has(selection.id)
    )
      throw Error("Unknown design selection");
  }
}
