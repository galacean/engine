/**
 * @title Scene Fog
 * @category Scene
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*FEbDQLYuRNkAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  FogMode,
  GLTFResource,
  Scene,
  ShadowType,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;

  // Set background color to corn flower blue
  const cornFlowerBlue = new Color(130 / 255, 163 / 255, 255 / 255);
  scene.background.solidColor = cornFlowerBlue;

  // Set fog
  scene.fogMode = FogMode.ExponentialSquared;
  scene.fogDensity = 0.015;
  scene.fogEnd = 200;
  scene.fogColor = cornFlowerBlue;

  const rootEntity = scene.createRootEntity();

  // Create camera entity and components
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(-6, 2, -22);
  cameraEntity.transform.rotate(new Vector3(0, -110, 0));
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(FreeControl).floorMock = false;

  // Create light entity and component
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(0, 0.7, 0.5);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  // Enable light cast shadow
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.shadowType = ShadowType.SoftLow;

  // Add ambient light
  const ambientLight = await engine.resourceManager.load<AmbientLight>({
    url: "https://gw.alipayobjects.com/os/bmw-prod/09904c03-0d23-4834-aa73-64e11e2287b0.bin",
    type: AssetType.Env,
  });
  scene.ambientLight = ambientLight;

  // Add model
  const glTFResource = await engine.resourceManager.load<GLTFResource>(
    "https://gw.alipayobjects.com/os/OasisHub/19748279-7b9b-4c17-abdf-2c84f93c54c8/oasis-file/1670226408346/low_poly_scene_forest_waterfall.gltf"
  );
  rootEntity.addChild(glTFResource.defaultSceneRoot);

  engine.run();

  // Add debug GUI for fog
  addDebugGUI(scene);
}

function addDebugGUI(scene: Scene): void {
  let fogStartItem;
  let fogEndItem;
  let fogDensityItem;
  const gui = new dat.GUI();

  let switchMode = (mode: FogMode) => {
    switch (mode) {
      case FogMode.None:
        clearModeItems();
        break;
      case FogMode.Linear:
        clearModeItems();
        fogStartItem = gui.add(debugInfos, "fogStart", 0, 300).onChange((v) => {
          scene.fogStart = v;
        });

        fogEndItem = gui.add(debugInfos, "fogEnd", 0, 300).onChange((v) => {
          scene.fogStart = v;
        });
        break;
      case FogMode.Exponential:
      case FogMode.ExponentialSquared:
        clearModeItems();
        fogDensityItem = gui
          .add(debugInfos, "fogDensity", 0.01, 0.1)
          .onChange((v) => {
            scene.fogDensity = v;
          });
        break;
    }
    scene.fogMode = mode;
  };

  let clearModeItems = () => {
    if (fogStartItem) {
      fogStartItem.remove();
      fogStartItem = null;
    }
    if (fogEndItem) {
      fogEndItem.remove();
      fogEndItem = null;
    }
    if (fogDensityItem) {
      fogDensityItem.remove();
      fogDensityItem = null;
    }
  };

  const fogColor = scene.fogColor;
  const debugInfos = {
    fogMode: scene.fogMode,
    fogColor: [fogColor.r * 255, fogColor.g * 255, fogColor.b * 255],
    fogStart: scene.fogStart,
    fogEnd: scene.fogEnd,
    fogDensity: scene.fogDensity,
  };

  gui
    .add(debugInfos, "fogMode", {
      None: FogMode.None,
      Linear: FogMode.Linear,
      Exponential: FogMode.Exponential,
      ExponentialSquared: FogMode.ExponentialSquared,
    })
    .onChange((v) => {
      switchMode(parseInt(v));
    });

  gui.addColor(debugInfos, "fogColor").onChange((v) => {
    scene.fogColor.set(v[0] / 255, v[1] / 255, v[2] / 255, 1.0);
  });

  switchMode(scene.fogMode);
}
main();
