import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createLakePillarPlacements } from "../../demo/decoration/LakePillarController";
import { LAKE_PILLAR_LAYOUT } from "../../demo/decoration/constants";
import { riverExpandedLakeExample } from "../../demo/examples/lake/riverExpandedLake";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";

describe("LakePillarController placement", () => {
  it("extends every pillar from the compiled lake bed through the water line", () => {
    const data = RiverNetworkCompiler.compile(riverExpandedLakeExample.riverDescriptor).data!;
    const placements = createLakePillarPlacements(data);
    const queryService = new RiverNetworkQueryService(data);
    const queryResult = createRiverNetworkQueryResult();

    expect(placements).toHaveLength(LAKE_PILLAR_LAYOUT.length);
    expect(createLakePillarPlacements(data)).toEqual(placements);
    for (const placement of placements) {
      expect(placement.bedY).toBeLessThan(placement.waterSurfaceY);
      expect(placement.topY).toBeGreaterThan(placement.waterSurfaceY);
      expect(placement.position[1] - placement.scale[1] * 0.5).toBeCloseTo(placement.bedY, 6);
      expect(placement.position[1] + placement.scale[1] * 0.5).toBeCloseTo(placement.topY, 6);
      expect(
        queryService.sampleSurface(
          new Vector3(placement.position[0], placement.waterSurfaceY, placement.position[2]),
          queryResult
        )
      ).toBe(true);
      expect(queryResult.insideFootprint).toBe(true);
    }
  });
});
