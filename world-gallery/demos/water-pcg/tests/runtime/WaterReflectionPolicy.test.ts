import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import {
  WATER_REFLECTION_ARBITRATION_POLICY,
  WATER_REFLECTION_QUALITY_POLICY,
  WaterReflectionOwnerArbitrator,
  resolveWaterReflectionPlan,
  type WaterReflectionRequest
} from "../../runtime/optics/WaterReflectionPolicy";

function request(id: string, quality: WaterReflectionRequest["quality"], priority: number): WaterReflectionRequest {
  return {
    id,
    preferredSource: "planar",
    quality,
    visible: true,
    priority,
    planeY: 0,
    cullingMask: 0xffffffff,
    waterLayerMask: id === "ocean" ? 1 << 29 : 1 << 30
  };
}

describe("WaterReflectionPolicy", () => {
  it("allows exactly one deterministic planar owner per camera", () => {
    const plan = resolveWaterReflectionPlan(
      [request("z-pool", "high", 10), request("ocean", "medium", 10), request("river", "high", 5)],
      { probe: true, planar: true }
    );

    expect(plan.planarOwnerId).toBe("ocean");
    expect(plan.resolutions).toContainEqual({
      requestId: "ocean",
      requestedSource: "planar",
      resolvedSource: "planar"
    });
    expect(plan.resolutions.filter((resolution) => resolution.resolvedSource === "planar")).toHaveLength(1);
    expect(plan.resolutions.filter((resolution) => resolution.fallbackReason === "planar-not-selected")).toHaveLength(
      2
    );
    expect(plan.waterLayerMask).toBe((1 << 29) | (1 << 30));
  });

  it("ranks eligible candidates by priority, area, distance, then stable id", () => {
    const availability = { probe: true, planar: true };
    const base = { screenAreaRatio: 0.2, cameraDistanceMeters: 10 };

    expect(
      resolveWaterReflectionPlan(
        [
          { ...request("area", "high", 2), ...base, screenAreaRatio: 0.9 },
          { ...request("priority", "high", 3), ...base }
        ],
        availability
      ).planarOwnerId
    ).toBe("priority");
    expect(
      resolveWaterReflectionPlan(
        [
          { ...request("ineligible", "high", 3), ...base, screenAreaRatio: 0.9, planarEligible: false },
          { ...request("near", "high", 3), ...base, cameraDistanceMeters: 2 },
          { ...request("large", "high", 3), ...base, screenAreaRatio: 0.3 }
        ],
        availability
      ).planarOwnerId
    ).toBe("large");
    expect(
      resolveWaterReflectionPlan(
        [
          { ...request("far", "high", 3), ...base, cameraDistanceMeters: 20 },
          { ...request("near", "high", 3), ...base, cameraDistanceMeters: 2 }
        ],
        availability
      ).planarOwnerId
    ).toBe("near");
    expect(
      resolveWaterReflectionPlan(
        [
          { ...request("z-stable", "high", 3), ...base },
          { ...request("a-stable", "high", 3), ...base }
        ],
        availability
      ).planarOwnerId
    ).toBe("a-stable");
  });

  it("preserves legacy defaults and fails closed for every explicitly invalid arbitration value", () => {
    const legacy = resolveWaterReflectionPlan([request("z", "high", 1), request("a", "high", 1)], {
      probe: false,
      planar: true
    });
    const invalidRequests: WaterReflectionRequest[] = [
      { ...request("priority", "high", 1), priority: Number.NaN },
      { ...request("eligible", "high", 1), planarEligible: "yes" as unknown as boolean },
      { ...request("area-nan", "high", 1), screenAreaRatio: Number.NaN },
      { ...request("area-negative", "high", 1), screenAreaRatio: -0.01 },
      { ...request("area-overflow", "high", 1), screenAreaRatio: 1.01 },
      { ...request("distance-nan", "high", 1), cameraDistanceMeters: Number.NaN },
      { ...request("distance-negative", "high", 1), cameraDistanceMeters: -0.01 }
    ];
    const invalid = resolveWaterReflectionPlan(invalidRequests, { probe: true, planar: true });

    expect(legacy.planarOwnerId).toBe("a");
    expect(legacy.eligiblePlanarRequestCount).toBe(2);
    expect(invalid.planarOwnerId).toBeUndefined();
    expect(invalid.eligiblePlanarRequestCount).toBe(0);
    expect(invalid.resolutions.every((resolution) => resolution.resolvedSource === "probe")).toBe(true);
    expect(invalid.resolutions.every((resolution) => resolution.fallbackReason === "planar-ineligible")).toBe(true);
  });

  it("holds one owner through 300 frames of sub-threshold area and distance noise", () => {
    const arbitrator = new WaterReflectionOwnerArbitrator();
    const availability = { probe: true, planar: true };
    const owner = { ...request("owner", "high", 1), screenAreaRatio: 0.4, cameraDistanceMeters: 10 };
    const stableState = arbitrator.updateInPlace([owner], availability);
    expect(stableState.selectedOwnerId).toBe("owner");

    for (let frame = 1; frame < 300; frame++) {
      const noise = frame % 2 === 0 ? 0.005 : -0.005;
      const challenger = {
        ...request("challenger", "high", 1),
        screenAreaRatio: 0.4 + noise,
        cameraDistanceMeters: frame % 3 === 0 ? 9.2 : 9.8
      };
      const state = arbitrator.updateInPlace([owner, challenger], availability);
      expect(state).toBe(stableState);
      expect(state.selectedOwnerId).toBe("owner");
    }

    expect(arbitrator.state).toMatchObject({
      selectedOwnerId: "owner",
      ownerAgeFrames: 299,
      ownerMinimumHoldRemainingFrames: 0,
      pendingOwnerAgeFrames: 0,
      eligiblePlanarRequestCount: 2
    });
  });

  it("requires the frozen 30-frame hold and 12-frame challenger confirmation", () => {
    const arbitrator = new WaterReflectionOwnerArbitrator();
    const availability = { probe: false, planar: true };
    const owner = { ...request("owner", "high", 1), screenAreaRatio: 0.2, cameraDistanceMeters: 20 };
    const challenger = {
      ...request("challenger", "high", 1),
      screenAreaRatio: 0.25,
      cameraDistanceMeters: 20
    };

    arbitrator.update([owner], availability);
    for (let frame = 0; frame < WATER_REFLECTION_ARBITRATION_POLICY.minimumOwnerHoldFrames; frame++) {
      arbitrator.update([owner], availability);
    }
    for (let frame = 1; frame < WATER_REFLECTION_ARBITRATION_POLICY.challengerConfirmFrames; frame++) {
      const state = arbitrator.update([owner, challenger], availability);
      expect(state.selectedOwnerId).toBe("owner");
      expect(state.pendingOwnerId).toBe("challenger");
    }

    const switched = arbitrator.update([owner, challenger], availability);
    expect(switched).toMatchObject({
      selectedOwnerId: "challenger",
      ownerAgeFrames: 0,
      pendingOwnerAgeFrames: 0
    });
  });

  it("hands off only after the owner is lost for six consecutive frames", () => {
    const arbitrator = new WaterReflectionOwnerArbitrator();
    const availability = { probe: false, planar: true };
    const owner = { ...request("owner", "high", 2), screenAreaRatio: 0.4, cameraDistanceMeters: 8 };
    const replacement = { ...request("replacement", "high", 1), screenAreaRatio: 0.2, cameraDistanceMeters: 12 };
    arbitrator.update([owner, replacement], availability);

    for (let frame = 1; frame < WATER_REFLECTION_ARBITRATION_POLICY.lostOwnerHandoffFrames; frame++) {
      const state = arbitrator.update([{ ...owner, visible: false }, replacement], availability);
      expect(state).toMatchObject({
        selectedOwnerId: undefined,
        pendingOwnerId: "replacement",
        pendingReason: "owner-lost",
        pendingOwnerAgeFrames: frame
      });
    }

    expect(arbitrator.update([{ ...owner, visible: false }, replacement], availability)).toMatchObject({
      selectedOwnerId: "replacement",
      ownerAgeFrames: 0,
      pendingOwnerAgeFrames: 0
    });
  });

  it("keeps Low off planar and falls back planar to probe then sky", () => {
    const lowWithProbe = resolveWaterReflectionPlan([request("low", "low", 1)], { probe: true, planar: true });
    const noResources = resolveWaterReflectionPlan([request("high", "high", 1)], {
      probe: false,
      planar: false
    });

    expect(WATER_REFLECTION_QUALITY_POLICY.low.planarEnabled).toBe(false);
    expect(WATER_REFLECTION_QUALITY_POLICY.medium.planarResolutionScale).toBe(0.25);
    expect(WATER_REFLECTION_QUALITY_POLICY.high.planarResolutionScale).toBe(0.5);
    expect(lowWithProbe.resolutions[0]).toMatchObject({
      resolvedSource: "probe",
      fallbackReason: "low-quality"
    });
    expect(noResources.resolutions[0]).toMatchObject({
      resolvedSource: "sky",
      fallbackReason: "planar-unavailable"
    });
  });

  it("selects requests that use the normalized general-plane representation", () => {
    const generalPlaneRequest: WaterReflectionRequest = {
      ...request("tilted", "high", 1),
      planeY: undefined,
      plane: { normal: new Vector3(0, Math.SQRT1_2, Math.SQRT1_2), distance: -2 },
      clipBias: 0.03
    };

    const plan = resolveWaterReflectionPlan([generalPlaneRequest], { probe: false, planar: true });

    expect(plan.planarOwnerId).toBe("tilted");
    expect(plan.resolutions[0]).toEqual({
      requestId: "tilted",
      requestedSource: "planar",
      resolvedSource: "planar"
    });
  });

  it("excludes registered water layers even while their requests are invisible", () => {
    const visible = request("ocean", "high", 1);
    const hidden: WaterReflectionRequest = {
      ...request("pool", "high", 0),
      visible: false
    };

    const plan = resolveWaterReflectionPlan([visible, hidden], { probe: true, planar: true });

    expect(plan.waterLayerMask).toBe((1 << 29) | (1 << 30));
    expect(plan.resolutions.map((resolution) => resolution.requestId)).toEqual(["ocean"]);
  });
});
