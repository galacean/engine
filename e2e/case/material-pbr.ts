/**
 * @title PBR Base
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  DirectLight,
  GLTFResource,
  PrimitiveMesh,
  SkyBoxMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  const directLight = directLightNode.addComponent(DirectLight);
  directLight.intensity = 0.5;
  directLightNode.transform.setPosition(5, 5, 5);
  directLightNode.transform.lookAt(new Vector3(0, 0, 0));

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(0.25, 0.25, 1.5);
  const camera = cameraNode.addComponent(Camera);

  console.time("load glTF");
  console.time("load HDR");
  console.time("start");
  const startTime = performance.now();
  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/477b0093-7ee8-41af-a0dd-836608a4f130.gltf")
      .then((gltf) => {
        console.timeEnd("load glTF");
        const { defaultSceneRoot } = gltf;
        rootEntity.addChild(defaultSceneRoot);
        defaultSceneRoot.transform.setScale(100, 100, 100);
      })
  ]).then(() => {
    const timeout = performance.now() - startTime;
    if (timeout > 5000) {
      throw `glTF 2 timeout ${timeout}`;
    }
    console.timeEnd("start");
    updateForE2E(engine);
    const category = "Material";
    const name = "material-pbr";
    initScreenshot(category, name, engine, camera);
    const a = document.createElement("a");
    a.id = "test2";
    document.body.appendChild(a);
  });

  const a = document.createElement("a");
  a.id = "test1";
  document.body.appendChild(a);
});
