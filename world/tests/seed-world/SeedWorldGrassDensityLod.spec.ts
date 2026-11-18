import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "@galacean/engine";
import { buildSimplifiedGrassLod1Indices } from "../../../packages/world-planning/src/runtime/SeedWorldDetailInstancedMesh.ts";
import {
  SeedWorldPopulationRuntime,
  syncGrassDensityLodUniform
} from "../../../packages/world-planning/src/runtime/SeedWorldPopulationRuntime.ts";
import type { ForwardGrassUpdateParams } from "../../../packages/world-planning/src/runtime/SeedWorldForwardGrass";

it("reuses grass window samples only while both published coverage samplers are stable", () => {
  const owner = Object.create(SeedWorldPopulationRuntime.prototype);
  const invalidateMask = vi.fn();
  let reuse: boolean | undefined;
  owner._forwardGrass = {
    invalidateMask,
    update(params: ForwardGrassUpdateParams) {
      reuse = params.samplerContext.reuseWindowSamples;
    }
  };
  owner._populationLayout = { detailDensityFields: [], detailSpeciesProfiles: [] };
  owner._detailCells = { cells: [] };
  owner._grassLodDebugConfig = {};
  const water = () => false;
  const stableWater = Object.assign(() => false, { stableWorldSamples: true });
  const coverage = () => 1;
  owner.setGrassWaterCoverage(water);
  owner._updateForwardGrass(true);
  expect(reuse).toBe(false);
  owner.setGrassWaterCoverage(stableWater);
  owner._updateForwardGrass(true);
  expect(reuse).toBe(true);
  owner.setGrassSurfaceCoverageSampler(coverage);
  owner._updateForwardGrass(true);
  expect(reuse).toBe(false);
  owner.setGrassSurfaceCoverageSampler(Object.assign(() => 1, { stableWorldSamples: true }));
  owner._updateForwardGrass(true);
  expect(reuse).toBe(true);
  owner.setGrassWaterCoverage(water);
  owner._updateForwardGrass(true);
  expect(reuse).toBe(false);
  expect(invalidateMask).toHaveBeenCalledTimes(5);
});

describe("SeedWorld grass density LOD uniform sync", () => {
  it("skips redundant shaderData uploads across unchanged frames and reuses one Vector4", () => {
    const setVector4 = vi.fn();
    const batch = {
      instanceCount: 512,
      renderer: {
        shaderData: { setVector4 }
      }
    };

    syncGrassDensityLodUniform(batch, true, 60);
    expect(setVector4).toHaveBeenCalledTimes(1);
    const firstVector = setVector4.mock.calls[0]?.[1];
    expect(firstVector).toMatchObject({ x: 512, y: 1, z: 60, w: 0.01 });

    // Unchanged frames do not allocate or re-upload the uniform.
    syncGrassDensityLodUniform(batch, true, 60);
    syncGrassDensityLodUniform(batch, true, 60);
    expect(setVector4).toHaveBeenCalledTimes(1);

    // Changing any uniform input updates the cached Vector4 in place and uploads once.
    batch.instanceCount = 256;
    syncGrassDensityLodUniform(batch, false, 90);
    expect(setVector4).toHaveBeenCalledTimes(2);
    expect(setVector4.mock.calls[1]?.[1]).toBe(firstVector);
    expect(firstVector).toMatchObject({ x: 256, y: 0, z: 90, w: 0.01 });
  });

  it("halves multi-blade grass cluster index counts while preserving base/tip extents", () => {
    // 2 disconnected 3-ring quad grass blades: 12 vertices, 8 triangles (24 indices).
    const positions = [
      // Blade A
      new Vector3(-0.05, 0.0, 0),
      new Vector3(0.05, 0.0, 0),
      new Vector3(-0.04, 0.25, 0.02),
      new Vector3(0.04, 0.25, 0.02),
      new Vector3(-0.02, 0.5, 0.06),
      new Vector3(0.02, 0.5, 0.06),
      // Blade B
      new Vector3(0.15, 0.0, 0.1),
      new Vector3(0.25, 0.0, 0.1),
      new Vector3(0.16, 0.22, 0.12),
      new Vector3(0.24, 0.22, 0.12),
      new Vector3(0.18, 0.45, 0.15),
      new Vector3(0.22, 0.45, 0.15)
    ];
    const lod0 = new Uint16Array([
      0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4,
      6, 7, 8, 7, 9, 8, 8, 9, 10, 9, 11, 10
    ]);
    const lod1 = buildSimplifiedGrassLod1Indices(positions, lod0);
    expect(lod1).toBeInstanceOf(Uint16Array);
    expect(lod1!.length).toBe(12); // 4 triangles instead of 8 (50% reduction)
    const ys = Array.from(lod1!).map((idx) => positions[idx]!.y);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(0.5);
  });
});
