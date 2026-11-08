import { describe, expect, it, vi } from "vitest";
import type { Engine, JSONAsset } from "@galacean/engine";
import authoredProfile from "@galacean/engine-environment/terrain/lighting/IntegratedWorldLightingProfile.json";
import {
  decodeTerrainLightingProfile,
  SEED_WORLD_LIGHTING_PROFILE_URL
} from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingProfile";
import { loadTerrainLightingProfile } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingProfileResources";
import { PlanningLightingProfileRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningLightingProfileRuntime";

vi.mock("@galacean/engine", () => ({ AssetType: { JSON: "json" } }));

const parameters = {
  timeHours: 12,
  direct: true,
  environment: true,
  shadows: true,
  fog: true,
  shadowStrength: 1,
  fogDensity: 0
};
const asset = (data = structuredClone(authoredProfile)) => ({ data }) as JSONAsset & { data: typeof authoredProfile };
const engine = (load: unknown) => ({ resourceManager: { load } }) as unknown as Engine;
const lighting = () => ({
  setTimeOfDayLightingProfile: vi.fn(),
  setTuning: vi.fn(),
  setVisibility: vi.fn(),
  applyVisualTuning: vi.fn()
});

describe("PlanningLightingProfileRuntime live clock", () => {
  const runtime = (host: ReturnType<typeof lighting>) =>
    new PlanningLightingProfileRuntime(engine(vi.fn(async () => asset())), host as never);

  it("applies the authored time once and keeps the live clock across republishes", async () => {
    const host = lighting();
    const profile = runtime(host);
    await profile.apply(parameters);
    expect(host.setTuning).toHaveBeenCalledTimes(1);
    expect(host.setTuning).toHaveBeenLastCalledWith({ playing: false, timeHours: 12 });
    await profile.apply(parameters);
    expect(host.setTuning).toHaveBeenCalledTimes(1);
    expect(host.setVisibility).toHaveBeenCalledTimes(2);
    expect(host.applyVisualTuning).toHaveBeenCalled();
  });

  it("moves the clock when the authored time changes", async () => {
    const host = lighting();
    const profile = runtime(host);
    await profile.apply(parameters);
    await profile.apply({ ...parameters, timeHours: 21 });
    expect(host.setTuning).toHaveBeenLastCalledWith({ playing: false, timeHours: 21 });
    await profile.apply(parameters);
    expect(host.setTuning).toHaveBeenLastCalledWith({ playing: false, timeHours: 12 });
    expect(host.setTuning).toHaveBeenCalledTimes(3);
  });
});

describe("native lighting profile assets", () => {
  it("decodes all authored samples and static values without changing calibration or sharing mutable JSON", () => {
    const json = structuredClone(authoredProfile);
    const profile = decodeTerrainLightingProfile(json);
    expect(profile).toEqual(json);
    json.samples[0].sunIntensity++;
    json.visualTuning.starSize++;
    expect(profile.samples[0].sunIntensity).toBe(authoredProfile.samples[0].sunIntensity);
    expect(profile.visualTuning.starSize).toBe(authoredProfile.visualTuning.starSize);
    expect(Object.isFrozen(profile.samples[0])).toBe(true);
    expect(Object.isFrozen(profile.visualTuning)).toBe(true);
  });

  it("rejects incomplete or invalid resources before applying them", () => {
    for (const mutate of [
      (p: any) => {
        p.version = 2;
      },
      (p: any) => {
        delete p.samples[0].sunColorR;
      },
      (p: any) => {
        p.samples[0].sunColorR = Infinity;
      },
      (p: any) => {
        p.samples[1].timeHours = p.samples[0].timeHours;
      },
      (p: any) => {
        p.samples[0].timeHours = 24;
      },
      (p: any) => {
        p.samples.shift();
      },
      (p: any) => {
        p.samples[0].fogEnd = p.samples[0].fogStart;
      },
      (p: any) => {
        p.samples[0].unknownField = 1;
      },
      (p: any) => {
        delete p.visualTuning.starSize;
      }
    ]) {
      const json = structuredClone(authoredProfile);
      mutate(json);
      expect(() => decodeTerrainLightingProfile(json)).toThrow();
    }
  });

  it("loads the requested native JSONAsset and preserves its ResourceManager identity", async () => {
    const resource = asset();
    const load = vi.fn(async () => resource);
    const result = await loadTerrainLightingProfile(engine(load), "Lighting/overcast.json");
    expect(load).toHaveBeenCalledWith({ type: "json", url: "Lighting/overcast.json" });
    expect(result.asset).toBe(resource);
    expect(result.data).toEqual(authoredProfile);
    await expect(loadTerrainLightingProfile(engine(load), "")).rejects.toThrow("asset URL");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy defaults, explicit zero and reset while installing the chosen asset's entire curve", async () => {
    const first = asset(),
      second = asset();
    second.data.samples.forEach((sample: { sunIntensity: number }) => {
      sample.sunIntensity *= 2;
    });
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const owner = lighting(),
      runtime = new PlanningLightingProfileRuntime(engine(load), owner);
    expect(await runtime.apply({ ...parameters, sunIntensity: 0 })).toBe(true);
    expect(load.mock.calls[0][0].url).toBe(SEED_WORLD_LIGHTING_PROFILE_URL);
    expect(owner.applyVisualTuning.mock.lastCall![0].sunIntensity).toBe(0);
    expect(await runtime.apply({ ...parameters, profileUrl: "Lighting/second.json" })).toBe(true);
    expect(owner.setTimeOfDayLightingProfile.mock.calls[1][0]).toEqual(second.data.samples);
    expect(owner.applyVisualTuning.mock.lastCall![0]).not.toHaveProperty("sunIntensity");
    expect(runtime.asset).toBe(second);
  });

  it("applies explicit night colours after static asset values and restores them on reset", async () => {
    const resource = asset(),
      owner = lighting();
    const runtime = new PlanningLightingProfileRuntime(
      engine(async () => resource),
      owner
    );
    await runtime.apply({ ...parameters, moonColorR: 0, moonColorG: 0.6, moonColorB: 1.4, moonDiskIntensity: 0 });
    expect(owner.applyVisualTuning.mock.calls.at(-2)![0]).toEqual(resource.data.visualTuning);
    expect(owner.applyVisualTuning.mock.lastCall![0]).toMatchObject({
      moonColorR: 0,
      moonColorG: 0.6,
      moonColorB: 1.4,
      moonDiskIntensity: 0
    });
    await runtime.apply(parameters);
    expect(owner.applyVisualTuning.mock.calls.at(-2)![0]).toEqual(resource.data.visualTuning);
    expect(owner.applyVisualTuning.mock.lastCall![0]).not.toHaveProperty("moonColorR");
  });

  it("does not let an earlier asset load overwrite a newer selection", async () => {
    let resolveEarlier!: (value: JSONAsset) => void;
    const pending = new Promise<JSONAsset>((resolve) => {
      resolveEarlier = resolve;
    });
    const latest = asset(),
      owner = lighting();
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(latest);
    const runtime = new PlanningLightingProfileRuntime(engine(load), owner);
    const earlier = runtime.apply({ ...parameters, profileUrl: "Lighting/earlier.json" });
    expect(await runtime.apply({ ...parameters, profileUrl: "Lighting/latest.json" })).toBe(true);
    resolveEarlier(asset());
    expect(await earlier).toBe(false);
    expect(runtime.asset).toBe(latest);
    expect(owner.setTimeOfDayLightingProfile).toHaveBeenCalledTimes(1);
  });

  it("reports a failed selection without silently loading a default or changing the published profile", async () => {
    const previous = asset(),
      owner = lighting();
    const load = vi.fn().mockResolvedValueOnce(previous).mockRejectedValueOnce(new Error("missing profile"));
    const runtime = new PlanningLightingProfileRuntime(engine(load), owner);
    await runtime.apply(parameters);
    await expect(runtime.apply({ ...parameters, profileUrl: "Lighting/missing.json" })).rejects.toThrow(
      "missing profile"
    );
    expect(runtime.asset).toBe(previous);
    expect(load).toHaveBeenCalledTimes(2);
    expect(owner.setTimeOfDayLightingProfile).toHaveBeenCalledTimes(1);
  });

  it("ignores a profile that finishes after its presentation owner is disposed", async () => {
    let finish!: (value: JSONAsset) => void;
    const owner = lighting();
    const runtime = new PlanningLightingProfileRuntime(
      engine(
        () =>
          new Promise<JSONAsset>((resolve) => {
            finish = resolve;
          })
      ),
      owner
    );
    const pending = runtime.apply(parameters);
    runtime.dispose();
    finish(asset());
    expect(await pending).toBe(false);
    expect(owner.setTimeOfDayLightingProfile).not.toHaveBeenCalled();
  });
});
