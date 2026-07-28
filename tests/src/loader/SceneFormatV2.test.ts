import "@galacean/engine-loader";
import {
  BackgroundTextureFillMode,
  BackgroundMode,
  Camera,
  BloomEffect,
  DiffuseMode,
  Entity,
  FogMode,
  Loader,
  ParticleCurve,
  ParticleCurveMode,
  ParticleRenderer,
  PostProcess,
  Scene,
  Script,
  ShadowCascadesMode,
  ShadowResolution,
  Transform
} from "@galacean/engine-core";
import { SpecularMode, type SceneFile } from "../../../packages/loader/src/schema/SceneSchema";
import { applySceneData } from "../../../packages/loader/src/SceneLoader";
import {
  ParserContext,
  ParserType
} from "../../../packages/loader/src/resource-deserialize/resources/parser/ParserContext";
import { ReflectionParser } from "../../../packages/loader/src/resource-deserialize/resources/parser/ReflectionParser";
import { SceneParser } from "../../../packages/loader/src/resource-deserialize/resources/scene/SceneParser";
import { GLTFResource } from "../../../packages/loader/src/gltf/GLTFResource";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

Loader.registerClass("Transform", Transform);
Loader.registerClass("Camera", Camera);
Loader.registerClass("PostProcess", PostProcess);
Loader.registerClass("BloomEffect", BloomEffect);

class TestValueType {
  x = 0;
  y = 0;
}
Loader.registerClass("TestValueType", TestValueType);

class ConstructorValueType {
  label = "";

  constructor(
    readonly seed: unknown,
    readonly child: TestValueType
  ) {}
}
Loader.registerClass("ConstructorValueType", ConstructorValueType);

class CallOrderComponent extends Script {
  value = "";
  receivedArgs: any[] = [];
  lastResult: any = null;
  nested = {
    value: "",
    setValue(value: string) {
      this.value = value;
    }
  };

  appendSuffix(suffix: string): void {
    this.value += suffix;
  }

  captureResolvedArgs(...args: any[]): void {
    this.receivedArgs = args;
  }

  captureCurrentValue(): void {
    this.receivedArgs = [this.value];
  }

  setBaseDelayed(base: string): Promise<void> {
    return Promise.resolve().then(() => {
      this.value = base;
    });
  }

  createResult(seed: number) {
    const result = {
      x: seed,
      y: 0,
      setY(next: number) {
        this.y = next;
      }
    };
    this.lastResult = result;
    return result;
  }
}
Loader.registerClass("CallOrderComponent", CallOrderComponent);

let engine: WebGLEngine;

describe("SceneFile v2 schema enums", () => {
  it("uses numeric enum values for ambient specularMode", () => {
    expect(SpecularMode.Sky).to.equal(0);
    expect(SpecularMode.Custom).to.equal(1);
  });
});

beforeAll(async function () {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 100;
  canvasDOM.height = 100;
  engine = await WebGLEngine.create({ canvas: canvasDOM });
});

afterAll(() => {
  engine?.destroy();
});

// ---------------------------------------------------------------------------
// ReflectionParser — $ prefix props resolution
// ---------------------------------------------------------------------------

describe("ReflectionParser v2 props resolution", () => {
  it("should resolve primitive values directly", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      name: "test",
      value: 42,
      flag: true
    });
    expect(target.name).to.equal("test");
    expect(target.value).to.equal(42);
    expect(target.flag).to.equal(true);
  });

  it("should resolve nested plain objects recursively", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      nested: { a: 1, b: { c: 2 } }
    });
    expect(target.nested).to.deep.equal({ a: 1, b: { c: 2 } });
  });

  it("should modify existing object properties in place", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const original = { x: 0, y: 0, z: 0 };
    const target: any = { position: original };
    await parser.parseProps(target, {
      position: { x: 1, y: 2, z: 3 }
    });
    // Should modify in place, not replace
    expect(target.position).to.equal(original);
    expect(target.position.x).to.equal(1);
    expect(target.position.y).to.equal(2);
    expect(target.position.z).to.equal(3);
  });

  it("should resolve arrays recursively", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      items: [1, "two", { key: 3 }]
    });
    expect(target.items).to.deep.equal([1, "two", { key: 3 }]);
  });

  it("should resolve $entity by flat index", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity0 = new Entity(engine, "entity0");
    const entity1 = new Entity(engine, "entity1");
    context.entityInstances[0] = entity0;
    context.entityInstances[1] = entity1;

    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      target: { $entity: [1] }
    });
    expect(target.target).to.equal(entity1);
  });

  it("should resolve missing $entity to null", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      target: { $entity: [999] }
    });
    expect(target.target).to.be.null;
  });

  it("should resolve $entity deep child by path", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const root = new Entity(engine, "root");
    const child = new Entity(engine, "child");
    const grandchild = new Entity(engine, "grandchild");
    root.addChild(child);
    child.addChild(grandchild);
    context.entityInstances[0] = root;

    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      a: { $entity: [0] },
      b: { $entity: [0, 0] },
      c: { $entity: [0, 0, 0] }
    });
    expect(target.a).to.equal(root);
    expect(target.b).to.equal(child);
    expect(target.c).to.equal(grandchild);
  });

  it("should resolve $entity with out-of-range path element to null", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const root = new Entity(engine, "root");
    context.entityInstances[0] = root;

    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      target: { $entity: [0, 5] }
    });
    expect(target.target).to.be.null;
  });

  it("should throw a clear error when $ref index is out of range", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};

    await expect(
      parser.parseProps(target, {
        asset: { $ref: 0 }
      })
    ).rejects.toThrow("ReflectionParser: invalid ref index 0 for $ref");
  });

  it("should resolve $component by entity index + type + index", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity = new Entity(engine, "test");
    context.entityInstances[0] = entity;

    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      comp: { $component: { entity: [0], type: "Transform", index: 0 } }
    });
    expect(target.comp).to.equal(entity.transform);
  });
});

// ---------------------------------------------------------------------------
// ReflectionParser — calls execution
// ---------------------------------------------------------------------------

describe("ReflectionParser calls resolution", () => {
  it("should resolve $class call args as constructors for factory-style methods", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const entity = new Entity(engine, "post-process");
    const postProcess = entity.addComponent(PostProcess);

    await parser.parseCalls(postProcess, [
      {
        method: "addEffect",
        args: [{ $class: "BloomEffect" }],
        result: {
          props: {
            threshold: { value: 0.9 },
            scatter: { value: 0.6 },
            intensity: { value: 1.5 }
          }
        }
      }
    ]);

    const effect = postProcess.getEffect(BloomEffect);
    expect(effect).to.be.instanceOf(BloomEffect);
    expect(effect.threshold.value).to.equal(0.9);
    expect(effect.scatter.value).to.equal(0.6);
    expect(effect.intensity.value).to.equal(1.5);
  });

  it("should resolve special call args through v2 value rules", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity = new Entity(engine, "target");
    context.entityInstances[1] = entity;

    const asset = { name: "call-asset" };
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockResolvedValue(asset as any);
    const refs = [{ url: "call-asset" }];
    const parser = new ReflectionParser(context, refs);
    const target = new CallOrderComponent(new Entity(engine, "host"));

    try {
      await parser.parseCalls(target, [
        {
          method: "captureResolvedArgs",
          args: [
            { $ref: 0 },
            { $type: "TestValueType", x: 3, y: 4 },
            { $entity: [1] },
            { $component: { entity: [1], type: "Transform", index: 0 } }
          ]
        }
      ]);
    } finally {
      getResourceByRef.mockRestore();
    }

    expect(target.receivedArgs[0]).to.equal(asset);
    expect(target.receivedArgs[1]).to.be.instanceOf(TestValueType);
    expect(target.receivedArgs[1].x).to.equal(3);
    expect(target.receivedArgs[1].y).to.equal(4);
    expect(target.receivedArgs[2]).to.equal(entity);
    expect(target.receivedArgs[3]).to.equal(entity.transform);
  });

  it("should apply result props and nested calls", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target = new CallOrderComponent(new Entity(engine, "host"));

    await parser.parseCalls(target, [
      {
        method: "createResult",
        args: [0],
        result: {
          props: { x: 1 },
          calls: [{ method: "setY", args: [2] }]
        }
      }
    ]);

    expect(target.lastResult.x).to.equal(1);
    expect(target.lastResult.y).to.equal(2);
  });

  it("should invoke methods on a nested target path", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target = new CallOrderComponent(new Entity(engine, "host"));

    await parser.parseCalls(target, [{ target: ["nested"], method: "setValue", args: ["ready"] }]);

    expect(target.nested.value).to.equal("ready");
  });

  it("should finish resolving props before executing calls", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    let resolveValue: (value: string) => void;
    const valuePromise = new Promise<string>((resolve) => {
      resolveValue = resolve;
    });
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockReturnValue(valuePromise as any);
    const parser = new ReflectionParser(context, [{ url: "delayed-value" }]);
    const target = new CallOrderComponent(new Entity(engine, "host"));

    try {
      const parsing = parser.parseMutationBlock(target, {
        props: { value: { $ref: 0 } },
        calls: [{ method: "captureCurrentValue" }]
      });
      await Promise.resolve();
      resolveValue!("ready");
      await parsing;
    } finally {
      getResourceByRef.mockRestore();
    }

    expect(target.receivedArgs).to.deep.equal(["ready"]);
  });

  it("should restore particle curves and bursts through existing public APIs", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const entity = new Entity(engine, "particle");
    const renderer = entity.addComponent(ParticleRenderer);

    await parser.parseMutationBlock(renderer, {
      props: {
        generator: {
          main: {
            startDelay: {
              mode: ParticleCurveMode.Curve,
              curveMax: {
                $type: "ParticleCurve",
                $args: [
                  { $type: "CurveKey", $args: [0, 1] },
                  { $type: "CurveKey", $args: [1, 2] }
                ]
              }
            }
          }
        }
      },
      calls: [
        { target: ["generator", "emission"], method: "clearBurst" },
        {
          target: ["generator", "emission"],
          method: "addBurst",
          args: [
            {
              $type: "Burst",
              $args: [0.5, { $type: "ParticleCompositeCurve", $args: [8] }, { $number: "Infinity" }, 0.1]
            }
          ]
        }
      ]
    });

    const curve = renderer.generator.main.startDelay.curve;
    expect(curve).to.be.instanceOf(ParticleCurve);
    expect(curve.keys.map(({ time, value }) => [time, value])).to.deep.equal([
      [0, 1],
      [1, 2]
    ]);
    expect(renderer.generator.emission.bursts).to.have.length(1);
    expect(renderer.generator.emission.bursts[0].time).to.equal(0.5);
    expect(renderer.generator.emission.bursts[0].count.constant).to.equal(8);
    expect(renderer.generator.emission.bursts[0].cycles).to.equal(Infinity);
    entity.destroy();
  });

  it("should await each call before executing the next one", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target = new CallOrderComponent(new Entity(engine, "host"));

    await parser.parseCalls(target, [
      { method: "setBaseDelayed", args: ["base"] },
      { method: "appendSuffix", args: ["-after"] }
    ]);

    expect(target.value).to.equal("base-after");
  });

  it("should throw a clear error when the target method is missing", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};

    await expect(parser.parseCalls(target, [{ method: "missingMethod" }])).rejects.toThrow("missingMethod");
  });
});

// ---------------------------------------------------------------------------
// SceneParser — v2 entity tree construction
// ---------------------------------------------------------------------------

describe("SceneParser v2 entity tree", () => {
  function createSceneData(
    entities: SceneFile["entities"],
    components: SceneFile["components"],
    rootEntities: number[],
    refs: SceneFile["refs"] = []
  ): SceneFile {
    return {
      version: "2.0",
      refs,
      entities,
      components,
      scene: {
        rootEntities,
        background: {
          mode: 0,
          color: [0.25, 0.25, 0.25, 1]
        },
        ambient: {
          diffuseMode: 0,
          diffuseIntensity: 1,
          specularIntensity: 1,
          specularMode: SpecularMode.Sky
        }
      }
    };
  }

  it("loads the main glTF resource and instantiates the selected scene", async () => {
    const data = createSceneData([{ instance: { asset: 0 } }], [], [0], [{ url: "model.glb", key: "scenes[1]" }]);
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const glTFResource = new GLTFResource(engine, "model.glb");
    const instanceRoot = new Entity(engine, "Scene 1");
    const instantiateSceneRoot = vi.spyOn(glTFResource, "instantiateSceneRoot").mockReturnValue(instanceRoot);
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockResolvedValue(glTFResource);

    try {
      const parser = new SceneParser(data, context, scene);
      parser.start();
      await parser.promise;

      expect(getResourceByRef).toHaveBeenCalledWith({ url: "model.glb" });
      expect(instantiateSceneRoot).toHaveBeenCalledWith(1);
      expect(scene.rootEntities[0]).to.equal(instanceRoot);
    } finally {
      getResourceByRef.mockRestore();
      instantiateSceneRoot.mockRestore();
    }
  });

  it("should reject scene data without the v2 version marker", () => {
    const data = {
      entities: [{ name: "Entity" }],
      components: [],
      scene: {
        rootEntities: [0],
        background: {
          mode: BackgroundMode.SolidColor,
          color: [0.25, 0.25, 0.25, 1]
        }
      }
    } as any;

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);

    expect(() => new SceneParser(data, context, scene)).toThrow(
      'Unsupported scene format version "undefined". Expected "2.0".'
    );
  });

  it("should build single-root entity tree from flat array", async () => {
    const data = createSceneData([{ name: "Root", children: [1, 2] }, { name: "Camera" }, { name: "Light" }], [], [0]);

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    expect(scene.rootEntitiesCount).to.equal(1);
    const root = scene.rootEntities[0];
    expect(root.name).to.equal("Root");
    expect(root.childCount).to.equal(2);
    expect(root.children[0].name).to.equal("Camera");
    expect(root.children[1].name).to.equal("Light");
  });

  it("should build multi-root entity tree", async () => {
    const data = createSceneData([{ name: "Root1", children: [2] }, { name: "Root2" }, { name: "Child" }], [], [0, 1]);

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    expect(scene.rootEntitiesCount).to.equal(2);
    expect(scene.rootEntities[0].name).to.equal("Root1");
    expect(scene.rootEntities[1].name).to.equal("Root2");
    expect(scene.rootEntities[0].childCount).to.equal(1);
    expect(scene.rootEntities[0].children[0].name).to.equal("Child");
  });

  it("should apply entity transforms from Vec3Tuple", async () => {
    const data = createSceneData(
      [
        {
          name: "Entity",
          position: [1, 2, 3],
          rotation: [45, 90, 0],
          scale: [2, 2, 2]
        }
      ],
      [],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    expect(entity.transform.position.x).to.equal(1);
    expect(entity.transform.position.y).to.equal(2);
    expect(entity.transform.position.z).to.equal(3);
    expect(entity.transform.rotation.x).to.equal(45);
    expect(entity.transform.rotation.y).to.equal(90);
    expect(entity.transform.rotation.z).to.equal(0);
    expect(entity.transform.scale.x).to.equal(2);
    expect(entity.transform.scale.y).to.equal(2);
    expect(entity.transform.scale.z).to.equal(2);
  });

  it("should set entity isActive and layer", async () => {
    const data = createSceneData([{ name: "Inactive", isActive: false, layer: 3 }], [], [0]);

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    expect(entity.isActive).to.equal(false);
    expect(entity.layer).to.equal(3);
  });

  it("should handle deep entity nesting", async () => {
    const data = createSceneData(
      [{ name: "A", children: [1] }, { name: "B", children: [2] }, { name: "C", children: [3] }, { name: "D" }],
      [],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const a = scene.rootEntities[0];
    expect(a.name).to.equal("A");
    expect(a.children[0].name).to.equal("B");
    expect(a.children[0].children[0].name).to.equal("C");
    expect(a.children[0].children[0].children[0].name).to.equal("D");
  });

  it("should default missing transform to identity", async () => {
    const data = createSceneData([{ name: "Default" }], [], [0]);

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    expect(entity.transform.position.x).to.equal(0);
    expect(entity.transform.position.y).to.equal(0);
    expect(entity.transform.position.z).to.equal(0);
    expect(entity.transform.scale.x).to.equal(1);
    expect(entity.transform.scale.y).to.equal(1);
    expect(entity.transform.scale.z).to.equal(1);
  });

  it("should add components and apply props (Stage 3-4)", async () => {
    const data = createSceneData(
      [{ name: "CamEntity", components: [0] }],
      [{ type: "Camera", props: { nearClipPlane: 0.5, farClipPlane: 500 } }],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    const camera = entity.getComponent(Camera);
    expect(camera).to.not.be.null;
    expect(camera.nearClipPlane).to.equal(0.5);
    expect(camera.farClipPlane).to.equal(500);
  });

  it("should apply component props and calls from the same schema", async () => {
    const data = createSceneData(
      [{ name: "CallEntity", components: [0] }],
      [
        {
          type: "CallOrderComponent",
          props: { value: "base" },
          calls: [{ method: "captureResolvedArgs", args: ["after"] }]
        } as any
      ],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const component = scene.rootEntities[0].getComponent(CallOrderComponent);
    expect(component).to.not.be.null;
    expect(component.value).to.equal("base");
    expect(component.receivedArgs).to.deep.equal(["after"]);
  });

  it("should apply component calls with $class args through scene parsing", async () => {
    const data = createSceneData(
      [{ name: "PostProcessEntity", components: [0] }],
      [
        {
          type: "PostProcess",
          props: { isGlobal: true, priority: 2 },
          calls: [
            {
              method: "addEffect",
              args: [{ $class: "BloomEffect" }],
              result: {
                props: {
                  threshold: { value: 0.85 },
                  intensity: { value: 1.25 }
                }
              }
            }
          ]
        } as any
      ],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const postProcess = scene.rootEntities[0].getComponent(PostProcess);
    const effect = postProcess.getEffect(BloomEffect);
    expect(postProcess.priority).to.equal(2);
    expect(effect).to.be.instanceOf(BloomEffect);
    expect(effect.threshold.value).to.equal(0.85);
    expect(effect.intensity.value).to.equal(1.25);
  });

  it("should throw a clear error when component type is not registered", async () => {
    const data = createSceneData([{ name: "Entity", components: [0] }], [{ type: "UnregisteredComponent999" }], [0]);

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await expect(parser.promise).rejects.toThrow("UnregisteredComponent999");
  });

  it("should collect dependent assets from refs array", () => {
    const data: SceneFile = {
      version: "2.0",
      refs: [
        { url: "nested.prefab" },
        { url: "component-call.mat" },
        { url: "override-call.mat" },
        { url: "texture.png", key: "mipmap" }
      ],
      entities: [{ name: "Root", components: [0] }],
      components: [{ type: "CallOrderComponent" }],
      scene: {
        rootEntities: [0],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        ambient: {
          diffuseMode: DiffuseMode.SolidColor,
          diffuseIntensity: 1,
          specularIntensity: 1,
          specularMode: SpecularMode.Sky
        }
      }
    };

    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    context._setTaskCompleteProgress = () => {};
    const parser = new SceneParser(data, context, scene);
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockResolvedValue({ _addReferCount() {} } as any);

    let collectedRefs: Array<{ url: string; key?: string }>;
    try {
      parser._collectDependentAssets(data);
      collectedRefs = getResourceByRef.mock.calls.map((args) => args[0] as any);
    } finally {
      getResourceByRef.mockRestore();
    }
    expect(collectedRefs).to.have.length(4);
    expect(collectedRefs.map((r) => r.url)).to.deep.equal([
      "nested.prefab",
      "component-call.mat",
      "override-call.mat",
      "texture.png"
    ]);
    expect(collectedRefs[3].key).to.equal("mipmap");
  });
});

// ---------------------------------------------------------------------------
// ReflectionParser — $signal binding
// ---------------------------------------------------------------------------

describe("ReflectionParser $signal resolution", () => {
  it("should bind listeners to target component method", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity0 = new Entity(engine, "source");
    const entity1 = new Entity(engine, "target");
    context.entityInstances[0] = entity0;
    context.entityInstances[1] = entity1;

    const parser = new ReflectionParser(context, []);

    const bound: Array<{ target: any; method: string; args: any[] }> = [];
    const mockSignal = {
      on(target: any, method: string, ...args: any[]) {
        bound.push({ target, method, args });
      }
    };

    const target: any = { onClick: mockSignal };
    await parser.parseProps(target, {
      onClick: {
        $signal: [{ target: { $component: { entity: [1], type: "Transform", index: 0 } }, methodName: "reset" }]
      }
    });

    // Signal object should be preserved (not replaced)
    expect(target.onClick).to.equal(mockSignal);
    // Listener should be bound to entity1's Transform
    expect(bound.length).to.equal(1);
    expect(bound[0].target).to.equal(entity1.transform);
    expect(bound[0].method).to.equal("reset");
  });

  it("should skip binding when target component is missing", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity0 = new Entity(engine, "source");
    context.entityInstances[0] = entity0;
    // entity 1 does NOT exist in entityMap

    const parser = new ReflectionParser(context, []);

    const bound: any[] = [];
    const mockSignal = {
      on(target: any, method: string, ...args: any[]) {
        bound.push({ target, method, args });
      }
    };

    const target: any = { onClick: mockSignal };
    await parser.parseProps(target, {
      onClick: {
        $signal: [{ target: { $component: { entity: [1], type: "Transform", index: 0 } }, methodName: "reset" }]
      }
    });

    // Signal preserved, but no listener bound (entity missing)
    expect(target.onClick).to.equal(mockSignal);
    expect(bound.length).to.equal(0);
  });

  it("should throw a clear error when $signal target property is not initialized", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity0 = new Entity(engine, "source");
    const entity1 = new Entity(engine, "target");
    context.entityInstances[0] = entity0;
    context.entityInstances[1] = entity1;

    const parser = new ReflectionParser(context, []);

    // onClick is undefined — not initialized as a Signal
    const target: any = { onClick: undefined };
    await expect(
      parser.parseProps(target, {
        onClick: {
          $signal: [{ target: { $component: { entity: [1], type: "Transform", index: 0 } }, methodName: "reset" }]
        }
      })
    ).rejects.toThrow("$signal");
  });

  it("should return null when $component references an unregistered type", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const entity = new Entity(engine, "test");
    context.entityInstances[0] = entity;

    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      comp: { $component: { entity: [0], type: "NonExistentType999", index: 0 } }
    });
    expect(target.comp).to.be.null;
  });
});

// ---------------------------------------------------------------------------
// ReflectionParser — $type polymorphic resolution
// ---------------------------------------------------------------------------

describe("ReflectionParser $type resolution", () => {
  it("should construct $type instance and apply remaining props", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      value: { $type: "TestValueType", x: 10, y: 20 }
    });
    expect(target.value).to.be.instanceOf(TestValueType);
    expect(target.value.x).to.equal(10);
    expect(target.value.y).to.equal(20);
  });

  it("should construct $type instance without props", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      value: { $type: "TestValueType" }
    });
    expect(target.value).to.be.instanceOf(TestValueType);
    expect(target.value.x).to.equal(0);
    expect(target.value.y).to.equal(0);
  });

  it("should recursively resolve $args before construction and then apply props", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      value: {
        $type: "ConstructorValueType",
        $args: [{ $number: "Infinity" }, { $type: "TestValueType", x: 3, y: 4 }],
        label: "ready"
      }
    });
    expect(target.value).to.be.instanceOf(ConstructorValueType);
    expect(target.value.seed).to.equal(Infinity);
    expect(target.value.child).to.be.instanceOf(TestValueType);
    expect(target.value.child).to.deep.include({ x: 3, y: 4 });
    expect(target.value.label).to.equal("ready");
  });

  it("should reject $args without an array-valued $type constructor contract", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};

    await expect(
      parser.parseProps(target, {
        value: { $type: "TestValueType", $args: "invalid" } as any
      })
    ).rejects.toThrow("$args must be an array when used with $type");
    await expect(parser.parseProps(target, { value: { $args: [] } })).rejects.toThrow("$args requires $type");
    await expect(parser.parseProps(target, { value: { $class: "TestValueType", $args: [] } })).rejects.toThrow(
      "$args requires $type"
    );
    await expect(parser.parseProps(target, { value: { $number: "NaN" } })).rejects.toThrow(
      '$number must be exactly "Infinity"'
    );
  });

  it("should throw a clear error when $type references an unregistered class", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await expect(
      parser.parseProps(target, {
        value: { $type: "NonExistentClass123" }
      })
    ).rejects.toThrow("NonExistentClass123");
  });

  it("should throw a clear error when $type is not a non-empty string", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await expect(
      parser.parseProps(target, {
        value: { $type: 123 } as any
      })
    ).rejects.toThrow("$type must be a non-empty registered class name string");
  });
});

describe("ReflectionParser $class resolution", () => {
  it("should resolve $class as the registered constructor through parseProps", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await parser.parseProps(target, {
      value: { $class: "TestValueType" }
    });
    expect(target.value).to.equal(TestValueType);
  });

  it("should throw a clear error when $class is an empty string", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await expect(
      parser.parseProps(target, {
        value: { $class: "" }
      })
    ).rejects.toThrow("$class must be a non-empty registered class name string");
  });

  it("should throw a clear error when $class is not a string", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await expect(
      parser.parseProps(target, {
        value: { $class: 123 } as any
      })
    ).rejects.toThrow("$class must be a non-empty registered class name string");
  });

  it("should throw a clear error when $class references an unregistered class", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context, []);
    const target: any = {};
    await expect(
      parser.parseProps(target, {
        value: { $class: "NonExistentClass123" }
      })
    ).rejects.toThrow("NonExistentClass123");
  });
});

// ---------------------------------------------------------------------------
// applySceneData — scene property parsing (shadow / fog / AO / background)
// ---------------------------------------------------------------------------
// Tests call the same applySceneData function that SceneLoader.load() uses,
// so any change to the parsing logic is automatically covered.

describe("applySceneData scene property parsing", () => {
  it("should resolve ambient resources for custom specular and spherical harmonics", async () => {
    const scene = new Scene(engine);
    const noop = () => {};
    const customAmbientTexture = { name: "custom-specular-texture", _addReferCount: noop };
    const ambientTexture = { name: "sh-specular-texture", _addReferCount: noop };
    const diffuseSphericalHarmonics = { name: "ambient-sh", coefficients: new Float32Array(27) };
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockImplementation((ref: any) => {
        switch (ref.url) {
          case "custom-ambient":
            return Promise.resolve({ specularTexture: customAmbientTexture }) as any;
          case "ambient-light":
            return Promise.resolve({
              specularTexture: ambientTexture,
              diffuseSphericalHarmonics
            }) as any;
          default:
            return Promise.resolve(null) as any;
        }
      });

    const refs = [{ url: "custom-ambient" }, { url: "ambient-light" }];
    try {
      await applySceneData(
        scene,
        {
          rootEntities: [0],
          background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
          ambient: {
            diffuseMode: DiffuseMode.SphericalHarmonics,
            diffuseIntensity: 1,
            specularIntensity: 1,
            specularMode: SpecularMode.Custom,
            customAmbientLight: 0,
            ambientLight: 1
          }
        },
        engine.resourceManager,
        refs
      );
    } finally {
      getResourceByRef.mockRestore();
    }

    expect(scene.ambientLight.specularTexture).to.equal(customAmbientTexture);
    expect(scene.ambientLight.diffuseSphericalHarmonics).to.equal(diffuseSphericalHarmonics);
  });

  it("should apply sky background resources", async () => {
    const scene = new Scene(engine);
    const noop = () => {};
    const skyMesh = { name: "sky-mesh", _addReferCount: noop };
    const skyMaterial = { name: "sky-material", _addReferCount: noop };
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockImplementation((ref: any) => {
        switch (ref.url) {
          case "sky-mesh":
            return Promise.resolve(skyMesh) as any;
          case "sky-material":
            return Promise.resolve(skyMaterial) as any;
          default:
            return Promise.resolve(null) as any;
        }
      });

    const refs = [{ url: "sky-mesh" }, { url: "sky-material" }];
    try {
      await applySceneData(
        scene,
        {
          rootEntities: [0],
          background: {
            mode: BackgroundMode.Sky,
            color: [0, 0, 0, 1],
            skyMesh: 0,
            skyMaterial: 1
          }
        },
        engine.resourceManager,
        refs
      );
    } finally {
      getResourceByRef.mockRestore();
    }

    expect(scene.background.sky.mesh).to.equal(skyMesh);
    expect(scene.background.sky.material).to.equal(skyMaterial);
  });

  it("should apply texture background resources and fill mode", async () => {
    const scene = new Scene(engine);
    const backgroundTexture = { name: "background-texture", _addReferCount: () => {} };
    const getResourceByRef = vi
      .spyOn(engine.resourceManager as any, "getResourceByRef")
      .mockImplementation((ref: any) => {
        if (ref.url === "background-texture") {
          return Promise.resolve(backgroundTexture) as any;
        }
        return Promise.resolve(null) as any;
      });

    const refs = [{ url: "background-texture" }];
    try {
      await applySceneData(
        scene,
        {
          rootEntities: [0],
          background: {
            mode: BackgroundMode.Texture,
            color: [0, 0, 0, 1],
            texture: 0,
            textureFillMode: BackgroundTextureFillMode.Fill
          }
        },
        engine.resourceManager,
        refs
      );
    } finally {
      getResourceByRef.mockRestore();
    }

    expect(scene.background.texture).to.equal(backgroundTexture);
    expect(scene.background.textureFillMode).to.equal(BackgroundTextureFillMode.Fill);
  });

  it("should throw a clear error when scene ref index is out of range", async () => {
    const scene = new Scene(engine);

    await expect(
      applySceneData(
        scene,
        {
          rootEntities: [0],
          background: {
            mode: BackgroundMode.Texture,
            color: [0, 0, 0, 1],
            texture: 0
          }
        },
        engine.resourceManager,
        []
      )
    ).rejects.toThrow("SceneLoader: invalid ref index 0 for scene.background.texture");
  });

  it("should apply shadow properties to scene", async () => {
    const scene = new Scene(engine);
    await applySceneData(
      scene,
      {
        rootEntities: [0],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        shadow: {
          castShadows: false,
          enableTransparentShadow: true,
          shadowResolution: ShadowResolution.High,
          shadowDistance: 100,
          shadowCascades: ShadowCascadesMode.FourCascades,
          shadowTwoCascadeSplits: 0.5,
          shadowFourCascadeSplits: [0.1, 0.3, 0.7],
          shadowFadeBorder: 0.2
        }
      },
      engine.resourceManager,
      []
    );

    expect(scene.castShadows).to.equal(false);
    expect(scene.enableTransparentShadow).to.equal(true);
    expect(scene.shadowResolution).to.equal(ShadowResolution.High);
    expect(scene.shadowDistance).to.equal(100);
    expect(scene.shadowCascades).to.equal(ShadowCascadesMode.FourCascades);
    expect(scene.shadowTwoCascadeSplits).to.equal(0.5);
    expect(scene.shadowFourCascadeSplits.x).to.be.closeTo(0.1, 0.001);
    expect(scene.shadowFourCascadeSplits.y).to.be.closeTo(0.3, 0.001);
    expect(scene.shadowFourCascadeSplits.z).to.be.closeTo(0.7, 0.001);
    expect(scene.shadowFadeBorder).to.equal(0.2);
  });

  it("should apply fog properties to scene", async () => {
    const scene = new Scene(engine);
    await applySceneData(
      scene,
      {
        rootEntities: [0],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        fog: {
          fogMode: FogMode.ExponentialSquared,
          fogStart: 10,
          fogEnd: 200,
          fogDensity: 0.05,
          fogColor: [1, 0, 0, 1]
        }
      },
      engine.resourceManager,
      []
    );

    expect(scene.fogMode).to.equal(FogMode.ExponentialSquared);
    expect(scene.fogStart).to.equal(10);
    expect(scene.fogEnd).to.equal(200);
    expect(scene.fogDensity).to.equal(0.05);
    expect(scene.fogColor.r).to.equal(1);
    expect(scene.fogColor.g).to.equal(0);
    expect(scene.fogColor.b).to.equal(0);
    expect(scene.fogColor.a).to.equal(1);
  });

  it("should apply ambient occlusion properties to scene", async () => {
    const scene = new Scene(engine);
    await applySceneData(
      scene,
      {
        rootEntities: [0],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        ambientOcclusion: {
          enabledAmbientOcclusion: true,
          intensity: 0.8,
          radius: 0.5,
          bias: 0.02,
          power: 3,
          quality: 2,
          bilateralThreshold: 0.1,
          minHorizonAngle: 0.04
        }
      },
      engine.resourceManager,
      []
    );

    const ao = scene.ambientOcclusion;
    expect(ao.enabled).to.equal(true);
    expect(ao.intensity).to.equal(0.8);
    expect(ao.radius).to.equal(0.5);
    expect(ao.bias).to.equal(0.02);
    expect(ao.power).to.equal(3);
    expect(ao.quality).to.equal(2);
    expect(ao.bilateralThreshold).to.equal(0.1);
    expect(ao.minHorizonAngle).to.equal(0.04);
  });

  it("should apply SolidColor background from Vec4Tuple", async () => {
    const scene = new Scene(engine);
    await applySceneData(
      scene,
      {
        rootEntities: [0],
        background: {
          mode: BackgroundMode.SolidColor,
          color: [0.5, 0.6, 0.7, 1]
        }
      },
      engine.resourceManager,
      []
    );

    expect(scene.background.mode).to.equal(BackgroundMode.SolidColor);
    expect(scene.background.solidColor.r).to.be.closeTo(0.5, 0.001);
    expect(scene.background.solidColor.g).to.be.closeTo(0.6, 0.001);
    expect(scene.background.solidColor.b).to.be.closeTo(0.7, 0.001);
    expect(scene.background.solidColor.a).to.equal(1);
  });

  it("should preserve defaults when shadow/fog/AO sections are absent", async () => {
    const scene = new Scene(engine);
    await applySceneData(
      scene,
      {
        rootEntities: [0],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] }
      },
      engine.resourceManager,
      []
    );

    expect(scene.castShadows).to.equal(true);
    expect(scene.fogMode).to.equal(FogMode.None);
    expect(scene.ambientOcclusion.enabled).to.equal(false);
  });
});
