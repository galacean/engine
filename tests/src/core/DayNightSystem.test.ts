import {
  DayNightClock,
  DayNightColorGradient,
  DayNightCurve,
  DayNightLightingScenarioAdapter,
  DayNightProbeTimelineAdapter,
  DayNightProfile,
  DayNightState,
  DayNightStateConsumer,
  DayNightSystem
} from "@galacean/engine-core";
import { Color, Quaternion, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("DayNightSystem", () => {
  it("evaluates scalar curves and linear-space gradients", () => {
    const curve = new DayNightCurve([
      { time: 0, value: 0 },
      { time: 1, value: 4 }
    ]);
    const gradient = new DayNightColorGradient([
      { time: 0, color: new Color(0, 0, 0, 1) },
      { time: 1, color: new Color(1, 0.5, 0.25, 1) }
    ]);
    const color = new Color();

    expect(curve.evaluate(0.25)).to.equal(1);
    expect(gradient.evaluate(0.5, color)).to.deep.equal(new Color(0.5, 0.25, 0.125, 1));
    expect(() => new DayNightCurve([])).to.throw("at least one key");
    expect(
      () =>
        new DayNightCurve([
          { time: 0, value: 0 },
          { time: 0, value: 1 }
        ])
    ).to.throw("unique");
  });

  it("keeps the solar elevation velocity continuous through the noon apex", () => {
    const elevation = new DayNightCurve(
      [
        { time: 9 / 24, value: 30 },
        { time: 12 / 24, value: 68 },
        { time: 15 / 24, value: 38 },
        { time: 18 / 24, value: 12 }
      ],
      "MonotoneCubic"
    );

    const immediatelyBeforeNoon = elevation.evaluate(11.99 / 24);
    const noon = elevation.evaluate(12 / 24);
    const immediatelyAfterNoon = elevation.evaluate(12.01 / 24);
    expect(noon).to.equal(68);
    expect(noon - immediatelyBeforeNoon).to.be.lessThan(0.01);
    expect(noon - immediatelyAfterNoon).to.be.lessThan(0.01);
    expect(elevation.evaluate(12.5 / 24)).to.be.greaterThan(65);
    expect(elevation.evaluate(13 / 24)).to.be.lessThan(noon);
    expect(elevation.evaluate(13 / 24)).to.be.greaterThan(elevation.evaluate(14 / 24));
  });

  it("derives phases and elevation-based twilight blending", () => {
    const profile = new DayNightProfile();
    const midnight = profile.createState(0);
    const dawn = profile.createState(0.25);
    const noon = profile.createState(0.5);
    const dusk = profile.createState(0.75);

    expect(midnight.phase).to.equal("Night");
    expect(midnight.nightFactor).to.equal(1);
    expect(midnight.sunIntensity).to.equal(0);

    expect(dawn.phase).to.equal("Dawn");
    expect(dawn.sunElevation).to.equal(0);
    expect(dawn.nightFactor).to.be.closeTo(0.5, 1e-6);
    expect(dawn.twilightFactor).to.equal(1);

    expect(noon.phase).to.equal("Day");
    expect(noon.nightFactor).to.equal(0);
    expect(noon.sunDirection.y).to.be.lessThan(0);

    expect(dusk.phase).to.equal("Dusk");
    expect(dusk.nightFactor).to.be.closeTo(0.5, 1e-6);
  });

  it("keeps shadow opacity stable while direct solar energy fades at the horizon", () => {
    const profile = new DayNightProfile();
    profile.sunElevation = new DayNightCurve([
      { time: 0, value: 0.5 },
      { time: 1, value: 0.5 }
    ]);
    profile.sunIntensity = new DayNightCurve([
      { time: 0, value: 4 },
      { time: 1, value: 4 }
    ]);
    profile.shadowStrength = new DayNightCurve([
      { time: 0, value: 1 },
      { time: 1, value: 1 }
    ]);

    const state = profile.createState(0.5);
    expect(state.sunIntensity).to.be.greaterThan(0);
    expect(state.sunIntensity).to.be.lessThan(4);
    expect(state.shadowStrength).to.equal(1);
  });

  it("wraps time and publishes state at the configured mobile update rate", () => {
    const clock = new DayNightClock(25);
    clock.timeScale = 3600;
    expect(clock.timeHours).to.equal(1);
    clock.update(1);
    expect(clock.timeHours).to.equal(2);

    const system = new DayNightSystem(clock, new DayNightProfile());
    system.updateFrequency = 10;
    const received: DayNightState[] = [];
    const consumer: DayNightStateConsumer = {
      applyDayNightState(state: DayNightState): void {
        received.push({ ...state });
      }
    };
    system.addConsumer(consumer);
    system.update(0.05);
    expect(received).to.have.length(1);
    system.update(0.05);
    expect(received).to.have.length(2);

    system.clock.paused = true;
    system.update(1);
    expect(received).to.have.length(2);
    system.setTimeHours(18);
    expect(received).to.have.length(3);
    expect(system.state.phase).to.equal("Dusk");
  });

  it("keeps only the adjacent baked Probe scenarios prepared on the time line", () => {
    const blendPairs: [string, string][] = [];
    const blendFactors: number[] = [];
    const volume = {
      lightingScenarioNames: ["Dawn", "Morning", "Noon", "Afternoon", "Dusk", "Night"],
      lightingScenario: "Night",
      setLightingScenarioBlendPair(active: string, target: string): void {
        this.lightingScenario = active;
        blendPairs.push([active, target]);
      },
      setLightingScenarioBlendFactor(factor: number): void {
        blendFactors.push(factor);
      }
    };
    const adapter = new DayNightProbeTimelineAdapter({ probeVolume: volume } as never, [
      { timeHours: 0, scenario: "Night" },
      { timeHours: 6, scenario: "Dawn" },
      { timeHours: 9, scenario: "Morning" },
      { timeHours: 12, scenario: "Noon" },
      { timeHours: 15, scenario: "Afternoon" },
      { timeHours: 18, scenario: "Dusk" }
    ]);
    const profile = new DayNightProfile();

    adapter.applyDayNightState(profile.createState(1.5 / 24));
    expect(adapter.activeScenario).to.equal("Night");
    expect(adapter.targetScenario).to.equal("Dawn");
    expect(adapter.blendFactor).to.be.closeTo(0.25, 1e-6);

    adapter.applyDayNightState(profile.createState(7.5 / 24));
    expect(volume.lightingScenario).to.equal("Dawn");
    expect(adapter.targetScenario).to.equal("Morning");
    expect(adapter.blendFactor).to.be.closeTo(0.5, 1e-6);

    adapter.applyDayNightState(profile.createState(8 / 24));
    expect(blendPairs).to.deep.equal([
      ["Night", "Dawn"],
      ["Dawn", "Morning"]
    ]);
    expect(blendFactors.at(-1)).to.be.closeTo(2 / 3, 1e-6);

    adapter.applyDayNightState(profile.createState(21 / 24));
    expect(volume.lightingScenario).to.equal("Dusk");
    expect(adapter.targetScenario).to.equal("Night");
    expect(adapter.blendFactor).to.be.closeTo(0.5, 1e-6);
    expect(blendPairs.at(-1)).to.deep.equal(["Dusk", "Night"]);
  });

  it("keeps authored direct light and ambient SH on the same scenario timeline", () => {
    const nightSH = new SphericalHarmonics3();
    const noonSH = new SphericalHarmonics3();
    nightSH.coefficients.fill(0);
    noonSH.coefficients.fill(2);
    const light = {
      color: new Color(),
      shadowStrength: 0,
      entity: { transform: { rotationQuaternion: new Quaternion() } }
    };
    const ambient = {
      diffuseMode: 0,
      diffuseSphericalHarmonics: new SphericalHarmonics3(),
      diffuseIntensity: 0,
      specularIntensity: 0
    };
    const adapter = new DayNightLightingScenarioAdapter(light as never, ambient as never, [
      {
        timeHours: 0,
        scenario: "Night",
        sunRotation: new Vector3(-40, -45, 0),
        sunColor: new Color(0, 0, 0, 1),
        shadowStrength: 0,
        diffuseSphericalHarmonics: nightSH,
        diffuseIntensity: 0.2
      },
      {
        timeHours: 12,
        scenario: "Noon",
        sunRotation: new Vector3(-70, 180, 0),
        sunColor: new Color(2, 2, 2, 1),
        shadowStrength: 1,
        diffuseSphericalHarmonics: noonSH,
        diffuseIntensity: 1
      }
    ]);

    adapter.applyDayNightState(new DayNightProfile().createState(6 / 24));
    expect(adapter.activeScenario).to.equal("Night");
    expect(adapter.targetScenario).to.equal("Noon");
    expect(adapter.blendFactor).to.equal(0.5);
    expect(light.color.r).to.equal(1);
    expect(light.shadowStrength).to.equal(0.5);
    expect(ambient.diffuseSphericalHarmonics.coefficients[0]).to.equal(1);
    expect(ambient.diffuseIntensity).to.be.closeTo(0.6, 1e-6);

    light.color.set(9, 8, 7, 1);
    light.shadowStrength = 0.25;
    const preservedRotation = light.entity.transform.rotationQuaternion;
    adapter.applyDirectLight = false;
    adapter.applyDayNightState(new DayNightProfile().createState(0));
    expect(light.color).to.deep.equal(new Color(9, 8, 7, 1));
    expect(light.shadowStrength).to.equal(0.25);
    expect(light.entity.transform.rotationQuaternion).to.equal(preservedRotation);
    expect(ambient.diffuseSphericalHarmonics.coefficients[0]).to.equal(0);
  });

  it("interpolates authored solar pitch and continuous azimuth instead of quaternion shortest paths", () => {
    const sh = new SphericalHarmonics3();
    const light = {
      color: new Color(),
      shadowStrength: 0,
      entity: { transform: { rotationQuaternion: new Quaternion() } }
    };
    const ambient = {
      diffuseMode: 0,
      diffuseSphericalHarmonics: sh,
      diffuseIntensity: 0,
      specularIntensity: 0
    };
    const adapter = new DayNightLightingScenarioAdapter(light as never, ambient as never, [
      {
        timeHours: 12,
        scenario: "Noon",
        sunRotation: new Vector3(-68, 180, 0),
        sunColor: new Color(8, 7.8, 7.5, 1),
        shadowStrength: 1,
        diffuseSphericalHarmonics: sh,
        diffuseIntensity: 1
      },
      {
        timeHours: 15,
        scenario: "Afternoon",
        sunRotation: new Vector3(-38, -130, 0),
        sunColor: new Color(6, 5.5, 4.9, 1),
        shadowStrength: 1,
        diffuseSphericalHarmonics: sh,
        diffuseIntensity: 1
      }
    ]);

    adapter.applyDayNightState(new DayNightProfile().createState(13.5 / 24));
    const expected = new Quaternion();
    Quaternion.rotationEuler((-53 * Math.PI) / 180, (205 * Math.PI) / 180, 0, expected);
    expect(Math.abs(Quaternion.dot(light.entity.transform.rotationQuaternion, expected))).to.be.closeTo(1, 1e-6);
  });
});
