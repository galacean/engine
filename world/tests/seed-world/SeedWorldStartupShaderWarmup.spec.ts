import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { PlanningAnimalHost } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHost";

const source = ts.createSourceFile(
  "SeedWorldDemo.ts",
  readFileSync(new URL("../../demos/seed-world/SeedWorldDemo.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
let startup: ts.IfStatement | undefined;
function visit(node: ts.Node) {
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(source) === "precompileShaders" &&
    node.thenStatement.getText(source).includes("preparePresentation")
  )
    startup = node;
  ts.forEachChild(node, visit);
}
visit(source);
if (!startup) throw new Error("Startup must prepare published presentation before collecting shaders");
const code = ts.transpileModule(`return async () => { ${startup.getText(source)} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(enabled = true, disposed = false) {
  const farm = deferred(),
    animal = deferred(),
    roots: object[] = [],
    events: string[] = [];
  const warmup = vi.fn(async (_engine, _scene, _camera, capturedRoots) => {
    expect(capturedRoots).toContain(farm);
    expect(capturedRoots).toContain(animal);
    events.push("compile");
    return { requested: 1 };
  });
  const state = {
    precompileShaders: enabled,
    disposed,
    progress: vi.fn(),
    farmingHost: {
      runtime: {
        preparePresentation: () =>
          farm.promise.then(() => {
            roots.push(farm);
          })
      }
    },
    animals: {
      preparePresentation: () =>
        animal.promise.then(() => {
          roots.push(animal);
        })
    },
    publication: {
      current: {
        vegetation: {
          preparePresentation: async () => {
            events.push("lod");
          }
        }
      }
    },
    warmupSeedWorldRendererVariants: warmup,
    engine: {},
    scene: { rootEntities: roots },
    camera: {},
    post: { getShaderWarmupState: () => ({ enabled: true }) },
    environment: { shaderWarmupBackgroundMaterials: [] },
    pageUrl: new URL("http://localhost/"),
    canvas: { dataset: {} }
  };
  return {
    farm,
    animal,
    warmup,
    events,
    run: new Function(...Object.keys(state), code)(...Object.values(state)) as () => Promise<void>
  };
}

describe("startup shader publication boundary", () => {
  it("collects after both published owners finish and LOD state is applied", async () => {
    const f = fixture(),
      task = f.run();
    f.farm.resolve();
    await Promise.resolve();
    expect(f.warmup).not.toHaveBeenCalled();
    f.animal.resolve();
    await task;
    expect(f.events).toEqual(["lod", "compile"]);
    expect(f.warmup).toHaveBeenCalledOnce();
  });
  it("does not compile into a disposed scene after asynchronous preparation", async () => {
    const f = fixture(true, true),
      task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(f.warmup).not.toHaveBeenCalled();
  });
  it("does not demand presentation resources when precompilation is disabled", async () => {
    const f = fixture(false);
    await f.run();
    expect(f.warmup).not.toHaveBeenCalled();
  });
});

describe("animal presentation preparation", () => {
  it("keeps disabled animals unloaded", async () => {
    const load = vi.fn();
    const host = new PlanningAnimalHost({} as any, () => ({ x: 0, z: 0 }), load);
    await host.preparePresentation();
    expect(load).not.toHaveBeenCalled();
  });
  it("joins module and admitted model preparation before startup collection", async () => {
    const model = deferred(),
      prepare = vi.fn(() => model.promise),
      synchronize = vi.fn(),
      update = vi.fn();
    const load = vi.fn(
      async () =>
        ({
          PlanningAnimalRuntime: class {
            synchronize = synchronize;
            update = update;
            preparePresentation = prepare;
          }
        }) as any
    );
    const host = new PlanningAnimalHost({} as any, () => ({ x: 0, z: 0 }), load);
    host.synchronize({} as any, { enabled: true } as any, {} as any);
    let completed = false;
    const task = host.preparePresentation().then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    expect(synchronize).toHaveBeenCalledOnce();
    expect(update.mock.calls.every(([dt]) => dt === 0)).toBe(true);
    model.resolve();
    await task;
    expect(completed).toBe(true);
    expect(load).toHaveBeenCalledOnce();
  });
});
