import { describe, expect, it } from "vitest";
import { RiverNetworkSchemaVersion, RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import {
  createRiverSurfaceMotionSampleOutput,
  evaluateRiverSurfaceMotion,
  resolveRiverSurfaceMotion
} from "../../compiler/river/RiverSurfaceMotion";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { CURVED_MAIN_RIVER_SURFACE_MOTION } from "../../demo/examples/river/constants";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { bifurcationNetworkFixture } from "../fixtures/riverFixtures";

describe("RiverSurfaceMotion", () => {
  it("resolves explicit V2 controls and deterministic V1 presets", () => {
    const explicit = resolveRiverSurfaceMotion(curvedMainRiverExample.riverDescriptor);
    const networkExplicit = resolveRiverSurfaceMotion(multiTributaryRiverExample.riverDescriptor);
    const firstDerived = resolveRiverSurfaceMotion(bifurcationNetworkFixture);
    const secondDerived = resolveRiverSurfaceMotion(bifurcationNetworkFixture);

    expect(explicit).toMatchObject({
      seed: CURVED_MAIN_RIVER_SURFACE_MOTION.seed,
      maxDisplacement: CURVED_MAIN_RIVER_SURFACE_MOTION.displacementAmplitude,
      displacementLengthScale: CURVED_MAIN_RIVER_SURFACE_MOTION.displacementLengthScale,
      shoreDampingWidth: CURVED_MAIN_RIVER_SURFACE_MOTION.shoreDampingWidth
    });
    expect(networkExplicit).toEqual(explicit);
    expect(firstDerived).toEqual(secondDerived);
    expect(firstDerived.seed).toBeGreaterThanOrEqual(0);
    expect(firstDerived.seed).toBeLessThanOrEqual(65535);
    expect(firstDerived.maxDisplacement).toBeGreaterThan(0);
  });

  it("is deterministic, time-continuous, shore-damped, and stops advection at zero flow", () => {
    const motion = resolveRiverSurfaceMotion(curvedMainRiverExample.riverDescriptor);
    const output = createRiverSurfaceMotionSampleOutput();
    const repeated = createRiverSurfaceMotionSampleOutput();
    const coordinates = {
      signedAcrossDistance: 0.37,
      networkFlowTime: 8.4,
      halfWidth: 3.5,
      flowSpeed: 1.7
    };

    evaluateRiverSurfaceMotion(motion, coordinates, 2.5, output);
    evaluateRiverSurfaceMotion(motion, coordinates, 2.5, repeated);
    expect(output).toEqual(repeated);

    const nearbyTime = createRiverSurfaceMotionSampleOutput();
    evaluateRiverSurfaceMotion(motion, coordinates, 2.501, nearbyTime);
    expect(Math.abs(nearbyTime.height - output.height)).toBeLessThan(0.01);
    expect(output.height).not.toBe(nearbyTime.height);

    const bank = createRiverSurfaceMotionSampleOutput();
    evaluateRiverSurfaceMotion(motion, { ...coordinates, signedAcrossDistance: coordinates.halfWidth }, 2.5, bank);
    expect(bank.height).toBe(0);

    const stoppedAtStart = createRiverSurfaceMotionSampleOutput();
    const stoppedLater = createRiverSurfaceMotionSampleOutput();
    const stoppedCoordinates = { ...coordinates, flowSpeed: 0 };
    evaluateRiverSurfaceMotion(motion, stoppedCoordinates, 0, stoppedAtStart);
    evaluateRiverSurfaceMotion(motion, stoppedCoordinates, 10, stoppedLater);
    expect(stoppedLater.height).toBe(stoppedAtStart.height);
    expect(stoppedLater.verticalVelocity).toBeCloseTo(0, 8);
  });

  it("disables macro displacement for the V1 Low preset", () => {
    const source = bifurcationNetworkFixture;
    if (source.schemaVersion !== RiverNetworkSchemaVersion.V1) throw new Error("Expected a V1 fixture.");
    const motion = resolveRiverSurfaceMotion({
      ...source,
      defaults: {
        ...source.defaults,
        quality: {
          ...source.defaults.quality,
          material: { level: RiverQualityLevel.Low }
        }
      }
    });

    expect(motion.maxDisplacement).toBe(0);
  });

  it("keeps the bounded noise sampling continuous during a long session", () => {
    const motion = resolveRiverSurfaceMotion(curvedMainRiverExample.riverDescriptor);
    const coordinates = {
      signedAcrossDistance: 0.37,
      networkFlowTime: 8.4,
      halfWidth: 3.5,
      flowSpeed: 1.7
    };
    const longSession = createRiverSurfaceMotionSampleOutput();
    const nearbyTime = createRiverSurfaceMotionSampleOutput();

    evaluateRiverSurfaceMotion(motion, coordinates, 86400, longSession);
    evaluateRiverSurfaceMotion(motion, coordinates, 86400.001, nearbyTime);

    expect(Object.values(longSession).every(Number.isFinite)).toBe(true);
    expect(Object.values(nearbyTime).every(Number.isFinite)).toBe(true);
    expect(Math.abs(nearbyTime.height - longSession.height)).toBeLessThan(0.01);
  });
});
