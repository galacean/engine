import { BlinnPhongMaterial, Entity, MeshRenderer, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * ShaderData is the cascade hub of ref counting: a texture set on a ShaderData owns
 * `host.refCount` references, and every change of the host's count propagates to its textures
 * (`ShaderData._addReferCount`), as does `Material._addReferCount` to shaderData + shader.
 */
describe("ShaderData / Material refCount cascade", () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    rootEntity = engine.sceneManager.activeScene.createRootEntity();
    engine.run();
  });

  it("setTexture swap / clear transfers counts by the host's refCount", () => {
    const material = new BlinnPhongMaterial(engine);
    const entity = rootEntity.createChild("swapHost");
    entity.addComponent(MeshRenderer).setMaterial(material);
    expect(material.refCount).eq(1);

    const texA = new Texture2D(engine, 1, 1);
    const texB = new Texture2D(engine, 1, 1);
    material.shaderData.setTexture("u_custom", texA);
    expect(texA.refCount).eq(1);

    material.shaderData.setTexture("u_custom", texB);
    expect(texA.refCount).eq(0);
    expect(texB.refCount).eq(1);

    material.shaderData.setTexture("u_custom", null);
    expect(texB.refCount).eq(0);

    entity.destroy();
    expect(material.refCount).eq(0);
  });

  it("a texture set on a doubly-referenced material owns two counts; dropping one reference cascades", () => {
    const material = new BlinnPhongMaterial(engine);
    const other = new BlinnPhongMaterial(engine);
    const entityA = rootEntity.createChild("hostA");
    const entityB = rootEntity.createChild("hostB");
    entityA.addComponent(MeshRenderer).setMaterial(material);
    entityB.addComponent(MeshRenderer).setMaterial(material);
    expect(material.refCount).eq(2);

    const tex = new Texture2D(engine, 1, 1);
    material.shaderData.setTexture("u_custom", tex);
    expect(tex.refCount).eq(2);

    // Dropping one material reference cascades -1 through shaderData to its textures.
    entityB.getComponent(MeshRenderer).setMaterial(other);
    expect(material.refCount).eq(1);
    expect(tex.refCount).eq(1);

    entityA.destroy();
    expect(material.refCount).eq(0);
    expect(tex.refCount).eq(0);
    entityB.destroy();
    expect(other.refCount).eq(0);
  });

  it("cloning a renderer keeps the shared material and its textures balanced", () => {
    const material = new BlinnPhongMaterial(engine);
    const tex = new Texture2D(engine, 1, 1);
    const entity = rootEntity.createChild("cloneHost");
    entity.addComponent(MeshRenderer).setMaterial(material);
    material.shaderData.setTexture("u_custom", tex);
    expect(material.refCount).eq(1);
    expect(tex.refCount).eq(1);

    const clone = entity.clone();
    rootEntity.addChild(clone);
    // The clone shares the material (+1), which cascades +1 to its textures.
    expect(material.refCount).eq(2);
    expect(tex.refCount).eq(2);

    clone.destroy();
    expect(material.refCount).eq(1);
    expect(tex.refCount).eq(1);

    entity.destroy();
    expect(material.refCount).eq(0);
    expect(tex.refCount).eq(0);
  });

  it("instance materials release on destroy and stay balanced across clone", () => {
    const material = new BlinnPhongMaterial(engine);
    const entity = rootEntity.createChild("instanceHost");
    const renderer = entity.addComponent(MeshRenderer);
    renderer.setMaterial(material);

    const instanced = renderer.getInstanceMaterial();
    expect(instanced).not.eq(material);
    // Instancing replaces the slot: the original material is released, the instance is owned.
    expect(material.refCount).eq(0);
    expect(instanced.refCount).eq(1);

    const clone = entity.clone();
    rootEntity.addChild(clone);
    expect(instanced.refCount).eq(2);

    clone.destroy();
    expect(instanced.refCount).eq(1);

    entity.destroy();
    expect(instanced.refCount).eq(0);
  });
});
