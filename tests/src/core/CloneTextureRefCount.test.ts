import {
  Animator,
  AnimatorController,
  Camera,
  Entity,
  Font,
  MeshRenderer,
  RenderTarget,
  SkinnedMeshRenderer,
  TextRenderer,
  Texture2D
} from "@galacean/engine-core";
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

  it("renderer-private joint texture is not propagated into clones", () => {
    const entity = rootEntity.createChild("skinnedSrc");
    const smr = entity.addComponent(SkinnedMeshRenderer);
    // Simulate the state _update builds when the bone count exceeds the uniform budget.
    const jointTexture = new Texture2D(engine, 4, 4);
    jointTexture.isGCIgnored = true;
    // @ts-ignore
    smr._jointTexture = jointTexture;
    smr.shaderData.setTexture("renderer_JointSampler", jointTexture);
    expect(jointTexture.refCount).eq(1);

    const clone = entity.clone();
    rootEntity.addChild(clone);
    const clonedSmr = clone.getComponent(SkinnedMeshRenderer);
    // The clone must not hold the source's private texture; it rebuilds its own on first update.
    expect(clonedSmr.shaderData.getTexture("renderer_JointSampler") ?? null).eq(null);
    expect(jointTexture.refCount).eq(1);

    // With no stray reference, the source's one-shot destroy() in _onDestroy succeeds (refCount is zero).
    entity.destroy();
    expect(jointTexture.refCount).eq(0);

    clone.destroy();
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

  it("camera renderTarget refCount stays balanced across clone/destroy", () => {
    const rt = new RenderTarget(engine, 4, 4, new Texture2D(engine, 4, 4));
    const entity = rootEntity.createChild("cameraSrc");
    entity.addComponent(Camera).renderTarget = rt;
    expect(rt.refCount).eq(1);

    const clone = entity.clone();
    rootEntity.addChild(clone);
    // The clone holds exactly one additional reference (acquired by the clone gate on the shared `_renderTarget` slot).
    expect(rt.refCount).eq(2);

    clone.destroy();
    expect(rt.refCount).eq(1);

    entity.destroy();
    expect(rt.refCount).eq(0);
  });

  it("text renderer font refCount stays balanced across clone/destroy", () => {
    const font = Font.createFromOS(engine, "Arial-CloneTest");
    const entity = rootEntity.createChild("textSrc");
    entity.addComponent(TextRenderer).font = font;
    const baseline = font.refCount;

    const clone = entity.clone();
    rootEntity.addChild(clone);
    // The clone holds exactly one additional reference (acquired by the clone gate on the shared `_font` slot).
    expect(font.refCount).eq(baseline + 1);

    clone.destroy();
    expect(font.refCount).eq(baseline);

    entity.destroy();
  });

  it("animator controller refCount stays balanced across clone/destroy", () => {
    const controller = new AnimatorController(engine);
    const entity = rootEntity.createChild("animatorSrc");
    entity.addComponent(Animator).animatorController = controller;
    const baseline = controller.refCount;

    const clone = entity.clone();
    rootEntity.addChild(clone);
    // The clone holds one additional reference (clone gate on the shared `_animatorController` slot; _cloneTo only re-registers the change flag).
    expect(controller.refCount).eq(baseline + 1);

    clone.destroy();
    expect(controller.refCount).eq(baseline);

    entity.destroy();
  });
});
