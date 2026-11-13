import { describe, expect, it, vi } from "vitest";
import { PlanningSeedScenePublication } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";

vi.mock("@galacean/engine-world-planning/spatial/runtime/PlanningWaterAudio", () => ({
  PlanningWaterAudio: class {},
  planningAudioSolids: () => []
}));

function fixture() {
  let height = 1,
    waterLevel = 3;
  const plan = { bridges: [], roadApproaches: [] } as any;
  const sample = vi.fn(() => height);
  const surface = new PlanningNavigationSurface(
    plan,
    sample,
    {
      sampleSurface(x: number, z: number, out: any) {
        out.surfacePosition.set(x, waterLevel, z);
        out.waterDepth = 2;
        return true;
      }
    } as any,
    undefined,
    true
  );
  const water = {
    prepareWater: async () => ({
      rollback: vi.fn(),
      commit: () => {
        waterLevel = 8;
        return { revision: 2, retiredCleanup: Promise.resolve() };
      }
    })
  };
  const owner = new PlanningSeedScenePublication({ water, canvas: { dataset: {} }, audio: {} } as any) as any;
  owner.published = { plan, navigation: surface, revision: 1 };
  owner.publishedAudio = { world: { rocks: [] } };
  return {
    owner,
    surface,
    sample,
    plan,
    setHeight: (value: number) => {
      height = value;
    }
  };
}

describe("animal support at publication boundaries", () => {
  it("invalidates a retained provider only when a content edit commits", async () => {
    const f = fixture();
    f.surface.beginAnimalUpdate();
    expect(f.surface.sampleHeightInterpolated(1, 2)).toBe(1);
    const candidate = await f.owner.prepareContent(f.plan, async () => ({
      commit: () => f.setHeight(4),
      discard() {}
    }));
    expect(f.surface.sampleHeightInterpolated(1, 2)).toBe(1);
    candidate.commit();
    expect(f.owner.current.navigation).toBe(f.surface);
    expect(f.surface.sampleHeightInterpolated(1, 2)).toBe(4);
    f.surface.endAnimalUpdate();
  });

  it("discards and failed commits leave accepted support cached", async () => {
    const f = fixture();
    f.surface.beginAnimalUpdate();
    f.surface.sampleHeightInterpolated(1, 2);
    const candidate = await f.owner.prepareContent(f.plan, async () => ({ commit() {}, discard() {} }));
    await candidate.discard();
    const failed = await f.owner.prepareContent(f.plan, async () => ({
      commit() {
        throw Error("rejected");
      },
      discard() {}
    }));
    expect(() => failed.commit()).toThrow("rejected");
    await failed.discard();
    expect(f.surface.sampleHeightInterpolated(1, 2)).toBe(1);
    expect(f.sample).toHaveBeenCalledTimes(1);
    f.surface.endAnimalUpdate();
  });

  it("refreshes water immediately after water-only publication on the same provider", async () => {
    const f = fixture(),
      out = { height: undefined, waterHeight: undefined } as any;
    f.surface.beginAnimalUpdate();
    f.surface.sampleAnimalSupport(1, 2, out);
    expect(out.waterHeight).toBe(3);
    const candidate = await f.owner.prepareWater(f.plan, {});
    f.surface.sampleAnimalSupport(1, 2, out);
    expect(out.waterHeight).toBe(3);
    candidate.commit();
    expect(f.owner.current.navigation).toBe(f.surface);
    f.surface.sampleAnimalSupport(1, 2, out);
    expect(out.waterHeight).toBe(8);
    f.surface.endAnimalUpdate();
  });
});
