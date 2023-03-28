import { BoxColliderShape, Layer, StaticCollider } from "@oasis-engine/core";
import { Ray, Vector3 } from "@oasis-engine/math";
import { LitePhysics } from "@oasis-engine/physics-lite";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

describe("physics manager test", () => {
  let engine: WebGLEngine;
  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new LitePhysics() });
  });

  it("constructor", async () => {
    expect(engine.physicsManager.gravity.y).to.eq(-9.81);
    expect(engine.physicsManager.fixedTimeStep).to.eq(1 / 60);
  });

  it("raycast", async () => {
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
