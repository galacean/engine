import { BlendShape, Entity, ModelMesh, Skin, SkinnedMeshRenderer } from "@galacean/engine-core";
import { BoundingBox, Matrix, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, expect, it } from "vitest";

describe("SkinnedMeshRenderer", async () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    rootEntity = scene.createRootEntity();

    engine.run();
  });

  it("blend shape weight", () => {
    const modelMesh = new ModelMesh(engine);
    const blendShape = new BlendShape("BlendShape");
    modelMesh.addBlendShape(blendShape);
    modelMesh.addBlendShape(blendShape);
    modelMesh.addBlendShape(blendShape);
    modelMesh.addBlendShape(blendShape);

    const entity = rootEntity.createChild("WeigthEntity");
    const skinnedMR = entity.addComponent(SkinnedMeshRenderer);
    skinnedMR.mesh = modelMesh;

    // Test that default weight is 0.
    expect(skinnedMR.blendShapeWeights.length).to.be.equal(4);
    expect(skinnedMR.blendShapeWeights).to.be.deep.equal(new Float32Array([0, 0, 0, 0]));

    skinnedMR.blendShapeWeights = new Float32Array([2, 2, 1, 1]);
    expect(skinnedMR.blendShapeWeights.length).to.be.equal(4);
    expect(skinnedMR.blendShapeWeights).to.be.deep.equal(new Float32Array([2, 2, 1, 1]));

    const blendShape2 = new BlendShape("BlendShape2");
    blendShape2.addFrame(0.9, [new Vector3(1, 0, 1), new Vector3(2, 1, 2), new Vector3(3, -1, 3)]);
    modelMesh.addBlendShape(blendShape2);
    expect(skinnedMR.blendShapeWeights.length).to.be.equal(5);
    expect(skinnedMR.blendShapeWeights).to.be.deep.equal(new Float32Array([2, 2, 1, 1, 0]));

    modelMesh.clearBlendShapes();
    modelMesh.addBlendShape(blendShape);
    expect(skinnedMR.blendShapeWeights.length).to.be.equal(1);
    expect(skinnedMR.blendShapeWeights).to.be.deep.equal(new Float32Array([2]));

    // Test that the weight is set correctly.
    skinnedMR.blendShapeWeights = new Float32Array([0.4, 1, 0.5, 0.7, 0.8, 0.2]);
    expect(skinnedMR.blendShapeWeights.length).to.be.equal(1);
    expect(skinnedMR.blendShapeWeights).to.be.deep.equal(new Float32Array([0.4]));
  });

  it("localBounds", () => {
    // Test that the localBounds is set correctly.
    const entity = rootEntity.createChild("LocalBoundsEntity");
    const skinnedMR = entity.addComponent(SkinnedMeshRenderer);

    skinnedMR.localBounds = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    expect(skinnedMR.localBounds.min).to.be.deep.include({ x: -1, y: -1, z: -1 });
    expect(skinnedMR.localBounds.max).to.be.deep.include({ x: 1, y: 1, z: 1 });
  });

  it("skin and rootBone", () => {
    const skin = new Skin("TestSkin");
    skin.skeleton = "RootBone";
    skin.joints = ["Joint0", "Joint1", "Joint2"];
    skin.inverseBindMatrices = [
      new Matrix(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0).invert(),
      new Matrix(1, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0).invert(),
      new Matrix(1, 0, 0, -1, 0, 0, 0, -1, 0, 0, -2, -1).invert()
    ];

    const position = new Vector3();
    const modelMesh = new ModelMesh(engine);
    const entity = rootEntity.createChild("SkinEntity");
    entity.transform.position = position;
    const rootBone = entity.createChild("RootBone");
    rootBone.createChild("Joint0");
    rootBone.createChild("Joint1");
    rootBone.createChild("Joint3");
    rootBone.createChild("Joint4");
    const skinnedMR = entity.addComponent(SkinnedMeshRenderer);
    skinnedMR.mesh = modelMesh;

    skinnedMR.skin = skin;
    engine.update();
    expect(skinnedMR.bounds.min).to.deep.eq(position);
    expect(skinnedMR.bounds.max).to.deep.eq(position);

    // Test that the skin is set correctly.
    expect(skinnedMR.skin).to.be.equal(skin);

    const rootBone0 = entity.createChild("RootBone0");
    skinnedMR.rootBone = rootBone0;
    engine.update();

    // Test that the rootBone is set correctly.
    expect(skinnedMR.rootBone).to.be.equal(rootBone0);

    position.set(1, 0, 0);
    rootBone0.transform.position = position;
    expect(skinnedMR.bounds.min).to.deep.eq(position);
    expect(skinnedMR.bounds.max).to.deep.eq(position);
  });

  it("clone", () => {
    // @ts-ignore
    const modelMesh = new ModelMesh(engine);

    const positions = [new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)];
    modelMesh.setPositions(positions);

    const deltaPositions = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];
    const blendShape = new BlendShape("BlendShape");
    blendShape.addFrame(1.0, deltaPositions);
    modelMesh.addBlendShape(blendShape);

    const entity = rootEntity.createChild();
    const skinnedMeshRenderer = entity.addComponent(SkinnedMeshRenderer);
    skinnedMeshRenderer.mesh = modelMesh;

    const cloneEntity = entity.clone();
    skinnedMeshRenderer.blendShapeWeights[0] = 0.6;

    expect(cloneEntity.getComponent(SkinnedMeshRenderer).blendShapeWeights).to.be.not.deep.equal(
      skinnedMeshRenderer.blendShapeWeights
    );
  });

  it("clone skin", () => {
    const entity = rootEntity.createChild("SkinCloneRoot");
    const bone0 = entity.createChild("Bone0");
    const bone1 = entity.createChild("Bone1");

    const modelMesh = new ModelMesh(engine);
    modelMesh.setPositions([new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)]);

    const skinnedMeshRenderer = entity.addComponent(SkinnedMeshRenderer);
    skinnedMeshRenderer.mesh = modelMesh;

    const skin = new Skin("CloneSkin");
    skin.rootBone = bone0;
    skin.bones = [bone0, bone1];
    skin.inverseBindMatrices = [
      new Matrix(),
      new Matrix(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 2, 3, 1)
    ];
    skinnedMeshRenderer.skin = skin;

    const cloneEntity = entity.clone();
    const cloneSkin = cloneEntity.getComponent(SkinnedMeshRenderer).skin;

    // The skin itself is deep cloned.
    expect(cloneSkin).to.be.not.equal(skin);

    // Entity references are remapped into the cloned subtree, not shared with the source.
    const cloneBone0 = cloneEntity.findByName("Bone0");
    const cloneBone1 = cloneEntity.findByName("Bone1");
    expect(cloneSkin.rootBone).to.be.equal(cloneBone0);
    expect(cloneSkin.rootBone).to.be.not.equal(bone0);
    expect(cloneSkin.bones.length).to.be.equal(2);
    expect(cloneSkin.bones[0]).to.be.equal(cloneBone0);
    expect(cloneSkin.bones[1]).to.be.equal(cloneBone1);
    expect(cloneSkin.bones[0]).to.be.not.equal(bone0);
    expect(cloneSkin.bones[1]).to.be.not.equal(bone1);

    // Inverse bind matrices are independent deep copies with equal values.
    expect(cloneSkin.inverseBindMatrices).to.be.not.equal(skin.inverseBindMatrices);
    expect(cloneSkin.inverseBindMatrices.length).to.be.equal(2);
    expect(cloneSkin.inverseBindMatrices[0]).to.be.not.equal(skin.inverseBindMatrices[0]);
    expect(cloneSkin.inverseBindMatrices[1]).to.be.not.equal(skin.inverseBindMatrices[1]);
    expect(cloneSkin.inverseBindMatrices[0].elements).to.be.deep.equal(skin.inverseBindMatrices[0].elements);
    expect(cloneSkin.inverseBindMatrices[1].elements).to.be.deep.equal(skin.inverseBindMatrices[1].elements);

    // The clone keeps its own update flag manager.
    // @ts-ignore
    expect(cloneSkin._updatedManager).to.be.not.equal(skin._updatedManager);

    entity.destroy();
    cloneEntity.destroy();
  });
});
