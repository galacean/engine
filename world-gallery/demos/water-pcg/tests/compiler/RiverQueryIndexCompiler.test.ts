import { describe, expect, it } from "vitest";
import { RiverQueryPrimitiveKind } from "../../compiler/river/RiverGeometryEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";

describe("RiverQueryIndexCompiler", () => {
  it("emits a deterministic sparse grid over every reach span and junction", () => {
    const first = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const second = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const reachSpanCount = first.reaches.reduce((sum, reach) => sum + reach.sampleCount - 1, 0);

    expect(first.queryIndex.cellSize).toBe(16);
    expect(first.queryIndex.primitiveCount).toBe(reachSpanCount + first.junctions.length);
    expect(first.queryIndex.cellCount).toBeGreaterThan(0);
    expect(first.queryIndex.cellOffsets.length).toBe(first.queryIndex.cellCount + 1);
    expect(first.queryIndex.cellOffsets.at(-1)).toBe(first.queryIndex.cellPrimitiveIndices.length);
    expect(Array.from(first.queryIndex.cellCoordinates)).toEqual(Array.from(second.queryIndex.cellCoordinates));
    expect(Array.from(first.queryIndex.cellPrimitiveIndices)).toEqual(
      Array.from(second.queryIndex.cellPrimitiveIndices)
    );
    expect(Array.from(first.queryIndex.primitiveKinds).filter((kind) => kind === RiverQueryPrimitiveKind.Junction)).toHaveLength(
      first.junctions.length
    );
  });

  it("keeps the sparse cell list sorted for allocation-free binary lookup", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const cells = data.queryIndex.cellCoordinates;
    for (let cellIndex = 1; cellIndex < data.queryIndex.cellCount; cellIndex++) {
      const previousX = cells.at((cellIndex - 1) * 2)!;
      const previousZ = cells.at((cellIndex - 1) * 2 + 1)!;
      const currentX = cells.at(cellIndex * 2)!;
      const currentZ = cells.at(cellIndex * 2 + 1)!;
      expect(currentX > previousX || (currentX === previousX && currentZ > previousZ)).toBe(true);
    }
  });

  it("isolates query buffers from caller mutation", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const coordinates = data.queryIndex.cellCoordinates.toTypedArray();
    const bounds = data.queryIndex.primitiveBounds.toTypedArray();
    const originalCoordinate = data.queryIndex.cellCoordinates.at(0);
    const originalBound = data.queryIndex.primitiveBounds.at(0);

    coordinates[0] = 999;
    bounds[0] = 999;

    expect(data.queryIndex.cellCoordinates.at(0)).toBe(originalCoordinate);
    expect(data.queryIndex.primitiveBounds.at(0)).toBe(originalBound);
  });
});
