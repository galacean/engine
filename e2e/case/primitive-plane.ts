/**
 * @title PrimitiveMesh
 * @category Primitive
 */
import {
  AssetType,
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ArCHTbfVPXUAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
      params: {
        isSRGBColorSpace: true
      }
    })
    .then((texture: Texture2D) => {
      const material = new BlinnPhongMaterial(engine);
      material.renderFace = RenderFace.Double;
      material.baseTexture = texture;

      const entity = rootEntity.createChild("mesh");
      const { transform } = entity;
      transform.setPosition(0, 1, 0);
      transform.setRotation(45, -45, 0);
      const meshRenderer = entity.addComponent(MeshRenderer);
      meshRenderer.mesh = PrimitiveMesh.createPlane(engine);
      meshRenderer.setMaterial(material);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
