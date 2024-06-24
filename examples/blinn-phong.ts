/**
 * @title Blinn Phong Material
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*JTsWRb6c7nsAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
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
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 30);
  cameraEntity.addComponent(Camera);
  const control = cameraEntity.addComponent(OrbitControl);
  control.target.y = 5;

  // Create Direct Light
  const light1 = rootEntity.createChild();
  const light2 = rootEntity.createChild();
  light1.transform.lookAt(new Vector3(-1, -1, -1));
  light2.transform.lookAt(new Vector3(1, 1, 1));
  light1.addComponent(DirectLight);
  light2.addComponent(DirectLight);

  engine.run();

  engine.resourceManager
    .load([
      {
        type: AssetType.Texture2D,
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*g_HIRqQdNUcAAAAAAAAAAAAAARQnAQ",
      },
      {
        type: AssetType.Texture2D,
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*H7nMRY2SuWcAAAAAAAAAAAAAARQnAQ",
      },
      {
        type: AssetType.GLTF,
        url: "https://gw.alipayobjects.com/os/bmw-prod/72a8e335-01da-4234-9e81-5f8b56464044.gltf",
      },
    ])
    .then((res) => {
      const baseTexture = res[0] as Texture2D;
      const normalTexture = res[1] as Texture2D;
      const gltf = res[2] as GLTFResource;

      const { defaultSceneRoot } = gltf;
      const rendererArray = new Array<MeshRenderer>();
      const materials = new Array<BlinnPhongMaterial>();

      rootEntity.addChild(defaultSceneRoot);
      defaultSceneRoot.getComponentsIncludeChildren(
        MeshRenderer,
        rendererArray
      );

      rendererArray.forEach((renderer) => {
        const material = new BlinnPhongMaterial(engine);
        material.baseTexture = baseTexture;
        material.normalTexture = normalTexture;
        material.shininess = 64;
        material.renderFace = RenderFace.Double;
        renderer.setMaterial(material);
        materials.push(material);
      });

      addGUI(materials);
    });

  function addGUI(materials: BlinnPhongMaterial[]): void {
    const state = {
      baseColor: [255, 255, 255],
      specularColor: [255, 255, 255],
      shininess: 64,
      normalIntensity: 1,
      isTransparent: false,
      opacity: 1,
    };

    gui.addColor(state, "baseColor").onChange((v) => {
      materials.forEach((material) => {
        material.baseColor.set(
          v[0] / 255,
          v[1] / 255,
          v[2] / 255,
          state.opacity
        );
      });
    });

    gui.addColor(state, "specularColor").onChange((v) => {
      materials.forEach((material) => {
        material.specularColor.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
      });
    });
    gui.add(state, "shininess", 0, 100).onChange((v) => {
      materials.forEach((material) => {
        material.shininess = v;
      });
    });
    gui.add(state, "normalIntensity", 0, 1, 0.1).onChange((v) => {
      materials.forEach((material) => {
        material.normalIntensity = v;
      });
    });
    gui.add(state, "isTransparent").onChange((v) => {
      materials.forEach((material) => {
        material.isTransparent = v;
      });
    });
    gui.add(state, "opacity", 0, 1, 0.1).onChange((v) => {
      materials.forEach((material) => {
        material.baseColor.a = v;
      });
    });
  }
});
