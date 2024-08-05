/**
 * @title CSS DOM
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*fZ8pR6j51Q0AAAAAAAAAAAAADiR2AQ/original
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*FBjgQJeAQwsAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  Entity,
  GLTFResource,
  Logger,
  Script,
  Vector3,
  WebGLEngine,
  WebGLMode,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";

async function main() {
  // Create engine
  const htmlCanvas = document.getElementById("canvas") as HTMLCanvasElement;
  const engine = await WebGLEngine.create({
    canvas: htmlCanvas,
    graphicDeviceOptions: { webGLMode: WebGLMode.Auto },
  });

  engine.canvas.resizeByClientSize();

  // Create root entity
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.setPosition(0, 1.5, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // Load glTF asset
  const glTFResource = await engine.resourceManager.load<GLTFResource>(
    "https://gw.alipayobjects.com/os/bmw-prod/8d36415b-5905-461f-9336-68a23d41518e.gltf"
  );
  const defaultSceneRoot = glTFResource.defaultSceneRoot;
  rootEntity.addChild(defaultSceneRoot);

  // Add dom element
  const dom = document.createElement("div");
  dom.innerHTML = "Hello world!!!";
  dom.setAttribute(
    "style",
    "padding:10px;position:absolute;top:0;left:0;background:white;border-radius:5px"
  );
  document.body.appendChild(dom);

  // Add script
  const script = defaultSceneRoot.addComponent(LocationTrackingScript);
  script.htmlCanvas = htmlCanvas;
  script.camera = camera;
  script.dom = dom;

  // Run engine
  engine.run();
}

main();

class LocationTrackingScript extends Script {
  screenPoint: Vector3 = new Vector3();
  widthRatio: number;
  heightRatio: number;
  camera: Camera;
  htmlCanvas: HTMLCanvasElement;
  dom: HTMLDivElement;

  onStart() {
    const canvas = this.engine.canvas;
    this.widthRatio = canvas.width / this.htmlCanvas.clientWidth;
    this.heightRatio = canvas.height / this.htmlCanvas.clientHeight;
  }

  onUpdate() {
    // Convert world coordinates to screen coordinates
    this.camera.worldToScreenPoint(
      this.entity.transform.position,
      this.screenPoint
    );
    const style = this.dom.style;
    style.left = `${this.screenPoint.x / this.widthRatio}px`;
    style.top = `${this.screenPoint.y / this.heightRatio}px`;
  }
}
