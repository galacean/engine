import { expect, it } from "vitest";
import { Color, DayNightColorGradient, DayNightSystem, createConstantDayNightCurve } from "@galacean/engine";
import type { Engine } from "@galacean/engine";
import authoredProfile from "@galacean/engine-environment/terrain/lighting/IntegratedWorldLightingProfile.json";
import { TerrainTimeTransition } from "@galacean/engine-environment/terrain/lighting/TerrainTimeTransition";
import { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { PlanningLightingProfileRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningLightingProfileRuntime";

/** Runs the production curve writer, profile application and clock transition. Only GPU state is stubbed. */
function fixture() {
  const system = new DayNightSystem();
  const curve = () => createConstantDayNightCurve(0);
  const curves = () =>
    new Proxy({}, { get: (target: Record<string, unknown>, key: string) => (target[key] ??= curve()) });
  const gradient = () =>
    new DayNightColorGradient([
      { time: 0, color: new Color() },
      { time: 1, color: new Color() }
    ]);
  const lighting: TerrainLightingRuntime = Object.assign(Object.create(TerrainLightingRuntime.prototype), {
    system,
    _scene: { fogStart: 0, fogEnd: 100, shaderData: { setFloat() {}, enableMacro() {}, disableMacro() {} } },
    _proceduralSky: { material: { customSkyZenithTint: new Color(), customSkyHorizonTint: new Color() } },
    _moonLighting: { options: { color: new Color() } },
    _atmosphericFog: { tint: new Color(), setTint() {} },
    _bloomIntensityCurve: curve(),
    _moonLightIntensityCurve: curve(),
    _skyTimeCurves: curves(),
    _presentationTimeCurves: curves(),
    _customSkyZenithTintGradient: gradient(),
    _customSkyHorizonTintGradient: gradient(),
    _timeTransition: new TerrainTimeTransition((hours: number) => {
      system.clock.paused = true;
      system.setTimeHours(hours);
    }),
    _requestProceduralSkyBake() {},
    setVisibility() {}
  });
  const engine = {
    resourceManager: { load: async () => ({ data: structuredClone(authoredProfile) }) }
  } as unknown as Engine;
  return { system, lighting, profile: new PlanningLightingProfileRuntime(engine, lighting) };
}

const values = { timeHours: 12, ambientIntensity: 0.42, direct: true, environment: true, shadows: true, fog: true };

it("keeps the live clock and the authored override at its authored time across a republish", async () => {
  const signal = new AbortController().signal;
  const { system, lighting, profile } = fixture();
  await profile.apply(values);
  expect(system.state.ambientIntensity).toBeCloseTo(0.42, 8);
  await lighting.transitionTime(21, 0, signal);
  const night = system.state.ambientIntensity;
  expect(night).not.toBeCloseTo(0.42, 2);

  await profile.apply({ ...values });
  expect(system.state.timeHours).toBeCloseTo(21, 8);
  expect(system.state.ambientIntensity).toBeCloseTo(night, 8);

  await lighting.transitionTime(12, 0, signal);
  expect(system.state.ambientIntensity).toBeCloseTo(0.42, 8);
});

it("moves the clock and the override together when the authored time changes", async () => {
  const signal = new AbortController().signal;
  const { system, lighting, profile } = fixture();
  await profile.apply(values);
  await profile.apply({ ...values, timeHours: 6 });
  expect(system.state.timeHours).toBeCloseTo(6, 8);
  expect(system.state.ambientIntensity).toBeCloseTo(0.42, 8);
  await lighting.transitionTime(12, 0, signal);
  expect(system.state.ambientIntensity).not.toBeCloseTo(0.42, 2);
});
