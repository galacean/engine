import { describe, expect, it } from "vitest";
import {
  defaultPoiLayout,
  distributePois,
  type PoiCandidate,
  type PoiDistribution
} from "@galacean/engine-world-planning/semantic-study/PoiDistribution";
import { solvePoiDistribution } from "@galacean/engine-world-planning/spatial/regions/PoiLayoutSolver";

function fixture(candidates?: PoiCandidate[]): PoiDistribution {
  return {
    candidates:
      candidates ??
      Array.from({ length: 9 }, (_, i) => ({
        id: `site-${i}`,
        origin: { x: 100 + (i % 3) * 200, z: 100 + Math.floor(i / 3) * 200 },
        domainId: "land"
      })),
    sites: [],
    domains: [
      {
        id: "land",
        outline: [
          { x: 0, z: 0 },
          { x: 600, z: 0 },
          { x: 600, z: 600 },
          { x: 0, z: 600 }
        ]
      }
    ],
    spacingM: 200,
    minAreaM2: 0,
    metrics: {
      count: 0,
      candidateCount: 0,
      dormantCount: 0,
      maxUncoveredM: 0,
      minSeparationM: null,
      budgetLimited: false
    }
  };
}

describe("unified POI layout solver", () => {
  it("moves neighbours from immutable origins and is independent of preview/commit history", () => {
    const input = fixture(),
      before = JSON.stringify(input),
      baseline = solvePoiDistribution(input);
    const edited = solvePoiDistribution(baseline, { "site-4": { sizeWeight: 1.4 } });
    expect(
      edited.sites.some(
        (site, i) => site.id !== "site-4" && JSON.stringify(site.center) !== JSON.stringify(baseline.sites[i].center)
      )
    ).toBe(true);
    expect(solvePoiDistribution(edited, { "site-4": { sizeWeight: 1.4 } })).toEqual(edited);
    expect(solvePoiDistribution(JSON.parse(JSON.stringify(input)), { "site-4": { sizeWeight: 1.4 } })).toEqual(edited);
    expect(solvePoiDistribution(edited, {})).toEqual(baseline);
    expect(JSON.stringify(input)).toBe(before);
    expect(edited.sites.map((site) => site.id)).toEqual(baseline.sites.map((site) => site.id));
  });

  it("uses minimum area for reversible dormancy and zero disables positive-area culling", () => {
    const input = fixture(),
      baseline = solvePoiDistribution(input);
    const reduced = solvePoiDistribution({ ...input, minAreaM2: 100000 });
    expect(reduced.metrics.count).toBeLessThan(baseline.metrics.count);
    expect(reduced.sites.filter((site) => site.active).every((site) => site.areaM2 >= 100000)).toBe(true);
    expect(reduced.sites.filter((site) => !site.active).every((site) => site.areaM2 === 0)).toBe(true);
    expect(solvePoiDistribution({ ...reduced, minAreaM2: 0 }, {}).sites).toEqual(baseline.sites);
  });

  it("admits stable reserve identities into surplus and does not refill expanded weighted regions", () => {
    const input = fixture([
      { id: "left", origin: { x: 100, z: 300 }, domainId: "land" },
      { id: "right", origin: { x: 500, z: 300 }, domainId: "land" },
      { id: "reserve", origin: { x: 300, z: 300 }, domainId: "land", reserve: true }
    ]);
    const ordinary = solvePoiDistribution(input);
    expect(ordinary.sites.find((site) => site.id === "reserve")?.active).toBe(true);
    const expanded = solvePoiDistribution(input, { left: { sizeWeight: 100 } });
    expect(expanded.sites.filter((site) => site.active).map((site) => site.id)).toEqual(["left"]);
    expect(solvePoiDistribution(expanded, {}).sites).toEqual(ordinary.sites);
    const noSurplus = { ...input, spacingM: 500 };
    expect(solvePoiDistribution(noSurplus).sites.find((site) => site.id === "reserve")?.active).toBe(false);
    expect(
      solvePoiDistribution(noSurplus, { reserve: { sizeWeight: 2 } }).sites.find((site) => site.id === "reserve")
        ?.active
    ).toBe(true);
  });

  it("keeps explicit anchors fixed and all solved geometry finite", () => {
    const result = solvePoiDistribution(fixture(), { "site-4": { sizeWeight: 2, x: 305, z: 306 } });
    expect(result.sites.find((site) => site.id === "site-4")?.center).toEqual({ x: 305, z: 306 });
    expect(
      result.sites.every((site) => [site.center.x, site.center.z, site.areaM2, site.weightM2].every(Number.isFinite))
    ).toBe(true);
  });

  it("reports bounded candidate work separately from active count", () => {
    const input = fixture();
    const config = { ...defaultPoiLayout(), spacingM: 16 };
    const result = distributePois({ width: 600, depth: 600, seed: 1, domains: input.domains }, config);
    expect(result.metrics.budgetLimited).toBe(true);
    expect(result.candidates.length).toBe(128);
    expect(result.metrics.count + result.metrics.dormantCount).toBe(128);
  });

  it("measures representative preview work without asserting a machine-dependent frame budget", () => {
    const input = fixture();
    input.domains[0].outline = [
      { x: 0, z: 0 },
      { x: 1024, z: 0 },
      { x: 1024, z: 1024 },
      { x: 0, z: 1024 }
    ];
    const result = distributePois({ width: 1024, depth: 1024, seed: 17, domains: input.domains }, defaultPoiLayout());
    const durations: number[] = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      solvePoiDistribution(result, { [result.candidates[0].id]: { sizeWeight: 1 + i / 20 } });
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    console.info("POI preview CPU sample", {
      candidates: result.candidates.length,
      active: result.metrics.count,
      medianMs: durations[6],
      maxMs: durations.at(-1)
    });
    expect(durations.every(Number.isFinite)).toBe(true);
    const bounded = distributePois(
      { width: 1024, depth: 1024, seed: 17, domains: input.domains },
      { ...defaultPoiLayout(), spacingM: 32, minAreaM2: 4000 }
    );
    const boundedDurations: number[] = [];
    for (let i = 0; i < 8; i++) {
      const start = performance.now();
      solvePoiDistribution(bounded, { [bounded.candidates[0].id]: { sizeWeight: 1 + i / 10 } });
      boundedDurations.push(performance.now() - start);
    }
    boundedDurations.sort((a, b) => a - b);
    console.info("POI bounded preview CPU sample", {
      candidates: bounded.candidates.length,
      active: bounded.metrics.count,
      minAreaM2: bounded.minAreaM2,
      medianMs: boundedDurations[4],
      maxMs: boundedDurations.at(-1)
    });
    expect(boundedDurations.every(Number.isFinite)).toBe(true);
  });
});
