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
    skin.inverseBindMatrices = [new Matrix(), new Matrix(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 2, 3, 1)];
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

  it("derives default rootBone-space localBounds from mesh and skin", () => {
    const createRig = (assignSkinFirst: boolean) => {
      const entity = rootEntity.createChild("AutoBoundsRig");
      const bone = entity.createChild("RootBone");
      bone.transform.setPosition(2, 1, -3);
      bone.transform.setScale(2, 0.5, 4);

      const mesh = new ModelMesh(engine);
      mesh.bounds.min.set(0, 0, -3);
      mesh.bounds.max.set(4, 2, 5);

      const skin = new Skin("RigSkin");
      skin.bones = [bone];
      skin.rootBone = bone;
      skin.inverseBindMatrices = [bone.transform.worldMatrix.clone().invert()];

      const renderer = entity.addComponent(SkinnedMeshRenderer);
      if (assignSkinFirst) {
        renderer.skin = skin;
        renderer.mesh = mesh;
      } else {
        renderer.mesh = mesh;
        renderer.skin = skin;
      }
      return { entity, bone, renderer };
    };

    for (const assignSkinFirst of [false, true]) {
      const { entity, bone, renderer } = createRig(assignSkinFirst);

      expect(renderer.localBounds.min.x).to.be.closeTo(-1, 1e-5);
      expect(renderer.localBounds.min.y).to.be.closeTo(-2, 1e-5);
      expect(renderer.localBounds.min.z).to.be.closeTo(0, 1e-5);
      expect(renderer.localBounds.max.x).to.be.closeTo(1, 1e-5);
      expect(renderer.localBounds.max.y).to.be.closeTo(2, 1e-5);
      expect(renderer.localBounds.max.z).to.be.closeTo(2, 1e-5);

      expect(renderer.bounds.min.x).to.be.closeTo(0, 1e-5);
      expect(renderer.bounds.min.y).to.be.closeTo(0, 1e-5);
      expect(renderer.bounds.min.z).to.be.closeTo(-3, 1e-5);
      expect(renderer.bounds.max.x).to.be.closeTo(4, 1e-5);
      expect(renderer.bounds.max.y).to.be.closeTo(2, 1e-5);
      expect(renderer.bounds.max.z).to.be.closeTo(5, 1e-5);

      bone.transform.setPosition(10, 1, -3);
      expect(renderer.localBounds.min.x).to.be.closeTo(-1, 1e-5);
      expect(renderer.bounds.min.x).to.be.closeTo(8, 1e-5);
      expect(renderer.bounds.max.x).to.be.closeTo(12, 1e-5);

      entity.destroy();
    }
  });

  it("captures bind-pose rootBone inverse matrix when rootBone is outside bones", () => {
    const entity = rootEntity.createChild("OutsideRootBoneEntity");
    const rootBone = entity.createChild("CharacterGroup");
    rootBone.transform.setPosition(3, 0, 0);
    rootBone.transform.setScale(2, 3, 1);
    const joint = rootBone.createChild("Joint0");

    const mesh = new ModelMesh(engine);
    mesh.bounds.min.set(6, -3, -1);
    mesh.bounds.max.set(8, 3, 1);

    const skin = new Skin("OutsideRootSkin");
    skin.bones = [joint];
    skin.inverseBindMatrices = [new Matrix()];
    skin.rootBone = rootBone;

    const renderer = entity.addComponent(SkinnedMeshRenderer);
    renderer.mesh = mesh;
    renderer.skin = skin;

    expect(renderer.localBounds.min.x).to.be.closeTo(1.5, 1e-5);
    expect(renderer.localBounds.min.y).to.be.closeTo(-1, 1e-5);
    expect(renderer.localBounds.min.z).to.be.closeTo(-1, 1e-5);
    expect(renderer.localBounds.max.x).to.be.closeTo(2.5, 1e-5);
    expect(renderer.localBounds.max.y).to.be.closeTo(1, 1e-5);
    expect(renderer.localBounds.max.z).to.be.closeTo(1, 1e-5);

    // Moving rootBone afterwards translates world bounds without recomputing bind inverse matrix.
    rootBone.transform.setPosition(10, 0, 0);
    expect(renderer.localBounds.min.x).to.be.closeTo(1.5, 1e-5);
    expect(renderer.bounds.min.x).to.be.closeTo(13, 1e-5);
    expect(renderer.bounds.max.x).to.be.closeTo(15, 1e-5);

    entity.destroy();
  });

  it("refreshes automatic localBounds when mesh or skin changes", () => {
    const entity = rootEntity.createChild("DynamicRefreshEntity");
    const renderer = entity.addComponent(SkinnedMeshRenderer);

    const mesh1 = new ModelMesh(engine);
    mesh1.bounds.min.set(-1, -1, -1);
    mesh1.bounds.max.set(1, 1, 1);
    renderer.mesh = mesh1;

    // Unskinned renderer mirrors mesh.bounds.
    expect(renderer.localBounds.min).to.deep.include({ x: -1, y: -1, z: -1 });
    expect(renderer.bounds.max).to.deep.include({ x: 1, y: 1, z: 1 });

    // Mutating mesh.bounds refreshes automatic localBounds and world bounds.
    mesh1.bounds.max.set(3, 1, 1);
    expect(renderer.localBounds.max.x).to.equal(3);
    expect(renderer.bounds.max.x).to.equal(3);

    // Reordering same-length skin.bones and replacing inverseBindMatrices refreshes auto localBounds.
    const boneA = entity.createChild("BoneA");
    const boneB = entity.createChild("BoneB");
    const ibmA = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1);
    const ibmB = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1);

    const skin = new Skin("DynamicSkin");
    skin.bones = [boneA, boneB];
    skin.inverseBindMatrices = [ibmA, ibmB];
    skin.rootBone = boneA;
    renderer.skin = skin;
    expect(renderer.localBounds.min.x).to.equal(9);
    expect(renderer.localBounds.max.x).to.equal(13);

    skin.bones = [boneB, boneA];
    expect(renderer.localBounds.min.x).to.equal(19);
    expect(renderer.localBounds.max.x).to.equal(23);

    skin.inverseBindMatrices = [ibmB, new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -5, 0, 0, 1)];
    skin.rootBone = boneB;
    expect(renderer.localBounds.min.x).to.equal(19);

    skin.rootBone = boneA;
    expect(renderer.localBounds.min.x).to.equal(-6);

    // Clearing rootBone falls back to renderer entity space; clearing mesh resets auto localBounds to zero.
    skin.rootBone = null!;
    expect(renderer.localBounds.min.x).to.equal(-1);
    expect(renderer.bounds.min.x).to.equal(-1);

    renderer.mesh = null!;
    expect(renderer.localBounds.min).to.deep.include({ x: 0, y: 0, z: 0 });
    expect(renderer.bounds.max).to.deep.include({ x: 0, y: 0, z: 0 });

    entity.destroy();
  });

  it("locks custom localBounds on assignment or mutation and restores automatic on null", () => {
    const entity = rootEntity.createChild("CustomLocalBoundsEntity");
    const bone = entity.createChild("Bone");
    const renderer = entity.addComponent(SkinnedMeshRenderer);

    const mesh1 = new ModelMesh(engine);
    mesh1.bounds.min.set(-1, -2, -3);
    mesh1.bounds.max.set(1, 2, 3);
    const mesh2 = new ModelMesh(engine);
    mesh2.bounds.min.set(-10, -20, -30);
    mesh2.bounds.max.set(10, 20, 30);

    const skin = new Skin("CustomSkin");
    skin.bones = [bone];
    skin.rootBone = bone;
    skin.inverseBindMatrices = [new Matrix()];

    renderer.mesh = mesh1;
    renderer.skin = skin;

    // In-place mutation of min locks custom mode while preserving automatic max.
    renderer.localBounds.min.set(-5, -6, -7);
    renderer.mesh = mesh2;
    expect(renderer.localBounds.min).to.deep.include({ x: -5, y: -6, z: -7 });
    expect(renderer.localBounds.max).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(renderer.bounds.min).to.deep.include({ x: -5, y: -6, z: -7 });

    // Restoring automatic derivation via null/undefined picks up mesh2.
    renderer.localBounds = null;
    expect(renderer.localBounds.min).to.deep.include({ x: -10, y: -20, z: -30 });
    expect(renderer.localBounds.max).to.deep.include({ x: 10, y: 20, z: 30 });
    expect(renderer.bounds.max).to.deep.include({ x: 10, y: 20, z: 30 });

    // Explicit all-zero custom bounds remain locked even after mesh swap, and unskinned custom bounds affect world bounds.
    renderer.skin = null!;
    renderer.localBounds = new BoundingBox(new Vector3(0, 0, 0), new Vector3(0, 0, 0));
    renderer.mesh = mesh1;
    expect(renderer.localBounds.min).to.deep.include({ x: 0, y: 0, z: 0 });
    expect(renderer.localBounds.max).to.deep.include({ x: 0, y: 0, z: 0 });
    expect(renderer.bounds.max).to.deep.include({ x: 0, y: 0, z: 0 });

    // Self-assignment also locks custom mode (mirrors ReflectionParser).
    renderer.localBounds = undefined;
    expect(renderer.localBounds.max).to.deep.include({ x: 1, y: 2, z: 3 });
    renderer.localBounds = renderer.localBounds;
    renderer.mesh = mesh2;
    expect(renderer.localBounds.max).to.deep.include({ x: 1, y: 2, z: 3 });

    entity.destroy();
  });

  it("clone preserves automatic and custom localBounds semantics", () => {
    // 1. Automatic mode with out-of-joints rootBone moved away from bind pose before clone().
    const autoRoot = rootEntity.createChild("CloneAutoRoot");
    const rootBone = autoRoot.createChild("OutsideRoot");
    rootBone.transform.setPosition(3, 0, 0);
    rootBone.transform.setScale(2, 1, 1);
    const joint = rootBone.createChild("Joint");

    const mesh1 = new ModelMesh(engine);
    mesh1.bounds.min.set(5, -1, -1);
    mesh1.bounds.max.set(7, 1, 1);
    const mesh2 = new ModelMesh(engine);
    mesh2.bounds.min.set(9, -2, -2);
    mesh2.bounds.max.set(13, 2, 2);

    const skin = new Skin("CloneAutoSkin");
    skin.bones = [joint];
    skin.inverseBindMatrices = [new Matrix()];
    skin.rootBone = rootBone;

    const autoRenderer = autoRoot.addComponent(SkinnedMeshRenderer);
    autoRenderer.mesh = mesh1;
    autoRenderer.skin = skin;
    expect(autoRenderer.localBounds.min.x).to.be.closeTo(1, 1e-5);
    expect(autoRenderer.localBounds.max.x).to.be.closeTo(2, 1e-5);

    // Move rootBone away from bind pose, then clone.
    rootBone.transform.setPosition(20, 0, 0);
    const autoClone = autoRoot.clone();
    const autoCloneRenderer = autoClone.getComponent(SkinnedMeshRenderer);
    expect(autoCloneRenderer.localBounds.min.x).to.be.closeTo(1, 1e-5);

    // Clone remains automatic and still uses bind-pose rootBone inverse matrix.
    autoCloneRenderer.mesh = mesh2;
    expect(autoCloneRenderer.localBounds.min.x).to.be.closeTo(3, 1e-5);
    expect(autoCloneRenderer.localBounds.max.x).to.be.closeTo(5, 1e-5);
    // Source remains unaffected by clone mesh change.
    expect(autoRenderer.localBounds.max.x).to.be.closeTo(2, 1e-5);

    // 2. Custom mode is preserved independently on clone.
    const customBox = new BoundingBox(new Vector3(-4, -4, -4), new Vector3(4, 4, 4));
    autoRenderer.localBounds = customBox;
    const customClone = autoRoot.clone();
    const customCloneRenderer = customClone.getComponent(SkinnedMeshRenderer);

    customCloneRenderer.mesh = mesh2;
    expect(customCloneRenderer.localBounds.min).to.deep.include({ x: -4, y: -4, z: -4 });
    expect(customCloneRenderer.localBounds.max).to.deep.include({ x: 4, y: 4, z: 4 });

    customCloneRenderer.localBounds = null;
    expect(customCloneRenderer.localBounds.min.x).to.be.closeTo(3, 1e-5);
    expect(autoRenderer.localBounds.max).to.deep.include({ x: 4, y: 4, z: 4 });

    autoRoot.destroy();
    autoClone.destroy();
    customClone.destroy();
  });
});
