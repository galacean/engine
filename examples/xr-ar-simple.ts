/**
 * @title AR simple
 * @category XR
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*t4cXTbFa6kkAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  Camera,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { XRSessionMode, XRTrackedInputDevice } from "@galacean/engine-xr";
import { WebXRDevice } from "@galacean/engine-xr-webxr";

// Create engine
WebGLEngine.create({ canvas: "canvas", xrDevice: new WebXRDevice() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize(1);
    const { sceneManager, xrManager } = engine;
    const scene = sceneManager.scenes[0];
    const origin = (xrManager.origin = scene.createRootEntity("origin"));
    // init direct light
    const light = origin.createChild("light");
    light.transform.setPosition(-10, 10, 10);
    light.transform.lookAt(new Vector3());
    light.addComponent(DirectLight);

    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
      });

    const ball = origin.createChild("ball");
    const renderer = ball.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 24);
    const material = new PBRMaterial(engine);
    material.metallic = 0.5;
    material.roughness = 0.5;
    renderer.setMaterial(new PBRMaterial(engine));
    ball.transform.translate(0, 0, -3);
    const camera = origin.createChild("camera").addComponent(Camera);
    xrManager.cameraManager.attachCamera(XRTrackedInputDevice.Camera, camera);
    xrManager.sessionManager.isSupportedMode(XRSessionMode.AR).then(
      () => {
        addXRButton("Enter AR").onclick = () => {
          xrManager.enterXR(XRSessionMode.AR);
        };
      },
      (error) => {
        addXRButton("Not Support");
        console.error(error);
      }
    );
    engine.run();
  }
);

function addXRButton(content: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = content;
  const { style } = button;
  style.position = "absolute";
  style.bottom = "20px";
  style.padding = "12px 6px";
  style.border = "1px solid rgb(255, 255, 255)";
  style.borderRadius = "4px";
  style.background = "rgba(0, 0, 0, 0.1)";
  style.color = "rgb(255, 255, 255)";
  style.font = "13px sans-serif";
  style.textAlign = "center";
  style.opacity = "0.5";
  style.outline = "none";
  style.zIndex = "999";
  style.cursor = "pointer";
  style.left = "calc(50% - 50px)";
  style.width = "100px";
  document.body.appendChild(button);
  return button;
}
