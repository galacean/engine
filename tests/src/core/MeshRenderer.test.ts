import { BlinnPhongMaterial, MeshRenderer, PrimitiveMesh, Entity, Camera, ModelMesh } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeAll, expect, it } from "vitest";

describe("MeshRenderer", async function () {
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let cubeEntity: Entity;
  let cubeMesh: ModelMesh;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;

    rootEntity = scene.createRootEntity();
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    cameraEntity.addComponent(Camera);

    // create a cube entity and add a mesh renderer component.
    cubeEntity = rootEntity.createChild("Cube");
    cubeEntity.addComponent(MeshRenderer);

    engine.canvas.resizeByClientSize();
    engine.run();
  });

  it("mesh", () => {
    // Test set mesh and get mesh work correctly.
    const mr = cubeEntity.getComponent(MeshRenderer);
    const cubeMesh2 = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    mr.mesh = cubeMesh2;
    expect(mr.mesh).to.be.equal(cubeMesh2);
    expect(cubeMesh2.refCount).to.be.equal(1);

    // Test that repeated assignment does not increase the reference count.
    mr.mesh = cubeMesh2;
    expect(cubeMesh2.refCount).to.be.equal(1);

    cubeMesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    mr.mesh = cubeMesh;
    expect(mr.mesh).to.equal(cubeMesh);
    expect(cubeMesh2.refCount).to.be.equal(0);

    mr.mesh = null;
  });

  it("enableVertexColor", () => {
    // Test set and get enableVertexColor work correctly.
    const mr = cubeEntity.getComponent(MeshRenderer);
    mr.enableVertexColor = true;
    expect(mr.enableVertexColor).to.be.true;

    // Test that repeated assignment works correctly.
    mr.enableVertexColor = true;
    expect(mr.enableVertexColor).to.be.true;

    // Test that set false value works correctly.
    mr.enableVertexColor = false;
    expect(mr.enableVertexColor).to.be.equal(false);
  });

  it("bounds", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);
    expect(mr.bounds.min).to.deep.include({ x: 0, y: 0, z: 0 });
    expect(mr.bounds.max).to.deep.include({ x: 0, y: 0, z: 0 });

    mr.mesh = cubeMesh;
    expect(mr.bounds.min).to.deep.include({ x: -1, y: -1, z: -1 });
    expect(mr.bounds.max).to.deep.include({ x: 1, y: 1, z: 1 });

    cubeEntity.transform.translate(1.5, 1.5, 1.5);
    expect(mr.bounds.min.x).to.closeTo(0.5, 0.01, "test bounds min x equal 0.5, delta 0.01");
    expect(mr.bounds.min.y).to.closeTo(0.5, 0.01, "test bounds min y equal 0.5, delta 0.01");
    expect(mr.bounds.min.z).to.closeTo(0.5, 0.01, "test bounds min z equal 0.5, delta 0.01");
    expect(mr.bounds.max.x).to.closeTo(2.5, 0.01, "test bounds max x equal 2.5, delta 0.01");
    expect(mr.bounds.max.y).to.closeTo(2.5, 0.01, "test bounds max y equal 2.5, delta 0.01");
    expect(mr.bounds.max.z).to.closeTo(2.5, 0.01, "test bounds max z equal 2.5, delta 0.01");

    cubeEntity.transform.rotate(new Vector3(0, 30, 0));
    expect(mr.bounds.min.x).to.closeTo(0.134, 0.001, "test bounds min x equal 0.134, delta 0.001");
    expect(mr.bounds.min.y).to.closeTo(0.5, 0.01, "test bounds min y equal 0.5, delta 0.001");
    expect(mr.bounds.min.z).to.closeTo(0.134, 0.001, "test bounds min z equal 0.134, delta 0.001");
    expect(mr.bounds.max.x).to.closeTo(2.866, 0.001, "test bounds max x equal 2.866, delta 0.001");
    expect(mr.bounds.max.y).to.closeTo(2.5, 0.001, "test bounds max y equal 2.5, delta 0.001");
    expect(mr.bounds.max.z).to.closeTo(2.866, 0.001, "test bounds max z equal 2.866, delta 0.001");

    cubeEntity.transform.setScale(3, 3, 3);
    expect(mr.bounds.min.x).to.closeTo(-2.598, 0.01, "test bounds min x equal -2.598, delta 0.01");
    expect(mr.bounds.min.y).to.closeTo(-1.5, 0.01, "test bounds min y equal -1.5, delta 0.01");
    expect(mr.bounds.min.z).to.closeTo(-2.598, 0.01, "test bounds min z equal -2.598, delta 0.01");
    expect(mr.bounds.max.x).to.closeTo(5.598, 0.01, "test bounds max x equal 5.598, delta 0.01");
    expect(mr.bounds.max.y).to.closeTo(4.5, 0.01, "test bounds max y equal 4.5, delta 0.01");
    expect(mr.bounds.max.z).to.closeTo(5.598, 0.01, "test bounds max z equal 5.598, delta 0.01");
  });

  it("clone", () => {
    // Test that clone works correctly.
    const cloneCube = cubeEntity.clone();
    const mr = cloneCube.getComponent(MeshRenderer);
    expect(mr.mesh).to.be.equal(cubeEntity.getComponent(MeshRenderer).mesh);

    // Test that mesh reference count is increased by 1 after clone.
    expect(cubeMesh.refCount).to.be.equal(2);

    cloneCube.destroy();
  });

  it("destroy", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);
    cubeEntity.destroy();

    // Test that the mesh reference count is reduced by 1 after the entity is destroyed.
    expect(cubeMesh.refCount).to.be.equal(0);
    expect(mr.mesh).to.be.null;
    expect(mr.destroyed).to.be.true;
  });
});
