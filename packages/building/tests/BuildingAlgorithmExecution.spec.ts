import {
  buildingAuthorKey,
  buildingDesignKey
} from "../src/tiny-glade/parts/architecture/BuildingDesignIdentity";
import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { European } from "../src/tiny-glade/parts/architecture/European";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import {
  buildingConnectionRules,
  resolveBuildingConnections
} from "../src/tiny-glade/parts/architecture/BuildingDesignRules";
import { buildingPlacementAlgorithms } from "../src/tiny-glade/parts/BuildingAlgorithms";
import { constructionGeometry } from "./fixtures/constructionGeometry";

describe("part algorithms and resolved connection constraints", () => {
  it("executes built-in connection rules through the same registry as custom rules", () => {
    const draft = European.buildHouses({ id: "home", foundation: { height: 1 } });
    const resolve = vi.spyOn(buildingConnectionRules, "resolve");
    try {
      const result = resolveBuildingConnections(draft);
      expect(resolve.mock.calls.map(([name]) => name)).toEqual(draft.relations.map((r) => r.rule));
      expect(result.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "wallRoofJoint", from: "home-wall", to: "home-roof" }),
          expect.objectContaining({ kind: "foundationContact", from: "home-foundation", to: "home-wall" })
        ])
      );
      expect(draft).not.toHaveProperty("constraints");
    } finally {
      resolve.mockRestore();
    }
  });

  it("consumes geometric constraints emitted by a custom rule without matching its name", async () => {
    buildingConnectionRules.register("test.roof-height-constraint", ({ relation, constrain }) => {
      constrain({ kind: "wallRoofJoint", from: relation.from.part, to: relation.to.part });
    });
    const draft = European.buildHouses({ id: "home" });
    const before = await implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
    draft.relations[0].rule = "test.roof-height-constraint";
    const after = await implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
    expect(after.groups).toEqual(before.groups);
    expect(after.preview).toEqual(before.preview);
  });

  it("rejects conflicting derived identities before any geometry is published", () => {
    buildingConnectionRules.register("test.duplicate-part", ({ parts }) => {
      const { id, ...base } = parts[0];
      const result = {
        ...base,
        support: { generator: "point", params: {} },
        localId: "same",
        selection: { kind: "part" as const, id }
      };
      return [result, result];
    });
    const draft = European.buildHouses({ id: "home" });
    draft.relations[0].rule = "test.duplicate-part";
    const original = JSON.stringify(draft);
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(/Duplicate design identity/);
    expect(JSON.stringify(draft)).toBe(original);
  });

  it("rejects a custom constraint whose endpoints have incompatible geometry", () => {
    buildingConnectionRules.register("test.invalid-constraint", ({ relation, constrain }) => {
      constrain({ kind: "foundationContact", from: relation.from.part, to: relation.to.part });
    });
    const draft = European.buildHouses({ id: "home" });
    draft.relations[0].rule = "test.invalid-constraint";
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(/compatible profile supports/);
  });

  it.each(["wallProfile", "foundationProfile", "roofProfile"])(
    "%s places only its selected part, not the entire house",
    async (generator) => {
      const draft = European.buildHouses({ id: "home", foundation: { height: 1 } });
      const design = designBuilding(draft, () => 0, constructionGeometry);
      const support = design.profileSupports[0];
      const part = draft.parts.find((p) => p.support.generator === generator)!;
      const placed = await buildingPlacementAlgorithms.resolve(part.algorithm.type)(
        {
          type: "surface",
          profile: {
            part,
            support,
            reservations: design.supports.get(buildingAuthorKey(support.part.id))?.reservations ?? [],
            decoration: design.prepared.decorations[0],
            contactHoles: design.prepared.contactHoles.get(support.nativeId),
            neighbors: design.profileSupports,
            terrain: () => 0,
            assets: constructionGeometry
          }
        },
        part.params,
        {}
      );
      if (Array.isArray(placed) || !("kind" in placed) || placed.kind !== "profile")
        throw Error("Expected profile output");
      const output = placed.output;
      expect(output.plans.map((p) => p.binding_id)).toEqual([part.id + "/placement"]);
      expect(output.geometries.map((g) => g.id)).toEqual([part.id]);
      expect(output.draws.length).toBeGreaterThan(0);
      expect(output.walls).toHaveLength(generator === "wallProfile" ? 1 : 0);
      expect(output.roofs).toHaveLength(generator === "roofProfile" ? 1 : 0);
    }
  );
});
