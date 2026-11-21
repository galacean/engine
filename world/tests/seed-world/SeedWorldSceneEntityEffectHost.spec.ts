import { describe, expect, it, vi } from "vitest";
import { Camera, Component, Entity, Material, MeshRenderer, Shader, SkinnedMeshRenderer, Vector3 } from "@galacean/engine";
import { playAssetEntranceEffect } from "@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect";
import { playHologramRainbowCreateEffect } from "@galacean/engine-world-planning/world/SeedWorldHologramRainbowEffect";
import { SeedWorldSceneEntityEffectHost } from "@galacean/engine-world-planning/world/SeedWorldSceneEntityEffectHost";

function createFakeShaderAndMaterialFixture() {
  const existingFind = Shader.find.bind(Shader);
  const existingCreate = Shader.create.bind(Shader);
  const fakeShaders = new Map<string, any>();
  const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
    return fakeShaders.get(name) ?? existingFind(name);
  });
  const createSpy = vi.spyOn(Shader, "create").mockImplementation((sourceOrName: any) => {
    const name = typeof sourceOrName === "string" && sourceOrName.startsWith("Shader ")
      ? sourceOrName.match(/Shader\s+"([^"]+)"/)?.[1] ?? "mock"
      : String(sourceOrName);
    const shader = { name, destroyed: false, subShaders: [], _subShaders: [], _addReferCount: vi.fn() };
    fakeShaders.set(name, shader);
    return shader as any;
  });
  return {
    restore() {
      findSpy.mockRestore();
      createSpy.mockRestore();
    },
    createdNames() {
      return [...fakeShaders.keys()];
    }
  };
}

describe("SeedWorldSceneEntityEffectHost", () => {
  it("registers both shared hologram shaders and tracks activation lifecycle cleanly", async () => {
    const shaderFixture = createFakeShaderAndMaterialFixture();
    try {
      let activation: any;
      const rootEntities: any[] = [];
      const createdRunners: any[] = [];
      const fakeEngine: any = {
        _macroCollection: {},
        _shaderProgramPools: [],
        resourceManager: {
          _addReferResource: vi.fn(),
          _deleteReferResource: vi.fn()
        }
      };
      const fakeScene: any = {
        engine: fakeEngine,
        rootEntities,
        createRootEntity: vi.fn((name: string) => {
          const components: any[] = [];
          const runner: any = {
            name,
            destroyed: false,
            pendingDestroy: false,
            children: [],
            scene: fakeScene,
            engine: fakeEngine,
            createChild: vi.fn(() => ({
              destroyed: false,
              pendingDestroy: false,
              children: [],
              transform: { worldMatrix: { elements: new Float32Array(16) } },
              addComponent: vi.fn(() => ({ setMaterial: vi.fn(), castShadows: false, receiveShadows: false })),
              destroy: vi.fn()
            })),
            addComponent: vi.fn((Ctor: any) => {
              const inst = new Ctor(runner);
              components.push(inst);
              return inst;
            }),
            destroy: vi.fn(() => {
              runner.destroyed = true;
            })
          };
          createdRunners.push(runner);
          return runner;
        })
      };

      const sourceIds = new WeakMap<object, { scene: string; entityId: string }>();
      const makeEntity = (id: string, opts: { hasMesh?: boolean; isCamera?: boolean; x?: number } = {}) => {
        const elems = new Float32Array(16);
        elems[0] = elems[5] = elems[10] = elems[15] = 1;
        elems[12] = opts.x ?? 0;
        const entity: any = {
          id,
          destroyed: false,
          pendingDestroy: false,
          children: [],
          scene: fakeScene,
          engine: fakeEngine,
          transform: {
            worldMatrix: { elements: elems },
            worldPosition: new Vector3(opts.x ?? 0, 0, 0)
          },
          getComponent: vi.fn((Ctor: any) => (opts.isCamera && Ctor === Camera ? {} : null)),
          getComponents: vi.fn((Ctor: any, out: any[] = []) => {
            if (Ctor === MeshRenderer && opts.hasMesh) {
              out.push({
                destroyed: false,
                mesh: { subMeshes: [{}], bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) } },
                bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) },
                entity,
                materialCount: 1,
                castShadows: true,
                getMaterials: () => [{}],
                setMaterial: vi.fn(),
                setMaterials: vi.fn()
              });
            }
            return out;
          })
        };
        sourceIds.set(entity, { scene: "Scene/SeedWorld.scene", entityId: id });
        return entity;
      };

      const cameraEntity = makeEntity("cam-1", { isCamera: true });
      rootEntities.push(cameraEntity);

      // Stub Material constructor via prototype spy? Instead use a lightweight material factory check on real Material
      const matDestroy = vi.spyOn(Material.prototype, "destroy").mockImplementation(function (this: any) {
        this._destroyed = true;
      });
      // Avoid real WebGL resource init inside Material constructor if engine is mocked
      const host = new SeedWorldSceneEntityEffectHost(
        {
          registerRuntimeActivation: (hooks: any) => {
            activation = hooks;
            return vi.fn();
          }
        } as any,
        {
          projection: {
            requiresRecovery: false,
            sourceIdentity: (obj: object) => sourceIds.get(obj)
          }
        } as any,
        fakeScene
      );

      expect(shaderFixture.createdNames()).toContain("SeedWorld/HologramRainbow");
      expect(shaderFixture.createdNames()).toContain("SeedWorld/HologramRainbowAdditive");
      expect(host.warmupMaterials.length).toBe(2);

      // 1. Add an async GLB entity (no MeshRenderer yet -> should spawn AsyncGlbArrivalWatcher)
      await activation.before();
      const fenceEntity = makeEntity("fence-1", { hasMesh: false, x: 10 });
      rootEntities.push(fenceEntity);
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(createdRunners.some((r) => r.name === "SeedWorldHoloArrivalWatcher")).toBe(true);

      // 2. Add a mesh entity directly -> should spawn SeedWorldHoloCreateRunner immediately
      await activation.before();
      const propEntity = makeEntity("prop-1", { hasMesh: true, x: 5 });
      rootEntities.push(propEntity);
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(createdRunners.some((r) => r.name === "SeedWorldHoloCreateRunner")).toBe(true);

      // 3. Move propEntity -> should spawn SeedWorldHoloUpdateRunner
      await activation.before();
      propEntity.transform.worldMatrix.elements[12] = 12;
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(createdRunners.some((r) => r.name === "SeedWorldHoloUpdateRunner")).toBe(true);

      // 4. Delete propEntity -> should spawn SeedWorldHoloDeleteRunner from ghost snapshot
      await activation.before();
      rootEntities.splice(rootEntities.indexOf(propEntity), 1);
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(createdRunners.some((r) => r.name === "SeedWorldHoloDeleteRunner")).toBe(true);

      host.dispose();
      matDestroy.mockRestore();
    } finally {
      shaderFixture.restore();
    }
  });

  it("filters minified system components via projection.identityOf, excludes FarmingSystem, and cleans up timed-out watchers", async () => {
    const shaderFixture = createFakeShaderAndMaterialFixture();
    const matDestroy = vi.spyOn(Material.prototype, "destroy").mockImplementation(function (this: any) {
      this._destroyed = true;
    });
    try {
      let activation: any;
      const rootEntities: any[] = [];
      const watcherScripts: any[] = [];
      const createdRunners: any[] = [];
      const fakeEngine: any = {
        _macroCollection: {},
        _shaderProgramPools: [],
        resourceManager: { _addReferResource: vi.fn(), _deleteReferResource: vi.fn() }
      };
      const fakeScene: any = {
        engine: fakeEngine,
        rootEntities,
        createRootEntity: vi.fn((name: string) => {
          const components: any[] = [];
          const runner: any = {
            name,
            destroyed: false,
            pendingDestroy: false,
            children: [],
            scene: fakeScene,
            engine: fakeEngine,
            _removeComponent: vi.fn(),
            createChild: vi.fn(() => ({
              destroyed: false,
              pendingDestroy: false,
              children: [],
              transform: { worldMatrix: { elements: new Float32Array(16) } },
              addComponent: vi.fn(() => ({ setMaterial: vi.fn(), castShadows: false, receiveShadows: false })),
              destroy: vi.fn()
            })),
            addComponent: vi.fn((Ctor: any) => {
              const inst = new Ctor(runner);
              components.push(inst);
              if (name === "SeedWorldHoloArrivalWatcher") watcherScripts.push(inst);
              return inst;
            }),
            destroy: vi.fn(() => {
              runner.destroyed = true;
              for (const c of components) c.onDestroy?.();
            })
          };
          createdRunners.push(runner);
          return runner;
        })
      };

      const sourceIds = new WeakMap<object, { scene: string; entityId: string }>();
      const compTypes = new WeakMap<object, { type: string }>();
      // Simulate minified class names ("a", "b") that do not match readable names
      const MinifiedWater = class a {};
      const MinifiedFarm = class b {};

      const makeEntity = (id: string, opts: { comp?: object; projectedType?: string; hasMesh?: boolean } = {}) => {
        const elems = new Float32Array(16);
        elems[0] = elems[5] = elems[10] = elems[15] = 1;
        if (opts.comp && opts.projectedType) compTypes.set(opts.comp, { type: opts.projectedType });
        const entity: any = {
          id,
          destroyed: false,
          pendingDestroy: false,
          children: [],
          scene: fakeScene,
          engine: fakeEngine,
          transform: { worldMatrix: { elements: elems }, worldPosition: new Vector3(0, 0, 0) },
          getComponent: vi.fn(() => null),
          getComponents: vi.fn((Ctor: any, out: any[] = []) => {
            if (Ctor === Component && opts.comp) out.push(opts.comp);
            if (Ctor === MeshRenderer && opts.hasMesh) {
              out.push({
                destroyed: false,
                mesh: { subMeshes: [{}], bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) } },
                bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) },
                entity,
                materialCount: 1,
                castShadows: true,
                getMaterials: () => [{}],
                setMaterial: vi.fn(),
                setMaterials: vi.fn()
              });
            }
            return out;
          })
        };
        sourceIds.set(entity, { scene: "Scene/SeedWorld.scene", entityId: id });
        return entity;
      };

      const host = new SeedWorldSceneEntityEffectHost(
        {
          registerRuntimeActivation: (hooks: any) => {
            activation = hooks;
            return vi.fn();
          }
        } as any,
        {
          projection: {
            requiresRecovery: false,
            sourceIdentity: (obj: object) => sourceIds.get(obj),
            identityOf: (comp: object) => compTypes.get(comp)
          }
        } as any,
        fakeScene
      );

      // Adding minified WaterBodyComponent & FarmingSystem entities must NOT spawn watchers or create runners.
      await activation.before();
      rootEntities.push(
        makeEntity("water-1", { comp: new MinifiedWater(), projectedType: "WaterBodyComponent", hasMesh: true }),
        makeEntity("farm-1", { comp: new MinifiedFarm(), projectedType: "FarmingSystem", hasMesh: true })
      );
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(createdRunners.length).toBe(0);

      // Adding an empty user entity spawns a watcher, and 8s timeout cleans it from host.watchers.
      await activation.before();
      rootEntities.push(makeEntity("empty-group-1", { hasMesh: false }));
      await activation.apply();
      activation.finish();
      await activation.after();
      expect(watcherScripts.length).toBe(1);
      expect((host as any).watchers.size).toBe(1);
      watcherScripts[0].onUpdate(8.5);
      expect((host as any).watchers.size).toBe(0);

      host.dispose();
    } finally {
      matDestroy.mockRestore();
      shaderFixture.restore();
    }
  });

  it("preserves concurrent material edits, prevents re-entrant destroyed-material binding, skips SkinnedMeshRenderer, and settles AssetEntrance on host destroy", async () => {
    // 1. AssetEntrancePlaybackDriver settles cleanly when playbackRoot is destroyed externally.
    const fakeRoot: any = {
      destroyed: false,
      pendingDestroy: false,
      children: [],
      components: [] as any[],
      getComponentsIncludeChildren: vi.fn((_Ctor: any, out: any[]) => out),
      addComponent: vi.fn((Ctor: any) => {
        const inst = new Ctor(fakeRoot);
        fakeRoot.components.push(inst);
        return inst;
      }),
      destroy() {
        this.destroyed = true;
        for (const c of this.components) {
          c.onDestroy?.();
          c._destroyed = true;
        }
      }
    };
    const onComplete = vi.fn();
    let settledError: unknown;
    const pEntrance = playAssetEntranceEffect([fakeRoot], { durationMs: 1000, onComplete }).catch((e) => {
      settledError = e;
    });
    fakeRoot.destroy();
    await pEntrance;
    expect(settledError).toBeDefined();
    expect(onComplete).not.toHaveBeenCalled();

    // 2. Hologram create effect skips SkinnedMeshRenderer and prevents re-entrancy / material clobbering.
    const shaderFixture = createFakeShaderAndMaterialFixture();
    const matDestroy = vi.spyOn(Material.prototype, "destroy").mockImplementation(function (this: any) {
      this._destroyed = true;
    });
    try {
      const matA = { name: "OriginalMatA", destroyed: false } as any;
      let currentMats: any[] = [matA];
      const scripts: any[] = [];
      const fakeEngine: any = {
        _macroCollection: {},
        _shaderProgramPools: [],
        resourceManager: { _addReferResource: vi.fn(), _deleteReferResource: vi.fn() }
      };
      const makeNode = (): any => ({
        destroyed: false,
        pendingDestroy: false,
        children: [],
        transform: { worldMatrix: { elements: new Float32Array(16) } },
        createChild: vi.fn(() => makeNode()),
        addComponent: vi.fn(() => ({ setMaterial: vi.fn(), castShadows: false, receiveShadows: false })),
        destroy: vi.fn()
      });
      const fakeScene: any = {
        engine: fakeEngine,
        createRootEntity: vi.fn(() => {
          const runner: any = {
            destroyed: false,
            pendingDestroy: false,
            children: [],
            _removeComponent: vi.fn(),
            createChild: vi.fn(() => makeNode()),
            addComponent: vi.fn((Ctor: any) => {
              const s = new Ctor(runner);
              scripts.push(s);
              return s;
            }),
            destroy: vi.fn(() => {
              runner.destroyed = true;
              for (const s of scripts) s.onDestroy?.();
            })
          };
          return runner;
        })
      };

      // SkinnedMeshRenderer must be skipped so rigged GLB meshes keep skinning intact.
      const fakeSkinned: any = Object.create(SkinnedMeshRenderer.prototype);
      Object.defineProperties(fakeSkinned, {
        destroyed: { value: false, configurable: true },
        mesh: { value: { subMeshes: [{}], bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) } }, configurable: true },
        bounds: { value: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) }, configurable: true },
        materialCount: { value: 1, configurable: true },
        castShadows: { value: true, writable: true, configurable: true },
        getMaterials: { value: () => currentMats, configurable: true },
        setMaterial: { value: (_s: number, m: any) => { currentMats = [m]; }, configurable: true },
        setMaterials: { value: (ms: any[]) => { currentMats = [...ms]; }, configurable: true }
      });
      const skinnedEntity: any = {
        destroyed: false,
        pendingDestroy: false,
        scene: fakeScene,
        engine: fakeEngine,
        children: [],
        transform: { worldMatrix: { elements: new Float32Array(16) }, worldPosition: new Vector3(0, 0, 0) },
        getComponents: (Ctor: any, out: any[] = []) => {
          if (Ctor === MeshRenderer) out.push(fakeSkinned);
          return out;
        }
      };
      Object.defineProperty(fakeSkinned, "entity", { value: skinnedEntity, configurable: true });
      await playHologramRainbowCreateEffect([skinnedEntity], { durationMs: 1000 });
      expect(currentMats[0]).toBe(matA);
      expect(scripts.length).toBe(0);

      // Re-entrant playHologramRainbowCreateEffect on static MeshRenderer must settle first effect cleanly and restore matA.
      const fakeStaticRenderer: any = {
        destroyed: false,
        mesh: { subMeshes: [{}], bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) } },
        bounds: { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) },
        materialCount: 1,
        castShadows: true,
        getMaterials: () => currentMats,
        setMaterial: (_s: number, m: any) => { currentMats = [m]; },
        setMaterials: (ms: any[]) => { currentMats = [...ms]; }
      };
      const staticEntity: any = {
        destroyed: false,
        pendingDestroy: false,
        scene: fakeScene,
        engine: fakeEngine,
        children: [],
        transform: { worldMatrix: { elements: new Float32Array(16) }, worldPosition: new Vector3(0, 0, 0) },
        getComponents: (Ctor: any, out: any[] = []) => {
          if (Ctor === MeshRenderer) out.push(fakeStaticRenderer);
          return out;
        }
      };
      fakeStaticRenderer.entity = staticEntity;

      const p1 = playHologramRainbowCreateEffect([staticEntity], { durationMs: 1000 });
      const holo1 = currentMats[0];
      expect(holo1).not.toBe(matA);
      // Launching a 2nd effect settles the 1st synchronously, destroys holo1, and captures real matA as backup!
      const p2 = playHologramRainbowCreateEffect([staticEntity], { durationMs: 1000 });
      await p1;
      expect(holo1._destroyed).toBe(true);
      const holo2 = currentMats[0];
      expect(holo2).not.toBe(holo1);
      expect(holo2).not.toBe(matA);
      // Finishing the 2nd effect restores real matA (NOT destroyed holo1!).
      scripts[1].onUpdate(1.2);
      await p2;
      expect(currentMats[0]).toBe(matA);
    } finally {
      matDestroy.mockRestore();
      shaderFixture.restore();
    }
  });
});
