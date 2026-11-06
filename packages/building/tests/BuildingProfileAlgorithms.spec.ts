import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { buildingPlacementAlgorithms } from "../src/tiny-glade/parts/BuildingAlgorithms";
import { European } from "../src/tiny-glade/parts/architecture/European";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import { validateBuildingWorkerDraft } from "../src/tiny-glade/parts/architecture/BuildingCpu";
import { constructionGeometry } from "./fixtures/constructionGeometry";

const build = (draft: ReturnType<typeof European.buildHouses>) =>
  implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
describe("custom placement on analytic profile supports", () => {
  it("executes the authored async function and packs its actual cells, without replacing it with its geometry basis", async () => {
    const grid = buildingPlacementAlgorithms.resolve("grid");
    let calls = 0;
    buildingPlacementAlgorithms.register(
      "test.sparse-roof",
      async (support, params, context) => {
        calls++;
        const result = await grid(support, params, context);
        if (Array.isArray(result) || !("kind" in result) || result.kind !== "profile") throw Error("Expected profile");
        const layout = result.output.draws.find((d) => "role" in d && d.role === "layout");
        if (!layout || !("cells" in layout)) throw Error("Missing roof cells");
        const removed = new Set(layout.cells.filter((_, index) => index % 2 === 0).map((cell) => cell.id));
        layout.cells = layout.cells.filter((cell) => !removed.has(cell.id));
        for (const plan of result.output.plans)
          plan.cells = plan.cells.filter((cell: { id: string }) => !removed.has(cell.id));
        return result;
      },
      { profile: { basis: "grid" } }
    );
    const draft = European.buildHouses({ id: "house", roofStyle: { algorithm: { type: "grid" } } });
    const original = await build(draft);
    draft.parts.find((p) => p.type === "roof")!.algorithm.type = "test.sparse-roof";
    const actual = await build(draft);
    const a = original.renderInput.groups.find((g) => g.role === "layout")!;
    const b = actual.renderInput.groups.find((g) => g.role === "layout")!;
    expect(calls).toBe(1);
    expect(b.cells.length).toBe(Math.floor(a.cells.length / 2));
    expect(b.units.roof_tile.byteLength).toBe(b.cells.length * 64);
    expect(b.units.roof_tile.byteLength).toBeLessThan(a.units.roof_tile.byteLength);
    expect(actual.renderInput.plans.find((p) => p.binding_id === "house-roof/placement").cells.length).toBe(
      original.renderInput.plans.find((p) => p.binding_id === "house-roof/placement").cells.length -
        Math.ceil(a.cells.length / 2)
    );
    expect(actual.renderInput.groups.filter((g) => g.role !== "layout")).toEqual(
      original.renderInput.groups.filter((g) => g.role !== "layout")
    );
    expect(draft.parts.find((p) => p.type === "roof")!.algorithm.type).toBe("test.sparse-roof");
    expect(() => validateBuildingWorkerDraft(draft)).toThrow(/not bundled for Worker execution/);
  });

  it.each(["nativeMasonry", "foundationSurface"] as const)(
    "%s convention is independent of the authored algorithm name",
    async (basis) => {
      const base = buildingPlacementAlgorithms.resolve(basis);
      const custom = vi.fn((...args: Parameters<typeof base>) => base(...args));
      buildingPlacementAlgorithms.register("test.custom-" + basis, custom, { profile: { basis } });
      const draft = European.buildHouses({
        id: "home",
        foundation: { height: 0.7 },
        wall: { algorithm: { type: "nativeMasonry" } },
        foundationStyle: { algorithm: { type: "foundationSurface" } }
      });
      const original = await build(draft);
      draft.parts.find((p) => p.algorithm.type === basis)!.algorithm.type = "test.custom-" + basis;
      const actual = await build(draft);
      expect(custom).toHaveBeenCalledTimes(1);
      expect(actual.renderInput).toEqual(original.renderInput);
    }
  );

  it("requires an explicit geometry convention instead of guessing from an unknown algorithm name", () => {
    buildingPlacementAlgorithms.register("test.unspecified-profile", () => []);
    const draft = European.buildHouses({ id: "house", roofStyle: { algorithm: { type: "test.unspecified-profile" } } });
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(
      /declare its profile geometry convention/
    );
    expect(() =>
      buildingPlacementAlgorithms.register("test.invalid-convention", () => [], {
        profile: { basis: "unknown" as any }
      })
    ).toThrow(/Unknown profile geometry convention/);
    expect(() => buildingPlacementAlgorithms.resolve("test.invalid-convention")).toThrow(/Unknown building algorithm/);
  });

  it("keeps the geometry declaration immutable and checks incompatible supports", () => {
    const policy = { basis: "nativeMasonry" as const };
    const fn = buildingPlacementAlgorithms.register("test.wall-only", () => [], { profile: policy });
    expect(() => buildingPlacementAlgorithms.register("test.wall-only", fn, { profile: { basis: "grid" } })).toThrow(
      /cannot change/
    );
    const draft = European.buildHouses({ id: "house", roofStyle: { algorithm: { type: "test.wall-only" } } });
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(/does not accept/);
  });
});
