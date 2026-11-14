import { describe, expect, it } from "vitest";
import { Quaternion } from "@galacean/engine-math";
import {
  designBuildingCore,
  deriveSeed,
  quatFromEuler,
  Random,
  sinCos,
  type BuildingCoreDraft
} from "../../src/building/core";
import { crossingDraft, houseDraft, roofPart, testRegistry } from "./fixtures";

function combined(): BuildingCoreDraft {
  const house = houseDraft(),
    crossing = crossingDraft();
  return {
    groups: [...house.groups, ...crossing.groups],
    parts: [
      ...house.parts,
      ...crossing.parts,
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
    connections: [
      ...house.connections!,
      { kind: "attach", id: "dormer-on-roof", guest: "dormer", hosts: [{ part: "roof" }] }
    ]
  };
}
const reversed = (draft: BuildingCoreDraft): BuildingCoreDraft => ({
  groups: [...draft.groups].reverse(),
  parts: [...draft.parts].reverse(),
  connections: [...(draft.connections ?? [])].reverse()
});

describe("Building core determinism", () => {
  it("gives each random channel of a laid unit its own stable stream", () => {
    const registry = testRegistry();
    const seen: Record<string, number[]> = {};
    registry.algorithms.register("probe", {
      plan(context) {
        for (const channel of ["size", "tint"])
          seen[channel] = [context.seed("w:0", channel), context.random("w:0", channel).nextUint32()];
        seen.base = [context.seed("w:0")];
        return { count: 0, data: null };
      },
      unitAt: () => undefined
    });
    const draft = (algorithm: string): BuildingCoreDraft => ({
      ...houseDraft(),
      parts: [{ ...houseDraft().parts[0], algorithm: { type: algorithm } }]
    });
    designBuildingCore(draft("probe"), registry);
    const first = JSON.parse(JSON.stringify(seen));
    expect(new Set([first.size[0], first.tint[0], first.base[0]]).size).toBe(3);
    designBuildingCore(draft("probe"), registry);
    expect(seen).toEqual(first);
  });

  it("produces identical output on every run", () => {
    const first = designBuildingCore(combined(), testRegistry());
    const second = designBuildingCore(combined(), testRegistry());
    expect(first.diagnostics).toEqual([]);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("does not depend on the order of groups, parts or connections", () => {
    const ordered = designBuildingCore(combined(), testRegistry());
    const shuffled = designBuildingCore(reversed(combined()), testRegistry());
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
  });

  it("uses fixed trigonometry that matches the platform within rounding", () => {
    for (let i = -720; i <= 720; i += 7.5) {
      const angle = (i * Math.PI) / 180;
      const [s, c] = sinCos(angle);
      expect(Math.abs(s - Math.sin(angle))).toBeLessThan(1e-15);
      expect(Math.abs(c - Math.cos(angle))).toBeLessThan(1e-15);
    }
  });

  it("follows the Galacean Euler order", () => {
    const expected = new Quaternion();
    for (const euler of [
      [30, 45, 60],
      [-90, 10, 170],
      [0, 90, 0]
    ] as const) {
      const toRadian = Math.PI / 180;
      Quaternion.rotationEuler(euler[0] * toRadian, euler[1] * toRadian, euler[2] * toRadian, expected);
      const q = quatFromEuler(euler);
      expect(q[0]).toBeCloseTo(expected.x, 12);
      expect(q[1]).toBeCloseTo(expected.y, 12);
      expect(q[2]).toBeCloseTo(expected.z, 12);
      expect(q[3]).toBeCloseTo(expected.w, 12);
    }
  });

  it("keeps seeds and random streams stable across releases", () => {
    // Golden values: changing them changes every saved building's appearance.
    expect(deriveSeed(7, "part", 3)).toBe(GOLDEN_SEED);
    const random = new Random(GOLDEN_SEED);
    expect([random.nextUint32(), random.nextUint32()]).toEqual(GOLDEN_STREAM);
    expect(deriveSeed(7, "part", 3)).not.toBe(deriveSeed(7, "part", "3"));
    expect(deriveSeed(7, "a", "b")).not.toBe(deriveSeed(7, "ab"));
  });
});
const GOLDEN_SEED = 2420034436;
const GOLDEN_STREAM = [2261320204, 3316752360];
