import { MeshRenderer, Entity, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, expect, it } from "vitest";

describe("Clone resource refCount", async function () {
  let engine: WebGLEngine;
  let rootEntity: Entity;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    rootEntity = engine.sceneManager.activeScene.createRootEntity();
    engine.run();
  });

  it("clone shares texture with balanced refCount (no leak)", () => {
    const texture = new Texture2D(engine, 1, 1);
    const entity = rootEntity.createChild("src");
    entity.addComponent(MeshRenderer).shaderData.setTexture("u_tex", texture);
    expect(texture.refCount).eq(1);

    const clone = entity.clone();
    rootEntity.addChild(clone);
    // The clone owns an independent shaderData that references the shared texture → +1.
    expect(texture.refCount).eq(2);

    clone.destroy();
    // Destroying the clone releases that reference → back to baseline, no leak.
    expect(texture.refCount).eq(1);

    entity.destroy();
  });
});
