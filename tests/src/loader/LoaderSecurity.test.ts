import { AssetType, Loader, Material, PrefabResource, Script, WebGLEngine, request } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";

function blobUrl(data: string, type = "application/json"): string {
  return URL.createObjectURL(new Blob([data], { type }));
}

describe("v2 resource deserialization & prototype security", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
  });

  afterAll(() => {
    engine?.destroy();
  });

  it("rejects reserved shaderData keys in MaterialLoader without leaking or polluting", async () => {
    const beforeCount = engine.resourceManager.findResourcesByType(Material).length;
    const badMaterial = {
      name: "evil-material",
      shader: "Unlit",
      shaderData: {
        ["__proto__"]: { pollutedByMaterial: true },
        constructor: { pollutedByCtor: true }
      },
      macros: []
    };
    const url = blobUrl(JSON.stringify(badMaterial));
    try {
      await expect(engine.resourceManager.load({ type: AssetType.Material, url })).rejects.toThrow();
      expect(({} as any).pollutedByMaterial).toBeUndefined();
      expect(({} as any).pollutedByCtor).toBeUndefined();
      expect(engine.resourceManager.findResourcesByType(Material)).toHaveLength(beforeCount);
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  it("ignores Object.prototype keys in MaterialLoader shaderData and loads valid material", async () => {
    (Object.prototype as any).u_PollutedShaderUniform = 12345;
    const url = blobUrl(
      JSON.stringify({
        name: "valid-unlit-material",
        shader: "Unlit",
        shaderData: {
          material_BaseColor: { type: "Color", value: { r: 0.2, g: 0.4, b: 0.6, a: 1 } }
        },
        macros: []
      })
    );
    let material: Material | undefined;
    try {
      material = await engine.resourceManager.load<Material>({ type: AssetType.Material, url });
      expect(material).toBeInstanceOf(Material);
      expect(material.shaderData.getFloat("u_PollutedShaderUniform")).toBeUndefined();
    } finally {
      delete (Object.prototype as any).u_PollutedShaderUniform;
      material?.destroy(true);
      URL.revokeObjectURL(url);
    }
  });

  it("blocks constructor/prototype/host traversal in v2 Prefab ReflectionParser", async () => {
    let executed = false;
    (globalThis as any).__galaceanV2RceTest = () => {
      executed = true;
    };

    const badPropPrefab = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          props: {
            ["constructor"]: { value: 1 }
          }
        }
      ],
      root: 0
    } as any;

    const badCallPrefab = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          calls: [
            {
              method: "constructor",
              args: ["globalThis.__galaceanV2RceTest()"]
            }
          ]
        }
      ],
      root: 0
    } as any;

    const hostEscapePrefab = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          props: {
            _engine: { canvas: { _webCanvas: null } }
          }
        }
      ],
      root: 0
    } as any;

    const multiHopCallEscape = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          calls: [
            {
              target: ["_engine", "_canvas", "_webCanvas", "ownerDocument", "location"],
              method: "assign",
              args: ["javascript:globalThis.__galaceanV2RceTest()"]
            }
          ]
        }
      ],
      root: 0
    } as any;

    const multiHopPoolEscape = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          calls: [
            {
              target: ["_engine", "resourceManager", "_assetUrlPool"],
              method: "hasOwnProperty",
              args: ["x"]
            }
          ]
        }
      ],
      root: 0
    } as any;

    const protoMethodCall = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          calls: [
            {
              method: "__defineGetter__",
              args: ["evil", "x"]
            }
          ]
        }
      ],
      root: 0
    } as any;

    class UnsafeResultScript extends Script {
      getFn() {
        return Function;
      }
      getEntity() {
        return this.entity;
      }
    }
    Loader.registerClass("UnsafeResultScript_Test", UnsafeResultScript);

    const unsafeFnCallResult = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "UnsafeResultScript_Test",
          calls: [
            {
              method: "getFn",
              args: [],
              result: { props: { pollutedFn: 1 } }
            }
          ]
        }
      ],
      root: 0
    } as any;

    const unsafeEntityCallResult = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "UnsafeResultScript_Test",
          calls: [
            {
              method: "getEntity",
              args: [],
              result: { props: { name: "pwned" } }
            }
          ]
        }
      ],
      root: 0
    } as any;

    const badComponentRefPrefab = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [
        {
          type: "MeshRenderer",
          props: {
            target: { $component: { entity: [0], type: "Engine", index: 0 } }
          }
        }
      ],
      root: 0
    } as any;

    try {
      await expect(PrefabParser.parse(engine, "bad-prop.prefab", badPropPrefab)).rejects.toThrow();
      await expect(PrefabParser.parse(engine, "bad-call.prefab", badCallPrefab)).rejects.toThrow();
      await expect(PrefabParser.parse(engine, "host-escape.prefab", hostEscapePrefab)).rejects.toThrow();
      await expect(PrefabParser.parse(engine, "multihop-location.prefab", multiHopCallEscape)).rejects.toThrow(
        "not a safe object instance"
      );
      await expect(PrefabParser.parse(engine, "multihop-pool.prefab", multiHopPoolEscape)).rejects.toThrow();
      await expect(PrefabParser.parse(engine, "proto-method.prefab", protoMethodCall)).rejects.toThrow(
        "Reserved serialized method"
      );
      await expect(PrefabParser.parse(engine, "unsafe-fn-result.prefab", unsafeFnCallResult)).rejects.toThrow(
        "unsafe value"
      );
      await expect(PrefabParser.parse(engine, "unsafe-entity-result.prefab", unsafeEntityCallResult)).rejects.toThrow(
        "unsafe value"
      );
      await expect(PrefabParser.parse(engine, "bad-comp-ref.prefab", badComponentRefPrefab)).rejects.toThrow(
        "not assignable to Component"
      );

      for (const badIndex of ["__proto__", "constructor", -1, 1.5]) {
        const badCompIndexPrefab = {
          version: "2.0",
          refs: [],
          entities: [{ name: "root", components: [0] }],
          components: [
            {
              type: "MeshRenderer",
              props: {
                target: { $component: { entity: [0], type: "MeshRenderer", index: badIndex } }
              }
            }
          ],
          root: 0
        } as any;
        await expect(PrefabParser.parse(engine, "bad-comp-index.prefab", badCompIndexPrefab)).rejects.toThrow(
          "non-negative integer"
        );
      }

      for (const badEntityPath of [["__proto__"], [0, "constructor"], [-1]]) {
        const badEntityRefPrefab = {
          version: "2.0",
          refs: [],
          entities: [{ name: "root", components: [0] }],
          components: [
            {
              type: "MeshRenderer",
              props: {
                target: { $entity: badEntityPath }
              }
            }
          ],
          root: 0
        } as any;
        await expect(PrefabParser.parse(engine, "bad-entity-index.prefab", badEntityRefPrefab)).rejects.toThrow(
          "non-negative integer"
        );
      }

      expect(executed).toBe(false);
    } finally {
      delete (globalThis as any).__galaceanV2RceTest;
    }
  });

  it("blocks non-Component and non-StateMachineScript class instantiation in v2 hierarchy and animator loaders", async () => {
    expect(Loader.getClass("request")).toBe(request);

    const badRequestComponent = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "request" }],
      root: 0
    } as any;

    const badEngineComponent = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "Engine" }],
      root: 0
    } as any;

    const badColliderComponent = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "BoxColliderShape" }],
      root: 0
    } as any;

    await expect(PrefabParser.parse(engine, "req-comp.prefab", badRequestComponent)).rejects.toThrow(
      "not assignable to Component"
    );
    await expect(PrefabParser.parse(engine, "eng-comp.prefab", badEngineComponent)).rejects.toThrow(
      "not assignable to Component"
    );
    await expect(PrefabParser.parse(engine, "shape-comp.prefab", badColliderComponent)).rejects.toThrow(
      "not assignable to Component"
    );

    const badAnimCtrlUrl = blobUrl(
      JSON.stringify({
        layers: [
          {
            name: "Base",
            blendingMode: 0,
            weight: 1,
            stateMachine: {
              states: [
                {
                  id: "s1",
                  name: "idle",
                  speed: 1,
                  wrapMode: 1,
                  clipStartNormalizedTime: 0,
                  clipEndNormalizedTime: 1,
                  scripts: ["request"]
                }
              ],
              transitions: [],
              entryTransitions: [],
              anyTransitions: []
            }
          }
        ],
        parameters: []
      })
    );
    try {
      await expect(
        engine.resourceManager.load({ type: AssetType.AnimatorController, url: badAnimCtrlUrl })
      ).rejects.toThrow("not assignable to StateMachineScript");
    } finally {
      URL.revokeObjectURL(badAnimCtrlUrl);
    }
  });

  it("blocks reserved and disallowed ResourceManager sub-asset ?q= traversal", async () => {
    const prefabData = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    };
    const url = blobUrl(JSON.stringify(prefabData));
    try {
      await expect(
        engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=constructor" })
      ).rejects.toThrow();
      await expect(
        engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=%70rototype" })
      ).rejects.toThrow();
      await engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url });
      expect(await engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=url" })).toBe(url);
      for (const suffix of ["engine", "_root.engine", "destroy"]) {
        await expect(
          engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=" + suffix })
        ).rejects.toThrow();
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});
