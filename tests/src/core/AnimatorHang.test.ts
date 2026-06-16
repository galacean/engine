import { Animator, Camera } from "@galacean/engine-core";
import "@galacean/engine-loader";
import type { GLTFResource } from "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { glbResource } from "./model/fox";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Animator GLTF load hang regression on 1024x1024 canvas", function () {
  let animator: Animator;
  let engine: WebGLEngine;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    rootEntity.addComponent(Camera);
    const resource = await engine.resourceManager.load<GLTFResource>(glbResource);
    const defaultSceneRoot = resource.defaultSceneRoot;
    rootEntity.addChild(defaultSceneRoot);
    animator = defaultSceneRoot.getComponent(Animator);
  });

  afterAll(function () {
    engine?.destroy();
  });

  it("loaded", () => {
    expect(animator).not.eq(null);
  });
});
