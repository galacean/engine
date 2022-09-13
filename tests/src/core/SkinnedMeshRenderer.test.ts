import { BlendShape, ModelMesh, SkinnedMeshRenderer } from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

describe("SkinnedMeshRenderer", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  engine.run();

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

    expect(cloneEntity.getComponent(SkinnedMeshRenderer).blendShapeWeights).to.not.deep.equal(
      skinnedMeshRenderer.blendShapeWeights
    );
  });
});
