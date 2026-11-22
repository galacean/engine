import {
  BlinnPhongMaterial,
  PBRMaterial,
  UnlitMaterial,
  MeshRenderer,
  PrimitiveMesh,
  Entity,
  Camera,
  DirectLight,
  Layer,
  ModelMesh,
  PipelineStage,
  RenderQueue,
  ShaderLanguage,
  ShaderPass,
  ShadowCascadesMode,
  ShadowType
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
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

  it("keeps empty material slots when creating instance materials", () => {
    const renderer = rootEntity.createChild().addComponent(MeshRenderer);
    const material = new BlinnPhongMaterial(engine);
    renderer.setMaterials([null, material]);

    const instances = renderer.getInstanceMaterials();
    expect(instances[0]).toBeNull();
    expect(instances[1]).not.toBe(material);
    expect(renderer.getInstanceMaterials()[1]).toBe(instances[1]);
    expect(material.refCount).toBe(0);

    renderer.setMaterial(1, null);
    expect(renderer.getMaterial(1)).toBeNull();
    renderer.entity.destroy();
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

  it("receiveShadows", () => {
    // Test that set and get receiveShadows work correctly.
    const mr = cubeEntity.getComponent(MeshRenderer);
    mr.receiveShadows = true;
    expect(mr.receiveShadows).to.be.true;

    // Test that set false value works correctly.
    mr.receiveShadows = false;
    expect(mr.receiveShadows).to.be.false;

    // Test that repeated assignment works correctly.
    mr.receiveShadows = true;
    expect(mr.receiveShadows).to.be.true;
  });

  it("material", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);

    // Add BlinnPhong, Unlit and PBR materials.
    mr.setMaterial(0, new BlinnPhongMaterial(engine));
    mr.setMaterial(0, new UnlitMaterial(engine));
    mr.setMaterial(1, new PBRMaterial(engine));

    // Test that get material works correctly.
    expect(mr.getMaterial()).to.be.instanceOf(UnlitMaterial);
    expect(mr.getMaterial(1)).to.be.instanceOf(PBRMaterial);

    // Test that return null when index is out of range.
    expect(mr.getMaterial(2)).to.be.null;
    expect(mr.getMaterial(-1)).to.be.null;

    mr.getInstanceMaterials();
    mr.setMaterial(1, new UnlitMaterial(engine));
    expect(mr.getMaterial(1)).to.be.instanceOf(UnlitMaterial);
  });

  it("materials", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);

    // Test that set materials works correctly.
    mr.setMaterials([new UnlitMaterial(engine), new PBRMaterial(engine), null, new BlinnPhongMaterial(engine)]);

    // Test that get materials works correctly.
    const materials = mr.getMaterials();
    expect(materials[0]).to.be.instanceOf(UnlitMaterial);
    expect(materials[1]).to.be.instanceOf(PBRMaterial);
    expect(materials[2]).to.be.null;
    expect(materials[3]).to.be.instanceOf(BlinnPhongMaterial);
  });

  it("materialCount", () => {
    // Test that get materialCount works correctly.
    const mr = cubeEntity.getComponent(MeshRenderer);
    mr.setMaterials([new UnlitMaterial(engine), new PBRMaterial(engine), new BlinnPhongMaterial(engine)]);
    mr.getInstanceMaterials();
    expect(mr.materialCount).to.be.equal(3);

    // Test that set materialCount works correctly.
    mr.materialCount = 2;
    expect(mr.materialCount).to.be.equal(2);

    // Test that set materialCount with negative value works correctly.
    mr.materialCount = 0;
    expect(mr.materialCount).to.be.equal(0);
  });

  it("getInstanceMaterial", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);

    // Test that getInstanceMaterial works correctly.
    expect(mr.getInstanceMaterial()).to.be.null;

    const unlitMaterial = new UnlitMaterial(engine);
    const pbrMaterial = new PBRMaterial(engine);
    mr.setMaterials([unlitMaterial, null, pbrMaterial]);

    // Test that getInstanceMaterial works correctly.
    const material = mr.getInstanceMaterial();
    expect(material).to.be.instanceOf(UnlitMaterial);
    expect(material.name).to.be.equal("Unlit(Instance)");

    // Test that material0 is same as material.
    const material0 = mr.getInstanceMaterial(0);
    expect(material0).to.be.eq(material);

    const material2 = mr.getInstanceMaterial(2);
    expect(material2).to.be.instanceOf(PBRMaterial);
    expect(material2.name).to.be.equal("PBR(Instance)");

    expect(mr.getInstanceMaterial(1)).to.be.null;

    // Test that return null when index is out of range.
    expect(mr.getInstanceMaterial(3)).to.be.null;
    expect(mr.getInstanceMaterial(-1)).to.be.null;
  });

  it("getInstanceMaterials", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);
    mr.setMaterials([new UnlitMaterial(engine), new PBRMaterial(engine)]);

    // Test that getInstanceMaterials works correctly.
    const materials = mr.getInstanceMaterials();
    expect(materials[0]).to.be.instanceOf(UnlitMaterial);
    expect(materials[0].name).to.be.equal("Unlit(Instance)");
    expect(materials[1]).to.be.instanceOf(PBRMaterial);
    expect(materials[1].name).to.be.equal("PBR(Instance)");
  });

  it("priority", () => {
    const mr = cubeEntity.getComponent(MeshRenderer);

    // Test that set and get priority works correctly.
    expect(mr.priority).to.be.equal(0);

    mr.priority = 1;
    expect(mr.priority).to.be.equal(1);

    // Test that repeated assignment works correctly.
    mr.priority = 1;
    expect(mr.priority).to.be.equal(1);

    // Test that set negative value works correctly.
    mr.priority = -1;
    expect(mr.priority).to.be.equal(-1);
  });

  it("batches and splits opaque MeshRenderers by _isFrontFaceInvert on WebGL2", () => {
    const scene = engine.sceneManager.activeScene;
    const testRoot = scene.createRootEntity("batch-ffi-root");
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);

    const camEntity = testRoot.createChild("batch-ffi-camera");
    camEntity.transform.setPosition(0, 0, 10);
    camEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = camEntity.addComponent(Camera);
    camera.enabled = false;
    camera.cullingMask = Layer.Layer10;

    const parentA = testRoot.createChild("parent-a");
    parentA.transform.setScale(-1, 2, 1);
    const entityA = parentA.createChild("mesh-a");
    entityA.layer = Layer.Layer10;
    entityA.transform.setRotation(0, 0, 45);
    const mrA = entityA.addComponent(MeshRenderer);
    mrA.mesh = mesh;
    mrA.setMaterial(material);

    const parentB = testRoot.createChild("parent-b");
    const entityB = parentB.createChild("mesh-b");
    entityB.layer = Layer.Layer10;
    const mrB = entityB.addComponent(MeshRenderer);
    mrB.mesh = mesh;
    mrB.setMaterial(material);

    engine.pause();
    try {
      // Opposite front-face inversion (true vs false) must not batch
      camera.render();
      // @ts-ignore
      const opaqueQueue = camera._renderPipeline._cullingResults.opaqueQueue;
      expect(opaqueQueue.batchedElements.length).to.equal(2);
      expect(opaqueQueue.batchedElements[0].instancedRenderers.length).to.equal(0);
      expect(opaqueQueue.batchedElements[1].instancedRenderers.length).to.equal(0);

      // Matching front-face inversion (both true) must batch into one instanced draw
      parentB.transform.setScale(-1, 1, 1);
      camera.render();
      expect(opaqueQueue.batchedElements.length).to.equal(1);
      expect(opaqueQueue.batchedElements[0].instancedRenderers.length).to.equal(2);

      // Restoring parentA to positive scale flips mrA back to false and splits again
      parentA.transform.setScale(1, 2, 1);
      camera.render();
      expect(opaqueQueue.batchedElements.length).to.equal(2);
    } finally {
      testRoot.destroy();
      engine.resume();
    }
  });

  it("skips eager distanceForSort for opaque elements while sorting transparent elements", () => {
    const scene = engine.sceneManager.activeScene;
    const testRoot = scene.createRootEntity("lazy-sort-root");
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    const camEntity = testRoot.createChild("lazy-sort-camera");
    camEntity.transform.setPosition(0, 0, 10);
    camEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = camEntity.addComponent(Camera);
    camera.enabled = false;
    camera.cullingMask = Layer.Layer11;

    const opaqueMat = new UnlitMaterial(engine);
    const opaqueEntity = testRoot.createChild("opaque");
    opaqueEntity.layer = Layer.Layer11;
    const opaqueMr = opaqueEntity.addComponent(MeshRenderer);
    opaqueMr.mesh = mesh;
    opaqueMr.setMaterial(opaqueMat);

    const transMatA = new UnlitMaterial(engine);
    transMatA.isTransparent = true;
    const transMatB = new UnlitMaterial(engine);
    transMatB.isTransparent = true;

    const nearEntity = testRoot.createChild("near");
    nearEntity.layer = Layer.Layer11;
    nearEntity.transform.setPosition(0, 0, 5); // closer to camera at z=10
    const nearMr = nearEntity.addComponent(MeshRenderer);
    nearMr.mesh = mesh;
    nearMr.setMaterial(transMatA);

    const farEntity = testRoot.createChild("far");
    farEntity.layer = Layer.Layer11;
    farEntity.transform.setPosition(0, 0, -5); // farther from camera at z=10
    const farMr = farEntity.addComponent(MeshRenderer);
    farMr.mesh = mesh;
    farMr.setMaterial(transMatB);

    engine.pause();
    try {
      camera.render();
      // @ts-ignore
      const culling = camera._renderPipeline._cullingResults;
      expect(Number.isNaN(culling.opaqueQueue.batchedElements[0].distanceForSort)).to.be.true;
      // Transparent queue sorts descending (farther object drawn first, nearer object drawn last)
      expect(culling.transparentQueue.batchedElements.map((e) => e.component)).to.deep.equal([farMr, nearMr]);
      expect(culling.transparentQueue.batchedElements[0].distanceForSort).to.be.greaterThan(
        culling.transparentQueue.batchedElements[1].distanceForSort
      );

      // Orthographic camera also sorts transparent elements back-to-front lazily
      camera.isOrthographic = true;
      camera.render();
      expect(culling.transparentQueue.batchedElements.map((e) => e.component)).to.deep.equal([farMr, nearMr]);
    } finally {
      testRoot.destroy();
      engine.resume();
    }
  });

  it("syncs ShaderPass _pipelineStage and isolates ShadowCaster passes during shadow rendering", () => {
    const pass = new ShaderPass("Custom", [], [], ShaderLanguage.GLSLES100, { pipelineStage: PipelineStage.ShadowCaster });
    expect(pass._pipelineStage).to.equal(PipelineStage.ShadowCaster);
    pass.setTag("pipelineStage", PipelineStage.Forward);
    expect(pass._pipelineStage).to.equal(PipelineStage.Forward);
    pass.deleteTag("pipelineStage");
    expect(pass._pipelineStage).to.be.undefined;

    const scene = engine.sceneManager.activeScene;
    const prevCastShadows = scene.castShadows;
    const prevCascades = scene.shadowCascades;
    const prevShadowDistance = scene.shadowDistance;
    const testRoot = scene.createRootEntity("shadow-stage-root");
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    const camEntity = testRoot.createChild("shadow-stage-camera");
    camEntity.transform.setPosition(0, 0, 10);
    camEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = camEntity.addComponent(Camera);
    camera.enabled = false;
    camera.cullingMask = Layer.Layer12;

    const lightEntity = testRoot.createChild("shadow-stage-light");
    lightEntity.transform.setRotation(-45, 0, 0);
    const light = lightEntity.addComponent(DirectLight);
    light.cullingMask = Layer.Layer12;
    light.shadowType = ShadowType.Hard;

    const transPbrMat = new PBRMaterial(engine);
    transPbrMat.isTransparent = true;

    const casterEntity = testRoot.createChild("transparent-pbr-caster");
    casterEntity.layer = Layer.Layer12;
    const casterMr = casterEntity.addComponent(MeshRenderer);
    casterMr.mesh = mesh;
    casterMr.setMaterial(transPbrMat);
    casterMr.castShadows = true;

    const origRender = RenderQueue.prototype.render;
    let shadowTransparentLength = -1;
    let shadowAlphaTestLength = -1;
    RenderQueue.prototype.render = function (context, stage, ...rest) {
      if (stage === PipelineStage.ShadowCaster) {
        // @ts-ignore
        shadowTransparentLength = context.camera._renderPipeline._cullingResults.transparentQueue.elements.length;
        // @ts-ignore
        shadowAlphaTestLength = context.camera._renderPipeline._cullingResults.alphaTestQueue.elements.length;
      }
      return origRender.call(this, context, stage, ...rest);
    };

    engine.pause();
    try {
      scene.castShadows = true;
      scene.shadowCascades = ShadowCascadesMode.NoCascades;
      scene.shadowDistance = 50;
      // @ts-ignore
      scene._updateRendering(0);
      camera.render();
      expect(shadowAlphaTestLength).to.equal(1);
      expect(shadowTransparentLength).to.equal(0);
    } finally {
      RenderQueue.prototype.render = origRender;
      scene.castShadows = prevCastShadows;
      scene.shadowCascades = prevCascades;
      scene.shadowDistance = prevShadowDistance;
      testRoot.destroy();
      engine.resume();
    }
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
