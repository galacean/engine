import {
  WebGLEngine,
  MeshRenderer,
  PrimitiveMesh,
  Vector2,
  Vector3,
  Shader,
  ShaderPass,
  ShaderLanguage,
  Material,
  PBRMaterial,
  Engine
} from "@galacean/engine";
import { HeadlessEngine } from "@galacean/engine-rhi-null";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let browser: WebGLEngine;
let headless: HeadlessEngine;
beforeAll(async () => {
  browser = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  headless = await HeadlessEngine.create();
});
afterAll(() => {
  browser?.destroy();
  headless?.destroy();
});

const creators = [
  (e: Engine) => PrimitiveMesh.createSphere(e, 1.5, { keepMeshData: true, subdivisionLevel: 1 }),
  (e: Engine) => PrimitiveMesh.createCuboid(e, 2, 3, 4, { keepMeshData: true }),
  (e: Engine) => PrimitiveMesh.createPlane(e, 2, 4, { keepMeshData: true }),
  (e: Engine) => PrimitiveMesh.createCapsule(e, 0.5, 2, { keepMeshData: true }),
  (e: Engine) => PrimitiveMesh.createCylinder(e, 1, 3, { keepMeshData: true }),
  (e: Engine) => PrimitiveMesh.createCone(e, 1, 3, { keepMeshData: true }),
  (e: Engine) => PrimitiveMesh.createTorus(e, 2, 0.5, { keepMeshData: true }),
  (e: Engine) =>
    PrimitiveMesh.createTube(e, [new Vector3(), new Vector3(1, 2, 3), new Vector3(3, 2, 1)], 0.3, {
      keepMeshData: true
    }),
  (e: Engine) =>
    PrimitiveMesh.createExtrudedPolygon(e, [new Vector2(-1, 0), new Vector2(1, 0), new Vector2(0, 2)], 2, {
      keepMeshData: true
    })
];

describe("WebGL and headless share engine semantics", () => {
  it.each(creators.map((create, index) => [index, create] as const))(
    "matches geometry and hierarchical bounds for factory %i",
    (_index, create) => {
      const values = [browser, headless].map((engine) => {
        const parent = engine.sceneManager.activeScene!.createRootEntity();
        parent.transform.setPosition(3, 4, 5);
        parent.transform.setRotation(20, 35, 40);
        parent.transform.setScale(-2, 3, 0.5);
        const child = parent.createChild();
        child.transform.setPosition(1, 2, 3);
        const renderer = child.addComponent(MeshRenderer);
        const mesh = create(engine);
        renderer.mesh = mesh;
        const result = {
          positions: mesh.getPositions()!.map((value) => value.toJSON()),
          indices: Array.from(mesh.getIndices()!),
          min: renderer.bounds.min.toJSON(),
          max: renderer.bounds.max.toJSON(),
          matrix: Array.from(child.transform.worldMatrix.elements)
        };
        parent.destroy();
        mesh.destroy();
        return result;
      });
      expect(values[1]).toEqual(values[0]);
    }
  );

  it("preserves built-in shader identity when both entries are imported", async () => {
    expect(new PBRMaterial(browser).shader).toBe(new PBRMaterial(headless).shader);
    const existing = Engine._builtinShaders.pbr;
    const custom = Shader.create("PBR", [new ShaderPass("Forward", [], [], ShaderLanguage.GLSLES100)]);
    const second = await HeadlessEngine.create();
    try {
      expect(Engine._builtinShaders.pbr).toBe(existing);
      expect(new PBRMaterial(second).shader).toBe(existing);
      expect(new Material(second, custom).shader).toBe(custom);
      expect(Shader.find("PBR")).toBe(custom);
    } finally {
      second.destroy();
      custom.destroy();
    }
  });
});
