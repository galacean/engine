/**
 * @title PBR Specular
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Logger,
  Shader,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { PBRSource, registerIncludes } from "@galacean/engine-shader-shaderlab";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

registerIncludes();

// Create engine
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  directLightNode.addComponent(DirectLight).color = new Color(2, 2, 2, 1);
  directLightNode.transform.setRotation(10, 50, 0);

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 0, 1.5);
  cameraNode.transform.lookAt(new Vector3());
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>(
        "https://mdn.alipayobjects.com/huamei_9ahbho/afts/file/A*NEFJQro2hFoAAAAATaAAAAgAegDwAQ/SpecularTest.glb"
      )
      .then((gltf) => {
        const { defaultSceneRoot, materials } = gltf;
        const entity = rootEntity.createChild();
        entity.addChild(defaultSceneRoot);
        const shader = Shader.create(PBRSource);
        materials?.forEach((material) => {
          material.shader = shader;
        });
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
      })
  ]).then(() => {
    updateForE2E(engine);
    initScreenshot(engine, camera);
  });
});
