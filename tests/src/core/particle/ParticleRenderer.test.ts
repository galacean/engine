import {
  BoxShape,
  Camera,
  Engine,
  ModelMesh,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  ParticleStopMode,
  PrimitiveMesh,
  Scene,
  ShaderMacro
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

function updateEngine(engine: Engine, frames: number, deltaTime = 100) {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < frames; i++) {
    engine.update();
  }
}

describe("ParticleRenderer", () => {
  let engine: WebGLEngine;
  let scene: Scene;

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });

    scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);

    engine.run();
  });

  it("ParticleRenderer lengthScale", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.lengthScale = 1;
    expect(renderer.lengthScale).to.eq(1);
    renderer.lengthScale = -0.333333;
    expect(renderer.lengthScale).to.eq(-0.333333);
    renderer.lengthScale = 0;
    expect(renderer.lengthScale).to.eq(0);
  });

  it("ParticleRenderer velocityScale", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.velocityScale = 1.333393;
    expect(renderer.velocityScale).to.eq(1.333393);
    renderer.velocityScale = -0.333333;
    expect(renderer.velocityScale).to.eq(-0.333333);
    renderer.velocityScale = 0;
    expect(renderer.velocityScale).to.eq(0);
  });

  it("pauses simulation while culled and resumes without catch-up", () => {
    const entity = scene.createRootEntity("CulledParticle");
    entity.transform.setPosition(100000, 0, 0);
    const generator = entity.addComponent(ParticleRenderer).generator;
    generator.useAutoRandomSeed = false;
    generator.main.isLoop = true;
    generator.main.startLifetime.constant = 10;
    generator.emission.rateOverTime.constant = 10;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);

    updateEngine(engine, 3);
    const culledPlayTime = generator._playTime;
    expect(culledPlayTime).to.be.closeTo(0.1, 1e-6);

    updateEngine(engine, 3);
    expect(generator._playTime).to.equal(culledPlayTime);

    entity.transform.setPosition(0, 0, 0);
    updateEngine(engine, 1);
    expect(generator._playTime).to.equal(culledPlayTime);

    updateEngine(engine, 1);
    expect(generator._playTime).to.be.closeTo(culledPlayTime + 0.1, 1e-6);

    entity.destroy();
  });

  it("updates generator and renderer shader data for active particles", () => {
    const entity = scene.createRootEntity("FeedbackParticle");
    const renderer = entity.addComponent(ParticleRenderer);
    const generator = renderer.generator;
    renderer.lengthScale = 3;
    renderer.velocityScale = 4;
    renderer.pivot.set(1, 2, 3);
    generator.noise.enabled = true;
    generator.main.startLifetime.constant = 10;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.emit(1);

    updateEngine(engine, 1);

    const shaderData = renderer.shaderData;
    expect(shaderData.getFloat("renderer_CurrentTime")).to.equal(generator._playTime);
    expect(shaderData.getFloat("renderer_StretchedBillboardLengthScale")).to.equal(3);
    expect(shaderData.getFloat("renderer_StretchedBillboardSpeedScale")).to.equal(4);
    expect(shaderData.getVector3("renderer_PivotOffset")).to.deep.equal(renderer.pivot);
    entity.destroy();
  });

  it("ParticleRenderer renderMode", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.None;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.None);
    renderer.renderMode = ParticleRenderMode.Billboard;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.Billboard);
    renderer.renderMode = ParticleRenderMode.StretchBillboard;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.StretchBillboard);
    renderer.renderMode = ParticleRenderMode.HorizontalBillboard;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.HorizontalBillboard);
    renderer.renderMode = ParticleRenderMode.Mesh;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.Mesh);
    expect(() => {
      renderer.renderMode = ParticleRenderMode.VerticalBillboard;
    }).to.throw("Not implemented");
  });

  it("refCount", () => {
    const renderer1 = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    const mesh = new ModelMesh(engine, "mesh");
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.mesh = null;
    expect(mesh.refCount).to.eq(0);
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.mesh = undefined;
    expect(mesh.refCount).to.eq(0);
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.destroy();
    expect(mesh.refCount).to.eq(0);

    const entity2 = scene.createRootEntity("entity2");
    entity2.addComponent(ParticleRenderer).mesh = mesh;
    entity2.destroy();
    expect(mesh.refCount).to.eq(0);

    const renderer2 = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer2.mesh = mesh;

    mesh.destroy();
    expect(mesh.refCount).to.eq(1);

    mesh.destroy(true);
    expect(mesh.refCount).to.eq(0);
  });

  it("clone with mesh render mode", () => {
    const entity = scene.createRootEntity("CloneSource");
    const renderer = entity.addComponent(ParticleRenderer);
    const mesh = PrimitiveMesh.createCuboid(engine);
    renderer.renderMode = ParticleRenderMode.Mesh;
    renderer.mesh = mesh;
    expect(mesh.refCount).to.eq(1);

    const cloneEntity = entity.clone();
    scene.addRootEntity(cloneEntity);
    const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);
    expect(cloneRenderer.renderMode).to.eq(ParticleRenderMode.Mesh);
    expect(cloneRenderer.mesh).to.eq(mesh);
    expect(mesh.refCount).to.eq(2);

    // Each renderer holds its own reference, destroying one should not release the other's
    cloneEntity.destroy();
    expect(mesh.refCount).to.eq(1);
    entity.destroy();
    expect(mesh.refCount).to.eq(0);
  });

  it("clone applies render mode macro and mesh layout together", () => {
    const meshMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");
    const billboardMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");

    // Mesh mode + noise triggers buffer reorganization mid-clone, before mesh is applied
    const entity = scene.createRootEntity("CloneMacroSource");
    const renderer = entity.addComponent(ParticleRenderer);
    const mesh = PrimitiveMesh.createCuboid(engine);
    renderer.renderMode = ParticleRenderMode.Mesh;
    renderer.mesh = mesh;
    renderer.generator.noise.enabled = true;

    let cloneEntity: typeof entity;
    expect(() => {
      cloneEntity = entity.clone();
      scene.addRootEntity(cloneEntity);
    }).not.to.throw();

    const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);
    expect(cloneRenderer.renderMode).to.eq(ParticleRenderMode.Mesh);
    expect(cloneRenderer.mesh).to.eq(mesh);
    expect(mesh.refCount).to.eq(2);
    // Shader macro must match renderMode, not stay on the constructor's billboard default
    const macroCollection = cloneRenderer.shaderData["_macroCollection"];
    expect(macroCollection.isEnable(meshMacro)).to.eq(true);
    expect(macroCollection.isEnable(billboardMacro)).to.eq(false);

    cloneEntity.destroy();
    entity.destroy();
    expect(mesh.refCount).to.eq(0);
  });

  it("clone with mesh render mode but no mesh", () => {
    const entity = scene.createRootEntity("CloneSourceNoMesh");
    const renderer = entity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.Mesh;

    expect(() => {
      const cloneEntity = entity.clone();
      const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);
      expect(cloneRenderer.renderMode).to.eq(ParticleRenderMode.Mesh);
      expect(cloneRenderer.mesh).to.be.undefined;
      cloneEntity.destroy();
    }).not.to.throw();

    entity.destroy();
  });

  it("reorganize geometry buffers with mesh render mode but no mesh", () => {
    const entity = scene.createRootEntity("NoMeshReorganize");
    const renderer = entity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.Mesh;

    // Toggling noise module triggers buffer reorganization, which must tolerate a null mesh
    expect(() => {
      renderer.generator.noise.enabled = true;
      renderer.generator.noise.enabled = false;
    }).not.to.throw();

    entity.destroy();
  });

  it("clone a grown particle system keeps capacity consistent", () => {
    const entity = scene.createRootEntity("GrownSource");
    const renderer = entity.addComponent(ParticleRenderer);
    const generator = renderer.generator;
    generator.main.maxParticles = 1000;
    generator.main.startLifetime.constant = 100;
    generator.emission.rateOverTime.constant = 500;
    generator.play();

    // Drive the simulation so the instance buffer grows well past its initial capacity
    updateEngine(engine, 30, 100);
    const sourceCount = generator["_currentParticleCount"];
    expect(sourceCount).to.be.greaterThan(128);

    const cloneEntity = entity.clone();
    scene.addRootEntity(cloneEntity);
    const cloneGenerator = cloneEntity.getComponent(ParticleRenderer).generator;

    // The clone starts with a freshly built buffer; it must not inherit the source's grown count,
    // otherwise the capacity and the actual buffer length disagree and emitting overflows
    expect(cloneGenerator["_currentParticleCount"]).to.be.lessThan(sourceCount);

    // The clone can play and grow on its own without crashing on the stale capacity
    expect(() => {
      cloneGenerator.play();
      updateEngine(engine, 30, 100);
    }).not.to.throw();

    cloneEntity.destroy();
    entity.destroy();
  });

  it("clone preserves generator module config", () => {
    const entity = scene.createRootEntity("ConfigSource");
    const generator = entity.addComponent(ParticleRenderer).generator;

    // Spread config across several @deepClone modules and value kinds (scalar / bool / enum / curve / module enabled)
    generator.main.duration = 7.5;
    generator.main.isLoop = false;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    generator.main.startLifetime.constant = 3;
    generator.emission.rateOverTime.constant = 42;
    generator.noise.enabled = true;
    generator.noise.frequency = 1.5;

    const cloneEntity = entity.clone();
    const cloneGenerator = cloneEntity.getComponent(ParticleRenderer).generator;

    expect(cloneGenerator.main.duration).to.eq(7.5);
    expect(cloneGenerator.main.isLoop).to.eq(false);
    expect(cloneGenerator.main.simulationSpace).to.eq(ParticleSimulationSpace.World);
    expect(cloneGenerator.main.startLifetime.constant).to.eq(3);
    expect(cloneGenerator.emission.rateOverTime.constant).to.eq(42);
    expect(cloneGenerator.noise.enabled).to.eq(true);
    expect(cloneGenerator.noise.frequency).to.eq(1.5);

    // Cloned config curves must be independent instances, not shared with the source
    expect(cloneGenerator.main.startLifetime).to.not.eq(generator.main.startLifetime);

    cloneEntity.destroy();
    entity.destroy();
  });

  it("clone keeps emission shape macro in sync", () => {
    const emissionShapeMacro = ShaderMacro.getByName("RENDERER_EMISSION_SHAPE");

    const entity = scene.createRootEntity("EmissionShapeSource");
    const renderer = entity.addComponent(ParticleRenderer);
    renderer.generator.emission.shape = new BoxShape();
    renderer.generator.emission.rateOverTime.constant = 100;
    renderer.generator.play();

    const cloneEntity = entity.clone();
    scene.addRootEntity(cloneEntity);
    const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);

    // Shape value is deep cloned into an independent instance
    expect(cloneRenderer.generator.emission.shape).to.not.eq(renderer.generator.emission.shape);
    expect(cloneRenderer.generator.emission.shape).to.be.instanceOf(BoxShape);

    // The macro is derived every frame from `enabled && shape`, so after a frame the clone's
    // shaderData carries the emission shape macro instead of staying on the constructor default
    updateEngine(engine, 2, 100);
    expect(cloneRenderer.shaderData["_macroCollection"].isEnable(emissionShapeMacro)).to.eq(true);

    cloneEntity.destroy();
    entity.destroy();
  });
});
