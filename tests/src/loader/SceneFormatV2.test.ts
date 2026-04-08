import "@galacean/engine-loader";
import { Camera, Entity, Loader, Scene, Transform } from "@galacean/engine-core";
import {
  ParserContext,
  ParserType,
  ReflectionParser,
  SceneParser,
  type IScene
} from "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

Loader.registerClass("Transform", Transform);
Loader.registerClass("Camera", Camera);

class TestValueType {
  x = 0;
  y = 0;
}
Loader.registerClass("TestValueType", TestValueType);

let engine: WebGLEngine;

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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
    const target: any = {};
    await parser.parseProps(target, {
      nested: { a: 1, b: { c: 2 } }
    });
    expect(target.nested).to.deep.equal({ a: 1, b: { c: 2 } });
  });

  it("should modify existing object properties in place", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
    const target: any = {};
    await parser.parseProps(target, {
      items: [1, "two", { key: 3 }]
    });
    expect(target.items).to.deep.equal([1, "two", { key: 3 }]);
  });

  it("should resolve $entity by flat index", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const entity0 = new Entity(engine, "entity0");
    const entity1 = new Entity(engine, "entity1");
    context.entityMap.set(0, entity0);
    context.entityMap.set(1, entity1);

    const parser = new ReflectionParser(context);
    const target: any = {};
    await parser.parseProps(target, {
      target: { $entity: 1 }
    });
    expect(target.target).to.equal(entity1);
  });

  it("should resolve $component by entity index + type + index", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const entity = new Entity(engine, "test");
    context.entityMap.set(0, entity);

    const parser = new ReflectionParser(context);
    const target: any = {};
    await parser.parseProps(target, {
      comp: { $component: { entity: 0, type: "Transform", index: 0 } }
    });
    expect(target.comp).to.equal(entity.transform);
  });

  it("should detect $ref values via _isAssetRef", () => {
    expect(ReflectionParser._isAssetRef({ $ref: "some-uuid" })).to.be.true;
    expect(ReflectionParser._isAssetRef({ $ref: "uuid", key: "k" })).to.be.true;
    expect(ReflectionParser._isAssetRef({ refId: "old-format" })).to.be.false;
    expect(ReflectionParser._isAssetRef(null)).to.be.false;
    expect(ReflectionParser._isAssetRef(42)).to.be.false;
    expect(ReflectionParser._isAssetRef("string")).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// SceneParser — v2 entity tree construction
// ---------------------------------------------------------------------------

describe("SceneParser v2 entity tree", () => {
  function createSceneData(
    entities: IScene["entities"],
    components: IScene["components"],
    rootEntities: number[]
  ): IScene {
    return {
      entities,
      components,
      scene: {
        entities: rootEntities,
        background: {
          mode: 0,
          color: [0.25, 0.25, 0.25, 1]
        },
        ambient: {
          diffuseMode: 0,
          diffuseIntensity: 1,
          specularIntensity: 1,
          specularMode: "Sky" as any,
          bakerResolution: 0
        }
      }
    };
  }

  it("should build single-root entity tree from flat array", async () => {
    const data = createSceneData(
      [
        { name: "Root", children: [1, 2] },
        { name: "Camera" },
        { name: "Light" }
      ],
      [],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
    const data = createSceneData(
      [
        { name: "Root1", children: [2] },
        { name: "Root2" },
        { name: "Child" }
      ],
      [],
      [0, 1]
    );

    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
    const data = createSceneData(
      [{ name: "Inactive", isActive: false, layer: 3 }],
      [],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    expect(entity.isActive).to.equal(false);
    expect(entity.layer).to.equal(3);
  });

  it("should handle deep entity nesting", async () => {
    const data = createSceneData(
      [
        { name: "A", children: [1] },
        { name: "B", children: [2] },
        { name: "C", children: [3] },
        { name: "D" }
      ],
      [],
      [0]
    );

    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new SceneParser(data, context, scene);
    parser.start();
    await parser.promise;

    const entity = scene.rootEntities[0];
    const camera = entity.getComponent(Camera);
    expect(camera).to.not.be.null;
    expect(camera.nearClipPlane).to.equal(0.5);
    expect(camera.farClipPlane).to.equal(500);
  });
});

// ---------------------------------------------------------------------------
// ReflectionParser — $type polymorphic resolution
// ---------------------------------------------------------------------------

describe("ReflectionParser $type resolution", () => {
  it("should construct $type instance and apply remaining props", async () => {
    const scene = new Scene(engine);
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
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
    const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
    const parser = new ReflectionParser(context);
    const target: any = {};
    await parser.parseProps(target, {
      value: { $type: "TestValueType" }
    });
    expect(target.value).to.be.instanceOf(TestValueType);
    expect(target.value.x).to.equal(0);
    expect(target.value.y).to.equal(0);
  });
});
