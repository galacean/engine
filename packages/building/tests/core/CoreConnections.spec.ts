import { describe, expect, it } from "vitest";
import {
  attachPairKey,
  authorConnectionKey,
  authorPartKey,
  createBuildingRegistry,
  derivedConnectionKey,
  derivedPartKey,
  designBuildingCore,
  detectedConnectionKey,
  joinPairKey,
  type BuildingCoreDraft,
  type BuildingDesignResult,
  type Rect
} from "../../src/building/core";
import { crossingDraft, houseDraft, roofPart, testRegistry, unitsOf } from "./fixtures";

const cellsOf = (result: BuildingDesignResult, id: string) =>
  unitsOf(result.parts.find((p) => p.key === authorPartKey(id))!);
const instancesOf = (result: BuildingDesignResult, part: string) =>
  new Map(unitsOf(result.parts.find((p) => p.key === part)!).map((u) => [u.key, u]));
const wallOf = (result: BuildingDesignResult) => result.parts.find((p) => p.key === authorPartKey("wall"))!;
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** The rect of a surfaceGrid unit key "face:r:c" with 0.5 × 0.25 cells and stagger 0.5. */
function gridRect(key: string): Rect {
  const [, r, c] = key.split(":").map(Number);
  const offset = r % 2 ? 0.25 : 0;
  return [offset + c * 0.5, r * 0.25, offset + (c + 1) * 0.5, (r + 1) * 0.25];
}
const WALL_CELLS = 12 * 16 + 0 - 6; // 12 rows; odd rows lose one cell to the stagger.

describe("Attach connections", () => {
  it("opens the host under the guest unit and lays around the opening", () => {
    const result = designBuildingCore(houseDraft(2), testRegistry());
    expect(result.diagnostics).toEqual([]);
    const wall = result.parts.find((p) => p.key === authorPartKey("wall"))!;
    expect(wall.modifications).toEqual([{ element: "face", op: "removeArea", rect: [1.5, 0.9, 2.5, 2.1] }]);
    const hole: Rect = [1.5, 0.9, 2.5, 2.1];
    expect(unitsOf(wall).length).toBeLessThan(WALL_CELLS);
    for (const cell of unitsOf(wall)) expect(overlaps(gridRect(cell.key), hole)).toBe(false);
    expect(instancesOf(result, authorPartKey("window")).size).toBe(1);
  });

  it("keeps every cell away from an edit unchanged", () => {
    const before = designBuildingCore(houseDraft(2), testRegistry());
    const after = designBuildingCore(houseDraft(5), testRegistry());
    const a = instancesOf(before, authorPartKey("wall")),
      b = instancesOf(after, authorPartKey("wall"));
    const holes: Rect[] = [
      [1.5, 0.9, 2.5, 2.1],
      [4.5, 0.9, 5.5, 2.1]
    ];
    let shared = 0;
    for (const [key, instance] of a)
      if (b.has(key)) {
        expect(b.get(key)).toEqual(instance);
        shared++;
      } else expect(holes.some((h) => overlaps(gridRect(key), h))).toBe(true);
    for (const key of b.keys()) if (!a.has(key)) expect(holes.some((h) => overlaps(gridRect(key), h))).toBe(true);
    expect(shared).toBeGreaterThan(a.size * 0.8);
  });

  it("resolves rules as connection override, then group override, then type-pair default", () => {
    const base = houseDraft();
    const byConnection: BuildingCoreDraft = {
      ...base,
      connections: [{ ...base.connections![0], rule: "none" }]
    };
    expect(wallOf(designBuildingCore(byConnection, testRegistry())).modifications).toEqual([]);
    const byGroup: BuildingCoreDraft = {
      ...base,
      groups: [{ ...base.groups[0], rules: { [attachPairKey("window", ["wall"])]: "none" } }]
    };
    expect(wallOf(designBuildingCore(byGroup, testRegistry())).modifications).toEqual([]);
    const missing = designBuildingCore(base, createBuildingRegistry());
    expect(missing.diagnostics).toEqual([
      { source: authorConnectionKey("window-on-wall"), message: "No rule for attach:window>wall" }
    ]);
  });

  it("supports several hosts", () => {
    const house = houseDraft();
    const draft: BuildingCoreDraft = {
      groups: house.groups,
      parts: [
        house.parts[0],
        roofPart("roof", "house"),
        {
          id: "half",
          group: "house",
          type: "halfDormer",
          geometry: {
            generator: "onHost",
            params: {
              points: [
                { id: "low", host: 0, element: "face", u: 3, v: 2.5 },
                { id: "high", host: 1, u: 3, v: 0.5 }
              ]
            }
          },
          algorithm: { type: "placeAtPoints" },
          unit: { source: "half", bounds: { min: [-0.5, -0.5, -0.1], max: [0.5, 0.5, 0.1] } }
        }
      ],
      connections: [{ kind: "attach", id: "half", guest: "half", hosts: [{ part: "wall" }, { part: "roof" }] }]
    };
    const result = designBuildingCore(draft, testRegistry());
    expect(result.diagnostics).toEqual([]);
    const modified = (id: string) => result.parts.find((p) => p.key === authorPartKey(id))!.modifications;
    expect(modified("wall")).toEqual([{ element: "face", op: "removeArea", rect: [2.5, 2, 3.5, 3] }]);
    expect(modified("roof")).toEqual([{ element: "slope", op: "removeArea", rect: [2.5, 0, 3.5, 1] }]);
  });

  it("derives parts whose own connections run on the next level", () => {
    const house = houseDraft();
    const draft: BuildingCoreDraft = {
      groups: house.groups,
      parts: [
        roofPart("roof", "house"),
        {
          id: "dormer",
          group: "house",
          type: "dormer",
          geometry: { generator: "onHost", params: { u: 4, v: 2 } },
          algorithm: { type: "placeAtPoints" },
          unit: { source: "dormer" }
        }
      ],
      connections: [{ kind: "attach", id: "dormer-on-roof", guest: "dormer", hosts: [{ part: "roof" }] }]
    };
    const result = designBuildingCore(draft, testRegistry());
    expect(result.diagnostics).toEqual([]);
    const attach = authorConnectionKey("dormer-on-roof");
    const cap = result.parts.find((p) => p.key === derivedPartKey(attach, "cap"))!;
    expect(cap.identity).toEqual({ kind: "derived", connection: attach, localId: "cap" });
    expect(cap.group).toBe("house");
    expect(cap.modifications).toEqual([{ element: "face", op: "removeArea", rect: [0, 0, 1, 0.25] }]);
    expect(unitsOf(cap)).toHaveLength(12);
    expect(derivedConnectionKey(attach, "cap-joint")).toContain("cap-joint");
  });

  it("reports a cycle without blocking unrelated parts", () => {
    const house = houseDraft();
    const loop = (id: string) => ({
      id,
      group: "house",
      type: "window",
      geometry: { generator: "onHost", params: { u: 1, v: 1 } },
      algorithm: { type: "placeAtPoints" }
    });
    const draft: BuildingCoreDraft = {
      groups: house.groups,
      parts: [house.parts[0], loop("p"), loop("q")],
      connections: [
        { kind: "attach", id: "p-on-q", guest: "p", hosts: [{ part: "q" }] },
        { kind: "attach", id: "q-on-p", guest: "q", hosts: [{ part: "p" }] }
      ]
    };
    const result = designBuildingCore(draft, testRegistry());
    expect(
      result.diagnostics.filter((d) => d.message === "Attach connections form a cycle").map((d) => d.source)
    ).toEqual([authorPartKey("p"), authorPartKey("q")]);
    expect(cellsOf(result, "wall").length).toBe(WALL_CELLS);
  });

  it("only lets a rule modify its own participants", () => {
    const registry = testRegistry();
    registry.rules.register("rogue", () => ({
      modify: [{ part: authorPartKey("other"), modification: { element: "face", op: "removeElement" } }]
    }));
    const house = houseDraft();
    const draft: BuildingCoreDraft = {
      ...house,
      parts: [...house.parts, { ...house.parts[0], id: "other" }],
      connections: [{ ...house.connections![0], rule: "rogue" }]
    };
    const result = designBuildingCore(draft, registry);
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      `Rule may only modify its participants, not ${authorPartKey("other")}`
    ]);
    expect(cellsOf(result, "other").length).toBe(WALL_CELLS);
  });

  it("stops runaway derivation at the depth limit", () => {
    const registry = testRegistry();
    registry.rules.register("forever", ({ parts }) => ({
      derive: [{ localId: "next", type: "seam", geometry: parts[0].geometry.original, algorithm: { type: "none" } }],
      connect: [
        { kind: "join", localId: "again", parts: [{ derived: "next" }, { part: parts[0].key }], rule: "forever" }
      ]
    }));
    const house = houseDraft();
    const draft: BuildingCoreDraft = {
      ...house,
      parts: [house.parts[0], { ...house.parts[0], id: "other" }],
      connections: [{ kind: "join", id: "start", parts: ["wall", "other"], rule: "forever" }]
    };
    const result = designBuildingCore(draft, registry, { maxDepth: 3 });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe("Derived connections exceed depth 3");
  });
});

describe("Join connections", () => {
  it("detects crossing peers and gives the derived seam to the connection", () => {
    const result = designBuildingCore(crossingDraft(), testRegistry());
    expect(result.diagnostics).toEqual([]);
    const connection = detectedConnectionKey(authorPartKey("wall-a"), authorPartKey("wall-b"));
    const seam = result.parts.find((p) => p.key === derivedPartKey(connection, "seam"))!;
    expect(seam.group).toBe("a");
    expect(unitsOf(seam)).toHaveLength(6);
    const gap = (id: string) => result.parts.find((p) => p.key === authorPartKey(id))!.modifications;
    expect(gap("wall-a")).toEqual([{ element: "face", op: "removeArea", rect: [3.7, 0, 4.3, 3] }]);
    expect(gap("wall-b")).toEqual([{ element: "face", op: "removeArea", rect: [2.7, 0, 3.3, 3] }]);
  });

  it("gives the same result whichever way round an explicit join is written", () => {
    const join = (parts: [string, string]): BuildingCoreDraft => ({
      ...crossingDraft(),
      connections: [{ kind: "join", id: "x", parts }]
    });
    const ab = designBuildingCore(join(["wall-a", "wall-b"]), testRegistry());
    const ba = designBuildingCore(join(["wall-b", "wall-a"]), testRegistry());
    expect(JSON.stringify(ba)).toBe(JSON.stringify(ab));
    expect(ab.parts.filter((p) => p.type === "seam")).toHaveLength(1);
  });

  it("reports conflicting group overrides on a join", () => {
    const draft = crossingDraft();
    const pair = joinPairKey("wall", "wall");
    const conflicting: BuildingCoreDraft = {
      ...draft,
      groups: [
        { ...draft.groups[0], rules: { [pair]: "none" } },
        { ...draft.groups[1], rules: { [pair]: "crossing" } }
      ]
    };
    const result = designBuildingCore(conflicting, testRegistry());
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      `Groups override ${pair} with different rules: none, crossing`
    ]);
  });
});
