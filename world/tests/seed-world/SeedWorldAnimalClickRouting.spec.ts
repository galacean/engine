import { readFileSync } from "node:fs";
import ts from "typescript";
import { Ray, Vector2 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { animalInteractionConfig } from "@galacean/engine-animals/gameplay/animal/AnimalInteraction";
import { PlanningAnimalRuntime } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime";

import { AnimalTaskController } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { AnimalAssetLibrary } from "@galacean/engine-animals/gameplay/animal/AnimalAssetLibrary";
import { seedAnimalCatalog, seedAnimalRegistrations } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalContent";

// Execute the scene's real click handler without booting a World or a WebGL canvas.
// Panel identity/reveal and native pointer ownership have separate runtime tests.
const source = ts.createSourceFile(
  "SeedWorldDemo.ts",
  readFileSync(new URL("../../demos/seed-world/SeedWorldDemo.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const handlers: ts.FunctionExpression[] = [];
function visit(node: ts.Node): void {
  if (ts.isFunctionExpression(node) && node.name?.text === "interactWithAnimal") handlers.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
if (handlers.length !== 1) throw new Error("Expected the native scene's single world-click handler");
const code = ts.transpileModule(`return (${handlers[0].getText(source)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function fixture(options: { ready?: boolean; disposed?: boolean; lassoFrozen?: boolean; farmingPicking?: boolean; rockHit?: boolean } = {}) {
  const state = {
    Ray, Vector2,
    ready: options.ready ?? true,
    disposed: options.disposed ?? false,
    lassoFrozen: options.lassoFrozen ?? false,
    runtimeDebug: { farmingPicking: options.farmingPicking ?? false },
    camera: { screenPointToRay: vi.fn() },
    animals: { shoo: vi.fn() },
    rockNavigation: { raycastWorld: vi.fn(() => options.rockHit) },
    root: { scene: { physics: { raycast: vi.fn(() => true) } } }
  };
  const click = new Function(...Object.keys(state), code)(...Object.values(state)) as (x: number, y: number) => void;
  return { ...state, click };
}

describe("world animal click routing", () => {
  it.each(["fast", "normal", "blocked"])("tries flight before a ground escape when a flamingo is clicked (%s)", (clearance) => {
    const library = new AnimalAssetLibrary({} as any, seedAnimalCatalog, seedAnimalRegistrations, "https://example.test/");
    const profile = library.resolve({ typeId: "flamingo-01" }).profile;
    const probes: string[] = [];
    const play = vi.fn((_clip: string) => 1);
    const controller = new AnimalTaskController(profile, {
      time: 0, wake() {}, schedule: () => () => {}, play,
      resolveTarget(query, event) {
        expect(query.query).toBe("flee");
        expect(event?.source).toEqual([1, 0]);
        probes.push(String(query.params?.medium));
        return [8, 10];
      },
      canMoveTo: (_target, speed, landing) =>
        !landing || clearance === "fast" || (clearance === "normal" && speed <= profile.movementSpeeds.fly),
      moveTo: () => () => {}
    }, () => 0.99999);
    expect(controller.notify({ type: "shoo", id: "click", source: [1, 0] })).toBe(true);
    controller.tick();
    expect(probes[0]).toBe("air");
    const canFly = clearance !== "blocked";
    expect(probes.includes("ground")).toBe(!canFly);
    expect(play.mock.calls[0][0]).toBe(canFly ? "fly" : "run");
    controller.dispose();
  });

  it("keeps an airborne flamingo in flight if a second click cannot find a fresh landing", () => {
    const library = new AnimalAssetLibrary({} as any, seedAnimalCatalog, seedAnimalRegistrations, "https://example.test/");
    const profile = library.resolve({ typeId: "flamingo-01" }).profile;
    const play = vi.fn((_clip: string) => 1);
    let clear = true;
    const controller = new AnimalTaskController(profile, {
      time: 0, wake() {}, schedule: () => () => {}, play,
      resolveTarget: () => clear ? [8, 10] : null,
      moveTo: () => () => {}
    });
    controller.notify({ type: "shoo", id: "first", source: [1, 0] });
    controller.tick();
    expect(controller.inspect().slot).toBe("fly");
    clear = false;
    controller.notify({ type: "shoo", id: "second", source: [2, 0] });
    controller.tick();
    expect(controller.inspect().slot).toBe("fly");
    expect(play.mock.calls.every(([clip]) => clip === "fly")).toBe(true);
    controller.dispose();
  });

  it("finds a short exit from a pocket even if both sides and the direction away from the click are blocked", () => {
    const runtime = Object.assign(Object.create(PlanningAnimalRuntime.prototype), { interactions: {} });
    const animal = { position: { x: 0, z: 0 }, direction: 0, medium: "ground", canOccupy: () => true };
    const open = (p: { x: number; z: number }) => Math.abs(p.x) < 0.1 && p.z < -1;
    const result = runtime.resolveTarget({ canTraverse: open }, animal, {
      query: "flee", params: { medium: "ground", escapeDetour: true, distance: 24 }
    }, { type: "shoo", source: [0, -8] }, () => 0.5, 1, 2, {}, { x: 0, z: 0, radius: 3 });
    expect(result).not.toBeNull();
    expect(open({ x: result[0], z: result[1] })).toBe(true);
    expect(Math.hypot(...result)).toBeLessThanOrEqual(3);
  });

  it("skips near-foot flight flee candidates so a shooed bird does not immediately land where it stood", () => {
    const runtime = Object.assign(Object.create(PlanningAnimalRuntime.prototype), { interactions: {} });
    const animal = { position: { x: 0, z: 0 }, direction: 0, medium: "ground", canOccupy: () => true };
    const proposals = [{ x: 0, z: 0.1 }, { x: 0, z: 4 }, { x: 0, z: 20 }];
    let index = 0;
    const result = runtime.resolveTarget({ flightCandidate: () => proposals[index++], canTraverse: () => true }, animal, {
      query: "flee", params: { medium: "air", arrivalMedium: "ground", scope: "world" }
    }, { type: "shoo", source: [0, -10] }, () => 0.5, 0.5, 1, {});
    expect(result).toEqual([0, 20]);
  });

  it("falls back to ground run when a startled bird without flyFirstOnShoo cannot take off", () => {
    const library = new AnimalAssetLibrary({} as any, seedAnimalCatalog, seedAnimalRegistrations, "https://example.test/");
    const profile = library.resolve({ typeId: "pigeon-01" }).profile;
    const play = vi.fn((_clip: string) => 1);
    const controller = new AnimalTaskController(profile, {
      time: 0, wake() {}, schedule: () => () => {}, play,
      resolveTarget: () => [8, 10],
      canMoveTo: (_target, _speed, landing) => !landing,
      moveTo: () => () => {}
    }, () => 0);
    expect(controller.notify({ type: "shoo", id: "click", source: [1, 0] })).toBe(true);
    controller.tick();
    expect(controller.inspect().branch).toBe("reaction:startle");
    expect(controller.inspect().slot).toBe("run");
    expect(play).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("shoos the first visible surface in reach from a free camera and respects occlusion and custom reach", () => {
    const actor = (z: number, visible = true) => ({
      animal: { visible, bounds: [[-1, 0, z], [1, 2, z + 2]], behavior: { notify: vi.fn(() => true) } }
    });
    const closest = actor(40), behind = actor(52);
    const runtime = Object.assign(Object.create(PlanningAnimalRuntime.prototype), {
      population: { active: [behind, actor(10, false), closest], system: { time: 0 } },
      interaction: animalInteractionConfig(), interactions: {}, requestId: 0
    });
    const ray = { origin: { x: 0, y: 1, z: 2 }, direction: { x: 0, y: 0, z: 1 } };
    expect(runtime.shoo(ray, () => true)).toBe(false);
    expect(runtime.shoo(ray)).toBe(true);
    expect(closest.animal.behavior.notify).toHaveBeenCalledWith({ id: "shoo:1", type: "shoo", source: [0, 2] });
    expect(behind.animal.behavior.notify).not.toHaveBeenCalled();
    for (const reach of [0, 5, 37.9]) {
      runtime.interaction.clickDistance = reach;
      expect(runtime.shoo(ray)).toBe(false);
    }
    runtime.interaction.clickDistance = 38;
    expect(runtime.shoo(ray)).toBe(true);
  });
  it("retains animal interaction and the rock/physics occlusion query", () => {
    const f = fixture();
    f.click(12, 34);
    expect(f.camera.screenPointToRay).toHaveBeenCalledOnce();
    expect(f.animals.shoo).toHaveBeenCalledOnce();
    const [ray, occluded] = f.animals.shoo.mock.calls[0] as unknown as [Ray, (distance: number) => boolean];
    expect(occluded(10)).toBe(true);
    expect(f.rockNavigation.raycastWorld).toHaveBeenCalledWith(ray, 10);
    expect(f.root.scene.physics.raycast).toHaveBeenCalledWith(ray, 10);
  });
  it("preserves a negative rock query instead of falling through to physics", () => {
    const f = fixture({ rockHit: false });
    f.click(12, 34);
    const [, occluded] = f.animals.shoo.mock.calls[0] as unknown as [Ray, (distance: number) => boolean];
    expect(occluded(10)).toBe(false);
    expect(f.root.scene.physics.raycast).not.toHaveBeenCalled();
  });
  it.each([{ ready: false }, { disposed: true }, { lassoFrozen: true }, { farmingPicking: true }])(
    "keeps animal clicks behind input ownership guards: %j", options => {
      const f = fixture(options);
      f.click(12, 34);
      expect(f.animals.shoo).not.toHaveBeenCalled();
    }
  );
});
