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
  MeshRenderer,
  PBRMaterial,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  directLightNode.addComponent(DirectLight).color = new Color(2, 2, 2, 1);
  directLightNode.transform.setRotation(10, 20, 10);

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 0, 30);
  cameraNode.transform.lookAt(new Vector3());
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load([
        {
          type: AssetType.Texture2D,
          url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*EZ10RbC5Qn4AAAAAR0AAAAgAegDwAQ/original"
        },
        {
          type: AssetType.Texture2D,
          url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*0GEqSaUEGhcAAAAASdAAAAgAegDwAQ/original",
          params: {
            isSRGBColorSpace: false
          }
        },
        {
          type: AssetType.GLTF,
          url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/file/A*GOltRosgimwAAAAAgCAAAAgAegDwAQ/notexture.glb"
        }
      ])
      .then((asset) => {
        const baseTexture = asset[0] as Texture2D;
        const metallicTexture = asset[1] as Texture2D;
        const gltf = asset[2] as GLTFResource;

        const { defaultSceneRoot } = gltf;

        const rendererArray = new Array<MeshRenderer>();
        const materials = new Array<PBRMaterial>();

        rootEntity.addChild(defaultSceneRoot);
        defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, rendererArray);

        rendererArray.forEach((renderer) => {
          const material = new PBRMaterial(engine);
          material.metallic = 1;
          material.baseTexture = baseTexture;
          material.roughnessMetallicTexture = metallicTexture;
          material.roughness = 0.3;
          material.specular = 1;
          material.specularColor = new Color(1, 0, 0, 1);
          renderer.setMaterial(material);
          materials.push(material);
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
