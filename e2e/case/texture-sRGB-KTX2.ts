/**
 * @title sRGB + KTX2
 * @category Texture
 */
import {
  AssetType,
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  Texture2D,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 0, 2);
  const camera = cameraEntity.addComponent(Camera);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/img/A*XmHPTYGREAIAAAAAAAAAAAAAekp5AQ/original/original.ktx2",
      type: AssetType.KTX2
    })
    .then((texture: Texture2D) => {
      const material = new UnlitMaterial(engine);
      material.baseTexture = texture;

      engine.run();
      const entity = rootEntity.createChild("mesh");
      entity.transform.setRotation(0, 90, 0);
      const meshRenderer = entity.addComponent(MeshRenderer);
      meshRenderer.mesh = PrimitiveMesh.createSubdivisionSurfaceSphere(engine);
      meshRenderer.setMaterial(material);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
