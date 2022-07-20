import { LitePhysics } from "@oasis-engine/physics-lite";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { Ray, Vector3 } from "@oasis-engine/math";
import { BoxColliderShape, Layer, StaticCollider } from "@oasis-engine/core";
import { expect } from "chai";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("physics manager test", () => {
  it("constructor", () => {
    const engine = new WebGLEngine(canvasDOM);
    engine.physicsManager.initialize(LitePhysics);

    expect(engine.physicsManager.gravity.y).to.eq(-9.81);
    expect(engine.physicsManager.maxSumTimeStep).to.eq(1 / 3);
    expect(engine.physicsManager.fixedTimeStep).to.eq(1 / 60);
  });

  it("raycast", () => {
    const engine = new WebGLEngine(canvasDOM);
    engine.physicsManager.initialize(LitePhysics);

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    const collider = rootEntity.addComponent(StaticCollider);
    const box = new BoxColliderShape();
    collider.addShape(box);
    let ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, 1, 0));
    expect(engine.physicsManager.raycast(ray)).to.eq(false);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

    ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1, -1));
    expect(engine.physicsManager.raycast(ray)).to.eq(true);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(true);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(true);

    collider.removeShape(box);
    expect(engine.physicsManager.raycast(ray)).to.eq(false);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
    expect(engine.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);
  });
});
