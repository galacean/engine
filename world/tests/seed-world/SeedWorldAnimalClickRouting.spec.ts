import { readFileSync } from "node:fs";
import ts from "typescript";
import { Ray, Vector2 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";

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
