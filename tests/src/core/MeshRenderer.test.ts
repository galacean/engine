import { BlinnPhongMaterial, MeshRenderer, PrimitiveMesh } from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

describe("MeshRenderer Test", function () {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  it("bounds test", () => {
    const entity = rootEntity.createChild("Cube");
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new BlinnPhongMaterial(engine);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    expect(renderer.bounds.min).to.deep.equal(new Vector3(-0.5, -0.5, -0.5));
    expect(renderer.bounds.max).to.deep.equal(new Vector3(0.5, 0.5, 0.5));

    entity.transform.translate(1.0, 1.0, 1.0);

    expect(renderer.bounds.min).to.deep.equal(new Vector3(0.5, 0.5, 0.5));
    expect(renderer.bounds.max).to.deep.equal(new Vector3(1.5, 1.5, 1.5));

    mesh.bounds.min.set(-1.0, -1.0, -1.0);
    mesh.bounds.max.set(1.0, 1.0, 1.0);

    expect(renderer.bounds.min).to.deep.equal(new Vector3(0.0, 0.0, 0.0));
    expect(renderer.bounds.max).to.deep.equal(new Vector3(2, 2, 2));
  });
});
