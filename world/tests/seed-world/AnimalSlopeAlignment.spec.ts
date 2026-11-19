import { describe, expect, it, vi } from "vitest";
import { Entity, Vector3, type Engine } from "@galacean/engine";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import type { AnimalAssetConfig } from "@galacean/engine-animals/gameplay/animal/AnimalAssetCatalog";
import type { AnimalTaskProfile, AnimalSlopeAlignment } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { AnimalAssetLibrary } from "@galacean/engine-animals/gameplay/animal/AnimalAssetLibrary";
import { seedAnimalCatalog, seedAnimalRegistrations } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalContent";

function createAnimal(
  heightAt: (x: number, z: number) => number,
  options: { heading?: number; slopeAlignment?: AnimalSlopeAlignment; bodyLength?: number; bodyWidth?: number; bodyHeight?: number } = {}
) {
  const root = new Entity({ resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} } } as unknown as Engine);
  const system = new AnimalSystem();
  const halfW = (options.bodyWidth ?? 1.2) * 0.5;
  const halfL = (options.bodyLength ?? 3.0) * 0.5;
  const height = options.bodyHeight ?? 2.0;
  const bounds = { min: [-halfW, 0, -halfL], max: [halfW, height, halfL] } as AnimalAssetConfig["bounds"];
  const config: AnimalAssetConfig = {
    id: "slope-test",
    name: "SlopeTest",
    family: "test",
    aliases: [],
    modelUrl: "",
    note: "",
    scale: 1,
    bounds,
    animations: [{ id: "idle", clip: "idle", duration: 1, loop: false, bounds }],
    initialAnimation: "idle"
  };
  const profile: AnimalTaskProfile = {
    defaultSkill: "idle",
    ...(options.slopeAlignment ? { slopeAlignment: options.slopeAlignment } : {}),
    skills: { idle: { label: "Idle", tree: { type: "action", name: "animate", params: { slot: "idle" } } } },
    animationSlots: { idle: [{ clip: "idle", weight: 1, medium: "ground" }] },
    movementSpeeds: {},
    reactions: {}
  };
  const heightSpy = vi.fn((x: number, z: number) => heightAt(x, z));
  const animal = new ConfiguredAnimal(
    root,
    config,
    undefined,
    system,
    [0, 0],
    profile,
    () => null,
    undefined,
    options.heading ?? 0,
    { ground: { heightAt: heightSpy } }
  );
  return { animal, system, root, heightSpy };
}

function localAxisInWorld(animal: ConfiguredAnimal, local: Vector3): Vector3 {
  const entity = (animal as any).root as Entity;
  const q = entity.transform.rotationQuaternion;
  const out = new Vector3();
  Vector3.transformByQuat(local, q, out);
  return out;
}

describe("animal terrain slope alignment", () => {
  it("pitches quadruped nose uphill and downhill accurately along arbitrary headings", () => {
    // Planar uphill slope rising along +Z: y = 0.4 * z (~21.8 degrees).
    const uphill = createAnimal((_x, z) => 0.4 * z, { heading: 0, slopeAlignment: "quadruped" });
    const forwardUp = localAxisInWorld(uphill.animal, new Vector3(0, 0, 1));
    expect(forwardUp.y).toBeGreaterThan(0.35);
    expect(forwardUp.z).toBeGreaterThan(0.9);
    // Exact slope direction: (0, 0.4, 1) normalized -> y ≈ 0.3714.
    expect(forwardUp.y).toBeCloseTo(0.4 / Math.hypot(0.4, 1), 3);

    // Facing downhill (-Z, heading = PI): nose should pitch downward (y < 0).
    const downhill = createAnimal((_x, z) => 0.4 * z, { heading: Math.PI, slopeAlignment: "quadruped" });
    const forwardDown = localAxisInWorld(downhill.animal, new Vector3(0, 0, 1));
    expect(forwardDown.y).toBeCloseTo(-0.4 / Math.hypot(0.4, 1), 3);

    // Planar slope rising along +X, animal facing +X (heading = PI/2).
    const eastUphill = createAnimal((x) => 0.3 * x, { heading: Math.PI / 2, slopeAlignment: "quadruped" });
    const forwardEast = localAxisInWorld(eastUphill.animal, new Vector3(0, 0, 1));
    expect(forwardEast.y).toBeCloseTo(0.3 / Math.hypot(0.3, 1), 3);
    expect(forwardEast.x).toBeGreaterThan(0.9);

    uphill.system.dispose();
    downhill.system.dispose();
    eastUphill.system.dispose();
  });

  it("rolls quadruped to match cross-slope while keeping bipeds mostly upright", () => {
    // Cross-slope rising along +X (animal faces +Z): local +X side is higher.
    const quad = createAnimal((x) => 0.35 * x, { heading: 0, slopeAlignment: "quadruped" });
    const biped = createAnimal((x) => 0.35 * x, { heading: 0, slopeAlignment: "biped" });

    const quadLeft = localAxisInWorld(quad.animal, new Vector3(1, 0, 0));
    const bipedLeft = localAxisInWorld(biped.animal, new Vector3(1, 0, 0));

    // Both tilt slightly toward the raised +X side, but quadruped rolls much more than biped.
    expect(quadLeft.y).toBeGreaterThan(0.2);
    expect(bipedLeft.y).toBeGreaterThan(0);
    expect(bipedLeft.y).toBeLessThan(quadLeft.y * 0.35);

    quad.system.dispose();
    biped.system.dispose();
  });

  it("settles quadruped calibration downward on convex dune ridges without altering logical position.y", () => {
    // Convex ridge peaking at z = 0 (y = 5), sloping down symmetrically on both sides.
    const ridge = createAnimal((_x, z) => 5 - 0.25 * Math.abs(z), { heading: 0, slopeAlignment: "quadruped", bodyLength: 3.2 });
    expect(ridge.animal.position.y).toBe(5);
    const cal = (ridge.animal as any).calibration as Entity;
    // Calibration Y settles below 0 so front/back feet sit on the ridge slopes instead of floating.
    expect(cal.transform.position.y).toBeLessThan(-0.15);
    expect(cal.transform.position.y).toBeGreaterThan(-0.6);
    ridge.system.dispose();
  });

  it("caches slope samples while stationary and levels back to horizontal when airborne", () => {
    const { animal, system, heightSpy } = createAnimal((_x, z) => 0.3 * z, { heading: 0, slopeAlignment: "quadruped" });
    const internals = animal as any;
    internals.rendered = true;
    heightSpy.mockClear();

    // Stationary frame reuses cached slope targets without re-sampling 4 terrain points.
    internals.applySlopeOrientation(1 / 60);
    expect(heightSpy).not.toHaveBeenCalled();

    // Switching to airborne smoothly levels pitch back toward 0.
    internals.movementMedium = "air";
    for (let i = 0; i < 60; i++) internals.applySlopeOrientation(1 / 60);
    expect(Math.abs(internals.slopePitch)).toBeLessThan(0.01);
    expect(Math.abs(internals.slopeRoll)).toBeLessThan(0.01);

    system.dispose();
  });

  it("classifies all 8 seed biped species as biped and long-necked quadrupeds like giraffe as quadruped", () => {
    const library = new AnimalAssetLibrary({} as any, seedAnimalCatalog, seedAnimalRegistrations, "https://example.test/");
    for (const bipedId of [
      "ostrich",
      "pinguin-adelie-01",
      "chick-01",
      "flamingo-01",
      "pigeon-01",
      "swan-01",
      "duck-01",
      "kangoroo-01"
    ]) {
      expect(library.resolve({ typeId: bipedId }).profile.slopeAlignment).toBe("biped");
    }
    for (const quadId of ["giraffe-01", "bison-01", "camel-01", "elephant-01", "lion-01", "fox"]) {
      expect(library.resolve({ typeId: quadId }).profile.slopeAlignment).toBe("quadruped");
    }
  });
});
