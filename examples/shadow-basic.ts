/**
 * @title Shadow Basic
 * @category Light
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*EXbeTbDNEvoAAAAAAAAAAAAADiR2AQ/original
 */

import { FreeControl } from "@galacean/engine-toolkit-controls";
import {
  AmbientLight,
  AssetType,
  Camera,
  DirectLight,
  GLTFResource,
  ShadowType,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
async function init() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  // Set shadow distance
  scene.shadowDistance = 20;

  // Create root entity
  const rootEntity = scene.createRootEntity();

  // Create camera entity and component
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(3, 2.5, 0);
  cameraEntity.transform.lookAt(new Vector3(0, 2, 0));
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(FreeControl).floorMock = false;

  // Create light entity and component
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(0.5, 0.9, 0);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));
  const directLight = lightEntity.addComponent(DirectLight);

  // Enable shadow
  directLight.shadowType = ShadowType.SoftLow;

  const glTFResource = await engine.resourceManager.load<GLTFResource>(
    "https://gw.alipayobjects.com/os/bmw-prod/ca50859b-d736-4a3e-9fc3-241b0bd2afef.gltf"
  );
  rootEntity.addChild(glTFResource.defaultSceneRoot);

  const ambientLight = await engine.resourceManager.load<AmbientLight>({
    type: AssetType.Env,
    url: "https://gw.alipayobjects.com/os/bmw-prod/09904c03-0d23-4834-aa73-64e11e2287b0.bin",
  });
  scene.ambientLight = ambientLight;

  engine.run();
}
init();
