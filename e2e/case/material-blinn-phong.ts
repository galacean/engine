/**
 * @title Blinn Phong Material
 * @category Material
 */
import {
  AssetType,
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  GLTFResource,
  MeshRenderer,
  RenderFace,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 5, 30);
  const camera = cameraEntity.addComponent(Camera);

  // Create Direct Light
  const light1 = rootEntity.createChild();
  const light2 = rootEntity.createChild();
  light1.transform.lookAt(new Vector3(-1, -1, -1));
  light2.transform.lookAt(new Vector3(1, 1, 1));
  light1.addComponent(DirectLight);
  light2.addComponent(DirectLight);

  engine.resourceManager
    .load([
      {
        type: AssetType.Texture2D,
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*g_HIRqQdNUcAAAAAAAAAAAAAARQnAQ"
      },
      {
        type: AssetType.Texture2D,
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*H7nMRY2SuWcAAAAAAAAAAAAAARQnAQ"
      },
      {
        type: AssetType.GLTF,
        url: "https://gw.alipayobjects.com/os/bmw-prod/72a8e335-01da-4234-9e81-5f8b56464044.gltf"
      }
    ])
    .then((res) => {
      const baseTexture = res[0] as Texture2D;
      const normalTexture = res[1] as Texture2D;
      const gltf = res[2] as GLTFResource;

      const { defaultSceneRoot } = gltf;
      const rendererArray = new Array<MeshRenderer>();
      const materials = new Array<BlinnPhongMaterial>();

      rootEntity.addChild(defaultSceneRoot);
      defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, rendererArray);

      rendererArray.forEach((renderer) => {
        const material = new BlinnPhongMaterial(engine);
        material.baseTexture = baseTexture;
        material.normalTexture = normalTexture;
        material.shininess = 64;
        material.renderFace = RenderFace.Double;
        renderer.setMaterial(material);
        materials.push(material);
      });
      updateForE2E(engine);
      const category = "Material";
      const name = "material-blinn-phong";
      initScreenshot(category, name, engine, camera);
    });
});
