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
  if (ts.isFunctionExpression(node) && node.name?.text === "pickWorldObject") handlers.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
if (handlers.length !== 1) throw new Error("Expected the native scene's single world-click handler");
const code = ts.transpileModule(`return (${handlers[0].getText(source)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function fixture(
  options: {
    enabled?: boolean;
    debug?: boolean;
    ready?: boolean;
    disposed?: boolean;
    lassoFrozen?: boolean;
    farmingPicking?: boolean;
    consumed?: boolean;
    animalHit?: boolean;
    kind?: "rock" | "tree";
  } = {}
) {
  const kind = options.kind ?? "rock";
  const ref = {
    id: kind === "rock" ? "rock-obb" : "tree-instance",
    domain: kind === "rock" ? "object" : "vegetation",
    kind
  };
  const published = { plan: {} };
  const panel = { selectRockObb: vi.fn(), farmingPicking: options.farmingPicking ?? false };
  const farming = { consumesWorldClick: vi.fn(() => options.consumed ?? false) };
  const state = {
    Ray,
    Vector2,
    camera: { screenPointToRay: vi.fn() },
    animals: { shoo: vi.fn(() => options.animalHit ?? false) },
    rockNavigation: { raycastWorld: vi.fn(() => false) },
    worldPickingEnabled: options.enabled ?? false,
    ready: options.ready ?? true,
    disposed: options.disposed ?? false,
    lassoFrozen: options.lassoFrozen ?? false,
    runtimeDebug: options.debug === false ? undefined : panel,
    farming,
    farmingHost: { runtime: farming },
    nativeBuildingHost: undefined,
    selectedNativeId: undefined,
    publication: { current: published },
    water: {},
    selectionPublication: undefined,
    selection: { clear: vi.fn(), select: vi.fn(() => true), setRegion: vi.fn() },
    tools: { application: { selectWorld: vi.fn(() => ({ items: [{ ref }] })), setUserSelection: vi.fn() } },
    worldPicker: { pick: vi.fn<() => string | undefined>(() => ref.id) },
    visitCurrentPickBatches: vi.fn(),
    planningSelectionRegion: vi.fn(() => ({ id: "region" })),
    canvas: { dispatchEvent: vi.fn() },
    pageUrl: new URL("http://localhost/?debug=1"),
    console: { error: vi.fn(), info: vi.fn() },
    CustomEvent: class {
      readonly detail: unknown;
      constructor(
        readonly type: string,
        init: { detail: unknown }
      ) {
        this.detail = init.detail;
      }
    }
  };
  const click = new Function(...Object.keys(state), code)(...Object.values(state)) as (x: number, y: number) => void;
  return { ...state, panel, click, ref };
}

describe("native rock click routing", () => {
  it("lets a nearby animal consume a click with editor selection disabled", () => {
    const f = fixture({ debug: false, animalHit: true });
    f.click(12, 34);
    expect(f.animals.shoo).toHaveBeenCalledOnce();
    expect(f.farming.consumesWorldClick).not.toHaveBeenCalled();
    expect(f.worldPicker.pick).not.toHaveBeenCalled();
  });

  it.each([{ ready: false }, { disposed: true }, { lassoFrozen: true }, { farmingPicking: true }])(
    "keeps animal clicks behind input ownership guards: %j",
    (options) => {
      const f = fixture({ ...options, animalHit: true });
      f.click(12, 34);
      expect(f.animals.shoo).not.toHaveBeenCalled();
    }
  );

  it("selects the rock controls with AI world selection switched off", () => {
    const f = fixture();
    f.click(12, 34);
    expect(f.worldPicker.pick).toHaveBeenCalledExactlyOnceWith(12, 34, f.visitCurrentPickBatches);
    expect(f.panel.selectRockObb).toHaveBeenCalledExactlyOnceWith(f.ref.id);
    expect(f.tools.application.selectWorld).not.toHaveBeenCalled();
    expect(f.tools.application.setUserSelection).not.toHaveBeenCalled();
    expect(f.selection.clear).not.toHaveBeenCalled();
    expect(f.selection.select).not.toHaveBeenCalled();
    expect(f.canvas.dispatchEvent).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "preserves baseline rock selection when scene selection is enabled, with debug panel %s",
    (debug) => {
      const f = fixture({ enabled: true, debug });
      f.click(12, 34);
      expect(f.worldPicker.pick).toHaveBeenCalledOnce();
      if (debug) expect(f.panel.selectRockObb).toHaveBeenCalledExactlyOnceWith(f.ref.id);
      else expect(f.panel.selectRockObb).not.toHaveBeenCalled();
      expect(f.selection.clear).toHaveBeenCalledOnce();
      expect(f.tools.application.setUserSelection).toHaveBeenLastCalledWith(f.ref);
      expect(f.selection.select).toHaveBeenCalledExactlyOnceWith(f.ref.id);
      expect(f.selection.setRegion).toHaveBeenCalledExactlyOnceWith({ id: "region" });
      expect(f.canvas.dispatchEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: "seed-world-picked", detail: { id: f.ref.id, ref: f.ref } })
      );
    }
  );

  it("switches generic selection from a tree to a rock and also selects the rock panel", () => {
    const f = fixture({ enabled: true, kind: "tree" });
    f.click(12, 34);
    expect(f.selection.select).toHaveBeenLastCalledWith("tree-instance");
    f.selection.clear.mockClear();
    f.selection.select.mockClear();
    f.selection.setRegion.mockClear();
    f.tools.application.setUserSelection.mockClear();
    f.canvas.dispatchEvent.mockClear();
    f.panel.selectRockObb.mockClear();
    const rock = { id: "rock-obb", domain: "object", kind: "rock" as const };
    f.worldPicker.pick.mockReturnValue(rock.id);
    f.tools.application.selectWorld.mockReturnValue({ items: [{ ref: rock }] });
    f.click(56, 78);
    expect(f.panel.selectRockObb).toHaveBeenCalledExactlyOnceWith(rock.id);
    expect(f.selection.clear).not.toHaveBeenCalled();
    expect(f.selection.select).toHaveBeenCalledExactlyOnceWith(rock.id);
    expect(f.selection.setRegion).toHaveBeenCalledExactlyOnceWith({ id: "region" });
    expect(f.tools.application.setUserSelection).toHaveBeenCalledExactlyOnceWith(rock);
    expect(f.canvas.dispatchEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "seed-world-picked", detail: { id: rock.id, ref: rock } })
    );
  });

  it("preserves enabled generic selection for non-rock objects", () => {
    const f = fixture({ enabled: true, kind: "tree" });
    f.click(12, 34);
    expect(f.worldPicker.pick).toHaveBeenCalledOnce();
    expect(f.panel.selectRockObb).toHaveBeenCalledWith(f.ref.id);
    expect(f.tools.application.setUserSelection).toHaveBeenLastCalledWith(f.ref);
    expect(f.selection.select).toHaveBeenCalledWith(f.ref.id);
    expect(f.canvas.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "seed-world-picked",
        detail: { id: f.ref.id, ref: f.ref }
      })
    );
  });

  it("clears generic selection on an empty click when scene selection is enabled", () => {
    const f = fixture({ enabled: true });
    f.worldPicker.pick.mockReturnValue(undefined);
    f.click(12, 34);
    expect(f.panel.selectRockObb).not.toHaveBeenCalled();
    expect(f.tools.application.selectWorld).not.toHaveBeenCalled();
    expect(f.tools.application.setUserSelection).toHaveBeenLastCalledWith(undefined);
    expect(f.selection.select).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(f.canvas.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "seed-world-picked", detail: null })
    );
  });

  it.each([
    { debug: false },
    { ready: false },
    { disposed: true },
    { lassoFrozen: true },
    { enabled: true, lassoFrozen: true },
    { farmingPicking: true },
    { consumed: true }
  ])("does not pick without a consumer or when another input owner blocks the click: %j", (options) => {
    const f = fixture(options);
    f.click(12, 34);
    expect(f.worldPicker.pick).not.toHaveBeenCalled();
    expect(f.panel.selectRockObb).not.toHaveBeenCalled();
  });

  it("leaves panel and AI selection alone on a miss while world selection is off", () => {
    const f = fixture();
    f.worldPicker.pick.mockReturnValue(undefined);
    f.click(12, 34);
    expect(f.panel.selectRockObb).not.toHaveBeenCalled();
    expect(f.selection.clear).not.toHaveBeenCalled();
    expect(f.tools.application.setUserSelection).not.toHaveBeenCalled();
    expect(f.canvas.dispatchEvent).not.toHaveBeenCalled();
  });

  it("reports a failed debug pick without publishing an AI selection change", () => {
    const f = fixture();
    const error = new Error("pick failed");
    f.worldPicker.pick.mockImplementation(() => {
      throw error;
    });
    f.click(12, 34);
    expect(f.console.error).toHaveBeenCalledWith("[SeedWorld pick]", error);
    expect(f.selection.clear).not.toHaveBeenCalled();
    expect(f.tools.application.setUserSelection).not.toHaveBeenCalled();
    expect(f.canvas.dispatchEvent).not.toHaveBeenCalled();
  });
});
