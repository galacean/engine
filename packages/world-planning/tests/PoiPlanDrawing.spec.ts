import { expect, it } from "vitest";
import { generateIslandPlan } from "../src/semantic-study/IslandPlanGenerator";
import { drawPoiTerritories } from "../src/semantic-study/PoiPlanDrawing";

it("renders dormant management cells without invalid SVG and keeps them recoverable", () => {
  const plan = generateIslandPlan({ seed: 1 });
  plan.poiDistribution = {
    candidates: [],
    sites: [true, false].map((active, index) => ({
      id: active ? "active" : "dormant", origin: { x: 200 + index * 300, z: 200 },
      center: { x: 200 + index * 300, z: 200 }, domainId: "land", weightM2: 0,
      areaM2: active ? 10000 : 0, active, memberIds: []
    })),
    domains: [{ id: "land", outline: plan.land }],
    spacingM: 100, minAreaM2: 0,
    metrics: { count: 1, candidateCount: 2, dormantCount: 1, maxUncoveredM: 0, minSeparationM: null, budgetLimited: false }
  };
  const first = drawPoiTerritories(plan);
  expect(first).toContain('data-feature-id="dormant"');
  const paths = [...first.matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]);
  expect(paths).toContain("");
  expect(paths.some((path) => path.startsWith("M"))).toBe(true);
  expect(paths.filter((path) => path.trim() && !path.startsWith("M"))).toEqual([]);
  plan.poiDistribution.sites[1].active = true;
  const recovered = drawPoiTerritories(plan);
  expect(recovered).toContain('data-feature-id="dormant"');
  expect([...recovered.matchAll(/\sd="([^"]*)"/g)].every((match) => match[1].startsWith("M"))).toBe(true);
});
