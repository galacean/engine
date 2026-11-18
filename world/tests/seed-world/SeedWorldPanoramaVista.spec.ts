import { describe, expect, it } from "vitest";
import {
  extractSeedWorldBoundaryProfile,
  generatePanoramaVistaBuffers,
  generateVistaTransitionSkirt,
  sampleAzimuthArray
} from "@galacean/engine-world-planning/vista/PanoramaVistaGenerator";
import { SeedWorldPlanner } from "@galacean/engine-world-planning/world/SeedWorldPlanner";

describe("PanoramaVistaGenerator & SeedWorld integration", () => {
  it("extracts a deterministic 360-degree boundary profile from SeedWorldPlan", () => {
    const planA = SeedWorldPlanner.generate({ rootSeed: 1_729 });
    const planB = SeedWorldPlanner.generate({ rootSeed: 1_729 });
    const planOther = SeedWorldPlanner.generate({ rootSeed: 4_096 });

    const profileA = extractSeedWorldBoundaryProfile(planA, undefined, 128);
    const profileB = extractSeedWorldBoundaryProfile(planB, undefined, 128);
    const profileOther = extractSeedWorldBoundaryProfile(planOther, undefined, 128);

    expect(profileA.bins).toBe(128);
    expect(profileA.worldHalfSizeMetres).toBe(planA.sizeMetres * 0.5);
    expect(profileA.worldCenterX).toBe(0);
    expect(profileA.worldCenterZ).toBe(0);
    expect(Array.from(profileA.mountainEnergy)).toEqual(Array.from(profileB.mountainEnergy));
    expect(Array.from(profileA.landMask)).toEqual(Array.from(profileB.landMask));
    expect(Array.from(profileA.mountainEnergy)).not.toEqual(Array.from(profileOther.mountainEnergy));

    // Verify periodic wrap continuity across -PI and +PI
    const wrapLeft = sampleAzimuthArray(profileA.mountainEnergy, -Math.PI + 1e-4);
    const wrapRight = sampleAzimuthArray(profileA.mountainEnergy, Math.PI - 1e-4);
    expect(Math.abs(wrapLeft - wrapRight)).toBeLessThan(0.05);
  });

  it("ray-marches deterministic 360-degree farA and farB panoramic G-buffers with horizon coverage", () => {
    const plan = SeedWorldPlanner.generate({ rootSeed: 1_729 });
    const profile = extractSeedWorldBoundaryProfile(plan, undefined, 128);
    const seed = (plan.stageSeeds.geology ^ plan.rootSeed) >>> 0;

    const vistaA = generatePanoramaVistaBuffers({
      seed,
      width: 256,
      height: 64,
      radialSteps: 64,
      boundaryProfile: profile
    });
    const vistaB = generatePanoramaVistaBuffers({
      seed,
      width: 256,
      height: 64,
      radialSteps: 64,
      boundaryProfile: profile
    });

    expect(vistaA.farA.length).toBe(256 * 64 * 4);
    expect(vistaA.farB.length).toBe(256 * 64 * 4);
    expect(vistaA.minDistanceKm).toBe(20);
    expect(Buffer.from(vistaA.farA).equals(Buffer.from(vistaB.farA))).toBe(true);
    expect(Buffer.from(vistaA.farB).equals(Buffer.from(vistaB.farB))).toBe(true);

    // Ensure bottom rows contain opaque mountain coverage while top rows remain sky-transparent
    let bottomCoverageSum = 0;
    let topCoverageSum = 0;
    for (let c = 0; c < vistaA.width; c++) {
      topCoverageSum += vistaA.farA[c * 4 + 3]!;
      bottomCoverageSum += vistaA.farA[((vistaA.height - 1) * vistaA.width + c) * 4 + 3]!;
    }
    expect(bottomCoverageSum / vistaA.width).toBeGreaterThan(220);
    expect(topCoverageSum / vistaA.width).toBeLessThan(32);
  });

  it("keeps the near cutoff from painting opaque vertical slices into the panorama", () => {
    const { farA, farB } = generatePanoramaVistaBuffers({
      seed: 1_729,
      width: 256,
      height: 64,
      minDistanceKm: 6,
      radialSteps: 64
    });

    let opaqueCutoffTexels = 0;
    for (let offset = 0; offset < farA.length; offset += 4) {
      if (farA[offset + 3] === 255 && farB[offset] === 0) opaqueCutoffTexels++;
    }
    expect(opaqueCutoffTexels).toBe(0);
  });

  it("builds a transition skirt mesh whose inner seam matches the boundary sampler and morphs outward", () => {
    const plan = SeedWorldPlanner.generate({ rootSeed: 1_729 });
    const baseProfile = extractSeedWorldBoundaryProfile(plan, undefined, 64);
    // Test with non-zero worldCenterX/Z (matching [0, 3072] IslandPlan domain centered at [1536, 1536])
    const profile = {
      ...baseProfile,
      worldCenterX: 1536,
      worldCenterZ: 1536
    };
    const halfSize = profile.worldHalfSizeMetres;

    const skirt = generateVistaTransitionSkirt({
      seed: plan.stageSeeds.geology,
      boundaryProfile: profile,
      sampleInnerBoundaryHeight: (wx, wz) => 42 + (wx + wz) * 0.01,
      outerRadiusMetres: 5_200,
      segmentsPerSide: 12,
      radialRings: 10
    });

    expect(skirt.angularColumns).toBe(48);
    expect(skirt.radialRings).toBe(10);
    expect(skirt.positions.length).toBe(48 * 10 * 3);
    expect(skirt.indices.length).toBe(48 * 9 * 6);

    // Ring 1 is the exact seam at max(|x - centerX|, |z - centerZ|) == halfSize
    for (let c = 0; c < skirt.angularColumns; c++) {
      const seamIdx = (1 * skirt.angularColumns + c) * 3;
      const sx = skirt.positions[seamIdx]!;
      const sy = skirt.positions[seamIdx + 1]!;
      const sz = skirt.positions[seamIdx + 2]!;
      expect(Math.max(Math.abs(sx - 1536), Math.abs(sz - 1536))).toBeCloseTo(halfSize, 3);
      const expectedSeamY = 42 + (sx + sz) * 0.01 - 0.18;
      expect(sy).toBeCloseTo(expectedSeamY, 2);

      // Outer ring (r = radialRings - 1) sits on the circular outer radius (5,200 m) around (1536, 1536)
      const outerIdx = ((skirt.radialRings - 1) * skirt.angularColumns + c) * 3;
      const ox = skirt.positions[outerIdx]!;
      const oz = skirt.positions[outerIdx + 2]!;
      expect(Math.hypot(ox - 1536, oz - 1536)).toBeCloseTo(5_200, 1);
    }
  });
});
