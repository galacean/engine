import {
  AssetType,
  BackgroundMode,
  Component,
  Loader,
  PrefabResource,
  Scene,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

class DeserializationComponent extends Component {
  readonly position = new Vector3();
  readonly offset = new Vector3();

  getPosition(): Vector3 {
    return this.position;
  }

  getCallback(): () => number {
    return () => 0;
  }
}

describe("Scene and prefab deserialization", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    Loader.registerClass("DeserializationComponent", DeserializationComponent);
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine?.destroy();
  });

  function hierarchy(entity: object): object {
    return {
      entities: [{ id: "root", components: [], ...entity }],
      scene: {
        background: { mode: BackgroundMode.SolidColor, color: { r: 0, g: 0, b: 0, a: 1 } }
      }
    };
  }

  function assetUrl(data: object): string {
    return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  }

  async function load<T>(type: AssetType, entity: object): Promise<T> {
    const url = assetUrl(hierarchy(entity));
    try {
      return await engine.resourceManager.load<T>({ type, url });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function component(config: object): object {
    return { components: [{ id: "component", class: "DeserializationComponent", ...config }] };
  }

  it("loads inherited setters, nested methods and method results", async () => {
    const scene = await load<Scene>(
      AssetType.Scene,
      component({
        props: { enabled: false, offset: { methods: { set: [[4, 5, 6]] } } },
        methods: { getPosition: [{ params: [], result: { methods: { set: [[1, 2, 3]] } } }] }
      })
    );

    const instance = scene.rootEntities[0].getComponent(DeserializationComponent);
    expect(instance.enabled).toBe(false);
    expect(instance.position.toJSON()).toEqual({ x: 1, y: 2, z: 3 });
    expect(instance.offset.toJSON()).toEqual({ x: 4, y: 5, z: 6 });
  });

  it.each(["constructor", "prototype", "__proto__"])("rejects the reserved property %s", async (key) => {
    await expect(load(AssetType.Scene, component({ props: { [key]: 0 } }))).rejects.toThrow(
      "Reserved serialized property"
    );
  });

  it("rejects calls to object built-ins", async () => {
    await expect(load(AssetType.Scene, component({ methods: { hasOwnProperty: [["position"]] } }))).rejects.toThrow(
      "Reserved serialized method"
    );
  });

  it("rejects configuring a function returned by a component method", async () => {
    await expect(
      load(
        AssetType.Scene,
        component({ methods: { getCallback: [{ params: [], result: { props: { label: "x" } } }] } })
      )
    ).rejects.toThrow("Serialized properties and methods require an object instance");
  });

  it("requires a registered class for nested objects", async () => {
    await expect(load(AssetType.Scene, component({ props: { offset: { class: "toString" } } }))).rejects.toThrow(
      "Serialized class is not registered"
    );
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

  it("validates sub-asset path members before cold loads and cache reads", async () => {
    const manager = engine.resourceManager;
    const url = assetUrl(hierarchy({}));
    const item = { type: AssetType.Prefab, url: url + "?q=%70rototype" };
    try {
      await expect(manager.load(item)).rejects.toThrow("Reserved sub-asset path member");
      await manager.load({ type: AssetType.Prefab, url });
      expect(await manager.load({ type: AssetType.Prefab, url: url + "?q=url" })).toBe(url);
      await expect(manager.load(item)).rejects.toThrow("Reserved sub-asset path member");
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});
