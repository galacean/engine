import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { hashRiverGeometryData, hashRiverString } from "../../compiler/shared/determinism";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { RiverNetworkQueryService, createRiverNetworkQueryResult } from "../../runtime/river/RiverQueryService";
import { RiverResource } from "../../runtime/river/RiverResource";

describe("RiverResource", () => {
  it("preserves compiled chunks, query buffers, hashes, and query semantics through serialization", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const compiled = RiverNetworkCompiler.compile(descriptor).data!;
    const resource = RiverResource.create(descriptor, compiled);
    const loaded = RiverResource.deserialize(resource.serialize());

    expect(loaded.metadata).toEqual(resource.metadata);
    expect(loaded.metadata.compiledHash).toMatch(/^[0-9a-f]{16}$/);
    expect(loaded.data.sourceId).toBe(compiled.sourceId);
    expect(loaded.data.stats).toEqual(compiled.stats);
    expect(loaded.data.chunks).toHaveLength(compiled.chunks.length);
    expect(loaded.data.queryIndex.primitiveCount).toBe(compiled.queryIndex.primitiveCount);
    expect(loaded.data.terrainInteraction).toEqual(compiled.terrainInteraction);
    expect(Array.from(loaded.data.queryIndex.cellCoordinates)).toEqual(Array.from(compiled.queryIndex.cellCoordinates));
    expect(loaded.data.chunks.map((chunk) => hashRiverGeometryData(chunk.surfaceGeometry))).toEqual(
      compiled.chunks.map((chunk) => hashRiverGeometryData(chunk.surfaceGeometry))
    );
    expect(loaded.data.junctions.map((junction) => junction.surfaceGeometry.colors)).toEqual(
      compiled.junctions.map((junction) => junction.surfaceGeometry.colors)
    );

    const originalQuery = new RiverNetworkQueryService(compiled);
    const loadedQuery = new RiverNetworkQueryService(loaded.data);
    const originalResult = createRiverNetworkQueryResult();
    const loadedResult = createRiverNetworkQueryResult();
    for (const junction of compiled.junctions) {
      const position = new Vector3(junction.position[0], junction.position[1] - 0.1, junction.position[2]);
      originalQuery.sampleSurface(position, originalResult);
      loadedQuery.sampleSurface(position, loadedResult);
      expect(loadedResult).toMatchObject({
        hit: originalResult.hit,
        waterBodyId: originalResult.waterBodyId,
        segmentId: originalResult.segmentId,
        insideFootprint: originalResult.insideFootprint,
        insideVolume: originalResult.insideVolume,
        surfaceHeight: expect.closeTo(originalResult.surfaceHeight),
        distanceToBank: expect.closeTo(originalResult.distanceToBank)
      });
      expect(loadedResult.flowVector).toEqual(originalResult.flowVector);
    }
  });

  it("returns isolated serialized bytes and rejects tampered compiled data", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const compiled = RiverNetworkCompiler.compile(descriptor).data!;
    const resource = RiverResource.create(descriptor, compiled);
    const first = resource.serialize();
    const second = resource.serialize();

    first[0] = 0;
    expect(second[0]).not.toBe(0);

    const envelope = JSON.parse(new TextDecoder().decode(second)) as Record<string, unknown>;
    envelope.compiledHash = "00000000";
    const tampered = new TextEncoder().encode(JSON.stringify(envelope));
    expect(() => RiverResource.deserialize(tampered)).toThrow(/hash mismatch/);
  });

  it("rejects atlas transforms that no longer map world bounds to the packed rect", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const compiled = RiverNetworkCompiler.compile(descriptor).data!;
    const resource = RiverResource.create(descriptor, compiled);
    const envelope = JSON.parse(new TextDecoder().decode(resource.serialize())) as {
      compiledHash: string;
      compiledData: {
        terrainInteraction: {
          localMapAtlas: {
            tiles: Array<{ worldToUv: number[] }>;
          };
        };
      };
    };
    envelope.compiledData.terrainInteraction.localMapAtlas.tiles[0].worldToUv[0] = 0;
    envelope.compiledHash = hashRiverString(JSON.stringify(envelope.compiledData));

    expect(() => RiverResource.deserialize(new TextEncoder().encode(JSON.stringify(envelope)))).toThrow(
      /Malformed river resource envelope/
    );
  });

  it("defers disposal until all runtime references are released", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const compiled = RiverNetworkCompiler.compile(descriptor).data!;
    const resource = RiverResource.create(descriptor, compiled);

    resource.retain();
    resource.dispose();
    expect(resource.isDisposed).toBe(false);
    expect(resource.data).toBe(compiled);

    resource.release();
    expect(resource.isDisposed).toBe(true);
    expect(resource.byteLength).toBe(0);
    expect(() => resource.data).toThrow(/disposed/);
    expect(() => resource.retain()).toThrow(/disposing/);
  });
});
