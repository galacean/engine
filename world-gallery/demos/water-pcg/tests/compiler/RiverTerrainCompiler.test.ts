import { describe, expect, it } from "vitest";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { RiverLocalMapRegionKind, RiverTerrainSurfaceOwnership } from "../../compiler/river/RiverGeometryEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import {
  RIVER_MAX_WATER_SURFACE_SLOPE,
  RIVER_TERRAIN_CORRIDOR_COMPONENT,
  RIVER_TERRAIN_CORRIDOR_STRIDE
} from "../../compiler/river/constants";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";

describe("River terrain and water-profile compilation", () => {
  it("resolves a continuous downstream-nonrising water surface independent from authored interior Y", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const reach = data.reaches[0];
    const samples = reach.artifact.samples;

    expect(samples[0].position[1]).toBeCloseTo(data.nodes[reach.fromNodeIndex].waterSurfaceElevation);
    expect(samples.at(-1)?.position[1]).toBeCloseTo(data.nodes[reach.toNodeIndex].waterSurfaceElevation);
    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1].position;
      const current = samples[index].position;
      expect(current[1]).toBeLessThanOrEqual(previous[1] + 1e-6);
      const horizontalDistance = Math.hypot(current[0] - previous[0], current[2] - previous[2]);
      const slope = horizontalDistance > 1e-6 ? Math.abs(current[1] - previous[1]) / horizontalDistance : 0;
      expect(slope).toBeLessThanOrEqual(RIVER_MAX_WATER_SURFACE_SLOPE + 1e-5);
    }
  });

  it("raises an excessively low downstream level to the compiler slope limit with a diagnostic", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      nodes: source.nodes.map((node) =>
        node.id === "main-source"
          ? { ...node, elevation: 10 }
          : node.id === "main-mouth"
            ? { ...node, elevation: -100 }
            : node
      )
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats.waterSlopeAdjustmentCount).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RiverDiagnosticCode.WaterProfileSlopeAdjusted })])
    );
    const reach = result.data!.reaches[0];
    expect(reach.elevationDrop / reach.length).toBeLessThanOrEqual(RIVER_MAX_WATER_SURFACE_SLOPE);
  });

  it("rejects an infeasible confluence slope interval instead of hiding a rising branch", () => {
    const source = multiTributaryRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      nodes: source.nodes.map((node) =>
        node.id === "main-source"
          ? { ...node, elevation: 20 }
          : node.id === "tributary-source"
            ? { ...node, elevation: 0 }
            : node
      )
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RiverDiagnosticCode.WaterProfileSlopeConflict })])
    );
  });

  it("emits vector terrain corridors and a real confluence atlas", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const terrain = data.terrainInteraction;

    expect(terrain.terrainSurfaceOwnership).toBe(RiverTerrainSurfaceOwnership.ExternalTerrainSystem);
    expect(terrain.reachCorridors).toHaveLength(data.reaches.length);
    expect(terrain.junctionCorridors).toHaveLength(data.junctions.length);
    expect(terrain.localMapBakeRegions).toHaveLength(data.junctions.length);
    expect(terrain.localMapBakeRegions.every((region) => region.kind === RiverLocalMapRegionKind.Confluence)).toBe(
      true
    );
    expect(data.stats.localMapRegionCount).toBe(data.junctions.length);
    expect(terrain.localMapAtlas?.tiles).toHaveLength(data.junctions.length);
    expect(data.stats.mapPixelCount).toBe((terrain.localMapAtlas?.width ?? 0) * (terrain.localMapAtlas?.height ?? 0));
    expect(terrain.localMapAtlas?.pixels.length).toBe(data.stats.mapPixelCount * 4);
    expect(data.stats.mapPixelCount).toBeGreaterThan(0);

    for (const corridor of terrain.reachCorridors) {
      const reach = data.reaches[corridor.reachIndex];
      expect(corridor.stride).toBe(RIVER_TERRAIN_CORRIDOR_STRIDE);
      expect(corridor.sampleCount).toBe(reach.artifact.samples.length);
      for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex++) {
        const sample = reach.artifact.samples[sampleIndex];
        const offset = sampleIndex * corridor.stride;
        const waterY = corridor.samples.at(offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY)!;
        const bedY = corridor.samples.at(offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY)!;
        const vegetationRadius = corridor.samples.at(
          offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.vegetationExclusionRadius
        )!;
        const buildingRadius = corridor.samples.at(offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.buildingExclusionRadius)!;
        expect(waterY).toBeCloseTo(sample.position[1]);
        expect(bedY).toBeCloseTo(sample.position[1] - sample.depth);
        expect(vegetationRadius).toBeCloseTo(sample.width * 0.5 + sample.bankFeather);
        expect(buildingRadius).toBe(vegetationRadius);
      }
    }
  });

  it("keeps an ordinary single reach without junctions or disturbances atlas-free", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const data = RiverNetworkCompiler.compile({ ...source, disturbances: [] }).data!;

    expect(data.terrainInteraction.localMapBakeRegions).toHaveLength(0);
    expect(data.terrainInteraction.localMapAtlas).toBeUndefined();
    expect(data.stats.mapPixelCount).toBe(0);
  });
});
