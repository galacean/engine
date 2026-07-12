import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createRiverRockPlacements } from "../../demo/decoration/RiverRockController";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";

describe("RiverRockController placement", () => {
  it.each([curvedMainRiverExample, multiTributaryRiverExample])(
    "creates deterministic half-submerged rocks for $id",
    (example) => {
      const data = RiverNetworkCompiler.compile(example.riverDescriptor).data!;
      const queryService = new RiverNetworkQueryService(data);
      const placements = createRiverRockPlacements(data, queryService);

      expect(placements).toHaveLength(7);
      expect(createRiverRockPlacements(data, queryService)).toEqual(placements);

      const queryResult = createRiverNetworkQueryResult();
      for (const placement of placements) {
        const position = new Vector3(...placement.position);
        expect(queryService.sampleSurface(position, queryResult)).toBe(true);
        expect(queryResult.insideFootprint).toBe(true);
        expect(placement.position[1]).toBeCloseTo(queryResult.surfaceHeight, 6);
        expect(placement.scale.every((component) => component > 0)).toBe(true);
      }
    }
  );
});
