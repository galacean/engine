import { RiverReadonlyFloat32Buffer } from "../shared/ReadonlyNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import { RIVER_TERRAIN_CORRIDOR_COMPONENT, RIVER_QUERY_SAMPLE_COMPONENT } from "./constants";
import {
  copyWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import type { RiverCompiledData, RiverGeometryData } from "./types";
import { hashRiverStableValue } from "../shared/determinism";

/** Bind one immutable external bed to render fields, terrain readback and CPU queries. */
export function compileRiverBedDepths(
  compiledRiver: RiverCompiledData,
  terrainSnapshot: WaterTerrainSnapshot
): RiverCompiledData {
  // Detach from caller-owned arrays before freezing or sending this result to a Worker.
  const terrain = copyWaterTerrainSnapshot(terrainSnapshot);
  const sampleRequiredBedHeight = (x: number, z: number): number => {
    const height = sampleWaterTerrainHeight(terrain, x, z);
    if (height === undefined || !Number.isFinite(height))
      throw new Error(`Terrain '${terrain.id}' does not cover River at (${x}, ${z}).`);
    return height;
  };
  const withBedDepths = (
    geometry: RiverGeometryData,
    origin: readonly [number, number, number] = [0, 0, 0]
  ): RiverGeometryData => ({
    ...geometry,
    uv3s: geometry.uv3s?.map((uv, index) => {
      const position = geometry.positions[index];
      return [
        uv[0],
        Math.max(0, position[1] + origin[1] - sampleRequiredBedHeight(position[0] + origin[0], position[2] + origin[2]))
      ] as const;
    })
  });
  return {
    ...compiledRiver,
    terrain,
    reaches: compiledRiver.reaches.map((reach) => ({
      ...reach,
      artifact: {
        ...reach.artifact,
        samples: reach.artifact.samples.map((sample) => ({
          ...sample,
          depth: Math.max(0, sample.position[1] - sampleRequiredBedHeight(sample.position[0], sample.position[2]))
        })),
        querySource: (() => {
          const source = reach.artifact.querySource;
          const samples = source.samples.toTypedArray();
          for (let offset = 0; offset < samples.length; offset += source.stride) {
            samples[offset + RIVER_QUERY_SAMPLE_COMPONENT.depth] = Math.max(
              0,
              samples[offset + RIVER_QUERY_SAMPLE_COMPONENT.y] -
                sampleRequiredBedHeight(
                  samples[offset + RIVER_QUERY_SAMPLE_COMPONENT.x],
                  samples[offset + RIVER_QUERY_SAMPLE_COMPONENT.z]
                )
            );
          }
          return { ...source, samples: new RiverReadonlyFloat32Buffer(samples, WaterBufferOwnership.Transfer) };
        })(),
        surfaceGeometry: withBedDepths(reach.artifact.surfaceGeometry)
      }
    })),
    junctions: compiledRiver.junctions.map((junction) => ({
      ...junction,
      depth: Math.max(0, junction.position[1] - sampleRequiredBedHeight(junction.position[0], junction.position[2])),
      surfaceGeometry: withBedDepths(junction.surfaceGeometry)
    })),
    chunks: compiledRiver.chunks.map((chunk) => {
      const surfaceGeometry = withBedDepths(chunk.surfaceGeometry, chunk.localOrigin);
      return {
        ...chunk,
        surfaceGeometry,
        contentHash: hashRiverStableValue({ previous: chunk.contentHash, depths: surfaceGeometry.uv3s })
      };
    }),
    terrainInteraction: {
      ...compiledRiver.terrainInteraction,
      reachCorridors: compiledRiver.terrainInteraction.reachCorridors.map((corridor) => {
        const samples = corridor.samples.toTypedArray();
        for (let offset = 0; offset < samples.length; offset += corridor.stride) {
          samples[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY] = sampleRequiredBedHeight(
            samples[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.x],
            samples[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.z]
          );
        }
        return { ...corridor, samples: new RiverReadonlyFloat32Buffer(samples, WaterBufferOwnership.Transfer) };
      }),
      junctionCorridors: compiledRiver.terrainInteraction.junctionCorridors.map((corridor) => {
        const position = compiledRiver.junctions[corridor.junctionIndex].position;
        return { ...corridor, riverBedElevation: sampleRequiredBedHeight(position[0], position[2]) };
      })
    }
  };
}
