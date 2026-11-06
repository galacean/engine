import { type BuildingDerivedPart, type BuildingDesignPart, validateDesignParts } from "./BuildingDesignIdentity";
import { AlgorithmLibrary, copyBuildingValue } from "../BuildingAlgorithms";
import {
  validateBuildingDraft,
  profileSupportGenerators,
  type BuildingBasePart,
  type BuildingDraft,
  type BuildingRelation
} from "./BuildingDraft";

/** Transient geometric constraint emitted by a connection rule, never persisted
 * beside its author relation. Endpoints are part identities, not naming conventions. */
export interface BuildingConstraint {
  relation: string;
  kind: "wallRoofJoint" | "foundationContact" | "attachment";
  from: string;
  to: string;
}
/** Solvers operate on one working draft. A solver may change supports, derive flat
 * parts, or publish a constraint for the geometry stage. Built-ins use this same contract. */
export type BuildingConnectionRule = (context: {
  parts: readonly BuildingBasePart[];
  relation: BuildingRelation;
  constrain(constraint: Omit<BuildingConstraint, "relation">): void;
}) => readonly BuildingDerivedPart[] | void;
export const buildingConnectionRules = new AlgorithmLibrary<BuildingConnectionRule>();

function validateConstraint(parts: BuildingBasePart[], constraint: BuildingConstraint) {
  const from = parts.find((p) => p.id === constraint.from);
  const to = parts.find((p) => p.id === constraint.to);
  if (!from || !to) throw Error("Missing constraint endpoint: " + constraint.relation);
  const supports = {
    wallRoofJoint: ["wallProfile", ["roofProfile"]],
    foundationContact: ["foundationProfile", ["wallProfile"]],
    attachment: ["attachmentMount", ["wallProfile", "roofProfile"]]
  } as const;
  const expected = supports[constraint.kind];
  if (
    !expected ||
    from.support.generator !== expected[0] ||
    !(expected[1] as readonly string[]).includes(to.support.generator)
  )
    throw Error("Constraint requires compatible profile supports: " + constraint.relation);
  if (from.group !== to.group) throw Error("Profile constraints must belong to the same group: " + constraint.relation);
}

export function resolveBuildingConnections(input: BuildingDraft) {
  const draft = copyBuildingValue(input);
  validateBuildingDraft(draft);
  const constraints: BuildingConstraint[] = [];
  const derived: BuildingDesignPart[] = [];
  for (const relation of draft.relations) {
    const extra = buildingConnectionRules.resolve(relation.rule)({
      parts: draft.parts,
      relation,
      constrain: (constraint) => {
        const resolved = { ...constraint, relation: relation.id };
        validateConstraint(draft.parts, resolved);
        constraints.push(resolved);
      }
    });
    for (const result of extra ?? []) {
      if ("id" in result || "identity" in result || "publication" in result)
        throw Error("Connection results require localId, not author or resolved identity");
      if (profileSupportGenerators.has(result.support.generator))
        throw Error(
          "Derived connection parts require a resolved Point, Path or Mesh support; profile bodies belong to the author draft"
        );
      const { localId, ...definition } = result;
      derived.push({
        ...definition,
        identity: {
          kind: "derived",
          producer: relation.rule,
          source: { kind: "relation", id: relation.id },
          localId
        }
      });
    }
    validateDesignParts(derived, draft);
    // Rules can edit author geometry; derived results never become author endpoints.
    validateBuildingDraft(draft);
  }
  for (const constraint of constraints) validateConstraint(draft.parts, constraint);
  return { draft, constraints, derived };
}

function endpoints(
  parts: readonly BuildingBasePart[],
  relation: BuildingRelation,
  fromSupport: string,
  fromBoundary: string,
  toSupports: readonly string[],
  toBoundary: string
) {
  const from = parts.find((p) => p.id === relation.from.part)!;
  const to = parts.find((p) => p.id === relation.to.part)!;
  if (from.support.generator !== fromSupport || !toSupports.includes(to.support.generator))
    throw Error(`Rule ${relation.rule} requires profile supports; register a connection rule for these supports`);
  if (relation.from.boundary !== fromBoundary || relation.to.boundary !== toBoundary)
    throw Error("Invalid connection boundary: " + relation.id);
  if (from.group !== to.group) throw Error("Profile constraints must belong to the same group: " + relation.id);
  return { from: from.id, to: to.id };
}

export const wallRoofJoint = buildingConnectionRules.register("wallRoofJoint", ({ parts, relation, constrain }) => {
  constrain({ kind: "wallRoofJoint", ...endpoints(parts, relation, "wallProfile", "top", ["roofProfile"], "base") });
});
export const foundationContact = buildingConnectionRules.register(
  "foundationContact",
  ({ parts, relation, constrain }) => {
    constrain({
      kind: "foundationContact",
      ...endpoints(parts, relation, "foundationProfile", "top", ["wallProfile"], "base")
    });
  }
);
function attachmentRule({ parts, relation, constrain }: Parameters<BuildingConnectionRule>[0]) {
  constrain({
    kind: "attachment",
    ...endpoints(parts, relation, "attachmentMount", "mount", ["wallProfile", "roofProfile"], "surface")
  });
}
// Separate registrations preserve stable rule names; both currently resolve the
// same host constraint. The attachment geometry decides its actual aperture.
export const opening = buildingConnectionRules.register("opening", (context) => attachmentRule(context));
export const mount = buildingConnectionRules.register("mount", (context) => attachmentRule(context));
