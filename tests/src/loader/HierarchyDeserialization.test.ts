import {
  AssetType,
  BackgroundMode,
  BloomEffect,
  PostProcess,
  PrefabResource,
  PrimitiveMesh,
  Scene,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Scene and prefab deserialization", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine?.destroy();
  });

  function hierarchy(entity: object, sceneOverrides?: object): object {
    return {
      entities: [{ id: "root", components: [], ...entity }],
      scene: {
        background: { mode: BackgroundMode.SolidColor, color: { r: 0, g: 0, b: 0, a: 1 } },
        ...sceneOverrides
      }
    };
  }

  function assetUrl(data: object): string {
    return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  }

  async function load<T>(type: AssetType, entity: object, sceneOverrides?: object): Promise<T> {
    const url = assetUrl(hierarchy(entity, sceneOverrides));
    try {
      return await engine.resourceManager.load<T>({ type, url });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function component(className: string, config: object = {}): object {
    return { components: [{ id: "component", class: className, ...config }] };
  }

  it("loads inherited setters, nested methods, and method results", async () => {
    const scene = await load<Scene>(AssetType.Scene, {
      transform: {
        class: "Transform",
        props: { position: { methods: { set: [[4, 5, 6]] } } }
      },
      components: [
        {
          id: "postProcess",
          class: "PostProcess",
          props: { enabled: false },
          methods: {
            addEffect: [
              {
                params: [{ classType: "BloomEffect" }],
                result: { props: { enabled: true, intensity: { value: 2.5 } } }
              }
            ]
          }
        }
      ]
    });

    try {
      const root = scene.rootEntities[0];
      expect(root.transform.position.toJSON()).toEqual({ x: 4, y: 5, z: 6 });

      const postProcess = root.getComponent(PostProcess);
      expect(postProcess.enabled).toBe(false);
      const bloom = postProcess.getEffect(BloomEffect);
      expect(bloom).not.toBeNull();
      expect(bloom.intensity.value).toBe(2.5);
    } finally {
      scene.destroy();
    }
  });

  it("blocks the constructor -> Function -> call RCE chain", async () => {
    let executed = false;
    (globalThis as any).__galaceanRceTest = () => {
      executed = true;
    };

    try {
      await expect(
        load(
          AssetType.Scene,
          component("Component", {
            props: {
              constructor: {
                methods: {
                  constructor: [
                    {
                      params: ["globalThis.__galaceanRceTest()"],
                      result: { methods: { call: [[]] } }
                    }
                  ]
                }
              }
            }
          })
        )
      ).rejects.toThrow("Reserved serialized property");
      expect(executed).toBe(false);
    } finally {
      delete (globalThis as any).__galaceanRceTest;
    }
  });

  it("blocks traversing engine host objects to window.eval via private or public properties", async () => {
    let executed = false;
    (globalThis as any).__galaceanDomEscapeTest = () => {
      executed = true;
    };

    const domChain = {
      canvas: {
        _webCanvas: {
          ownerDocument: {
            defaultView: {
              methods: { eval: [["globalThis.__galaceanDomEscapeTest()"]] }
            }
          }
        }
      }
    };

    try {
      await expect(
        load(AssetType.Scene, { transform: { class: "Transform", props: { _engine: domChain } } })
      ).rejects.toThrow("Protected serialized property");
      await expect(
        load(AssetType.Scene, { transform: { class: "Transform", props: { engine: domChain } } })
      ).rejects.toThrow("Protected serialized property");
      expect(executed).toBe(false);
    } finally {
      delete (globalThis as any).__galaceanDomEscapeTest;
    }
  });

  it.each(["constructor", "prototype", "__proto__"])("rejects the reserved property %s", async (key) => {
    await expect(load(AssetType.Scene, component("PostProcess", { props: { [key]: 0 } }))).rejects.toThrow(
      "Reserved serialized property"
    );
  });

  it("rejects overwriting protected runtime properties and methods", async () => {
    await expect(load(AssetType.Scene, component("PostProcess", { props: { _engine: 0 } }))).rejects.toThrow(
      "Protected serialized property"
    );
    await expect(load(AssetType.Scene, component("PostProcess", { props: { destroy: 0 } }))).rejects.toThrow(
      "Protected serialized property"
    );
  });

  it.each(["hasOwnProperty", "destroy", "eval"])("rejects disallowed method %s", async (methodName) => {
    await expect(load(AssetType.Scene, component("PostProcess", { methods: { [methodName]: [[]] } }))).rejects.toThrow(
      "Serialized method is not allowed"
    );
  });

  it("rejects unregistered, non-component, and disallowed classes", async () => {
    await expect(
      load(AssetType.Scene, component("PostProcess", { props: { layer: { class: "toString" } } }))
    ).rejects.toThrow("Serialized class is not registered");

    await expect(load(AssetType.Scene, component("BoxColliderShape"))).rejects.toThrow("not assignable to Component");

    await expect(load(AssetType.Scene, { transform: { class: "PostProcess" } })).rejects.toThrow(
      "not assignable to Transform"
    );

    await expect(
      load(
        AssetType.Scene,
        component("PostProcess", {
          props: { layer: { class: "request", constructParams: ["http://127.0.0.1:1/blocked"] } }
        })
      )
    ).rejects.toThrow("Serialized class is not allowed");
  });

  it("discards a prefab rejected during nested transform parsing", async () => {
    const resourceManager = engine.resourceManager;
    const prefabs = resourceManager.findResourcesByType(PrefabResource);
    await expect(
      load(AssetType.Prefab, { transform: { class: "Transform", props: { position: { prototype: 0 } } } })
    ).rejects.toThrow("Reserved serialized property");
    expect(resourceManager.findResourcesByType(PrefabResource)).toEqual(prefabs);
  });

  it("releases a detached prefab instance when project scene parsing fails", async () => {
    const manager = engine.resourceManager;
    const prefabUrl = assetUrl(hierarchy({}));
    const sceneUrl = assetUrl(
      hierarchy({ assetRefId: "source", transform: { class: "Transform", props: { prototype: 0 } } })
    );
    const projectUrl = assetUrl({
      scene: "cleanup.scene",
      files: [
        { id: "source", type: AssetType.Prefab, virtualPath: "source.prefab", path: prefabUrl },
        { id: "scene", type: AssetType.Scene, virtualPath: "cleanup.scene", path: sceneUrl }
      ]
    });

    try {
      const source = await manager.load<PrefabResource>({ type: AssetType.Prefab, url: prefabUrl });
      await expect(manager.load({ type: AssetType.Project, url: projectUrl })).rejects.toThrow(
        "Reserved serialized property"
      );
      expect(source.refCount).toBe(0);
    } finally {
      URL.revokeObjectURL(projectUrl);
      URL.revokeObjectURL(sceneUrl);
      URL.revokeObjectURL(prefabUrl);
    }
  });

  it("does not leak sky mesh refCount when another scene asset rejects first", async () => {
    const manager = engine.resourceManager as any;
    const skyMesh = PrimitiveMesh.createCuboid(engine);
    let resolveMesh!: (value: any) => void;
    const pendingMeshPromise = new Promise((resolve) => {
      resolveMesh = resolve;
    });
    const originalGetResourceByRef = manager.getResourceByRef.bind(manager);

    manager.getResourceByRef = (ref: { refId: string }) => {
      if (ref.refId === "sky-mesh-pending") {
        return pendingMeshPromise;
      }
      if (ref.refId === "sky-mat-fail") {
        return Promise.reject(new Error("sky material failed"));
      }
      return originalGetResourceByRef(ref);
    };

    try {
      const loadPromise = load<Scene>(
        AssetType.Scene,
        {},
        {
          background: {
            mode: BackgroundMode.Sky,
            skyMesh: { refId: "sky-mesh-pending" },
            skyMaterial: { refId: "sky-mat-fail" }
          }
        }
      );

      await expect(loadPromise).rejects.toThrow("sky material failed");
      resolveMesh(skyMesh);
      await pendingMeshPromise;
      await Promise.resolve();
      expect(skyMesh.refCount).toBe(0);
    } finally {
      manager.getResourceByRef = originalGetResourceByRef;
      skyMesh.destroy(true);
    }
  });

  it("validates sub-asset path members and targets before cold loads and cache reads", async () => {
    const manager = engine.resourceManager;
    const url = assetUrl(hierarchy({}));
    const reservedItems = [
      { type: AssetType.Prefab, url: url + "?q=%70rototype" },
      { type: AssetType.Prefab, url: url + "?q=constructor" }
    ];
    try {
      for (const item of reservedItems) {
        await expect(manager.load(item)).rejects.toThrow("Reserved sub-asset path member");
      }
      await manager.load({ type: AssetType.Prefab, url });
      expect(await manager.load({ type: AssetType.Prefab, url: url + "?q=url" })).toBe(url);
      for (const item of reservedItems) {
        await expect(manager.load(item)).rejects.toThrow("Reserved sub-asset path member");
      }
      for (const suffix of ["engine", "_root.engine", "destroy"]) {
        await expect(manager.load({ type: AssetType.Prefab, url: url + "?q=" + suffix })).rejects.toThrow(
          "Disallowed sub-asset path target"
        );
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  it("rejects reserved properties during MaterialLoader renderState parsing", async () => {
    const materialUrl = assetUrl({
      name: "evil-material",
      shader: "unlit",
      shaderData: {},
      macros: [],
      renderState: {
        ["__proto__"]: { pollutedByMaterial: true }
      }
    });
    try {
      await expect(engine.resourceManager.load({ type: AssetType.Material, url: materialUrl })).rejects.toThrow(
        "Reserved material property"
      );
      expect(({} as any).pollutedByMaterial).toBeUndefined();
    } finally {
      URL.revokeObjectURL(materialUrl);
    }
  });
});
