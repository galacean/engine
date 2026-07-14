import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createRiverBedChunkGeometries } from "../../demo/decoration/RiverBedController";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";

describe("RiverBedController geometry", () => {
  it.each([curvedMainRiverExample, multiTributaryRiverExample])(
    "creates a deterministic opaque bed below every water chunk for $id",
    (example) => {
      const data = RiverNetworkCompiler.compile(example.riverDescriptor).data!;
      const queryService = new RiverNetworkQueryService(data);
      const geometries = createRiverBedChunkGeometries(data);

      expect(geometries).toHaveLength(data.reaches.length + data.junctions.length);
      expect(createRiverBedChunkGeometries(data)).toEqual(geometries);

      const queryResult = createRiverNetworkQueryResult();
      let meaningfulDepthCount = 0;
      for (const geometry of geometries) {
        expect(geometry.positions.length).toBeGreaterThan(0);
        expect(geometry.indices.length).toBeGreaterThan(0);
        expect(Math.max(...geometry.indices)).toBeLessThan(geometry.positions.length);

        for (const position of geometry.positions) {
          const worldPosition = new Vector3(...position);
          if (!queryService.sampleSurface(worldPosition, queryResult)) continue;
          expect(position[1]).toBeLessThan(queryResult.surfaceHeight);
          if (queryResult.surfaceHeight - position[1] > 0.5) meaningfulDepthCount++;
        }
      }
      expect(meaningfulDepthCount).toBeGreaterThan(0);

      for (let junctionIndex = 0; junctionIndex < data.junctions.length; junctionIndex++) {
        const surfaceGeometry = data.junctions[junctionIndex].surfaceGeometry;
        const bedGeometry = geometries.find(
          (geometry) => geometry.id === `junction-${data.terrainInteraction.junctionCorridors[junctionIndex].id}`
        );
        if (!bedGeometry) throw new Error("Expected a junction bed geometry.");
        expect(bedGeometry.positions).toHaveLength(surfaceGeometry.positions.length);
        expect(Array.from(bedGeometry.indices)).toEqual(Array.from(surfaceGeometry.indices));
        for (let vertexIndex = 0; vertexIndex < bedGeometry.positions.length; vertexIndex++) {
          expect(bedGeometry.positions[vertexIndex][1]).toBeLessThan(surfaceGeometry.positions[vertexIndex][1]);
        }
      }
    }
  );
});
